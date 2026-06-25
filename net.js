/*
  ══════════════════════════════════════════════════════
  net.js — Сетевой слой: Telegram-авторизация,
  сохранение прогресса на сервер (MongoDB)

  СТРАТЕГИЯ СОХРАНЕНИЯ:
  ✅ МГНОВЕННО: inventory, equipped, upg, skills, potionLv,
     potionThreshold, floor, level, pixr, gram, bp, prem
  ⏱️ 10 СЕКУНД: hp, gold, xp, killCount, potions
  🔄 ПОЛЛИНГ: каждые 9 секунд проверка уведомлений
  📦 БАТЧ: шлёт только изменившиеся поля (дельта)
  ══════════════════════════════════════════════════════
*/
(function () {
  'use strict';

  var API = (function() {
    var url = new URLSearchParams(window.location.search).get('api') || 
              window.ENV_API_URL || 
              'https://ghz-production.up.railway.app';
    return url.replace(/\/$/, '');
  })();

  var EQUIP_SLOTS = ['weapon', 'body', 'legs', 'gloves', 'belt', 'ring', 'boots', 'helmet'];
  
  var INSTANT_FIELDS = [
    'inventory', 'equipped', 'upg', 'skills', 
    'potionLv', 'potionThreshold', 'floor', 'level',
    'pixr', 'gram', 'bp', 'prem'
  ];

  var TG_INIT = '';
  var SYNC = {
    booted: false,
    started: false,
    online: false,
    pushing: false,
    dirtyTimer: null,
    batchTimer: null,
    lastServerTs: 0,
    serverConfirmed: false,
    currentTgId: null,
    rlBackoffUntil: 0,

    lastHp: 0,
    lastGold: 0,
    lastXp: 0,
    lastKillCount: 0,
    lastPotions: 0,
    lastLevel: 0,
    lastFloor: 0,
    lastPixr: 0,
  };

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return Object.assign({}, o); } }

  function getTgId() {
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        var unsafe = window.Telegram.WebApp.initDataUnsafe;
        if (unsafe && unsafe.user && unsafe.user.id) {
          return String(unsafe.user.id);
        }
      }
    } catch (e) {}
    return null;
  }

  // ═══════════════════════════════
  //  ЭКРАН ЗАГРУЗКИ
  // ═══════════════════════════════

  var LS_MIN_MS = 800;
  var _lsShownAt = Date.now();

  function lsSetStatus(text, pct) {
    var el = document.getElementById('lsStatus');
    if (el) el.innerHTML = '<span class="ls-dots">' + text + '</span>';
    var bar = document.getElementById('lsBar');
    if (bar && pct != null) bar.style.width = pct + '%';
  }

  function lsHide() {
    var el = document.getElementById('loadingScreen');
    if (!el || el.classList.contains('fade-out')) return;
    el.style.pointerEvents = 'none';
    var elapsed = Date.now() - _lsShownAt;
    var delay = Math.max(0, LS_MIN_MS - elapsed);
    setTimeout(function () {
      lsSetStatus('Готово', 100);
      setTimeout(function () {
        el.classList.add('fade-out');
        setTimeout(function () {
          el.style.display = 'none';
          el.classList.add('hidden-done');
        }, 520);
      }, 300);
    }, delay);
  }

  function lsInitStars() {
    var wrap = document.getElementById('lsStars');
    if (!wrap) return;
    var html = '';
    for (var i = 0; i < 60; i++) {
      var x = (Math.random() * 100).toFixed(1);
      var y = (Math.random() * 100).toFixed(1);
      var dur = (1.5 + Math.random() * 2.5).toFixed(1);
      var del = (Math.random() * 3).toFixed(1);
      var op = (0.1 + Math.random() * 0.4).toFixed(2);
      html += '<div class="ls-star" style="left:' + x + '%;top:' + y + '%;opacity:' + op + ';--dur:' + dur + 's;--delay:-' + del + 's;"></div>';
    }
    wrap.innerHTML = html;
  }

  // ═══════════════════════════════
  //  СЕРИАЛИЗАЦИЯ И СЖАТИЕ
  // ═══════════════════════════════

  function serializeState() {
    var eq = {};
    EQUIP_SLOTS.forEach(function (slot) {
      var it = G.equipped && G.equipped[slot];
      eq[slot] = it ? it.id : null;
    });
    var inv = (G.inventory || []).map(function (it) {
      var c = clone(it);
      delete c._equipped;
      return c;
    });
    return {
      v:                   1,
      tgId:                getTgId(),
      charId:              (typeof G_CHAR !== 'undefined' && G_CHAR) ? G_CHAR.id : (G.charId || null),
      inventory:           inv,
      equipped:            eq,
      upg:                 clone(G.upg),
      skills:              clone(G.skills || {}),
      potionLv:            G.potionLv,
      potionThreshold:     G.potionThreshold,
      floor:               G.floor,
      level:               G.level,
      pixr:                G.pixr,
      gram:                G.gram,
      bp:                  clone(G.bp   || { active: false, claimed: [] }),
      prem:                clone(G.prem || { tier: null, expiresAt: 0 }),
      boss:                clone(G.boss || { floor: 1, lastFightTime: 0 }),
      hp:                  G.hp,
      gold:                G.gold,
      xp:                  G.xp,
      xpNeeded:            G.xpNeeded,
      killCount:           G.killCount,
      potions:             G.potions,
      invIdCounter:        (typeof _invIdCounter === 'number') ? _invIdCounter : 0,
      dailyTasks:          clone(G.dailyTasks          || { date: '', seconds: 0, claimed: [] }),
      specialTasksClaimed: clone(G.specialTasksClaimed || {}),
      invFilter:           G.invFilter || 'all',
      cp:                  (typeof calcCP === 'function') ? calcCP() : 0,
      updatedAt:           Date.now(),
    };
  }

  // ═══════════════════════════════
  //  ПРИМЕНЕНИЕ СНАПШОТА
  // ═══════════════════════════════

  function applySnapshot(s) {
    if (!s || typeof s !== 'object') return false;

    var currentTgId = getTgId();
    if (s.tgId && currentTgId && s.tgId !== currentTgId) {
      console.warn('⚠️ Игнорируем снапшот другого пользователя:', s.tgId);
      return false;
    }

    var d = s.data || s;
    if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
      d = d.data;
    }

    console.log('📦 [applySnapshot] Применяем данные:', Object.keys(d));

    if (d.charId && typeof CHARS !== 'undefined' && CHARS[d.charId]) {
      G_CHAR = CHARS[d.charId];
      G.charId = d.charId;
      if (typeof applyCharacterSprites === 'function') applyCharacterSprites(G_CHAR);
    }

    G.upg = Object.assign(
      { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 },
      d.upg || {}
    );

    if (G_CHAR && typeof UPG_DEFS !== 'undefined') {
      G.baseStats = Object.assign({}, G_CHAR.baseStats);
      UPG_DEFS.forEach(function(u) {
        var lv = G.upg[u.id] || 0;
        if (lv > 0) {
          G.baseStats[u.stat] = parseFloat(
            ((G.baseStats[u.stat] || 0) + u.bonus * lv).toFixed(4)
          );
        }
      });
      var lvBonuses = num(d.level, 1) - 1;
      if (lvBonuses > 0) {
        G.baseStats.atk    = (G.baseStats.atk    || 0) + lvBonuses * 2;
        G.baseStats.def    = (G.baseStats.def    || 0) + lvBonuses * 1;
        G.baseStats.hp     = (G.baseStats.hp     || 0) + lvBonuses * 10;
        G.baseStats.atkSpd = parseFloat(
          ((G.baseStats.atkSpd || 1.0) + lvBonuses * 0.02).toFixed(4)
        );
      }
    } else if (d.baseStats) {
      G.baseStats = Object.assign({}, d.baseStats);
    }

    G.skills = d.skills || {};
    G.potionLv = num(d.potionLv, 0);
    G.potionThreshold = num(d.potionThreshold, 30);
    G.floor = num(d.floor, G.floor);
    G.level = num(d.level, G.level);
    G.maxFloor = num(d.maxFloor, G.maxFloor);
    G.pixr = num(d.pixr, G.pixr);
    G.gram = num(d.gram, G.gram);
    G.gold = num(d.gold, G.gold);
    G.xp = num(d.xp, G.xp);
    G.killCount = num(d.killCount, G.killCount);
    G.potions = num(d.potions, G.potions);

    console.log(`✅ [applySnapshot] gram=${G.gram}, gold=${G.gold}, pixr=${G.pixr}`);

    G.bp = d.bp || { active: false, claimed: [] };
    if (!G.bp.claimed) G.bp.claimed = [];
    G.prem = d.prem || { tier: null, expiresAt: 0 };
    G.boss = d.boss || { floor: 1, lastFightTime: 0 };
    if (!G.boss.floor) G.boss.floor = 1;

    G.invFilter = d.invFilter || 'all';
    G.dailyTasks = d.dailyTasks || { date: '', seconds: 0, claimed: [] };
    G.specialTasksClaimed = d.specialTasksClaimed || {};

    G.inventory = (d.inventory || []).map(function (it) {
      var c = clone(it);
      c._equipped = false;
      return c;
    });

    if (typeof d.invIdCounter === 'number') _invIdCounter = d.invIdCounter;
    G.inventory.forEach(function (i) {
      if (typeof i.id === 'number' && i.id > _invIdCounter) _invIdCounter = i.id;
    });

    // ✅ ПРАВИЛЬНО (полный набор слотов)
G.equipped = { 
  weapon: null, 
  body: null, 
  legs: null, 
  gloves: null, 
  belt: null, 
  ring: null, 
  boots: null, 
  helmet: null 
};
    var eq = d.equipped || {};
    EQUIP_SLOTS.forEach(function (slot) {
      var id = eq[slot];
      if (id == null) return;
      var it = G.inventory.find(function (i) { return i.id === id; });
      if (it) {
        it._equipped = true;
        G.equipped[slot] = it;
      }
    });

    if (typeof recalcStats === 'function') recalcStats();

    G.maxHp = num(d.maxHp, G.maxHp);
    G.xpNeeded = num(d.xpNeeded, 0);
    if (!G.xpNeeded || G.xpNeeded < 100) {
      var _xp = 100;
      for (var _lv = 1; _lv < G.level; _lv++) {
        _xp = Math.floor(_xp * (_lv < 7 ? 2.5 : 1.1));
      }
      G.xpNeeded = _xp;
    }

    var hp = num(d.hp, G.maxHp);
    if (hp <= 0) hp = Math.floor(G.maxHp * 0.3);
    G.hp = Math.max(1, Math.min(hp, G.maxHp));

    SYNC.lastHp        = G.hp;
    SYNC.lastGold      = G.gold;
    SYNC.lastXp        = G.xp;
    SYNC.lastKillCount = G.killCount;
    SYNC.lastPotions   = G.potions;
    SYNC.lastLevel     = G.level;
    SYNC.lastFloor     = G.floor;
    SYNC.lastPixr      = G.pixr || 0;

    return true;
  }

  // ═══════════════════════════════
  //  СЕРВЕРНЫЕ ЗАПРОСЫ
  // ═══════════════════════════════

  var START_PARAM = '';

  function serverLoad() {
    if (!SYNC.online) return Promise.resolve(null);
    return fetch(API + '/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT, startParam: START_PARAM }),
    }).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        console.warn('⚠️ [serverLoad] не-JSON ответ, статус:', r.status);
        return { ok: false };
      }
      return r.json();
    })
    .catch(function (e) { 
      console.error('❌ [serverLoad] ошибка:', e.message);
      throw e; 
    });
  }

  function serverSaveInstant(data) {
    if (!SYNC.online || !SYNC.serverConfirmed) return Promise.resolve({ ok: false });
    
    var snap = serializeState();
    Object.keys(data).forEach(function(key) {
      snap[key] = data[key];
    });
    snap.updatedAt = Date.now();
    
    return fetch(API + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT, data: snap }),
    }).then(function (r) { return r.json(); });
  }

  // ⚡ БАТЧ-СОХРАНЕНИЕ — КАЖДЫЕ 10 СЕКУНД (только дельта изменений)
  function serverSaveBatch() {
    if (!SYNC.online || !SYNC.serverConfirmed || SYNC.pushing) return;
    if (SYNC.rlBackoffUntil && Date.now() < SYNC.rlBackoffUntil) return;

    var currentHp        = G.hp;
    var currentGold      = G.gold;
    var currentXp        = G.xp;
    var currentKillCount = G.killCount;
    var currentPotions   = G.potions;
    var currentLevel     = G.level;
    var currentFloor     = G.floor;
    var currentPixr      = G.pixr;

    // ✅ Собираем только изменившиеся поля
    var delta = {
      tgId:      getTgId(),
      charId:    (typeof G_CHAR !== 'undefined' && G_CHAR) ? G_CHAR.id : (G.charId || null),
      updatedAt: Date.now(),
      cp:        (typeof calcCP === 'function') ? calcCP() : 0,
    };

    var hasChanges = false;

    if (currentHp        !== SYNC.lastHp)        { delta.hp        = currentHp;        hasChanges = true; }
    if (currentGold      !== SYNC.lastGold)      { delta.gold      = currentGold;      hasChanges = true; }
    if (currentXp        !== SYNC.lastXp)        { delta.xp        = currentXp;        hasChanges = true; }
    if (currentKillCount !== SYNC.lastKillCount) { delta.killCount = currentKillCount; hasChanges = true; }
    if (currentPotions   !== SYNC.lastPotions)   { delta.potions   = currentPotions;   hasChanges = true; }
    if (currentLevel     !== SYNC.lastLevel)     { delta.level     = currentLevel;     delta.xpNeeded = G.xpNeeded; hasChanges = true; }
    if (currentFloor     !== SYNC.lastFloor)     { delta.floor     = currentFloor;     delta.maxFloor = G.maxFloor; hasChanges = true; }
    if (currentPixr      !== SYNC.lastPixr)      { delta.pixr      = currentPixr;      hasChanges = true; }

    if (!hasChanges) return;

    SYNC.pushing = true;

    fetch(API + '/api/save/delta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT, delta: delta }),
    }).then(function (r) { return r.json(); })
      .then(function (r) {
        if (r && r.ok) {
          SYNC.lastHp        = currentHp;
          SYNC.lastGold      = currentGold;
          SYNC.lastXp        = currentXp;
          SYNC.lastKillCount = currentKillCount;
          SYNC.lastPotions   = currentPotions;
          SYNC.lastLevel     = currentLevel;
          SYNC.lastFloor     = currentFloor;
          SYNC.lastPixr      = currentPixr;
          SYNC.lastServerTs  = r.updatedAt || delta.updatedAt;
          SYNC.rlBackoffUntil = 0;

          // ✅ Если сервер вернул sync — применяем (админские изменения)
          if (r.sync) {
            console.log('🔄 [batch] Применяем серверный sync:', Object.keys(r.sync));
            if (r.sync.gram      !== undefined) G.gram      = r.sync.gram;
            if (r.sync.gold      !== undefined) G.gold      = r.sync.gold;
            if (r.sync.pixr      !== undefined) G.pixr      = r.sync.pixr;
            if (r.sync.inventory !== undefined) {
              G.inventory = r.sync.inventory;
              if (typeof renderInventory === 'function') renderInventory();
            }
            if (typeof updateHUD === 'function') updateHUD();
            if (typeof renderWallet === 'function') renderWallet();
            // Сбрасываем last-значения чтобы не перезаписать обратно
            SYNC.lastGold = G.gold;
            SYNC.lastPixr = G.pixr;
          }
        } else if (r && r.error === 'rate_limit') {
          SYNC.rlBackoffUntil = Date.now() + 6000;
          console.warn('⚠️ [save] rate limit, пауза 6s');
        }
      })
      .catch(function () {})
      .then(function () { SYNC.pushing = false; });
  }

  function saveInstant(data) {
    if (!SYNC.started || !SYNC.online) return;
    serverSaveInstant(data).catch(function() {});
  }

  function touch() {
    if (!SYNC.started || !SYNC.online) return;
    clearTimeout(SYNC.dirtyTimer);
    SYNC.dirtyTimer = setTimeout(serverSaveBatch, 500);
  }

  function flush() {
    if (!SYNC.started) return;
    if (!SYNC.online || !SYNC.serverConfirmed) return;
    var snap = serializeState();
    snap.updatedAt = Date.now();
    try {
      fetch(API + '/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: TG_INIT, data: snap }),
        keepalive: true,
      });
    } catch (e) {}
  }

  // ═══════════════════════════════
  //  ПОЛЛИНГ — простой опрос (каждые 9 секунд)
  // ═══════════════════════════════

  var pollTimer = null;
  var isPolling = false;
  var lastEventId = 0;

  function startPolling() {
    if (!SYNC.started || !SYNC.online) return;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    console.log('🔄 [Poll] Запуск опроса...');
    doPoll();
  }

  function doPoll() {
    if (!SYNC.started || !SYNC.online) {
      return;
    }
    if (isPolling) return;

    var tgId = getTgId();
    if (!tgId) {
      pollTimer = setTimeout(doPoll, 9000);
      return;
    }

    isPolling = true;

    fetch(API + '/api/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: TG_INIT,
        lastEventId: lastEventId
      })
    })
    .then(function(r) { 
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json(); 
    })
    .then(function(response) {
      isPolling = false;
      lastEventId = response.timestamp || Date.now();

      if (response.ok && response.notifications && response.notifications.length > 0) {
        console.log('📨 [Poll] Получено ' + response.notifications.length + ' уведомлений');
        response.notifications.forEach(function(notification) {
          if (notification.event === 'reload') {
            console.log('🔄 [Poll] Обновление данных с сервера...');
            // ✅ Один forceReload — применяет всё актуальное состояние
            if (typeof window.forceReload === 'function') {
              window.forceReload().then(function(success) {
                if (success) {
                  if (typeof renderWallet === 'function') renderWallet();
                  if (typeof updateHUD === 'function') updateHUD();
                }
              });
            } else {
              location.reload();
            }
          }
        });
      }

      if (SYNC.started && SYNC.online) {
        pollTimer = setTimeout(doPoll, 9000);
      }
    })
    .catch(function(error) {
      isPolling = false;
      console.error('❌ [Poll] Ошибка:', error.message);
      if (SYNC.started && SYNC.online) {
        pollTimer = setTimeout(doPoll, 9000);
      }
    });
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    isPolling = false;
    console.log('🛑 [Poll] Остановлен');
  }

  // ═══════════════════════════════
  //  ПРИНУДИТЕЛЬНАЯ ПЕРЕЗАГРУЗКА
  // ═══════════════════════════════

  window.forceReload = function() {
    console.log('🔄 [forceReload] Запрос обновления данных...');
    return serverLoad().then(function(r) {
      if (r && r.ok && r.save && r.save.data) {
        console.log('✅ [forceReload] Данные получены, применяем...');
        applySnapshot(r.save.data);
        if (typeof updateHUD === 'function') updateHUD();
        if (typeof renderInventory === 'function') renderInventory();
        if (typeof renderWallet === 'function') renderWallet();
        if (typeof updatePotionHud === 'function') updatePotionHud();
        if (typeof switchTab === 'function') switchTab(activeTab);
        console.log('✅ [forceReload] Готово! GRAM:', G.gram);
        return true;
      } else {
        console.warn('⚠️ [forceReload] Не удалось загрузить данные');
        return false;
      }
    }).catch(function(e) {
      console.error('❌ [forceReload] Ошибка:', e.message);
      return false;
    });
  };

  // ═══════════════════════════════
  //  ЭКРАН ВЫБОРА ПЕРСОНАЖА
  // ═══════════════════════════════

  function stopCharSelectAnims() {
    try { if (typeof _csSpriteTimers !== 'undefined') Object.keys(_csSpriteTimers).forEach(function (k) { clearInterval(_csSpriteTimers[k]); }); } catch (e) {}
    try { if (typeof _csParticleTimer !== 'undefined' && _csParticleTimer) cancelAnimationFrame(_csParticleTimer); } catch (e) {}
  }
  
  function hideCharSelect() {
    var cs = document.getElementById('charSelect');
    if (cs) cs.classList.add('hidden');
    stopCharSelectAnims();
  }

  // ═══════════════════════════════
  //  СТАРТ ИЗ СНАПШОТА
  // ═══════════════════════════════

  function bootFromSnapshot(snap) {
    if (SYNC.started) return;
    var data = snap.data || snap;
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      data = data.data;
    }
    if (!applySnapshot(data)) return;
    hideCharSelect();
    SYNC.started = true;
    // ✅ Запускаем игру только если loop ещё не запущен
    if (typeof startGame === 'function') {
      if (typeof window._loopRunning === 'undefined' || !window._loopRunning) {
        startGame();
      } else {
        // Loop уже идёт — только обновляем HUD
        if (typeof updateHUD === 'function') updateHUD();
        if (typeof initSkillsHud === 'function') initSkillsHud();
        if (typeof updatePotionHud === 'function') updatePotionHud();
      }
    }
    setTimeout(startPolling, 2000);
  }

  function hotApply(snap) {
    if (!applySnapshot(snap)) return;
    if (typeof updateHUD === 'function') updateHUD();
    if (typeof initSkillsHud === 'function') initSkillsHud();
    if (typeof updatePotionHud === 'function') updatePotionHud();
    try { if (typeof switchTab === 'function' && typeof activeTab !== 'undefined') switchTab(activeTab); } catch (e) {}
  }

  // ═══════════════════════════════
  //  ЦИКЛЫ СИНХРОНИЗАЦИИ — 10 СЕКУНД
  // ═══════════════════════════════

  function startSyncLoops() {
    if (SYNC.booted) return; // ✅ защита от дублирования слушателей
    SYNC.batchTimer = setInterval(serverSaveBatch, 10000);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) flush();
    });

    if (window.Telegram && window.Telegram.WebApp) {
      try { window.Telegram.WebApp.onEvent('close', flush); } catch (e) {}
    }

    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  // ═══════════════════════════════
  //  СБРОС К ЭКРАНУ ВЫБОРА
  // ═══════════════════════════════

  function resetToCharSelect() {
    if (typeof gameActive !== 'undefined') window.gameActive = false;
    if (typeof G_CHAR !== 'undefined') window.G_CHAR = null;
    
    stopPolling();
    
    try { if (typeof G !== 'undefined') {
      G.charId = null;
      G.gold = 0; G.pixr = 0; G.gram = 0;
      G.level = 1; G.xp = 0; G.floor = 1; G.maxFloor = 1; G.killCount = 0;
      G.inventory = []; G.equipped = {};
      G.upg = { atk:0, def:0, hp:0, spd:0, crit:0, dodge:0, atkSpd:0 };
      G.bp = { active: false, claimed: [] };
      G.prem = { tier: null, expiresAt: 0 };
      G.skills = {};
      G.potions = 0;
      G.potionLv = 0;
      G.dailyTasks = { date: '', seconds: 0, claimed: [] };
      G.specialTasksClaimed = {};
    }} catch(e) {}
    if (typeof _invIdCounter !== 'undefined') window._invIdCounter = 0;
    
    var cs = document.getElementById('charSelect');
    if (cs) cs.classList.remove('hidden');
    var canvas = document.getElementById('gameCanvas');
    if (canvas) canvas.style.display = 'none';
    var skillsHud = document.getElementById('skillsHud');
    if (skillsHud) skillsHud.classList.remove('visible');
  }

  // ═══════════════════════════════
  //  BOOT
  // ═══════════════════════════════

  function initTelegram() {
  if (window.Telegram && window.Telegram.WebApp) {
    try { window.Telegram.WebApp.ready(); } catch (e) {}
    try { window.Telegram.WebApp.expand(); } catch (e) {}
    try { window.Telegram.WebApp.disableVerticalSwipes && window.Telegram.WebApp.disableVerticalSwipes(); } catch (e) {}
    TG_INIT = window.Telegram.WebApp.initData || '';
    try {
      START_PARAM = (window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.start_param) || '';
    } catch (e) { START_PARAM = ''; }
  }
  if (!START_PARAM) {
    try {
      var urlRef = new URLSearchParams(window.location.search).get('ref') || '';
      if (urlRef) START_PARAM = urlRef;
    } catch (e) {}
  }
  SYNC.online = !!TG_INIT;
  
  var tgId = getTgId();
  if (tgId) {
    SYNC.currentTgId = tgId;
  }
  console.log('🟢 [initTelegram] Пользователь:', tgId, 'Online:', SYNC.online);
}

  // ═══════════════════════════════
//  БУТ — с задержкой
// ═══════════════════════════════

function boot() {
  lsInitStars();
  lsSetStatus('Подключение', 10);
  initTelegram();

  function _bootFinalize() {
    try {
      SYNC.booted = true;
      startSyncLoops();
      if (SYNC.online && SYNC.started && SYNC.serverConfirmed) {
        serverSaveBatch();
      }
    } catch (e) {
      console.error('❌ [boot] finalize error:', e.message);
    }
    lsHide();
  }

  lsSetStatus(SYNC.online ? 'Загрузка с сервера' : 'Офлайн режим', 30);

  // Анимируем прогресс пока ждём ответ сервера
  var _pct = 30;
  var _progressTimer = SYNC.online ? setInterval(function () {
    if (_pct < 85) { _pct += 1; lsSetStatus('Загрузка с сервера', _pct); }
  }, 300) : null;

  function _stopProgress() {
    if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
  }

  serverLoad().then(function (r) {
    _stopProgress();

    if (!r || !r.ok) {
      console.warn('⚠️ [serverLoad] ответ не ok:', r);
      _showNoServerError();
      _bootFinalize();
      return;
    }

    var server = r.save;
    var currentTgId = getTgId();

    if (server && server.data && server.data.tgId && currentTgId && server.data.tgId !== currentTgId) {
      console.warn('⚠️ Сервер вернул данные другого пользователя, игнорируем');
      _showNoServerError();
      _bootFinalize();
      return;
    }

    if (server && server.data && server.data.charId &&
        typeof CHARS !== 'undefined' && CHARS[server.data.charId]) {

      SYNC.serverConfirmed = true;
      lsSetStatus('Применение данных', 90);

      if (!SYNC.started) {
        bootFromSnapshot(server.data);
        setTimeout(function () { _bootFinalize(); }, 300);
      } else {
        hotApply(server.data);
        setTimeout(function () { _bootFinalize(); }, 300);
      }
    } else if (!server || !server.data) {
      // Новый пользователь — персонаж не выбран
      _bootFinalize();
    } else {
      // charId есть, но не найден в CHARS (неизвестный)
      _bootFinalize();
    }
  }).catch(function (err) {
    _stopProgress();
    console.error('❌ [boot] serverLoad ошибка:', err.message);
    _showNoServerError();
    _bootFinalize();
  });
}

  function _showNoServerError() {
    var statusEl = document.getElementById('lsStatus');
    if (statusEl) {
      statusEl.innerHTML = '❌ Нет соединения с сервером<br><span style="font-size:10px;color:#e74c3c;">Проверьте интернет</span>';
    }
    var barWrap = document.querySelector('.ls-bar-wrap');
    if (barWrap && !document.querySelector('.ls-retry-btn')) {
      var btn = document.createElement('button');
      btn.className = 'ls-retry-btn';
      btn.textContent = '🔄 ПОВТОРИТЬ';
      btn.style.cssText = 'margin-top:12px;padding:8px 20px;background:#2a2a5a;border:1px solid #f5c542;border-radius:8px;color:#f5c542;font-size:12px;font-family:Courier New,monospace;cursor:pointer;';
      btn.onclick = function() { location.reload(); };
      barWrap.parentNode.insertBefore(btn, barWrap.nextSibling);
    }
  }

  // ═══════════════════════════════
  //  ХУКИ
  // ═══════════════════════════════

  function hookCharSelect() {
    var orig = window.confirmChar;
    if (typeof orig !== 'function') return;
    window.confirmChar = function () {
      var r = orig.apply(this, arguments);
      if (typeof G_CHAR === 'undefined' || !G_CHAR) return r;
      G.charId = G_CHAR.id;
      SYNC.started = true;
      SYNC.serverConfirmed = true;
      stopCharSelectAnims();
      
      if (SYNC.online) {
        try {
          fetch(API + '/api/character', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: TG_INIT, charId: G.charId }),
          });
        } catch (e) {}
        var snap = serializeState();
        serverSaveInstant({
          charId: G.charId,
          inventory: snap.inventory,
          equipped: snap.equipped,
          upg: snap.upg,
          skills: snap.skills,
          potionLv: snap.potionLv,
          potionThreshold: snap.potionThreshold,
          floor: snap.floor,
          level: snap.level,
          pixr: snap.pixr,
          gram: snap.gram,
          bp: snap.bp,
          prem: snap.prem,
        });
      }
      return r;
    };
  }

  // ═══════════════════════════════
  //  ❌ УБРАНО: сохранение при обновлении HUD
  //  var _hudSaveTimer = null;
  //  function saveToServerDebounced() { ... }
  // ═══════════════════════════════

  function hookActions() {
    var instantActions = [
      'equipItem', 'unequipItem', 'destroyItem', 'refineItem',
      'useSkillBook', 'buyBattlePass', 'claimBpReward', 'buyPrem',
      'upgPotion', 'goToFloor', 'buyPotions'
    ];
    
    instantActions.forEach(function (name) {
      var fn = window[name];
      if (typeof fn !== 'function') return;
      window[name] = function () {
        var r = fn.apply(this, arguments);
        try {
          var snap = serializeState();
          var data = {};
          INSTANT_FIELDS.forEach(function(field) {
            if (snap[field] !== undefined) data[field] = snap[field];
          });
          saveInstant(data);
        } catch (e) {}
        return r;
      };
    });

    // ❌ УБРАНО: сохранение при обновлении HUD
    // var origHUD = window.updateHUD;
    // if (typeof origHUD === 'function') {
    //   window.updateHUD = function () {
    //     var r = origHUD.apply(this, arguments);
    //     if (SYNC.started) saveToServerDebounced();
    //     return r;
    //   };
    // }
  }

  // ═══════════════════════════════
  //  ЭКСПОРТ ДЛЯ ИГРОВЫХ СОБЫТИЙ
  // ═══════════════════════════════

  window.onPixrDrop = function(amount) {
    G.pixr = (G.pixr || 0) + amount;
    saveInstant({ pixr: G.pixr });
  };

  window.onExchangePixr = function() {
    saveInstant({ pixr: G.pixr, gram: G.gram });
  };

  window.onItemDrop = function(item) {
    G.inventory.push(item);
    saveInstant({ inventory: G.inventory });
  };

  window.onEquip = function(item) {
    saveInstant({ equipped: G.equipped });
  };

  window.onUpgrade = function(upgId, newLevel) {
    saveInstant({ upg: G.upg });
  };

  window.onSkillUpgrade = function(skillId, newLevel) {
    saveInstant({ skills: G.skills });
  };

  window.onLevelUp = function() {
    saveInstant({ level: G.level, xpNeeded: G.xpNeeded });
  };

  window.onFloorChange = function(newFloor) {
    saveInstant({ floor: G.floor, maxFloor: G.maxFloor });
  };

  // ═══════════════════════════════
  //  ИНИЦИАЛИЗАЦИЯ
  // ═══════════════════════════════

  hookCharSelect();
  hookActions();

  if (document.readyState === 'complete') {
    boot();
  } else {
    window.addEventListener('load', boot);
  }

  window.GameSync = {
    save:        serverSaveBatch,
    flush:       flush,
    touch:       touch,
    serialize:   serializeState,
    apply:       applySnapshot,
    state:       SYNC,
    getTgId:     getTgId,
    saveInstant: saveInstant,
    _API:        API,
    get _INIT() { return TG_INIT; },
  };
})();
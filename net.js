/*
  ══════════════════════════════════════════════════════
  net.js — Сетевой слой: Telegram-авторизация,
  сохранение прогресса на сервер (MongoDB)

  СТРАТЕГИЯ СОХРАНЕНИЯ:
  ✅ МГНОВЕННО: inventory, equipped, upg, skills, potionLv,
     potionThreshold, floor, level, pixr, gram, bp, prem
  ⏱️ 3 СЕКУНДЫ: hp, gold, xp, killCount, potions

  ⚡ ОПТИМИЗАЦИИ:
  - Сжатие данных перед отправкой
  - Интервал 3 секунды (вместо 5)
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

  var EQUIP_SLOTS = ['weapon', 'armor', 'ring', 'boots', 'helmet'];
  
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
  };

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return Object.assign({}, o); } }

  // ═══════════════════════════════
  //  LOCALSTORAGE — резервная копия
  //  Используется ТОЛЬКО если сервер недоступен при загрузке.
  //  Сервер всегда имеет приоритет над localStorage.
  // ═══════════════════════════════
  var LS_KEY = 'pixrpg_save_v2';

  function saveLocal() {
    // Сохраняем при любом активном сеансе — и онлайн, и офлайн.
    // saveLocal никогда не отправляет данные на сервер — только localStorage.
    if (!SYNC.started) return;
    try {
      var snap = serializeState();
      snap._savedAt = Date.now();
      snap._offlineOnly = !SYNC.serverConfirmed; // маркер: данные не подтверждены сервером
      localStorage.setItem(LS_KEY, JSON.stringify(snap));
    } catch (e) {}
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      // Игнорируем снапшоты старше 30 дней
      if (parsed && parsed._savedAt && (Date.now() - parsed._savedAt) > 30 * 24 * 3600 * 1000) return null;
      return parsed;
    } catch (e) { return null; }
  }

  function clearLocal() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

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
    // Немедленно отключаем перехват тапов — пользователь может тапать на charSelect
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

    var full = {
      v: 1,
      tgId: getTgId(),
      charId: (typeof G_CHAR !== 'undefined' && G_CHAR) ? G_CHAR.id : (G.charId || null),

      // === МГНОВЕННЫЕ ПОЛЯ ===
      inventory: inv,
      equipped: eq,
      upg: clone(G.upg),
      skills: clone(G.skills || {}),
      potionLv: G.potionLv,
      potionThreshold: G.potionThreshold,
      floor: G.floor,
      level: G.level,
      pixr: G.pixr,
      gram: G.gram,
      bp: clone(G.bp || { active: false, claimed: [] }),
      prem: clone(G.prem || { tier: null, expiresAt: 0 }),
      boss: clone(G.boss || { floor: 1, lastFightTime: 0 }),

      // === ОТЛОЖЕННЫЕ ПОЛЯ (3 сек) ===
      hp: G.hp,
      gold: G.gold,
      xp: G.xp,
      xpNeeded: G.xpNeeded,
      killCount: G.killCount,
      potions: G.potions,

      // === ПРОЧИЕ (не отправляем тяжелые) ===
      invIdCounter: (typeof _invIdCounter === 'number') ? _invIdCounter : 0,
      dailyTasks:          clone(G.dailyTasks          || { date: '', seconds: 0, claimed: [] }),
      specialTasksClaimed: clone(G.specialTasksClaimed || {}),
      invFilter: G.invFilter || 'all',
      cp: (typeof calcCP === 'function') ? calcCP() : 0,
      updatedAt: Date.now(),
    };

    // ⚡ СЖАТИЕ: удаляем тяжелые поля, которые не нужны на сервере
    // (stats, baseStats, maxHp, xpNeeded, maxFloor — вычисляются на клиенте)
    var compressed = {
      v: full.v,
      tgId: full.tgId,
      charId: full.charId,
      inventory: full.inventory,
      equipped: full.equipped,
      upg: full.upg,
      skills: full.skills,
      potionLv: full.potionLv,
      potionThreshold: full.potionThreshold,
      floor: full.floor,
      level: full.level,
      pixr: full.pixr,
      gram: full.gram,
      bp: full.bp,
      prem: full.prem,
      boss: full.boss,
      hp: full.hp,
      gold: full.gold,
      xp: full.xp,
      xpNeeded: full.xpNeeded,
      killCount: full.killCount,
      potions: full.potions,
      invIdCounter: full.invIdCounter,
      invFilter: full.invFilter,
      dailyTasks:          full.dailyTasks,
      specialTasksClaimed: full.specialTasksClaimed,
      cp: full.cp,
      updatedAt: full.updatedAt,
    };

    return compressed;
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

    if (s.charId && typeof CHARS !== 'undefined' && CHARS[s.charId]) {
      G_CHAR = CHARS[s.charId];
      G.charId = s.charId;
      if (typeof applyCharacterSprites === 'function') applyCharacterSprites(G_CHAR);
    }

    G.upg = Object.assign(
      { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 },
      s.upg || {}
    );

    // Восстанавливаем baseStats из трёх источников:
    //   1) базовые статы персонажа
    //   2) бонусы от апгрейдов (G.upg * bonus за уровень)
    //   3) бонусы от уровней (levelUp: +2 atk, +1 def, +10 hp, +0.02 atkSpd за каждый уровень выше 1)
    // Если снапшот содержит baseStats — используем его как fallback (старые сейвы).
    if (G_CHAR && typeof UPG_DEFS !== 'undefined') {
      G.baseStats = Object.assign({}, G_CHAR.baseStats);
      // Бонусы от апгрейдов
      UPG_DEFS.forEach(function(u) {
        var lv = G.upg[u.id] || 0;
        if (lv > 0) {
          G.baseStats[u.stat] = parseFloat(
            ((G.baseStats[u.stat] || 0) + u.bonus * lv).toFixed(4)
          );
        }
      });
      // Бонусы от уровней (каждый уровень выше 1 даёт +2 atk, +1 def, +10 hp, +0.02 atkSpd)
      var lvBonuses = num(s.level, 1) - 1;
      if (lvBonuses > 0) {
        G.baseStats.atk    = (G.baseStats.atk    || 0) + lvBonuses * 2;
        G.baseStats.def    = (G.baseStats.def    || 0) + lvBonuses * 1;
        G.baseStats.hp     = (G.baseStats.hp     || 0) + lvBonuses * 10;
        G.baseStats.atkSpd = parseFloat(
          ((G.baseStats.atkSpd || 1.0) + lvBonuses * 0.02).toFixed(4)
        );
      }
    } else if (s.baseStats) {
      // Fallback для старых сейвов или если CHARS/UPG_DEFS ещё не загружены
      G.baseStats = Object.assign({}, s.baseStats);
    }

    G.skills = s.skills || {};
    G.potionLv = num(s.potionLv, 0);
    G.potionThreshold = num(s.potionThreshold, 30);
    G.floor = num(s.floor, G.floor);
    G.level = num(s.level, G.level);
    G.maxFloor = num(s.maxFloor, G.maxFloor);
    G.pixr = num(s.pixr, G.pixr);
    G.gram = num(s.gram, G.gram);
    G.bp = s.bp || { active: false, claimed: [] };
    if (!G.bp.claimed) G.bp.claimed = [];
    G.prem = s.prem || { tier: null, expiresAt: 0 };
    G.boss = s.boss || { floor: 1, lastFightTime: 0 };
    if (!G.boss.floor) G.boss.floor = 1;
    G.invFilter = s.invFilter || 'all';
    G.dailyTasks          = s.dailyTasks          || { date: '', seconds: 0, claimed: [] };
    G.specialTasksClaimed = s.specialTasksClaimed || {};

    G.gold = num(s.gold, G.gold);
    G.xp = num(s.xp, G.xp);
    G.killCount = num(s.killCount, G.killCount);
    G.potions = num(s.potions, G.potions);

    G.inventory = (s.inventory || []).map(function (it) {
      var c = clone(it); c._equipped = false; return c;
    });

    if (typeof s.invIdCounter === 'number') _invIdCounter = s.invIdCounter;
    G.inventory.forEach(function (i) {
      if (typeof i.id === 'number' && i.id > _invIdCounter) _invIdCounter = i.id;
    });

    G.equipped = { weapon: null, armor: null, ring: null, boots: null, helmet: null };
    var eq = s.equipped || {};
    EQUIP_SLOTS.forEach(function (slot) {
      var id = eq[slot];
      if (id == null) return;
      var it = G.inventory.find(function (i) { return i.id === id; });
      if (it) { it._equipped = true; G.equipped[slot] = it; }
    });

    if (typeof recalcStats === 'function') recalcStats();
    
    G.maxHp = num(s.maxHp, G.maxHp);
    G.xpNeeded = num(s.xpNeeded, 0);
    // Если xpNeeded не сохранён (старые сейвы) — пересчитываем из уровня
    if (!G.xpNeeded || G.xpNeeded < 100) {
      var _xp = 100;
      for (var _lv = 1; _lv < G.level; _lv++) {
        _xp = Math.floor(_xp * (_lv < 7 ? 2.5 : 1.1));
      }
      G.xpNeeded = _xp;
    }
    
    var hp = num(s.hp, G.maxHp);
    if (hp <= 0) hp = Math.floor(G.maxHp * 0.3);
    G.hp = Math.max(1, Math.min(hp, G.maxHp));

    SYNC.lastHp = G.hp;
    SYNC.lastGold = G.gold;
    SYNC.lastXp = G.xp;
    SYNC.lastKillCount = G.killCount;
    SYNC.lastPotions = G.potions;

    return true;
  }

  // ═══════════════════════════════
  //  СЕРВЕРНЫЕ ЗАПРОСЫ
  // ═══════════════════════════════

  var START_PARAM = '';

  function serverLoad() {
    if (!SYNC.online) return Promise.resolve(null);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 5000) : null;
    
    return fetch(API + '/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT, startParam: START_PARAM }),
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (r) { 
      clearTimeout(timer); 
      return r.json(); 
    })
    .catch(function (e) { 
      clearTimeout(timer); 
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

  // ⚡ ОТЛОЖЕННОЕ СОХРАНЕНИЕ — КАЖДЫЕ 3 СЕКУНДЫ
  function serverSaveBatch() {
    if (!SYNC.online || !SYNC.serverConfirmed || SYNC.pushing) {
      return;
    }

    // Пауза при rate limit (429)
    if (SYNC.rlBackoffUntil && Date.now() < SYNC.rlBackoffUntil) {
      return;
    }
    
    var currentHp = G.hp;
    var currentGold = G.gold;
    var currentXp = G.xp;
    var currentKillCount = G.killCount;
    var currentPotions = G.potions;
    
    var hasChanges = 
      currentHp !== SYNC.lastHp ||
      currentGold !== SYNC.lastGold ||
      currentXp !== SYNC.lastXp ||
      currentKillCount !== SYNC.lastKillCount ||
      currentPotions !== SYNC.lastPotions;

    if (!hasChanges) return;

    SYNC.pushing = true;
    
    var snap = serializeState();
    snap.hp = currentHp;
    snap.gold = currentGold;
    snap.xp = currentXp;
    snap.killCount = currentKillCount;
    snap.potions = currentPotions;
    snap.updatedAt = Date.now();
    
    fetch(API + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT, data: snap }),
    }).then(function (r) { return r.json(); })
      .then(function (r) {
        if (r && r.ok) {
          SYNC.lastHp = currentHp;
          SYNC.lastGold = currentGold;
          SYNC.lastXp = currentXp;
          SYNC.lastKillCount = currentKillCount;
          SYNC.lastPotions = currentPotions;
          SYNC.lastServerTs = r.updatedAt || snap.updatedAt;
          SYNC.rlBackoffUntil = 0;
          saveLocal();
        } else if (r && r.error === 'rate_limit') {
          // Пауза 6 секунд при rate limit
          SYNC.rlBackoffUntil = Date.now() + 6000;
          console.warn('⚠️ [save] rate limit, пауза 6s');
        }
      })
      .catch(function () {})
      .then(function () { SYNC.pushing = false; });
  }

  function saveInstant(data) {
    if (!SYNC.started || !SYNC.online) return;
    saveLocal();
    serverSaveInstant(data).catch(function() {});
  }

  function touch() {
    if (!SYNC.started || !SYNC.online) return;
    clearTimeout(SYNC.dirtyTimer);
    SYNC.dirtyTimer = setTimeout(serverSaveBatch, 500);
  }

  function flush() {
    if (!SYNC.started) return;
    // Сначала сохраняем в localStorage (синхронно, всегда успевает)
    saveLocal();
    // Затем пробуем отправить на сервер с keepalive
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
    if (!applySnapshot(snap)) return;
    hideCharSelect();
    SYNC.started = true;
    if (typeof startGame === 'function') startGame();
  }

  function hotApply(snap) {
    if (!applySnapshot(snap)) return;
    if (typeof updateHUD === 'function') updateHUD();
    if (typeof initSkillsHud === 'function') initSkillsHud();
    if (typeof updatePotionHud === 'function') updatePotionHud();
    try { if (typeof switchTab === 'function' && typeof activeTab !== 'undefined') switchTab(activeTab); } catch (e) {}
  }

  // ═══════════════════════════════
  //  ЦИКЛЫ СИНХРОНИЗАЦИИ — 3 СЕКУНДЫ
  // ═══════════════════════════════

  function startSyncLoops() {
    // ⚡ КАЖДЫЕ 3 СЕКУНДЫ — серверный батч-сейв
    SYNC.batchTimer = setInterval(serverSaveBatch, 3000);

    // ⚡ КАЖДЫЕ 10 СЕКУНД — локальный бекап (работает и в офлайн-режиме)
    setInterval(saveLocal, 10000);

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
    if (tgId) SYNC.currentTgId = tgId;
    console.log('🟢 [initTelegram] Пользователь:', tgId, 'Online:', SYNC.online);
  }

  function boot() {
    lsInitStars();
    lsSetStatus('Подключение', 10);
    initTelegram();

    // Аварийный таймер: экран загрузки ВСЕГДА скроется через 8 секунд,
    // даже если в промис-цепочке произошла ошибка.
    var _emergencyTimer = setTimeout(function () {
      console.warn('⚠️ [boot] emergency hide');
      lsHide();
    }, 8000);

    function _bootFinalize() {
      clearTimeout(_emergencyTimer);
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

    lsSetStatus(SYNC.online ? 'Загрузка с сервера' : 'Офлайн режим', 60);

    serverLoad().then(function (r) {
      if (!r || !r.ok) {
        console.warn('⚠️ [serverLoad] ответ не ok:', r);
        _tryBootFromLocal();
        return;
      }

      var server = r.save;
      var currentTgId = getTgId();

      if (server && server.data && server.data.tgId && currentTgId && server.data.tgId !== currentTgId) {
        console.warn('⚠️ Сервер вернул данные другого пользователя, игнорируем');
        _tryBootFromLocal();
        return;
      }

      if (server && server.data && server.data.charId &&
          typeof CHARS !== 'undefined' && CHARS[server.data.charId]) {
        SYNC.serverConfirmed = true;
        lsSetStatus('Применение данных', 85);
        if (!SYNC.started) {
          bootFromSnapshot(server.data);
        } else {
          hotApply(server.data);
        }
      } else if (!server || !server.data) {
        if (SYNC.started) {
          SYNC.started = false;
          SYNC.serverConfirmed = false;
          resetToCharSelect();
        }
        clearLocal();
      }
    }).catch(function (err) {
      console.error('❌ [boot] serverLoad ошибка:', err.message);
      _tryBootFromLocal();
    }).then(function () {
      _bootFinalize();
    });
  }

  // Загрузка из localStorage когда сервер недоступен.
  // НЕ устанавливает serverConfirmed — сохранение на сервер заблокировано.
  function _tryBootFromLocal() {
    if (SYNC.started) return; // уже загружено
    var local = loadLocal();
    if (!local || !local.charId) return;
    // Проверяем что локальные данные принадлежат текущему пользователю
    var currentTgId = getTgId();
    if (local.tgId && currentTgId && local.tgId !== currentTgId) return;
    console.warn('⚠️ [boot] Сервер недоступен, загружаем из localStorage');
    lsSetStatus('Офлайн режим', 85);
    if (applySnapshot(local)) {
      hideCharSelect();
      SYNC.started = true;
      // serverConfirmed остаётся false — сейвы на сервер не пойдут
      if (typeof startGame === 'function') startGame();
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

  var _hudSaveTimer = null;
  function saveToServerDebounced() {
    if (_hudSaveTimer) return;
    _hudSaveTimer = setTimeout(function () { 
      _hudSaveTimer = null; 
      serverSaveBatch(); 
    }, 500);
  }

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

    var origHUD = window.updateHUD;
    if (typeof origHUD === 'function') {
      window.updateHUD = function () {
        var r = origHUD.apply(this, arguments);
        if (SYNC.started) saveToServerDebounced();
        return r;
      };
    }
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
    saveLocal:   saveLocal,
    clearLocal:  clearLocal,
    _API:        API,
    get _INIT() { return TG_INIT; },
  };
})();
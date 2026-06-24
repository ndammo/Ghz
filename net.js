/*
  ══════════════════════════════════════════════════════
  net.js — Сетевой слой (УПРОЩЁННЫЙ, НО РАБОЧИЙ)
  - Нет localStorage
  - Мгновенное сохранение
  - Полное сохранение каждые 5 секунд
  ══════════════════════════════════════════════════════
*/
(function () {
  'use strict';

  // ═══════════════════════════════
  //  КОНФИГ
  // ═══════════════════════════════
  var API = (function() {
    var url = new URLSearchParams(window.location.search).get('api') || 
              window.ENV_API_URL || 
              'https://ghz-production.up.railway.app';
    return url.replace(/\/$/, '');
  })();

  var TG_INIT = '';
  var SYNC = {
    started: false,
    online: false,
    pushing: false,
    serverConfirmed: false,
    currentTgId: null,
    saveTimer: null,
    lastFullSave: 0,
  };

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
  //  ПОЛНЫЙ СНАПШОТ
  // ═══════════════════════════════
  function getFullSnapshot() {
    var eq = {};
    var EQUIP_SLOTS = ['weapon', 'armor', 'ring', 'boots', 'helmet'];
    EQUIP_SLOTS.forEach(function (slot) {
      var it = window.G && window.G.equipped && window.G.equipped[slot];
      eq[slot] = it ? it.id : null;
    });

    var inv = (window.G && window.G.inventory || []).map(function (it) {
      var c = JSON.parse(JSON.stringify(it));
      delete c._equipped;
      return c;
    });

    var G = window.G || {};
    var G_CHAR = window.G_CHAR || null;

    return {
      tgId: getTgId(),
      charId: G_CHAR ? G_CHAR.id : (G.charId || null),
      inventory: inv,
      equipped: eq,
      upg: JSON.parse(JSON.stringify(G.upg || {})),
      skills: JSON.parse(JSON.stringify(G.skills || {})),
      potionLv: G.potionLv || 0,
      potionThreshold: G.potionThreshold || 30,
      floor: G.floor || 1,
      level: G.level || 1,
      pixr: G.pixr || 0,
      gram: G.gram || 0,
      bp: JSON.parse(JSON.stringify(G.bp || { active: false, claimed: [] })),
      prem: JSON.parse(JSON.stringify(G.prem || { tier: null, expiresAt: 0 })),
      boss: JSON.parse(JSON.stringify(G.boss || { floor: 1, lastFightTime: 0 })),
      hp: G.hp || 0,
      gold: G.gold || 0,
      xp: G.xp || 0,
      xpNeeded: G.xpNeeded || 100,
      killCount: G.killCount || 0,
      potions: G.potions || 0,
      invIdCounter: (typeof window._invIdCounter === 'number') ? window._invIdCounter : 0,
      dailyTasks: JSON.parse(JSON.stringify(G.dailyTasks || { date: '', seconds: 0, claimed: [] })),
      specialTasksClaimed: JSON.parse(JSON.stringify(G.specialTasksClaimed || {})),
      invFilter: G.invFilter || 'all',
      maxFloor: G.maxFloor || 1,
      cp: (typeof window.calcCP === 'function') ? window.calcCP() : 0,
      updatedAt: Date.now(),
    };
  }

  // ═══════════════════════════════
  //  СОХРАНЕНИЕ
  // ═══════════════════════════════
  function saveToServer(instant) {
    if (!SYNC.online || !SYNC.serverConfirmed || SYNC.pushing) {
      return;
    }

    if (!instant) {
      var now = Date.now();
      if (now - SYNC.lastFullSave < 5000) return;
      SYNC.lastFullSave = now;
    }

    SYNC.pushing = true;
    var snapshot = getFullSnapshot();
    snapshot.updatedAt = Date.now();

    fetch(API + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT, data: snapshot }),
    })
    .then(function (r) { return r.json(); })
    .then(function (r) {
      if (r && r.ok) {
        SYNC.lastFullSave = Date.now();
      }
    })
    .catch(function () {})
    .then(function () {
      SYNC.pushing = false;
    });
  }

  function saveInstant() {
    if (!SYNC.started || !SYNC.online || !SYNC.serverConfirmed) return;
    saveToServer(true);
  }

  function startPeriodicSave() {
    if (SYNC.saveTimer) return;
    SYNC.saveTimer = setInterval(function() {
      if (SYNC.started && SYNC.online && SYNC.serverConfirmed) {
        saveToServer(false);
      }
    }, 5000);
  }

  // ═══════════════════════════════
  //  ПРИМЕНЕНИЕ СНАПШОТА
  // ═══════════════════════════════
  function applySnapshot(s) {
    if (!s || typeof s !== 'object') return false;

    var currentTgId = getTgId();
    if (s.tgId && currentTgId && s.tgId !== currentTgId) {
      console.warn('⚠️ Игнорируем данные другого пользователя');
      return false;
    }

    var G = window.G;
    if (!G) {
      console.error('❌ G не определён!');
      return false;
    }

    // Персонаж
    if (s.charId && typeof window.CHARS !== 'undefined' && window.CHARS[s.charId]) {
      window.G_CHAR = window.CHARS[s.charId];
      G.charId = s.charId;
      if (typeof window.applyCharacterSprites === 'function') {
        window.applyCharacterSprites(window.G_CHAR);
      }
    }

    // Базовые статы
    G.upg = Object.assign(
      { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 },
      s.upg || {}
    );

    var G_CHAR = window.G_CHAR;
    if (G_CHAR && typeof window.UPG_DEFS !== 'undefined') {
      G.baseStats = Object.assign({}, G_CHAR.baseStats);
      window.UPG_DEFS.forEach(function(u) {
        var lv = G.upg[u.id] || 0;
        if (lv > 0) {
          G.baseStats[u.stat] = parseFloat(
            ((G.baseStats[u.stat] || 0) + u.bonus * lv).toFixed(4)
          );
        }
      });
      var lvBonuses = (s.level || 1) - 1;
      if (lvBonuses > 0) {
        G.baseStats.atk    = (G.baseStats.atk || 0) + lvBonuses * 2;
        G.baseStats.def    = (G.baseStats.def || 0) + lvBonuses * 1;
        G.baseStats.hp     = (G.baseStats.hp || 0) + lvBonuses * 10;
        G.baseStats.atkSpd = parseFloat(((G.baseStats.atkSpd || 1.0) + lvBonuses * 0.02).toFixed(4));
      }
    }

    // Простые поля
    G.skills = s.skills || {};
    G.potionLv = s.potionLv || 0;
    G.potionThreshold = s.potionThreshold || 30;
    G.floor = s.floor || 1;
    G.level = s.level || 1;
    G.maxFloor = s.maxFloor || 1;
    G.pixr = s.pixr || 0;
    G.gram = s.gram || 0;
    G.gold = s.gold || 0;
    G.xp = s.xp || 0;
    G.killCount = s.killCount || 0;
    G.potions = s.potions || 0;
    G.invFilter = s.invFilter || 'all';
    G.bp = s.bp || { active: false, claimed: [] };
    if (!G.bp.claimed) G.bp.claimed = [];
    G.prem = s.prem || { tier: null, expiresAt: 0 };
    G.boss = s.boss || { floor: 1, lastFightTime: 0 };
    if (!G.boss.floor) G.boss.floor = 1;
    G.dailyTasks = s.dailyTasks || { date: '', seconds: 0, claimed: [] };
    G.specialTasksClaimed = s.specialTasksClaimed || {};
    G.xpNeeded = s.xpNeeded || 100;
    if (typeof s.invIdCounter === 'number') window._invIdCounter = s.invIdCounter;

    // Инвентарь
    G.inventory = (s.inventory || []).map(function (it) {
      var c = JSON.parse(JSON.stringify(it));
      c._equipped = false;
      return c;
    });

    G.inventory.forEach(function (i) {
      if (typeof i.id === 'number' && i.id > (window._invIdCounter || 0)) {
        window._invIdCounter = i.id;
      }
    });

    // Экипировка
    G.equipped = { weapon: null, armor: null, ring: null, boots: null, helmet: null };
    var eq = s.equipped || {};
    var EQUIP_SLOTS = ['weapon', 'armor', 'ring', 'boots', 'helmet'];
    EQUIP_SLOTS.forEach(function (slot) {
      var id = eq[slot];
      if (id == null) return;
      var it = G.inventory.find(function (i) { return i.id === id; });
      if (it) {
        it._equipped = true;
        G.equipped[slot] = it;
      }
    });

    // Пересчёт статов
    if (typeof window.recalcStats === 'function') window.recalcStats();
    
    G.maxHp = s.maxHp || G.baseStats.hp || 100;
    G.hp = s.hp || G.maxHp;
    if (G.hp <= 0) G.hp = Math.floor(G.maxHp * 0.3);
    if (G.hp > G.maxHp) G.hp = G.maxHp;

    return true;
  }

  // ═══════════════════════════════
  //  ЗАГРУЗКА С СЕРВЕРА
  // ═══════════════════════════════
  function serverLoad() {
    if (!SYNC.online) return Promise.resolve(null);
    
    return fetch(API + '/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT }),
    })
    .then(function (r) { return r.json(); })
    .catch(function (e) {
      console.error('❌ [serverLoad] ошибка:', e.message);
      throw e;
    });
  }

  // ═══════════════════════════════
  //  ЭКРАН ЗАГРУЗКИ
  // ═══════════════════════════════
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
    setTimeout(function () {
      el.classList.add('fade-out');
      setTimeout(function () {
        el.style.display = 'none';
        el.classList.add('hidden-done');
      }, 520);
    }, 300);
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

  function stopCharSelectAnims() {
    try {
      if (typeof window._csSpriteTimers !== 'undefined') {
        Object.keys(window._csSpriteTimers).forEach(function (k) {
          clearInterval(window._csSpriteTimers[k]);
        });
      }
    } catch (e) {}
    try {
      if (typeof window._csParticleTimer !== 'undefined' && window._csParticleTimer) {
        cancelAnimationFrame(window._csParticleTimer);
      }
    } catch (e) {}
  }

  function hideCharSelect() {
    var cs = document.getElementById('charSelect');
    if (cs) cs.classList.add('hidden');
    stopCharSelectAnims();
  }

  function bootFromSnapshot(snap) {
    if (SYNC.started) return;
    if (!applySnapshot(snap)) return;
    hideCharSelect();
    SYNC.started = true;
    if (typeof window.startGame === 'function') window.startGame();
    startPeriodicSave();
  }

  function resetToCharSelect() {
    if (typeof window.gameActive !== 'undefined') window.gameActive = false;
    if (typeof window.G_CHAR !== 'undefined') window.G_CHAR = null;
    try {
      var G = window.G;
      if (G) {
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
      }
    } catch(e) {}
    if (typeof window._invIdCounter !== 'undefined') window._invIdCounter = 0;
    
    var cs = document.getElementById('charSelect');
    if (cs) cs.classList.remove('hidden');
    var canvas = document.getElementById('gameCanvas');
    if (canvas) canvas.style.display = 'none';
    var skillsHud = document.getElementById('skillsHud');
    if (skillsHud) skillsHud.classList.remove('visible');
  }

  function initTelegram() {
    if (window.Telegram && window.Telegram.WebApp) {
      try { window.Telegram.WebApp.ready(); } catch (e) {}
      try { window.Telegram.WebApp.expand(); } catch (e) {}
      try { window.Telegram.WebApp.disableVerticalSwipes && window.Telegram.WebApp.disableVerticalSwipes(); } catch (e) {}
      TG_INIT = window.Telegram.WebApp.initData || '';
    }
    SYNC.online = !!TG_INIT;
    var tgId = getTgId();
    if (tgId) SYNC.currentTgId = tgId;
    console.log('🟢 [initTelegram] Пользователь:', tgId, 'Online:', SYNC.online);
  }

  // ═══════════════════════════════
  //  ЗАГРУЗКА ИГРЫ
  // ═══════════════════════════════
  function boot() {
    lsInitStars();
    lsSetStatus('Подключение', 10);
    initTelegram();

    if (!SYNC.online) {
      lsSetStatus('❌ Нет подключения', 100);
      setTimeout(function() {
        lsHide();
        resetToCharSelect();
      }, 1000);
      return;
    }

    lsSetStatus('Загрузка данных', 50);

    serverLoad()
      .then(function (r) {
        if (r && r.ok && r.save && r.save.data) {
          SYNC.serverConfirmed = true;
          lsSetStatus('Применение данных', 80);
          bootFromSnapshot(r.save.data);
        } else {
          lsSetStatus('Нет сохранений', 80);
          resetToCharSelect();
        }
      })
      .catch(function (err) {
        console.error('❌ [boot] ошибка:', err.message);
        lsSetStatus('❌ Ошибка загрузки', 100);
        setTimeout(function() {
          resetToCharSelect();
        }, 1000);
      })
      .then(function () {
        lsHide();
      });
  }

  // ═══════════════════════════════
  //  ХУКИ ДЛЯ МГНОВЕННОГО СОХРАНЕНИЯ
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
        if (SYNC.started) saveInstant();
        return r;
      };
    });
  }

  // ═══════════════════════════════
  //  ЭКСПОРТ ДЛЯ ИГРЫ
  // ═══════════════════════════════
  window.onPixrDrop = function(amount) {
    if (window.G) {
      window.G.pixr = (window.G.pixr || 0) + amount;
      saveInstant();
    }
  };

  window.onExchangePixr = function() {
    saveInstant();
  };

  window.onItemDrop = function(item) {
    if (window.G) {
      window.G.inventory.push(item);
      saveInstant();
    }
  };

  window.onEquip = function(item) {
    saveInstant();
  };

  window.onUpgrade = function(upgId, newLevel) {
    saveInstant();
  };

  window.onSkillUpgrade = function(skillId, newLevel) {
    saveInstant();
  };

  window.onLevelUp = function() {
    saveInstant();
  };

  window.onFloorChange = function(newFloor) {
    saveInstant();
  };

  // ═══════════════════════════════
  //  ПРИНУДИТЕЛЬНОЕ СОХРАНЕНИЕ
  // ═══════════════════════════════
  function flushOnClose() {
    if (!SYNC.started || !SYNC.online || !SYNC.serverConfirmed) return;
    var snapshot = getFullSnapshot();
    snapshot.updatedAt = Date.now();
    try {
      fetch(API + '/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: TG_INIT, data: snapshot }),
        keepalive: true,
      });
    } catch (e) {}
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) flushOnClose();
  });

  if (window.Telegram && window.Telegram.WebApp) {
    try { window.Telegram.WebApp.onEvent('close', flushOnClose); } catch (e) {}
  }

  window.addEventListener('pagehide', flushOnClose);
  window.addEventListener('beforeunload', flushOnClose);

  // ═══════════════════════════════
  //  ЗАПУСК
  // ═══════════════════════════════
  hookActions();

  if (document.readyState === 'complete') {
    boot();
  } else {
    window.addEventListener('load', boot);
  }

  window.GameSync = {
    save: function() { saveToServer(false); },
    saveInstant: saveInstant,
    flush: flushOnClose,
    state: SYNC,
    getTgId: getTgId,
    _API: API,
    get _INIT() { return TG_INIT; },
  };

})();
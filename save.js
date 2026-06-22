/*
  ══════════════════════════════════════════════════════
  save.js — Система сохранений Pixel Runner RPG
  Локальное сохранение (localStorage) + сервер Railway
  API: https://ghz-production.up.railway.app/
  ══════════════════════════════════════════════════════

  Подключать ПОСЛЕ ui.js (последним скриптом).

  Публичное API:
    SaveSystem.init()          — вызывается при старте игры
    SaveSystem.saveLocal()     — сохранить только в localStorage
    SaveSystem.saveServer()    — сохранить на сервер (throttled)
    SaveSystem.saveNow()       — немедленно сохранить на сервер
    SaveSystem.load()          — загрузить (сервер → local fallback)
*/

var SaveSystem = (function() {
  'use strict';

  var API       = 'https://ghz-production.up.railway.app';
  var LS_KEY    = 'pixelrpg_save_v1';
  var INTERVAL  = 60;          // авто-сейв каждые N секунд
  var MIN_SERVER_INTERVAL = 15; // не чаще раза в 15 сек

  var _initData     = '';
  var _lastServerSave = 0;
  var _dirty        = false;
  var _autoTimer    = null;
  var _initialized  = false;
  var _charId       = 'fire';

  // ──────────────────────────────────────────────────
  //  Собрать объект сохранения из G
  // ──────────────────────────────────────────────────
  function buildSave() {
    return {
      gold:      G.gold,
      pixr:      G.pixr,
      gram:      G.gram,
      level:     G.level,
      xp:        G.xp,
      xpNeeded:  G.xpNeeded,
      floor:     G.floor,
      maxFloor:  G.maxFloor,
      killCount: G.killCount,
      cp:        calcCP(),
      hp:        G.hp,
      maxHp:     G.maxHp,
      upg:       Object.assign({}, G.upg),
      potionLv:  G.potionLv,
      potions:   G.potions || 0,
      potionThreshold: G.potionThreshold || 30,
      baseStats: Object.assign({}, G.baseStats),
      stats:     Object.assign({}, G.stats),
      charId:    _charId,
      inventory: (G.inventory || []).map(function(item) { return Object.assign({}, item); }),
      equipped:  Object.assign({}, G.equipped),
      owned:     Object.assign({}, G.owned),
      skills:    Object.assign({}, G.skills),
      bp:        { active: G.bp.active, claimed: (G.bp.claimed || []).slice() },
      prem:      Object.assign({}, G.prem),
      invFilter: G.invFilter || 'all',
    };
  }

  // ──────────────────────────────────────────────────
  //  Применить загруженные данные в G
  // ──────────────────────────────────────────────────
  function applySave(d) {
    if (!d) return;

    G.gold      = d.gold      != null ? d.gold      : G.gold;
    G.pixr      = d.pixr      != null ? d.pixr      : G.pixr;
    G.gram      = d.gram      != null ? d.gram      : G.gram;
    G.level     = d.level     != null ? d.level     : G.level;
    G.xp        = d.xp        != null ? d.xp        : G.xp;
    G.xpNeeded  = d.xpNeeded  != null ? d.xpNeeded  : G.xpNeeded;
    G.floor     = d.floor     != null ? d.floor     : G.floor;
    G.maxFloor  = d.maxFloor  != null ? d.maxFloor  : G.maxFloor;
    G.killCount = d.killCount != null ? d.killCount : G.killCount;
    G.hp        = d.hp        != null ? d.hp        : G.hp;
    G.maxHp     = d.maxHp     != null ? d.maxHp     : G.maxHp;

    if (d.upg && typeof d.upg === 'object')        Object.assign(G.upg, d.upg);
    if (d.baseStats && typeof d.baseStats === 'object') Object.assign(G.baseStats, d.baseStats);
    if (d.stats && typeof d.stats === 'object')    Object.assign(G.stats, d.stats);

    G.potionLv        = d.potionLv        != null ? d.potionLv        : G.potionLv;
    G.potions         = d.potions         != null ? d.potions         : G.potions;
    G.potionThreshold = d.potionThreshold != null ? d.potionThreshold : G.potionThreshold;

    if (Array.isArray(d.inventory)) G.inventory = d.inventory.slice();
    if (d.equipped && typeof d.equipped === 'object') Object.assign(G.equipped, d.equipped);
    if (d.owned    && typeof d.owned    === 'object') Object.assign(G.owned, d.owned);
    if (d.skills   && typeof d.skills   === 'object') Object.assign(G.skills, d.skills);

    if (d.bp) {
      G.bp.active  = !!d.bp.active;
      G.bp.claimed = Array.isArray(d.bp.claimed) ? d.bp.claimed.slice() : [];
    }
    if (d.prem) Object.assign(G.prem, d.prem);
    if (d.invFilter) G.invFilter = d.invFilter;

    if (d.charId) _charId = d.charId;
  }

  // ──────────────────────────────────────────────────
  //  Получить initData от Telegram
  // ──────────────────────────────────────────────────
  function getInitData() {
    try {
      if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) {
        return Telegram.WebApp.initData;
      }
    } catch (_) {}
    // DEV fallback — можно заменить на реальный userId для тестов
    return 'dev:' + (localStorage.getItem('pixelrpg_devid') || _genDevId());
  }

  function _genDevId() {
    var id = 'dev_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('pixelrpg_devid', id);
    return id;
  }

  // ──────────────────────────────────────────────────
  //  LOCAL STORAGE
  // ──────────────────────────────────────────────────
  function saveLocal() {
    try {
      var snap = { data: buildSave(), ts: Date.now() };
      localStorage.setItem(LS_KEY, JSON.stringify(snap));
    } catch (e) {
      console.warn('[Save] localStorage write failed:', e);
    }
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var snap = JSON.parse(raw);
      return snap && snap.data ? snap : null;
    } catch (_) {
      return null;
    }
  }

  // ──────────────────────────────────────────────────
  //  SERVER SAVE (throttled)
  // ──────────────────────────────────────────────────
  function saveServer() {
    var now = Date.now() / 1000;
    if (now - _lastServerSave < MIN_SERVER_INTERVAL) {
      _dirty = true;
      return;
    }
    _doServerSave();
  }

  function saveNow() {
    _doServerSave();
  }

  function _doServerSave() {
    _lastServerSave = Date.now() / 1000;
    _dirty = false;

    var body = JSON.stringify({ saveData: buildSave() });

    fetch(API + '/save', {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-tg-init-data':  _initData,
      },
      body:      body,
      keepalive: true,   // работает при закрытии вкладки
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (!res.ok) console.warn('[Save] server returned:', res);
    })
    .catch(function(e) {
      console.warn('[Save] server save failed, using local only:', e.message);
    });

    // Всегда дублируем локально
    saveLocal();
  }

  // ──────────────────────────────────────────────────
  //  LOAD — сервер → localfallback
  // ──────────────────────────────────────────────────
  function load() {
    return fetch(API + '/save', {
      method:  'GET',
      headers: { 'x-tg-init-data': _initData },
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.found && res.saveData) {
        applySave(res.saveData);
        // Перезаписываем локальный кеш свежими серверными данными
        saveLocal();
        console.log('[Save] loaded from server');
        return { source: 'server', data: res.saveData };
      } else {
        return _tryLoadLocal();
      }
    })
    .catch(function(e) {
      console.warn('[Save] server load failed, trying local:', e.message);
      return _tryLoadLocal();
    });
  }

  function _tryLoadLocal() {
    var snap = loadLocal();
    if (snap && snap.data) {
      applySave(snap.data);
      console.log('[Save] loaded from localStorage');
      return { source: 'local', data: snap.data };
    }
    console.log('[Save] no save found, new game');
    return { source: 'none', data: null };
  }

  // ──────────────────────────────────────────────────
  //  Отметить изменение (вызывать из buyUpgrade, лут, etc.)
  // ──────────────────────────────────────────────────
  function markDirty() {
    _dirty = true;
    saveLocal(); // сразу в localStorage
  }

  // ──────────────────────────────────────────────────
  //  Авто-сейв каждые INTERVAL секунд
  // ──────────────────────────────────────────────────
  function _startAutoSave() {
    if (_autoTimer) clearInterval(_autoTimer);
    _autoTimer = setInterval(function() {
      if (_dirty) saveServer();
      else        saveLocal();
    }, INTERVAL * 1000);
  }

  // ──────────────────────────────────────────────────
  //  Сохранить при уходе со страницы
  // ──────────────────────────────────────────────────
  function _bindUnload() {
    // visibilitychange — срабатывает и на Android при сворачивании
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') {
        saveLocal();          // надёжный синхронный путь
        _doServerSave();      // keepalive fetch — попытка на сервер
      }
    });

    // pagehide — резервный
    window.addEventListener('pagehide', function() {
      saveLocal();
      _doServerSave();
    });

    // beforeunload — для браузеров
    window.addEventListener('beforeunload', function() {
      saveLocal();
    });
  }

  // ──────────────────────────────────────────────────
  //  INIT — вызвать один раз перед startGame()
  //  charId — выбранный персонаж ('fire'|'light'|'water')
  // ──────────────────────────────────────────────────
  function init(charId) {
    if (_initialized) return Promise.resolve({ source: 'already' });
    _initialized = true;

    _charId   = charId || 'fire';
    _initData = getInitData();

    _bindUnload();
    _startAutoSave();

    return load();
  }

  // ══════════════════════════════════════════════════
  return {
    init:        init,
    saveLocal:   saveLocal,
    saveServer:  saveServer,
    saveNow:     saveNow,
    load:        load,
    markDirty:   markDirty,
    buildSave:   buildSave,
  };
})();

/*
  ══════════════════════════════════════════════════════
  net.js — Сетевой слой: Telegram-авторизация, сохранение
  прогресса на сервер (MongoDB), локальный кеш.
  Версия: 2.1 (финальная)

  Логика:
   • При запуске: моментальный старт из localStorage, затем сверка с сервером.
   • localStorage каждые 5 сек, сервер каждые 30 сек.
   • При закрытии/сворачивании — flush() через fetch + keepalive.
   • Структурные действия — сохраняются сразу (debounce 1.2с).
   • Слияние данных: сервер ↔ локальный по updatedAt.

  Подключать ПОСЛЕ ui.js (последним скриптом).
  ══════════════════════════════════════════════════════
*/
(function () {
  'use strict';

  var API    = 'https://ghz-production.up.railway.app';
  var LS_KEY = 'prrpg_save_v2';
  var EQUIP_SLOTS = ['weapon', 'armor', 'ring', 'boots', 'helmet'];

  var TG_INIT = '';
  var SYNC = {
    booted: false,
    started: false,
    online: false,
    pushing: false,
    dirtyTimer: null,
    lastServerTs: 0,
    saveQueue: [],
    bootLocked: false,
  };

  // ───────────────────────────────
  //  УТИЛИТЫ
  // ───────────────────────────────
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  
  function clone(o) {
    if (!o || typeof o !== 'object') return o;
    try { return JSON.parse(JSON.stringify(o)); }
    catch (e) { return Object.assign({}, o); }
  }

  function isValidSave(s) {
    return s && typeof s === 'object' && s.v === 1 && s.charId && s.level != null;
  }

  // ───────────────────────────────
  //  ЭКРАН ЗАГРУЗКИ
  // ───────────────────────────────
  var LS_MIN_MS = 800;
  var _lsShownAt = Date.now();
  var _lsHidden = false;

  function lsSetStatus(text, pct) {
    var el = document.getElementById('lsStatus');
    if (el) el.innerHTML = '<span class="ls-dots">' + text + '</span>';
    var bar = document.getElementById('lsBar');
    if (bar && pct != null) bar.style.width = pct + '%';
  }

  function lsHide() {
    if (_lsHidden) return;
    _lsHidden = true;
    var el = document.getElementById('loadingScreen');
    if (!el || el.classList.contains('fade-out')) return;
    var delay = Math.max(0, LS_MIN_MS - (Date.now() - _lsShownAt));
    setTimeout(function () {
      lsSetStatus('Готово', 100);
      setTimeout(function () {
        el.classList.add('fade-out');
        setTimeout(function () { el.style.display = 'none'; }, 520);
      }, 300);
    }, delay);
  }

  function lsInitStars() {
    var wrap = document.getElementById('lsStars');
    if (!wrap) return;
    var html = '';
    for (var i = 0; i < 60; i++) {
      html += '<div class="ls-star" style="left:' + (Math.random() * 100).toFixed(1) + 
              '%;top:' + (Math.random() * 100).toFixed(1) + 
              '%;opacity:' + (0.1 + Math.random() * 0.4).toFixed(2) + 
              ';--dur:' + (1.5 + Math.random() * 2.5).toFixed(1) + 
              's;--delay:-' + (Math.random() * 3).toFixed(1) + 's;"></div>';
    }
    wrap.innerHTML = html;
  }

  // ───────────────────────────────
  //  СЕРИАЛИЗАЦИЯ
  // ───────────────────────────────
  var _cachedCP = 0, _cachedCPTime = 0;

  function serializeState() {
    var eq = {};
    EQUIP_SLOTS.forEach(function (slot) {
      var it = G.equipped && G.equipped[slot];
      eq[slot] = it ? it.id : null;
    });

    var inv = (G.inventory || []).map(function (it) {
      var c = Object.assign({}, it);
      delete c._equipped;
      return c;
    });

    var now = Date.now();
    if (now - _cachedCPTime > 5000) {
      _cachedCP = (typeof calcCP === 'function') ? calcCP() : 0;
      _cachedCPTime = now;
    }

    return {
      v: 1,
      charId: (typeof G_CHAR !== 'undefined' && G_CHAR) ? G_CHAR.id : (G.charId || null),
      gold: G.gold, pixr: G.pixr, gram: G.gram,
      level: G.level, xp: G.xp, xpNeeded: G.xpNeeded,
      floor: G.floor, maxFloor: G.maxFloor, killCount: G.killCount,
      hp: G.hp, maxHp: G.maxHp,
      baseStats: clone(G.baseStats),
      stats: clone(G.stats),
      upg: clone(G.upg),
      potionLv: G.potionLv, potions: G.potions, potionThreshold: G.potionThreshold,
      bp: clone(G.bp || { active: false, claimed: [] }),
      prem: clone(G.prem || { tier: null, expiresAt: 0 }),
      skills: clone(G.skills || {}),
      inventory: inv,
      equipped: eq,
      invIdCounter: (typeof _invIdCounter === 'number') ? _invIdCounter : 0,
      invFilter: G.invFilter || 'all',
      cp: _cachedCP,
      updatedAt: now,
    };
  }

  // ───────────────────────────────
  //  ПРИМЕНЕНИЕ СНАПШОТА
  // ───────────────────────────────
  function applySnapshot(s) {
    if (!s || typeof s !== 'object') return false;
    try {
      if (s.charId && typeof CHARS !== 'undefined' && CHARS[s.charId]) {
        G_CHAR = CHARS[s.charId];
        G.charId = s.charId;
        if (typeof applyCharacterSprites === 'function') applyCharacterSprites(G_CHAR);
      }

      if (s.baseStats) G.baseStats = Object.assign({}, s.baseStats);
      G.gold = num(s.gold, G.gold);
      G.pixr = num(s.pixr, G.pixr);
      G.gram = num(s.gram, G.gram);
      G.level = num(s.level, G.level);
      G.xp = num(s.xp, G.xp);
      G.xpNeeded = num(s.xpNeeded, G.xpNeeded);
      G.floor = num(s.floor, G.floor);
      G.maxFloor = num(s.maxFloor, G.maxFloor);
      G.killCount = num(s.killCount, G.killCount);

      G.upg = Object.assign({ atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 }, s.upg || {});
      G.potionLv = num(s.potionLv, 0);
      G.potions = num(s.potions, 0);
      G.potionThreshold = num(s.potionThreshold, 30);
      G.bp = s.bp || { active: false, claimed: [] };
      if (!G.bp.claimed) G.bp.claimed = [];
      G.prem = s.prem || { tier: null, expiresAt: 0 };
      G.skills = s.skills || {};
      G.invFilter = s.invFilter || 'all';

      G.inventory = (s.inventory || []).map(function (it) {
        var c = Object.assign({}, it);
        c._equipped = false;
        return c;
      });

      var itemIndex = {};
      G.inventory.forEach(function (item) { if (item.id != null) itemIndex[item.id] = item; });

      if (typeof s.invIdCounter === 'number') _invIdCounter = s.invIdCounter;
      G.inventory.forEach(function (i) { if (typeof i.id === 'number' && i.id > _invIdCounter) _invIdCounter = i.id; });

      G.equipped = { weapon: null, armor: null, ring: null, boots: null, helmet: null };
      var eq = s.equipped || {};
      EQUIP_SLOTS.forEach(function (slot) {
        var id = eq[slot];
        if (id != null && itemIndex[id]) {
          itemIndex[id]._equipped = true;
          G.equipped[slot] = itemIndex[id];
        }
      });

      if (typeof recalcStats === 'function') recalcStats();
      var hp = num(s.hp, G.maxHp);
      if (hp <= 0) hp = Math.floor(G.maxHp * 0.3);
      G.hp = Math.max(1, Math.min(hp, G.maxHp));

      return true;
    } catch (e) {
      console.error('applySnapshot:', e);
      return false;
    }
  }

  // ───────────────────────────────
  //  LOCALSTORAGE
  // ───────────────────────────────
  function writeLocal(snap) { try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); } catch (e) {} }
  function readLocal() { try { var s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function saveLocal() { if (SYNC.started) writeLocal(serializeState()); }

  // ───────────────────────────────
  //  СЕРВЕР
  // ───────────────────────────────
  function serverLoad() {
    if (!SYNC.online) return Promise.resolve(null);
    return fetch(API + '/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT }),
    }).then(function (r) { return r.ok ? r.json() : null; });
  }

  function serverSave(snap) {
    if (!SYNC.online) return Promise.resolve({ ok: false });
    return fetch(API + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT, data: snap }),
      keepalive: true,
    }).then(function (r) { return r.ok ? r.json() : { ok: false }; });
  }

  function processSaveQueue() {
    if (!SYNC.online || !SYNC.started || SYNC.pushing || !SYNC.saveQueue.length) return;
    SYNC.pushing = true;
    var snap = SYNC.saveQueue.shift();
    serverSave(snap)
      .then(function (r) { if (r && r.ok) SYNC.lastServerTs = r.updatedAt || snap.updatedAt; })
      .catch(function () { if (SYNC.saveQueue.length < 5) SYNC.saveQueue.unshift(snap); })
      .then(function () { SYNC.pushing = false; if (SYNC.saveQueue.length) setTimeout(processSaveQueue, 500); });
  }

  function pushServer() {
    if (!SYNC.online || !SYNC.started) { saveLocal(); return; }
    var snap = serializeState();
    writeLocal(snap);
    if (SYNC.saveQueue.length < 3) SYNC.saveQueue.push(snap);
    processSaveQueue();
  }

  function touch() {
    if (!SYNC.started) return;
    saveLocal();
    if (!SYNC.online) return;
    clearTimeout(SYNC.dirtyTimer);
    SYNC.dirtyTimer = setTimeout(pushServer, 1200);
  }

  function flush() {
    if (!SYNC.started) return;
    try {
      var snap = serializeState();
      writeLocal(snap);
      if (SYNC.online) {
        fetch(API + '/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: TG_INIT, data: snap }),
          keepalive: true,
        }).catch(function () {});
      }
    } catch (e) {}
  }

  // ───────────────────────────────
  //  ЭКРАН ВЫБОРА ПЕРСОНАЖА
  // ───────────────────────────────
  function stopCharSelectAnims() {
    try { if (typeof _csSpriteTimers !== 'undefined') Object.keys(_csSpriteTimers).forEach(function (k) { clearInterval(_csSpriteTimers[k]); }); } catch (e) {}
    try { if (typeof _csParticleTimer !== 'undefined' && _csParticleTimer) cancelAnimationFrame(_csParticleTimer); } catch (e) {}
  }

  function hideCharSelect() {
    var cs = document.getElementById('charSelect');
    if (cs) cs.classList.add('hidden');
    stopCharSelectAnims();
  }

  function showCharSelect() {
    stopCharSelectAnims();
    var cs = document.getElementById('charSelect');
    if (cs) {
      cs.classList.remove('hidden');
      if (typeof initCharSelect === 'function') initCharSelect();
      if (typeof window._csSelected === 'object') window._csSelected = null;
      if (typeof updateConfirmBtn === 'function') updateConfirmBtn();
    }
  }

  // ───────────────────────────────
  //  ЗАПУСК ИГРЫ
  // ───────────────────────────────
  function bootFromSnapshot(snap) {
    if (SYNC.started) return false;
    if (!applySnapshot(snap)) return false;
    hideCharSelect();
    SYNC.started = true;
    try { if (typeof startGame === 'function') startGame(); } catch (e) { console.error('startGame:', e); return false; }
    return true;
  }

  function hotApply(snap) {
    if (!SYNC.started || !applySnapshot(snap)) return false;
    try {
      if (typeof updateHUD === 'function') updateHUD();
      if (typeof initSkillsHud === 'function') initSkillsHud();
      if (typeof updatePotionHud === 'function') updatePotionHud();
      try { if (typeof switchTab === 'function' && typeof activeTab !== 'undefined') switchTab(activeTab); } catch (e) {}
    } catch (e) { console.error('hotApply:', e); return false; }
    return true;
  }

  function mergeSnapshots(local, server) {
    if (!server || !server.data) return local;
    if (!local) return server.data;
    return (server.updatedAt || 0) > (local.updatedAt || 0) ? server.data : local;
  }

  // ───────────────────────────────
  //  ЦИКЛЫ СИНХРОНИЗАЦИИ
  // ───────────────────────────────
  var _syncIntervals = [];

  function startSyncLoops() {
    if (SYNC.booted) return;
    _syncIntervals.push(setInterval(saveLocal, 5000));
    _syncIntervals.push(setInterval(pushServer, 30000));
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    SYNC.booted = true;
  }

  function stopSyncLoops() {
    _syncIntervals.forEach(function (i) { clearInterval(i); });
    _syncIntervals = [];
    SYNC.booted = false;
  }

  // ───────────────────────────────
  //  BOOT
  // ───────────────────────────────
  function initTelegram() {
    if (window.Telegram && window.Telegram.WebApp) {
      try { window.Telegram.WebApp.ready(); } catch (e) {}
      try { window.Telegram.WebApp.expand(); } catch (e) {}
      try { window.Telegram.WebApp.disableVerticalSwipes && window.Telegram.WebApp.disableVerticalSwipes(); } catch (e) {}
      TG_INIT = window.Telegram.WebApp.initData || '';
      try { window.Telegram.WebApp.onEvent('close', flush); } catch (e) {}
    }
    SYNC.online = !!TG_INIT;
  }

  function boot() {
  if (SYNC.bootLocked) return;
  SYNC.bootLocked = true;

  lsInitStars();
  lsSetStatus('Подключение', 10);
  initTelegram();

  var local = readLocal();
  if (local && isValidSave(local) && typeof CHARS !== 'undefined' && CHARS[local.charId]) {
    lsSetStatus('Локальная загрузка', 30);
    bootFromSnapshot(local);
  }

  var lsTimeout = setTimeout(function () {
    if (!SYNC.started) {
      var fallback = readLocal();
      if (fallback && isValidSave(fallback) && typeof CHARS !== 'undefined' && CHARS[fallback.charId]) {
        lsSetStatus('Офлайн загрузка', 60);
        bootFromSnapshot(fallback);
      }
    }
    lsHide();
    finishBoot();
  }, 6000);

  lsSetStatus(SYNC.online ? 'Синхронизация с сервером' : 'Офлайн режим', 50);

  serverLoad().then(function (r) {
    clearTimeout(lsTimeout);

    if (r && r.ok) {
      var srv = r.save;
      var hasSrv = srv && srv.data && srv.data.charId && typeof CHARS !== 'undefined' && CHARS[srv.data.charId];

      if (hasSrv) {
        // Сервер имеет данные — загружаем
        if (!SYNC.started) {
          lsSetStatus('Загрузка с сервера', 70);
          bootFromSnapshot(srv.data);
        } else {
          lsSetStatus('Слияние данных', 70);
          hotApply(mergeSnapshots(readLocal(), srv));
        }
        try { writeLocal(srv.data); } catch (e) {}
        
      } else {
        // Сервер пуст: новый игрок или админ удалил данные
        // Удаляем localStorage, чтобы старые данные не вернулись
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        
        // Сбрасываем состояние
        if (SYNC.started) {
          SYNC.started = false;
          SYNC.booted = false;
          stopSyncLoops();
        }
        
        // Показываем выбор персонажа
        showCharSelect();
        lsHide();
        finishBoot();
        return;
      }
      
      lsSetStatus('Готово', 90);
    }
  }).catch(function () {
    clearTimeout(lsTimeout);
    if (!SYNC.started) {
      var off = readLocal();
      if (off && isValidSave(off) && typeof CHARS !== 'undefined' && CHARS[off.charId]) {
        lsSetStatus('Офлайн режим', 60);
        bootFromSnapshot(off);
      } else {
        showCharSelect();
      }
    }
    lsSetStatus('Офлайн (сервер недоступен)', 80);
  }).then(function () {
    lsHide();
    finishBoot();
  });
}

  function finishBoot() {
    if (!SYNC.booted) {
      startSyncLoops();
      if (SYNC.online && SYNC.started) setTimeout(pushServer, 1000);
    }
  }

  // ───────────────────────────────
  //  ХУКИ
  // ───────────────────────────────
  function hookCharSelect() {
    var orig = window.confirmChar;
    if (typeof orig !== 'function') return;
    window.confirmChar = function () {
      var r = orig.apply(this, arguments);
      if (typeof G_CHAR === 'undefined' || !G_CHAR) return r;
      G.charId = G_CHAR.id;
      SYNC.started = true;
      stopCharSelectAnims();
      saveLocal();
      if (SYNC.online) {
        fetch(API + '/api/character', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: TG_INIT, charId: G.charId }),
          keepalive: true,
        }).catch(function () {});
        setTimeout(pushServer, 500);
      }
      return r;
    };
  }

  var _hudSaveTimer = null;
  function saveLocalDebounced() {
    if (_hudSaveTimer) return;
    _hudSaveTimer = setTimeout(function () { _hudSaveTimer = null; saveLocal(); }, 500);
  }

  function hookActions() {
    ['buyUpgrade','equipItem','unequipItem','destroyItem','refineItem','useSkillBook','buyBattlePass',
     'claimBpReward','buyPrem','exchangePixr','upgPotion','buyPotions','revivePlayer','goToFloor',
     'savePotionThreshold'].forEach(function (name) {
      var fn = window[name];
      if (typeof fn !== 'function') return;
      window[name] = function () { var r = fn.apply(this, arguments); try { touch(); } catch (e) {} return r; };
    });

    var origHUD = window.updateHUD;
    if (typeof origHUD === 'function') {
      window.updateHUD = function () { var r = origHUD.apply(this, arguments); if (SYNC.started) saveLocalDebounced(); return r; };
    }
  }

  // ───────────────────────────────
  //  СТАРТ
  // ───────────────────────────────
  hookCharSelect();
  hookActions();

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);

  window.addEventListener('unload', stopSyncLoops);

  window.GameSync = {
    save: pushServer,
    flush: flush,
    touch: touch,
    serialize: serializeState,
    apply: applySnapshot,
    state: SYNC,
    reset: function () { stopSyncLoops(); SYNC.bootLocked = false; SYNC.started = false; SYNC.booted = false; SYNC.saveQueue = []; },
  };
})();
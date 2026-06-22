/*
  ══════════════════════════════════════════════════════
  net.js — Сетевой слой: Telegram-авторизация, сохранение
  прогресса на сервер (MongoDB), локальный кеш.

  Логика:
   • При запуске: моментальный старт из localStorage (без
     мигания экрана выбора), затем сверка с сервером.
   • HP / баланс / весь снапшот:
       – localStorage каждые 5 сек,
       – сервер каждые 30 сек,
       – + при закрытии/сворачивании (visibilitychange + TG close event).
   • Структурные действия (покупка, экипировка, заточка,
     навыки, BP, premium, этаж, выбор персонажа) —
     сохраняются сразу (debounce 1.2с).
   • Полный снапшот, поэтому при обновлении/закрытии в
     Telegram прогресс не теряется.

  Подключать ПОСЛЕ ui.js (последним скриптом).
  ══════════════════════════════════════════════════════
*/
(function () {
  'use strict';

  var API    = 'https://ghz-production.up.railway.app';
  var LS_KEY = 'prrpg_save_v1';
  var EQUIP_SLOTS = ['weapon', 'armor', 'ring', 'boots', 'helmet'];

  var TG_INIT = '';
  var SYNC = {
    booted: false,   // прошёл boot
    started: false,  // игра запущена (персонаж есть)
    online: false,   // есть валидный initData -> можем писать на сервер
    pushing: false,
    dirtyTimer: null,
    lastServerTs: 0,
  };

  // ───────────────────────────────
  //  ЭКРАН ЗАГРУЗКИ
  // ───────────────────────────────
  var LS_MIN_MS = 800; // минимальное время показа (чтоб не мелькало)
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
    var elapsed = Date.now() - _lsShownAt;
    var delay = Math.max(0, LS_MIN_MS - elapsed);
    setTimeout(function () {
      lsSetStatus('Готово', 100);
      setTimeout(function () {
        el.classList.add('fade-out');
        setTimeout(function () { el.style.display = 'none'; }, 520);
      }, 300);
    }, delay);
  }

  // Генерация звёзд фона
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

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clone(o)  { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return Object.assign({}, o); } }

  // ───────────────────────────────
  //  СЕРИАЛИЗАЦИЯ СОСТОЯНИЯ (полный снапшот G)
  // ───────────────────────────────
  function serializeState() {
    var eq = {};
    EQUIP_SLOTS.forEach(function (slot) {
      var it = G.equipped && G.equipped[slot];
      eq[slot] = it ? it.id : null;
    });

    var inv = (G.inventory || []).map(function (it) {
      var c = clone(it);
      delete c._equipped; // ссылку восстанавливаем по equipped при загрузке
      return c;
    });

    return {
      v: 1,
      charId: (typeof G_CHAR !== 'undefined' && G_CHAR) ? G_CHAR.id : (G.charId || null),

      gold: G.gold, pixr: G.pixr, gram: G.gram,
      level: G.level, xp: G.xp, xpNeeded: G.xpNeeded,
      floor: G.floor, maxFloor: G.maxFloor, killCount: G.killCount,
      hp: G.hp, maxHp: G.maxHp,

      baseStats: clone(G.baseStats),
      stats:     clone(G.stats),
      upg:       clone(G.upg),

      potionLv: G.potionLv, potions: G.potions, potionThreshold: G.potionThreshold,
      bp:     clone(G.bp     || { active: false, claimed: [] }),
      prem:   clone(G.prem   || { tier: null, expiresAt: 0 }),
      skills: clone(G.skills || {}),

      inventory: inv,
      equipped:  eq,
      invIdCounter: (typeof _invIdCounter === 'number') ? _invIdCounter : 0,
      invFilter: G.invFilter || 'all',

      cp: (typeof calcCP === 'function') ? calcCP() : 0,
      updatedAt: Date.now(),
    };
  }

  // ───────────────────────────────
  //  ПРИМЕНЕНИЕ СНАПШОТА К G
  // ───────────────────────────────
  function applySnapshot(s) {
    if (!s || typeof s !== 'object') return false;

    // Персонаж (спрайты, без сброса прокачанных статов)
    if (s.charId && typeof CHARS !== 'undefined' && CHARS[s.charId]) {
      G_CHAR = CHARS[s.charId];
      G.charId = s.charId;
      if (typeof applyCharacterSprites === 'function') applyCharacterSprites(G_CHAR);
    }

    // Базовые статы и числа
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

    G.upg = Object.assign(
      { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 },
      s.upg || {}
    );
    G.potionLv = num(s.potionLv, 0);
    G.potions = num(s.potions, 0);
    G.potionThreshold = num(s.potionThreshold, 30);
    G.bp = s.bp || { active: false, claimed: [] };
    if (!G.bp.claimed) G.bp.claimed = [];
    G.prem = s.prem || { tier: null, expiresAt: 0 };
    G.skills = s.skills || {};
    G.invFilter = s.invFilter || 'all';

    // Инвентарь
    G.inventory = (s.inventory || []).map(function (it) {
      var c = clone(it); c._equipped = false; return c;
    });

    // Счётчик id (не ниже максимального существующего)
    if (typeof s.invIdCounter === 'number') _invIdCounter = s.invIdCounter;
    G.inventory.forEach(function (i) {
      if (typeof i.id === 'number' && i.id > _invIdCounter) _invIdCounter = i.id;
    });

    // Экипировка: восстанавливаем ССЫЛКИ на объекты инвентаря
    G.equipped = { weapon: null, armor: null, ring: null, boots: null, helmet: null };
    var eq = s.equipped || {};
    EQUIP_SLOTS.forEach(function (slot) {
      var id = eq[slot];
      if (id == null) return;
      var it = G.inventory.find(function (i) { return i.id === id; });
      if (it) { it._equipped = true; G.equipped[slot] = it; }
    });

    // Пересчёт статов от базы + экипировки, затем HP
    if (typeof recalcStats === 'function') recalcStats();
    var hp = num(s.hp, G.maxHp);
    if (hp <= 0) hp = Math.floor(G.maxHp * 0.3);
    G.hp = Math.max(1, Math.min(hp, G.maxHp));

    return true;
  }

  // ───────────────────────────────
  //  ЛОКАЛЬНЫЙ КЕШ
  // ───────────────────────────────
  function writeLocal(snap) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); } catch (e) {}
  }
  function readLocal() {
    try { var s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
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
    }).then(function (r) { return r.json(); });
  }

  function serverSave(snap) {
    if (!SYNC.online) return Promise.resolve({ ok: false });
    return fetch(API + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT, data: snap }),
    }).then(function (r) { return r.json(); });
  }

  function pushServer() {
    if (!SYNC.online || !SYNC.started || SYNC.pushing) { saveLocal(); return; }
    var snap = serializeState();
    writeLocal(snap);
    SYNC.pushing = true;
    serverSave(snap)
      .then(function (r) { if (r && r.ok) SYNC.lastServerTs = r.updatedAt || snap.updatedAt; })
      .catch(function () {})
      .then(function () { SYNC.pushing = false; });
  }

  // Сохранение «сразу» после структурных действий (с коалесингом)
  function touch() {
    if (!SYNC.started) return;
    saveLocal();
    if (!SYNC.online) return;
    clearTimeout(SYNC.dirtyTimer);
    SYNC.dirtyTimer = setTimeout(pushServer, 1200);
  }

function flush() {
  if (!SYNC.started) return;
  
  var snap = serializeState();
  writeLocal(snap); // всегда в localStorage синхронно
  
  if (!SYNC.online) return;
  
  try {
    fetch(API + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT, data: snap }),
      keepalive: true // ← ДОБАВИТЬ ЭТУ СТРОКУ
    }).catch(function() {}); // ← ДОБАВИТЬ ЭТУ СТРОКУ
  } catch (e) {
    // Игнорируем ошибки
  }
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

  // ───────────────────────────────
  //  СТАРТ ИГРЫ ИЗ СНАПШОТА
  // ───────────────────────────────
  function bootFromSnapshot(snap) {
    if (SYNC.started) return;
    if (!applySnapshot(snap)) return;
    hideCharSelect();
    SYNC.started = true;
    if (typeof startGame === 'function') startGame();
  }

  // Применить серверный снапшот поверх уже идущей игры (другое устройство)
  function hotApply(snap) {
    if (!applySnapshot(snap)) return;
    if (typeof updateHUD === 'function') updateHUD();
    if (typeof initSkillsHud === 'function') initSkillsHud();
    if (typeof updatePotionHud === 'function') updatePotionHud();
    try { if (typeof switchTab === 'function' && typeof activeTab !== 'undefined') switchTab(activeTab); } catch (e) {}
  }

  // ───────────────────────────────
  //  ЦИКЛЫ СИНХРОНИЗАЦИИ
  // ───────────────────────────────
  function startSyncLoops() {
    setInterval(saveLocal, 1000);            // localStorage каждую 1 сек (дёшево, не теряем HP/золото)
    setInterval(pushServer, 15000);          // сервер каждые 15 сек

    // visibilitychange — срабатывает при сворачивании в Telegram
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) flush();
    });

    // Telegram WebApp события — надёжнее beforeunload
    if (window.Telegram && window.Telegram.WebApp) {
      // close: юзер закрыл мини-апп кнопкой X
      try { window.Telegram.WebApp.onEvent('close', flush); } catch (e) {}
      // viewportChanged: изменился размер вьюпорта (сворачивание/разворачивание)
      try { window.Telegram.WebApp.onEvent('viewportChanged', saveLocal); } catch (e) {}
    }

    // pagehide — иногда работает в некоторых WebView
    window.addEventListener('pagehide', flush);
    // beforeunload — НЕ работает в Telegram WebView, но оставим для браузера
    window.addEventListener('beforeunload', flush);
  }

  // ───────────────────────────────
  //  BOOT
  // ───────────────────────────────
  function initTelegram() {
    if (window.Telegram && window.Telegram.WebApp) {
      try { window.Telegram.WebApp.ready(); } catch (e) {}
      try { window.Telegram.WebApp.expand(); } catch (e) {}
      // не закрывать свайпом вниз случайно (где поддерживается)
      try { window.Telegram.WebApp.disableVerticalSwipes && window.Telegram.WebApp.disableVerticalSwipes(); } catch (e) {}
      TG_INIT = window.Telegram.WebApp.initData || '';
    }
    SYNC.online = !!TG_INIT;
  }

  function boot() {
  lsInitStars();
  lsSetStatus('Подключение', 10);
  initTelegram();

  // ВРЕМЕННО НЕ ЗАГРУЖАЕМ ИЗ LOCALSTORAGE!
  // var local = readLocal(); // ← ЗАКОММЕНТИРОВАТЬ

  // Таймаут: если сервер не ответил за 6 сек — грузим из localStorage (офлайн)
  var lsTimeout = setTimeout(function () {
    // Если сервер не ответил — загружаем из localStorage как запасной вариант
    var local = readLocal();
    if (local && local.charId && typeof CHARS !== 'undefined' && CHARS[local.charId]) {
      lsSetStatus('Офлайн загрузка', 40);
      bootFromSnapshot(local);
    }
    lsHide();
  }, 6000);

  lsSetStatus(SYNC.online ? 'Загрузка с сервера' : 'Офлайн режим', 60);

  // 2) Сверка с сервером
  serverLoad().then(function (r) {
    clearTimeout(lsTimeout);
    
    var server = r && r.save;
    var hasServerData = server && server.data && server.data.charId &&
                        typeof CHARS !== 'undefined' && CHARS[server.data.charId];

    // =============================================
    // ГЛАВНАЯ ЛОГИКА: сервер всегда главный
    // =============================================
    if (r && r.ok) {
      if (hasServerData) {
        // На сервере ЕСТЬ данные — загружаем их
        lsSetStatus('Загрузка с сервера', 70);
        
        // Сохраняем данные сервера в localStorage
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(server.data));
        } catch (e) {}
        
        // Запускаем игру из данных сервера
        if (!SYNC.started) {
          bootFromSnapshot(server.data);
        } else {
          hotApply(server.data);
        }
        
        lsSetStatus('Готово', 90);
        
      } else {
        // НА СЕРВЕРЕ ПУСТО — удаляем localStorage и показываем выбор персонажа
        try {
          localStorage.removeItem(LS_KEY);
        } catch (e) {}
        
        // Если игра уже запущена — перезагружаем
        if (SYNC.started) {
          location.reload();
          return;
        }
        
        // Показываем экран выбора персонажа
        lsSetStatus('Новый игрок', 50);
        
        stopCharSelectAnims();
        
        var cs = document.getElementById('charSelect');
        if (cs) {
          cs.classList.remove('hidden');
          if (typeof initCharSelect === 'function') {
            initCharSelect();
          }
          if (typeof window._csSelected === 'object') {
            window._csSelected = null;
          }
          if (typeof updateConfirmBtn === 'function') {
            updateConfirmBtn();
          }
        }
        
        lsHide();
        return;
      }
    }
    
  }).catch(function () {
    clearTimeout(lsTimeout);
    // Если сервер не ответил — загружаем из localStorage (офлайн режим)
    var local = readLocal();
    if (local && local.charId && typeof CHARS !== 'undefined' && CHARS[local.charId]) {
      lsSetStatus('Офлайн загрузка', 40);
      bootFromSnapshot(local);
    }
  }).then(function () {
    SYNC.booted = true;
    startSyncLoops();
    if (SYNC.online && SYNC.started) pushServer();
    lsHide();
  });
}

  // ───────────────────────────────
  //  ХУКИ: выбор персонажа + структурные действия
  // ───────────────────────────────
  function hookCharSelect() {
    var orig = window.confirmChar;
    if (typeof orig !== 'function') return;
    window.confirmChar = function () {
      var r = orig.apply(this, arguments);
      if (typeof G_CHAR === 'undefined' || !G_CHAR) return r; // не выбрали — выходим
      G.charId = G_CHAR.id;
      SYNC.started = true;
      stopCharSelectAnims();
      saveLocal();
      if (SYNC.online) {
        try {
          fetch(API + '/api/character', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: TG_INIT, charId: G.charId }),
          });
        } catch (e) {}
        pushServer();
      }
      return r;
    };
  }

  // Дебаунс для saveLocal из updateHUD (не чаще раза в 500мс)
  var _hudSaveTimer = null;
  function saveLocalDebounced() {
    if (_hudSaveTimer) return;
    _hudSaveTimer = setTimeout(function () { _hudSaveTimer = null; saveLocal(); }, 500);
  }

  function hookActions() {
    // Структурные действия — сохраняем сразу (debounce 1.2с на сервер)
    var names = [
      'buyUpgrade', 'equipItem', 'unequipItem', 'destroyItem', 'refineItem',
      'useSkillBook', 'buyBattlePass', 'claimBpReward', 'buyPrem', 'exchangePixr',
      'upgPotion', 'buyPotions', 'revivePlayer', 'goToFloor', 'savePotionThreshold',
    ];
    names.forEach(function (name) {
      var fn = window[name];
      if (typeof fn !== 'function') return;
      window[name] = function () {
        var r = fn.apply(this, arguments);
        try { touch(); } catch (e) {}
        return r;
      };
    });

    // updateHUD вызывается при каждом изменении HP/XP/золота —
    // цепляемся сюда для максимально быстрого сохранения в localStorage.
    // Используем debounce 500мс чтобы не тормозить игровой loop.
    var origHUD = window.updateHUD;
    if (typeof origHUD === 'function') {
      window.updateHUD = function () {
        var r = origHUD.apply(this, arguments);
        if (SYNC.started) saveLocalDebounced();
        return r;
      };
    }
  }

  // Установка хуков сразу (все скрипты выше уже загружены)
  hookCharSelect();
  hookActions();

  // Boot после полной загрузки (ui.js успевает инициализировать экран выбора)
  if (document.readyState === 'complete') {
    boot();
  } else {
    window.addEventListener('load', boot);
  }

  // Публичный API (на всякий случай)
  window.GameSync = {
    save: pushServer,
    flush: flush,
    touch: touch,
    serialize: serializeState,
    apply: applySnapshot,
    state: SYNC,
  };
})();
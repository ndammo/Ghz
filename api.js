/*
  ══════════════════════════════════════════════════════
  api.js — Клиентский модуль сохранения/загрузки
  Pixel Runner RPG

  Стратегия сохранений:
  1. localStorage — мгновенно при каждом изменении (буфер от краша)
  2. Сервер — каждые 20 сек + при ключевых событиях
  3. При старте — берём новейшее из сервера и localStorage

  API.init()          — авторизация + загрузка (merge сервер/local)
  API.save()          — сервер + localStorage
  API.saveBeacon()    — sendBeacon при закрытии + localStorage
  API.saveLocal()     — только localStorage (0ms, при каждом изменении)
  API.partial(fields) — частичный патч сервера + localStorage
  API.savedHp         — HP из сохранения (до applyCharacter)
  ══════════════════════════════════════════════════════
*/

const API = (function() {
  'use strict';

  const BASE_URL   = 'https://ghz-production.up.railway.app';
  const LS_KEY     = 'pixelrpg_save';   // ключ в localStorage

  let _initData  = '';
  let _userId    = '';
  let _photoUrl  = '';
  let _firstName = '';
  let _saveTimer = null;
  let _dirty     = false;
  let _savedHp   = null;

  function getInitData() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
      return window.Telegram.WebApp.initData;
    }
    var urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('initData') || '';
  }

  // ── fetch с авторизацией ──
  async function apiFetch(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (_initData) opts.headers['Authorization'] = 'tma ' + _initData;
    opts.headers['Content-Type'] = 'application/json';
    var res = await fetch(BASE_URL + path, opts);
    if (!res.ok) {
      var body = await res.json().catch(function() { return {}; });
      throw new Error(body.error || 'HTTP ' + res.status);
    }
    return res.json();
  }

  // ══════════════════════════════════════════════════════
  //  localStorage
  // ══════════════════════════════════════════════════════

  // Сохранить снапшот локально — синхронно, 0ms
  function writeLocal(snapshot) {
    try {
      // Привязываем к userId чтобы не смешивать аккаунты
      var key = _userId ? LS_KEY + '_' + _userId : LS_KEY;
      localStorage.setItem(key, JSON.stringify(snapshot));
    } catch(e) {
      // localStorage может быть заполнен — не критично
      console.warn('[API] localStorage write failed:', e.message);
    }
  }

  // Загрузить локальное сохранение
  function readLocal() {
    try {
      var key  = _userId ? LS_KEY + '_' + _userId : LS_KEY;
      var raw  = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch(e) {
      return null;
    }
  }

  // ══════════════════════════════════════════════════════
  //  Применение сохранения к G
  //  HP запоминаем в _savedHp — восстановим ПОСЛЕ applyCharacter
  // ══════════════════════════════════════════════════════
  function applySave(save) {
    if (!save) return null;

    var scalars = [
      'gold','pixr','gram','level','xp','xpNeeded',
      'floor','maxFloor','killCount',
      'potionLv','potions','potionThreshold',
    ];
    scalars.forEach(function(k) {
      if (save[k] !== undefined && save[k] !== null) G[k] = save[k];
    });

    // HP отдельно — applyCharacter перезапишет, восстановим потом
    if (save.hp !== undefined && save.hp !== null) {
      _savedHp = { hp: save.hp, maxHp: save.maxHp };
    }

    if (save.baseStats) Object.assign(G.baseStats, save.baseStats);
    if (save.stats)     Object.assign(G.stats,     save.stats);
    if (save.upg)       Object.assign(G.upg,       save.upg);
    if (save.equipped)  Object.assign(G.equipped,  save.equipped);

    if (save.bp)   G.bp   = { active: !!save.bp.active, claimed: save.bp.claimed || [] };
    if (save.prem) G.prem = { tier: save.prem.tier || null, expiresAt: save.prem.expiresAt || 0 };

    if (Array.isArray(save.inventory))                G.inventory = save.inventory;
    if (save.skills && typeof save.skills === 'object') G.skills   = save.skills;

    return save.charId || null;
  }

  // ── Снапшот G ──
  function buildSnapshot() {
    return {
      charId:    window.G_CHAR ? window.G_CHAR.id : null,
      gold:      G.gold,
      pixr:      G.pixr,
      gram:      G.gram,
      level:     G.level,
      xp:        G.xp,
      xpNeeded:  G.xpNeeded,
      floor:     G.floor,
      maxFloor:  G.maxFloor,
      killCount: G.killCount,
      hp:        G.hp,
      maxHp:     G.maxHp,
      baseStats: Object.assign({}, G.baseStats),
      stats:     Object.assign({}, G.stats),
      upg:       Object.assign({}, G.upg),
      potionLv:  G.potionLv  || 0,
      potions:   G.potions   || 0,
      potionThreshold: G.potionThreshold || 30,
      bp:        { active: G.bp.active, claimed: G.bp.claimed.slice() },
      prem:      { tier: G.prem.tier, expiresAt: G.prem.expiresAt },
      inventory: G.inventory.slice(),
      equipped:  Object.assign({}, G.equipped),
      skills:    Object.assign({}, G.skills),
      _ts:       Date.now(),   // timestamp для merge
    };
  }

  // ══════════════════════════════════════════════════════
  //  Публичное API
  // ══════════════════════════════════════════════════════

  async function init() {
    _initData = getInitData();
    if (!_initData) {
      console.warn('[API] No initData — offline mode');
      return null;
    }
    try {
      var res = await apiFetch('/auth', {
        method: 'POST',
        body: JSON.stringify({ initData: _initData }),
      });
      _userId    = res.userId;
      _photoUrl  = res.photoUrl  || '';
      _firstName = res.firstName || '';
      console.log('[API] Auth OK userId=' + _userId + ' isNew=' + res.isNew);

      // Всегда берём данные с сервера
      // localStorage используется только как буфер от краша (запись),
      // но при входе не читается
      var charId = applySave(res.save);

      // Обновляем localStorage актуальными серверными данными
      writeLocal(buildSnapshot());

      // Автосохранение каждые 20 сек
      _saveTimer = setInterval(function() {
        if (_dirty) { save(); _dirty = false; }
      }, 20000);

      return charId;
    } catch (e) {
      console.error('[API] Auth failed:', e.message);
      return null;
    }
  }

  // Полное сохранение: сервер + localStorage
  async function save() {
    var snapshot = buildSnapshot();
    // localStorage — синхронно и сразу
    writeLocal(snapshot);
    // Сервер — async
    if (!_initData) return;
    try {
      await apiFetch('/save', {
        method: 'POST',
        body: JSON.stringify(snapshot),
      });
      console.log('[API] Save OK');
    } catch (e) {
      console.error('[API] Save failed (local saved):', e.message);
      // Данные уже в localStorage — не страшно
    }
  }

  // Только localStorage — вызывать при каждом изменении G
  function saveLocal() {
    writeLocal(buildSnapshot());
  }

  // sendBeacon при закрытии + localStorage
  function saveBeacon() {
    // localStorage — гарантированно
    var snapshot = buildSnapshot();
    writeLocal(snapshot);
    // Beacon на сервер
    if (!_initData) return;
    var blob = new Blob(
      [JSON.stringify(snapshot)],
      { type: 'application/json' }
    );
    var url = BASE_URL + '/save?tma=' + encodeURIComponent(_initData);
    navigator.sendBeacon(url, blob);
    console.log('[API] Beacon + local saved');
  }

  // Частичный патч сервера + обновление localStorage
  async function partial(fields) {
    // localStorage обновляем сразу (полный снапшот)
    writeLocal(buildSnapshot());
    if (!_initData) return;
    _dirty = false;
    try {
      await apiFetch('/save/partial', {
        method: 'POST',
        body: JSON.stringify({ fields: fields }),
      });
    } catch (e) {
      console.error('[API] Partial failed (local saved):', e.message);
    }
  }

  function markDirty() {
    _dirty = true;
    // При каждом изменении — мгновенно в localStorage
    writeLocal(buildSnapshot());
  }

  return {
    init:        init,
    save:        save,
    saveLocal:   saveLocal,
    saveBeacon:  saveBeacon,
    partial:     partial,
    markDirty:   markDirty,
    get loaded()    { return !!_userId; },
    get userId()    { return _userId; },
    get savedHp()   { return _savedHp; },
    get photoUrl()  { return _photoUrl; },
    get firstName() { return _firstName; },
  };
})();

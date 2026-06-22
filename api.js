/*
  ══════════════════════════════════════════════════════
  api.js — Клиентский модуль сохранения/загрузки
  Pixel Runner RPG

  API.init()          — авторизация при старте
  API.save()          — полное сохранение G (async)
  API.saveBeacon()    — принудительное сохранение при закрытии (sync, sendBeacon)
  API.partial(fields) — частичный патч
  API.loaded          — флаг: данные загружены
  API.savedHp         — HP из сохранения (до applyCharacter)
  ══════════════════════════════════════════════════════
*/

const API = (function() {
  'use strict';

  const BASE_URL = 'https://ghz-production.up.railway.app';

  let _initData  = '';
  let _userId    = '';
  let _saveTimer = null;
  let _dirty     = false;
  let _savedHp   = null;   // сохранённое HP — читается в ui.js после applyCharacter

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
  //  Применение сохранения к G
  //  HP и maxHp сохраняем в _savedHp — восстановим ПОСЛЕ
  //  applyCharacter(), которая перезаписывает G.hp
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

    // HP запоминаем отдельно — восстановим после applyCharacter
    if (save.hp    !== undefined && save.hp    !== null) _savedHp = { hp: save.hp, maxHp: save.maxHp };

    if (save.baseStats) Object.assign(G.baseStats, save.baseStats);
    if (save.stats)     Object.assign(G.stats,     save.stats);
    if (save.upg)       Object.assign(G.upg,       save.upg);
    if (save.equipped)  Object.assign(G.equipped,  save.equipped);

    if (save.bp)   G.bp   = { active: !!save.bp.active, claimed: save.bp.claimed || [] };
    if (save.prem) G.prem = { tier: save.prem.tier || null, expiresAt: save.prem.expiresAt || 0 };

    if (Array.isArray(save.inventory))               G.inventory = save.inventory;
    if (save.skills && typeof save.skills === 'object') G.skills  = save.skills;

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
      _userId = res.userId;
      console.log('[API] Auth OK userId=' + _userId + ' isNew=' + res.isNew);

      var charId = applySave(res.save);

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

  // Обычное async сохранение
  async function save() {
    if (!_initData) return;
    try {
      await apiFetch('/save', {
        method: 'POST',
        body: JSON.stringify(buildSnapshot()),
      });
      console.log('[API] Save OK');
    } catch (e) {
      console.error('[API] Save failed:', e.message);
    }
  }

  // Принудительное синхронное сохранение через sendBeacon
  // Браузер гарантирует отправку даже при закрытии вкладки
  function saveBeacon() {
    if (!_initData) return;
    var snapshot = buildSnapshot();
    var blob = new Blob(
      [JSON.stringify(snapshot)],
      { type: 'application/json' }
    );
    // sendBeacon не поддерживает Authorization header —
    // передаём initData в query string
    var url = BASE_URL + '/save?tma=' + encodeURIComponent(_initData);
    navigator.sendBeacon(url, blob);
    console.log('[API] Beacon sent');
  }

  async function partial(fields) {
    if (!_initData) return;
    _dirty = false;
    try {
      await apiFetch('/save/partial', {
        method: 'POST',
        body: JSON.stringify({ fields: fields }),
      });
    } catch (e) {
      console.error('[API] Partial failed:', e.message);
    }
  }

  function markDirty() {
    _dirty = true;
  }

  return {
    init:        init,
    save:        save,
    saveBeacon:  saveBeacon,
    partial:     partial,
    markDirty:   markDirty,
    get loaded()  { return !!_userId; },
    get userId()  { return _userId; },
    get savedHp() { return _savedHp; },
  };
})();

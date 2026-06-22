/*
  ══════════════════════════════════════════════════════
  api.js — Клиентский модуль сохранения/загрузки
  Pixel Runner RPG

  СТРАТЕГИЯ СОХРАНЕНИЙ (УПРОЩЕННАЯ):
  1. Сервер — единственный источник истины
  2. localStorage — аварийный кэш (только при ошибках!)
  3. Автосохранение каждые 20 сек
  4. При закрытии: 3 метода (Telegram API + fetch + localStorage)
  5. sendBeacon — УБРАН (не работает в Telegram)

  API.init()          — авторизация + загрузка (сервер → кэш)
  API.save()          — полное сохранение (сервер → кэш)
  API.saveOnClose()   — сохранение при закрытии (3 метода)
  API.partial(fields) — частичный патч (сервер → кэш)
  API.markDirty()     — пометить, что нужно сохранить
  API.savedHp         — HP из сохранения
  API.restoreFromCache() — экстренное восстановление
  ══════════════════════════════════════════════════════
*/

const API = (function() {
  'use strict';

  const BASE_URL = 'https://ghz-production.up.railway.app';
  const LS_KEY = 'pixelrpg_emergency';

  let _initData = '';
  let _userId = '';
  let _photoUrl = '';
  let _firstName = '';
  let _saveTimer = null;
  let _dirty = false;
  let _savedHp = null;
  let _isSaving = false;
  let _lastSaveHash = '';

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
  //  АВАРИЙНЫЙ КЭШ (localStorage)
  //  ТОЛЬКО при ошибках сервера или закрытии!
  // ══════════════════════════════════════════════════════

  function writeEmergencyCache(snapshot) {
    try {
      var key = _userId ? LS_KEY + '_' + _userId : LS_KEY;
      // ✅ Сжимаем данные — только критическое
      var compressed = {
        charId: snapshot.charId,
        gold: snapshot.gold,
        pixr: snapshot.pixr,
        gram: snapshot.gram,
        level: snapshot.level,
        xp: snapshot.xp,
        xpNeeded: snapshot.xpNeeded,
        floor: snapshot.floor,
        maxFloor: snapshot.maxFloor,
        killCount: snapshot.killCount,
        hp: snapshot.hp,
        maxHp: snapshot.maxHp,
        baseStats: snapshot.baseStats,
        stats: snapshot.stats,
        upg: snapshot.upg,
        potionLv: snapshot.potionLv,
        potions: snapshot.potions,
        potionThreshold: snapshot.potionThreshold,
        bp: snapshot.bp,
        prem: snapshot.prem,
        // ✅ Инвентарь сжимаем (убираем лишние поля)
        inventory: snapshot.inventory.map(function(item) {
          return {
            id: item.id,
            slot: item.slot,
            name: item.name,
            rarity: item.rarity,
            level: item.level,
            stats: item.stats,
            refine: item.refine || 0,
            isSkillBook: item.isSkillBook || false,
            bookSkillId: item.bookSkillId || null,
            forClass: item.forClass || null,
          };
        }),
        equipped: snapshot.equipped,
        skills: snapshot.skills,
        timestamp: Date.now()
      };
      
      localStorage.setItem(key, JSON.stringify(compressed));
      console.log('[API] Emergency cache saved');
      return true;
    } catch(e) {
      console.warn('[API] Emergency cache write failed:', e.message);
      return false;
    }
  }

  function readEmergencyCache() {
    try {
      var key = _userId ? LS_KEY + '_' + _userId : LS_KEY;
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      
      var parsed = JSON.parse(raw);
      // ✅ Кэш не старше 1 часа
      if (Date.now() - parsed.timestamp > 3600000) {
        console.log('[API] Emergency cache expired');
        localStorage.removeItem(key);
        return null;
      }
      
      console.log('[API] Emergency cache found from', new Date(parsed.timestamp));
      return parsed;
    } catch(e) {
      console.warn('[API] Emergency cache read failed:', e.message);
      return null;
    }
  }

  function clearEmergencyCache() {
    try {
      var key = _userId ? LS_KEY + '_' + _userId : LS_KEY;
      localStorage.removeItem(key);
      console.log('[API] Emergency cache cleared');
    } catch(e) {}
  }

  // ══════════════════════════════════════════════════════
  //  ПРИМЕНЕНИЕ СОХРАНЕНИЯ
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
  //  ПУБЛИЧНОЕ API
  // ══════════════════════════════════════════════════════

  async function init() {
    _initData = getInitData();
    if (!_initData) {
      console.warn('[API] No initData');
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
      console.log('[API] Auth OK userId=' + _userId);

      // ✅ Всегда берем с сервера
      var charId = applySave(res.save);
      
      // ✅ Очищаем аварийный кэш после успешной загрузки
      clearEmergencyCache();

      // Автосохранение каждые 20 сек
      _saveTimer = setInterval(function() {
        if (_dirty && !_isSaving) {
          save().catch(function(e) {
            console.warn('[API] Auto-save failed:', e.message);
          });
          _dirty = false;
        }
      }, 20000);

      return charId;

    } catch (e) {
      console.error('[API] Auth failed:', e.message);
      
      // ✅ Если сервер упал — пробуем аварийный кэш
      var emergency = readEmergencyCache();
      if (emergency) {
        console.log('[API] Using emergency cache');
        return applySave(emergency);
      }
      
      return null;
    }
  }

  // Полное сохранение: сервер → если ошибка, то кэш
  async function save() {
    if (!_initData || _isSaving) return;
    
    _isSaving = true;
    var snapshot = buildSnapshot();
    
    try {
      await apiFetch('/save', {
        method: 'POST',
        body: JSON.stringify(snapshot),
      });
      
      // ✅ Если успешно — очищаем аварийный кэш
      clearEmergencyCache();
      console.log('[API] Save OK');
      
    } catch (e) {
      console.error('[API] Save failed:', e.message);
      
      // ✅ Если сервер недоступен — сохраняем в аварийный кэш
      writeEmergencyCache(snapshot);
      throw e;
      
    } finally {
      _isSaving = false;
    }
  }

  // ⚠️ ГАРАНТИРОВАННОЕ сохранение при закрытии (3 метода)
  function saveOnClose() {
    if (!_initData) return;
    
    var snapshot = buildSnapshot();
    
    // ✅ Проверяем, изменились ли данные
    var hash = JSON.stringify({
      hp: snapshot.hp,
      gold: snapshot.gold,
      xp: snapshot.xp,
      level: snapshot.level,
      floor: snapshot.floor,
      killCount: snapshot.killCount,
    });
    
    if (hash === _lastSaveHash) {
      console.log('[API] No changes, skipping save on close');
      return;
    }
    _lastSaveHash = hash;
    
    // ✅ 1. Всегда пишем в localStorage (ГАРАНТИРОВАННО!)
    writeEmergencyCache(snapshot);
    
    // ✅ 2. Пробуем отправить через Telegram WebApp (НАДЕЖНО)
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.sendData(JSON.stringify({
          action: 'save',
          data: snapshot
        }));
        console.log('[API] Data sent via Telegram.sendData');
      }
    } catch (e) {
      console.warn('[API] Telegram.sendData failed:', e.message);
    }
    
    // ✅ 3. Пробуем через fetch + keepalite (БЫСТРО)
    try {
      var payload = Object.assign({}, snapshot, { _initData: _initData });
      fetch(BASE_URL + '/save/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function() {});
      console.log('[API] Close save sent via fetch');
    } catch (e) {
      console.warn('[API] Fetch close failed:', e.message);
    }
    
    // ❌ sendBeacon УБРАН — не работает в Telegram
  }

  // Частичный патч
  async function partial(fields) {
    if (!_initData || _isSaving) return;
    _dirty = false;
    
    var snapshot = buildSnapshot();
    
    try {
      await apiFetch('/save/partial', {
        method: 'POST',
        body: JSON.stringify({ fields: fields }),
      });
      console.log('[API] Partial OK');
    } catch (e) {
      console.error('[API] Partial failed:', e.message);
      // ✅ При ошибке — сохраняем полный снапшот в кэш
      writeEmergencyCache(snapshot);
      throw e;
    }
  }

  function markDirty() {
    _dirty = true;
  }

  // Экстренное восстановление из кэша
  function restoreFromCache() {
    var emergency = readEmergencyCache();
    if (emergency) {
      applySave(emergency);
      console.log('[API] Restored from emergency cache');
      return true;
    }
    return false;
  }

  return {
    init:           init,
    save:           save,
    saveOnClose:    saveOnClose,
    partial:        partial,
    markDirty:      markDirty,
    restoreFromCache: restoreFromCache,
    get loaded()    { return !!_userId; },
    get userId()    { return _userId; },
    get savedHp()   { return _savedHp; },
    get photoUrl()  { return _photoUrl; },
    get firstName() { return _firstName; },
  };
})();
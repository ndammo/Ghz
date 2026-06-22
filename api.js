/*
  api.js — Pixel Runner RPG
  
  Стратегия сохранения:
  - localStorage: hp + gold мгновенно (каждое изменение)
  - сервер: при ключевых событиях (levelup, floor, upgrade, death, buy)
  - сервер: полный сейв каждые 30 сек
  - visibilitychange: полный сейв при уходе в фон
  
  Загрузка:
  - сначала localStorage (hp, gold)
  - потом сервер (полный прогресс)
  - экран выбора персонажа скрывается если charId уже сохранён
*/

(function() {
  'use strict';

  var BASE_URL = 'https://ghz-production.up.railway.app';
  var LS_FAST  = 'prpg_fast';   // hp + gold
  var LS_CHAR  = 'prpg_char';   // выбранный персонаж

  // ══════════════════════════════
  //  localStorage helpers
  // ══════════════════════════════
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  }

  // ── Мгновенное сохранение hp + gold в localStorage ──
  function saveFast() {
    if (typeof G === 'undefined') return;
    lsSet(LS_FAST, { hp: G.hp, gold: G.gold, pixr: G.pixr || 0, ts: Date.now() });
  }

  // ── Восстановить hp + gold из localStorage ──
  function loadFast() {
    if (typeof G === 'undefined') return;
    var d = lsGet(LS_FAST);
    if (!d) return;
    if (typeof d.hp   === 'number') G.hp   = d.hp;
    if (typeof d.gold === 'number') G.gold = d.gold;
    if (typeof d.pixr === 'number') G.pixr = d.pixr;
  }

  // ══════════════════════════════
  //  Telegram token
  // ══════════════════════════════
  function getTgToken() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
      return window.Telegram.WebApp.initData;
    }
    return '';
  }

  function reqHeaders() {
    return { 'Content-Type': 'application/json', 'x-tg-token': getTgToken() };
  }

  // ══════════════════════════════
  //  fetch с таймаутом
  // ══════════════════════════════
  function apiFetch(path, opts) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, 8000) : null;
    return fetch(BASE_URL + path, Object.assign({ signal: ctrl ? ctrl.signal : undefined }, opts))
      .then(function(r) { if (timer) clearTimeout(timer); return r.json(); })
      .catch(function(e) { if (timer) clearTimeout(timer); return { ok: false, error: e.message }; });
  }

  // ══════════════════════════════
  //  Снимок G для сервера
  // ══════════════════════════════
  function snapshotG() {
    if (typeof G === 'undefined') return {};
    return {
      gold: G.gold || 0,
      pixr: G.pixr || 0,
      gram: G.gram || 0,
      level: G.level || 1,
      xp: G.xp || 0,
      xpNeeded: G.xpNeeded || 100,
      floor: G.floor || 1,
      maxFloor: G.maxFloor || 1,
      killCount: G.killCount || 0,
      hp: G.hp || 1,
      maxHp: G.maxHp || 100,
      charId: (typeof G_CHAR !== 'undefined' && G_CHAR) ? G_CHAR.id : (lsGet(LS_CHAR) || 'fire'),
      stats: G.stats || {},
      baseStats: G.baseStats || {},
      upg: G.upg || {},
      potionLv: G.potionLv || 0,
      potions: G.potions || 0,
      potionThreshold: G.potionThreshold || 30,
      bp: G.bp || { active: false, claimed: [] },
      prem: G.prem || { tier: null, expiresAt: 0 },
      owned: G.owned || {},
      skills: G.skills || {},
      inventory: Array.isArray(G.inventory) ? G.inventory.slice(0, 500) : [],
      equipped: G.equipped || {},
      invFilter: G.invFilter || 'all',
    };
  }

  // ══════════════════════════════
  //  Применить данные с сервера к G
  // ══════════════════════════════
  function applyToG(data) {
    if (!data || typeof G === 'undefined') return;
    var fields = ['gold','pixr','gram','level','xp','xpNeeded','floor','maxFloor',
      'killCount','hp','maxHp','upg','potionLv','potions','potionThreshold',
      'bp','prem','owned','skills','inventory','equipped','invFilter'];
    fields.forEach(function(k) { if (data[k] !== undefined) G[k] = data[k]; });
    if (data.stats)     Object.assign(G.stats,     data.stats);
    if (data.baseStats) Object.assign(G.baseStats, data.baseStats);
    if (G.hp > G.maxHp) G.hp = G.maxHp;
  }

  // ══════════════════════════════
  //  Очередь серверного сохранения
  // ══════════════════════════════
  var _saving  = false;
  var _queued  = false;

  function serverSave() {
    if (!API.userId) return;
    if (_saving) { _queued = true; return; }
    _saving = true;
    _queued = false;
    var snap = snapshotG();
    var cp   = (typeof calcCP === 'function') ? calcCP() : 0;
    apiFetch('/save', {
      method: 'POST',
      headers: reqHeaders(),
      body: JSON.stringify({ gameData: snap, cp: cp }),
    }).then(function() {
      _saving = false;
      if (_queued) { _queued = false; serverSave(); }
    });
  }

  // ══════════════════════════════
  //  Автосейв каждые 30 сек
  // ══════════════════════════════
  function startAutoSave() {
    setInterval(function() {
      saveFast();
      if (API.userId) serverSave();
    }, 30000);
  }

  // ── Сохранение при уходе в фон ──
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      saveFast();
      if (API.userId) serverSave();
    }
  });

  // ══════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════
  var API = {
    userId:   null,
    userName: null,
    ready:    false,

    // ── Авторизация ──
    auth: function() {
      return apiFetch('/auth', { method: 'POST', headers: reqHeaders(), body: '{}' })
        .then(function(r) {
          if (r.ok) {
            API.userId   = r.user.userId;
            API.userName = r.user.firstName || r.user.username || ('Player' + String(r.user.userId).slice(-4));
            API.ready    = true;
            startAutoSave();
          }
          return r;
        });
    },

    // ── Загрузка прогресса с сервера ──
    loadProgress: function() {
      if (!API.userId) return Promise.resolve({ ok: false });
      return apiFetch('/save', { method: 'GET', headers: reqHeaders() })
        .then(function(r) {
          if (r.ok && r.data) {
            applyToG(r.data);
            // После загрузки с сервера перезаписываем hp/gold из localStorage
            // только если localStorage свежее (играл без связи)
            var fast = lsGet(LS_FAST);
            if (fast && fast.ts && r.data) {
              // localStorage всегда актуальнее для hp/gold
              if (typeof fast.hp   === 'number') G.hp   = fast.hp;
              if (typeof fast.gold === 'number') G.gold = fast.gold;
              if (typeof fast.pixr === 'number') G.pixr = fast.pixr;
            }
            return { ok: true, charId: r.data.charId };
          }
          return { ok: false };
        });
    },

    // ── Вызывается при ключевых событиях ──
    // levelup, floor, upgrade, death, buy
    onEvent: function() {
      saveFast();
      serverSave();
    },

    // ── Мгновенное сохранение hp/gold (вызывается из updateHUD) ──
    onHpGoldChange: function() {
      saveFast();
    },

    // ── Запомнить выбранного персонажа ──
    saveChar: function(charId) {
      lsSet(LS_CHAR, charId);
    },

    // ── Есть ли сохранённый персонаж ──
    getSavedChar: function() {
      return lsGet(LS_CHAR);
    },

    leaderboard: function() {
      return apiFetch('/leaderboard', { method: 'GET', headers: reqHeaders() });
    },
  };

  window.API = API;
})();

/*
  ══════════════════════════════════════════════════════
  api.js — Telegram авторизация + сохранение прогресса
  
  API: https://ghz-production.up.railway.app
  
  Экспортирует глобально:
    API.auth()          — авторизация при старте
    API.saveProgress()  — сохранить G на сервер
    API.loadProgress()  — загрузить G с сервера
    API.leaderboard()   — получить топ-50
    API.userId          — Telegram user id
    API.userName        — имя пользователя
  ══════════════════════════════════════════════════════
*/

(function() {
  'use strict';

  var BASE_URL = 'https://ghz-production.up.railway.app';

  // ── initData из Telegram WebApp ──
  function getTgToken() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
      return window.Telegram.WebApp.initData;
    }
    return '';
  }

  // ── Заголовки для каждого запроса ──
  function headers() {
    return {
      'Content-Type': 'application/json',
      'x-tg-token':   getTgToken(),
    };
  }

  // ── Базовый fetch с таймаутом ──
  function apiFetch(path, opts, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer;
    if (ctrl) {
      timer = setTimeout(function() { ctrl.abort(); }, timeoutMs);
    }
    var fetchOpts = Object.assign({ signal: ctrl ? ctrl.signal : undefined }, opts);
    return fetch(BASE_URL + path, fetchOpts)
      .then(function(r) {
        if (timer) clearTimeout(timer);
        return r.json();
      })
      .catch(function(e) {
        if (timer) clearTimeout(timer);
        console.warn('[API] ' + path + ' failed:', e.message);
        return { ok: false, error: e.message };
      });
  }

  // ═══════════════════════════════
  //  Автосейв: каждые 60 секунд
  // ═══════════════════════════════
  var _autoSaveTimer = null;
  var _saveQueue     = false;
  var _saving        = false;

  function startAutoSave() {
    if (_autoSaveTimer) clearInterval(_autoSaveTimer);
    _autoSaveTimer = setInterval(function() {
      if (window.API && window.API.userId) {
        window.API.saveProgress();
      }
    }, 60000);
  }

  // ── Сохраняем при уходе со страницы ──
  document.addEventListener('visibilitychange', function() {
    if (document.hidden && window.API && window.API.userId) {
      window.API.saveProgress();
    }
  });

  // ═══════════════════════════════
  //  Снимок объекта G (только нужные поля)
  // ═══════════════════════════════
  function snapshotG() {
    if (typeof G === 'undefined') return {};
    return {
      gold:             G.gold      || 0,
      pixr:             G.pixr      || 0,
      gram:             G.gram      || 0,
      level:            G.level     || 1,
      xp:               G.xp        || 0,
      xpNeeded:         G.xpNeeded  || 100,
      floor:            G.floor     || 1,
      maxFloor:         G.maxFloor  || 1,
      killCount:        G.killCount || 0,
      hp:               G.hp        || G.maxHp || 100,
      maxHp:            G.maxHp     || 100,
      charId:           (typeof G_CHAR !== 'undefined' && G_CHAR) ? G_CHAR.id : 'fire',
      stats:            G.stats     || {},
      baseStats:        G.baseStats || {},
      upg:              G.upg       || {},
      potionLv:         G.potionLv  || 0,
      potions:          G.potions   || 0,
      potionThreshold:  G.potionThreshold || 30,
      bp:               G.bp        || { active: false, claimed: [] },
      prem:             G.prem      || { tier: null, expiresAt: 0 },
      owned:            G.owned     || {},
      skills:           G.skills    || {},
      inventory:        G.inventory || [],
      equipped:         G.equipped  || {},
      invFilter:        G.invFilter || 'all',
    };
  }

  // ═══════════════════════════════
  //  Применение загруженных данных к G
  // ═══════════════════════════════
  function applyToG(data) {
    if (!data || typeof G === 'undefined') return;

    var fields = [
      'gold','pixr','gram','level','xp','xpNeeded',
      'floor','maxFloor','killCount','hp','maxHp',
      'upg','potionLv','potions','potionThreshold',
      'bp','prem','owned','skills','inventory',
      'equipped','invFilter'
    ];
    fields.forEach(function(k) {
      if (data[k] !== undefined) G[k] = data[k];
    });

    if (data.stats)     Object.assign(G.stats,     data.stats);
    if (data.baseStats) Object.assign(G.baseStats,  data.baseStats);
    if (data.maxHp)     { G.maxHp = data.maxHp; if (G.hp > G.maxHp) G.hp = G.maxHp; }
  }

  // ═══════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════
  var API = {
    userId:   null,
    userName: null,
    ready:    false,

    // ── Авторизация ──
    auth: function() {
      return apiFetch('/auth', { method: 'POST', headers: headers(), body: JSON.stringify({}) })
        .then(function(r) {
          if (r.ok) {
            API.userId   = r.user.userId;
            API.userName = r.user.firstName || r.user.username || ('Player' + r.user.userId.slice(-4));
            API.ready    = true;
            startAutoSave();
            console.log('[API] Authorized as', API.userName, '(id:', API.userId + ')');
          } else {
            console.warn('[API] Auth failed:', r.error);
          }
          return r;
        });
    },

    // ── Загрузка прогресса ──
    loadProgress: function() {
      if (!API.userId) return Promise.resolve({ ok: false, error: 'Not authorized' });
      return apiFetch('/save', { method: 'GET', headers: headers() })
        .then(function(r) {
          if (r.ok && r.data) {
            applyToG(r.data);
            console.log('[API] Progress loaded (floor ' + (r.data.floor || 1) + ', lv ' + (r.data.level || 1) + ')');
          }
          return r;
        });
    },

    // ── Сохранение прогресса ──
    saveProgress: function() {
      if (!API.userId || _saving) {
        _saveQueue = true;
        return Promise.resolve({ ok: false, queued: true });
      }
      _saving = true;
      _saveQueue = false;
      var snap = snapshotG();
      var cp = (typeof calcCP === 'function') ? calcCP() : 0;
      return apiFetch('/save', {
        method:  'POST',
        headers: headers(),
        body:    JSON.stringify({ gameData: snap, cp: cp }),
      }).then(function(r) {
        _saving = false;
        if (_saveQueue) { _saveQueue = false; API.saveProgress(); }
        if (r.ok) console.log('[API] Saved (CP:', cp + ')');
        return r;
      }).catch(function(e) {
        _saving = false;
        return { ok: false, error: e.message };
      });
    },

    // ── Лидерборд ──
    leaderboard: function() {
      return apiFetch('/leaderboard', { method: 'GET', headers: headers() });
    },
  };

  window.API = API;
})();

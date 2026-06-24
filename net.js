/*
  ══════════════════════════════════════════════════════
  net.js — Простой сетевой слой
  Сохраняем на сервер: мгновенно (важное) и раз в 5 секунд (всё)
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

  var TG_INIT = '';
  var currentTgId = null;
  var saveTimer = null;
  var isSaving = false;
  var SAVE_INTERVAL = 5000; // 5 секунд

  // ═══════════════════════════════
  //  ПОЛУЧЕНИЕ TG ID
  // ═══════════════════════════════
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
  //  ЗАГРУЗКА С СЕРВЕРА
  // ═══════════════════════════════
  function loadFromServer() {
    return new Promise(function(resolve, reject) {
      if (!TG_INIT) {
        reject(new Error('No initData'));
        return;
      }

      fetch(API + '/api/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: TG_INIT })
      })
      .then(function(r) { return r.json(); })
      .then(function(r) {
        if (!r.ok) {
          reject(new Error(r.error || 'Server error'));
          return;
        }
        
        if (r.save && r.save.data) {
          applyServerData(r.save.data);
          resolve(r.save.data);
        } else {
          // Новый пользователь
          var emptySave = createEmptySave();
          applyServerData(emptySave);
          resolve(emptySave);
        }
      })
      .catch(function(err) {
        reject(err);
      });
    });
  }

  // ═══════════════════════════════
  //  ПРИМЕНЕНИЕ ДАННЫХ С СЕРВЕРА
  // ═══════════════════════════════
  function applyServerData(data) {
    if (!data || typeof data !== 'object') return;

    // Персонаж
    if (data.charId) {
      G.charId = data.charId;
      if (typeof CHARS !== 'undefined' && CHARS[data.charId]) {
        G_CHAR = CHARS[data.charId];
        if (typeof applyCharacterSprites === 'function') {
          applyCharacterSprites(G_CHAR);
        }
      }
    }

    // Базовые статы
    if (data.baseStats) {
      G.baseStats = Object.assign({}, data.baseStats);
    }

    // Инвентарь
    if (data.inventory) {
      G.inventory = data.inventory.map(function(item) {
        var copy = JSON.parse(JSON.stringify(item));
        copy._equipped = false;
        return copy;
      });
    }

    // Экипировка
    if (data.equipped) {
      G.equipped = data.equipped;
      Object.values(G.equipped).forEach(function(item) {
        if (item) item._equipped = true;
      });
    }

    // Все остальные поля
    var fields = [
      'level', 'xp', 'xpNeeded', 'floor', 'maxFloor',
      'gold', 'pixr', 'gram', 'killCount',
      'hp', 'maxHp', 'potions', 'potionLv', 'potionThreshold',
      'upg', 'skills', 'bp', 'prem', 'boss',
      'dailyTasks', 'specialTasksClaimed', 'invFilter'
    ];

    fields.forEach(function(field) {
      if (data[field] !== undefined) {
        G[field] = data[field];
      }
    });

    // Пересчет статов
    if (typeof recalcStats === 'function') {
      recalcStats();
    }

    // Обновление UI
    if (typeof updateHUD === 'function') {
      updateHUD();
    }
    if (typeof updatePotionHud === 'function') {
      updatePotionHud();
    }
    if (typeof initSkillsHud === 'function') {
      initSkillsHud();
    }

    currentTgId = getTgId();
    console.log('✅ Данные загружены с сервера');
  }

  // ═══════════════════════════════
  //  СОЗДАНИЕ ПУСТОГО СЕЙВА
  // ═══════════════════════════════
  function createEmptySave() {
    return {
      charId: null,
      level: 1,
      xp: 0,
      xpNeeded: 100,
      floor: 1,
      maxFloor: 1,
      gold: 0,
      pixr: 0,
      gram: 0,
      killCount: 0,
      hp: 100,
      maxHp: 100,
      potions: 0,
      potionLv: 0,
      potionThreshold: 30,
      upg: { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 },
      skills: {},
      inventory: [],
      equipped: { weapon: null, armor: null, ring: null, boots: null, helmet: null },
      bp: { active: false, claimed: [] },
      prem: { tier: null, expiresAt: 0 },
      boss: { floor: 1, lastFightTime: 0 },
      dailyTasks: { date: '', seconds: 0, claimed: [] },
      specialTasksClaimed: {},
      invFilter: 'all'
    };
  }

  // ═══════════════════════════════
  //  СЕРИАЛИЗАЦИЯ
  // ═══════════════════════════════
  function serializeState() {
    return {
      tgId: currentTgId,
      charId: G.charId || null,
      level: G.level || 1,
      xp: G.xp || 0,
      xpNeeded: G.xpNeeded || 100,
      floor: G.floor || 1,
      maxFloor: G.maxFloor || 1,
      gold: G.gold || 0,
      pixr: G.pixr || 0,
      gram: G.gram || 0,
      killCount: G.killCount || 0,
      hp: G.hp || 0,
      maxHp: G.maxHp || 100,
      potions: G.potions || 0,
      potionLv: G.potionLv || 0,
      potionThreshold: G.potionThreshold || 30,
      upg: Object.assign({}, G.upg),
      skills: Object.assign({}, G.skills),
      inventory: G.inventory.map(function(item) {
        var copy = JSON.parse(JSON.stringify(item));
        delete copy._equipped;
        return copy;
      }),
      equipped: Object.assign({}, G.equipped),
      bp: Object.assign({}, G.bp),
      prem: Object.assign({}, G.prem),
      boss: Object.assign({}, G.boss),
      dailyTasks: Object.assign({}, G.dailyTasks),
      specialTasksClaimed: Object.assign({}, G.specialTasksClaimed),
      invFilter: G.invFilter || 'all',
      updatedAt: Date.now()
    };
  }

  // ═══════════════════════════════
  //  СОХРАНЕНИЕ НА СЕРВЕР
  // ═══════════════════════════════
  function saveToServer(force) {
    if (isSaving) return;
    if (!TG_INIT) {
      console.warn('⚠️ Нет initData, сохранение невозможно');
      return;
    }

    isSaving = true;
    var data = serializeState();

    fetch(API + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: TG_INIT, data: data })
    })
    .then(function(r) { return r.json(); })
    .then(function(r) {
      if (r.ok) {
        console.log('✅ Сохранено на сервер (force: ' + (force || false) + ')');
      } else {
        console.warn('⚠️ Ошибка сохранения:', r.error);
      }
    })
    .catch(function(err) {
      console.error('❌ Ошибка сохранения:', err.message);
    })
    .then(function() {
      isSaving = false;
    });
  }

  // ═══════════════════════════════
  //  МГНОВЕННОЕ СОХРАНЕНИЕ (важное)
  // ═══════════════════════════════
  function saveInstant() {
    // Сбрасываем таймер, чтобы не было двойного сохранения
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveToServer(true);
    // Запускаем таймер заново
    if (SAVE_INTERVAL > 0) {
      saveTimer = setTimeout(function() {
        saveToServer(false);
        startPeriodicSave();
      }, SAVE_INTERVAL);
    }
  }

  // ═══════════════════════════════
  //  ЗАПУСК ПЕРИОДИЧЕСКОГО СОХРАНЕНИЯ
  // ═══════════════════════════════
  function startPeriodicSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    // Первое сохранение через 5 секунд
    saveTimer = setTimeout(function() {
      saveToServer(false);
      // Запускаем периодическое сохранение
      if (SAVE_INTERVAL > 0) {
        saveTimer = setInterval(function() {
          saveToServer(false);
        }, SAVE_INTERVAL);
      }
    }, SAVE_INTERVAL);
  }

  // ═══════════════════════════════
  //  ЗАПУСК ЦИКЛА СОХРАНЕНИЯ
  // ═══════════════════════════════
  function startSaveLoop() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    startPeriodicSave();

    // Сохраняем при сворачивании
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        saveToServer(true);
      }
    });

    // Сохраняем при закрытии
    window.addEventListener('pagehide', function() {
      saveToServer(true);
    });

    window.addEventListener('beforeunload', function() {
      saveToServer(true);
    });

    console.log('🔄 Цикл сохранения запущен (интервал ' + SAVE_INTERVAL + 'мс)');
  }

  // ═══════════════════════════════
  //  ИНИЦИАЛИЗАЦИЯ
  // ═══════════════════════════════
  function init() {
    // Получаем initData из Telegram
    if (window.Telegram && window.Telegram.WebApp) {
      try {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
        TG_INIT = window.Telegram.WebApp.initData || '';
        var unsafe = window.Telegram.WebApp.initDataUnsafe;
        if (unsafe && unsafe.user) {
          currentTgId = String(unsafe.user.id);
        }
      } catch (e) {
        console.error('❌ Ошибка Telegram:', e.message);
      }
    }

    if (!TG_INIT) {
      console.warn('⚠️ Нет initData — демо-режим');
      currentTgId = 'demo_' + Date.now();
      var emptySave = createEmptySave();
      applyServerData(emptySave);
      if (typeof startGame === 'function') startGame();
      return;
    }

    // Загружаем данные с сервера
    loadFromServer()
      .then(function() {
        if (G.charId) {
          if (typeof startGame === 'function') startGame();
        } else {
          var cs = document.getElementById('charSelect');
          if (cs) cs.classList.remove('hidden');
        }
        startSaveLoop();
      })
      .catch(function(err) {
        console.error('❌ Ошибка загрузки:', err.message);
        var status = document.getElementById('lsStatus');
        if (status) {
          status.textContent = '❌ Ошибка подключения к серверу';
          status.style.color = '#e74c3c';
        }
      });
  }

  // ═══════════════════════════════
  //  ПУБЛИЧНЫЙ API
  // ═══════════════════════════════
  window.GameSync = {
    save: saveToServer,
    saveInstant: saveInstant,
    getTgId: getTgId,
    loadFromServer: loadFromServer,
    API: API,
    _INIT: TG_INIT,
    isOnline: function() { return !!TG_INIT; }
  };

  // Хуки для игровых событий (вызываются из других файлов)
  window.onPixrDrop = function(amount) {
    G.pixr = (G.pixr || 0) + amount;
    if (window.GameSync && typeof window.GameSync.saveInstant === 'function') {
      window.GameSync.saveInstant();
    }
  };

  window.onExchangePixr = function() {
    if (window.GameSync && typeof window.GameSync.saveInstant === 'function') {
      window.GameSync.saveInstant();
    }
  };

  window.onItemDrop = function(item) {
    if (!G.inventory) G.inventory = [];
    G.inventory.push(item);
    if (window.GameSync && typeof window.GameSync.saveInstant === 'function') {
      window.GameSync.saveInstant();
    }
  };

  window.onEquip = function(item) {
    if (window.GameSync && typeof window.GameSync.saveInstant === 'function') {
      window.GameSync.saveInstant();
    }
  };

  window.onUpgrade = function(upgId, newLevel) {
    if (window.GameSync && typeof window.GameSync.saveInstant === 'function') {
      window.GameSync.saveInstant();
    }
  };

  window.onSkillUpgrade = function(skillId, newLevel) {
    if (window.GameSync && typeof window.GameSync.saveInstant === 'function') {
      window.GameSync.saveInstant();
    }
  };

  window.onLevelUp = function() {
    if (window.GameSync && typeof window.GameSync.saveInstant === 'function') {
      window.GameSync.saveInstant();
    }
  };

  window.onFloorChange = function(newFloor) {
    if (window.GameSync && typeof window.GameSync.saveInstant === 'function') {
      window.GameSync.saveInstant();
    }
  };

  // Запускаем инициализацию
  if (document.readyState === 'complete') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();
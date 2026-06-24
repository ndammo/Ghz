/*
  ══════════════════════════════════════════════════════
  net.js — WebSocket клиент
  Единый источник истины — сервер
  Отправляет ТОЛЬКО изменённые поля (diff)
  ══════════════════════════════════════════════════════
*/

(function() {
  'use strict';

  var API = (function() {
    var url = new URLSearchParams(window.location.search).get('api') || 
              window.ENV_API_URL || 
              'https://ghz-production.up.railway.app';
    return url.replace(/\/$/, '');
  })();

  var WS_URL = API.replace('https://', 'wss://').replace('http://', 'ws://');

  var ws = null;
  var isConnected = false;
  var isReady = false;
  var isSynced = false;
  var reconnectTimer = null;
  var saveQueue = [];
  var isSaving = false;
  var TG_INIT = '';
  var TG_ID = null;
  
  // ⭐ Храним предыдущее состояние для сравнения
  var _lastState = {};
  
  var SYNC = {
    booted: false,
    started: false,
    online: false,
    serverConfirmed: false
  };

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
    return TG_ID;
  }

  // ═══════════════════════════════
  //  ПОДКЛЮЧЕНИЕ К WEBSOCKET
  // ═══════════════════════════════

  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    if (ws && ws.readyState === WebSocket.CONNECTING) return;

    console.log('🔌 Подключение к WebSocket...');
    updateLoadingStatus('Подключение к серверу...', 30);

    try {
      ws = new WebSocket(WS_URL + '/ws');
    } catch (e) {
      console.error('❌ Ошибка создания WebSocket:', e.message);
      scheduleReconnect();
      return;
    }

    ws.onopen = function() {
      console.log('✅ WebSocket подключен');
      isConnected = true;
      updateLoadingStatus('Загрузка данных...', 50);

      var tgId = getTgId();
      if (tgId) {
        ws.send(JSON.stringify({
          type: 'auth',
          tgId: tgId
        }));
      } else {
        console.warn('⚠️ Нет tgId для авторизации');
      }
    };

    ws.onmessage = function(event) {
      try {
        var msg = JSON.parse(event.data);
        handleWebSocketMessage(msg);
      } catch (e) {
        console.error('❌ Ошибка парсинга сообщения:', e.message);
      }
    };

    ws.onclose = function() {
      console.log('❌ WebSocket отключен');
      isConnected = false;
      isReady = false;
      scheduleReconnect();
    };

    ws.onerror = function(err) {
      console.error('❌ WebSocket ошибка:', err.message);
    };
  }

  // ═══════════════════════════════
  //  ОБНОВЛЕНИЕ ЭКРАНА ЗАГРУЗКИ
  // ═══════════════════════════════

  function updateLoadingStatus(text, pct) {
    var status = document.getElementById('lsStatus');
    var bar = document.getElementById('lsBar');
    if (status) status.innerHTML = '<span class="ls-dots">' + text + '</span>';
    if (bar && pct !== undefined) bar.style.width = pct + '%';
  }

  function hideLoadingScreen() {
    var el = document.getElementById('loadingScreen');
    if (!el || el.classList.contains('fade-out')) return;
    el.style.pointerEvents = 'none';
    el.classList.add('fade-out');
    setTimeout(function() {
      el.style.display = 'none';
      el.classList.add('hidden-done');
    }, 520);
  }

  // ═══════════════════════════════
  //  ПЕРЕПОДКЛЮЧЕНИЕ
  // ═══════════════════════════════

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(function() {
      console.log('🔄 Переподключение...');
      updateLoadingStatus('Переподключение...', 20);
      connectWebSocket();
    }, 3000);
  }

  // ═══════════════════════════════
  //  ОБРАБОТКА СООБЩЕНИЙ
  // ═══════════════════════════════

  function handleWebSocketMessage(msg) {
    switch (msg.type) {
      case 'auth_ok':
        console.log('✅ Авторизация на сервере успешна');
        isReady = true;
        SYNC.serverConfirmed = true;
        SYNC.online = true;
        updateLoadingStatus('Авторизация...', 60);
        break;

      case 'sync':
        console.log('📥 Получены данные с сервера');
        updateLoadingStatus('Применение данных...', 80);
        
        if (msg.data) {
          applySnapshot(msg.data);
          
          // ⭐ Обновляем кэш после загрузки
          _lastState = getFullState();
          
          var charId = msg.charId || msg.data.charId;
if (charId) {
  console.log('✅ Персонаж найден:', charId);
            isSynced = true;
            
            if (typeof updateHUD === 'function') updateHUD();
            if (typeof initSkillsHud === 'function') initSkillsHud();
            if (typeof updatePotionHud === 'function') updatePotionHud();
            if (typeof renderInventory === 'function' && typeof activeTab !== 'undefined' && activeTab === 'inv') renderInventory();
            if (typeof renderWallet === 'function' && typeof activeTab !== 'undefined' && activeTab === 'wallet') renderWallet();
            
            hideLoadingScreen();
            
            var cs = document.getElementById('charSelect');
            if (cs) cs.classList.add('hidden');
            
            if (!SYNC.started && typeof startGame === 'function') {
              SYNC.started = true;
              updateLoadingStatus('Запуск игры...', 95);
              setTimeout(function() {
                startGame();
                hideLoadingScreen();
              }, 300);
            }
          } else {
            console.log('ℹ️ Персонаж не выбран, показываем выбор');
            isSynced = true;
            hideLoadingScreen();
            
            var cs = document.getElementById('charSelect');
            if (cs) cs.classList.remove('hidden');
            
            var skillsHud = document.getElementById('skillsHud');
            if (skillsHud) skillsHud.classList.remove('visible');
          }
        }
        break;

      case 'update':
        console.log('🔄 Обновление от сервера:', Object.keys(msg.data));
        applyUpdate(msg.data);
        // ⭐ Обновляем кэш после обновления
        _lastState = getFullState();
        if (typeof updateHUD === 'function') updateHUD();
        break;

      case 'saved':
        isSaving = false;
        if (saveQueue.length > 0) {
          var next = saveQueue.shift();
          sendSave(next);
        }
        break;

      case 'error':
        console.error('❌ Ошибка сервера:', msg.message);
        break;

      default:
        console.log('📨 Неизвестное сообщение:', msg.type);
    }
  }

  // ═══════════════════════════════
  //  ПРИМЕНЕНИЕ ДАННЫХ (полный снапшот)
  // ═══════════════════════════════

  function applySnapshot(s) {
    if (!s || typeof s !== 'object') return false;

    if (s.charId && typeof CHARS !== 'undefined' && CHARS[s.charId]) {
      G_CHAR = CHARS[s.charId];
      G.charId = s.charId;
      if (typeof applyCharacterSprites === 'function') applyCharacterSprites(G_CHAR);
    }

    if (s.inventory && Array.isArray(s.inventory)) {
      G.inventory = s.inventory.map(function(item) {
        var c = Object.assign({}, item);
        c._equipped = false;
        return c;
      });
    }

    if (s.equipped) {
      G.equipped = s.equipped;
      if (G.inventory) {
        G.inventory.forEach(function(item) {
          item._equipped = false;
          Object.keys(G.equipped).forEach(function(slot) {
            if (G.equipped[slot] && G.equipped[slot].id === item.id) {
              item._equipped = true;
            }
          });
        });
      }
    }

    if (s.upg) {
      G.upg = Object.assign({ atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 }, s.upg);
    }

    if (s.skills) {
      G.skills = s.skills;
    }

    if (s.level !== undefined) G.level = s.level;
    if (s.xp !== undefined) G.xp = s.xp;
    if (s.xpNeeded !== undefined) G.xpNeeded = s.xpNeeded;
    if (s.floor !== undefined) G.floor = s.floor;
    if (s.maxFloor !== undefined) G.maxFloor = s.maxFloor;
    if (s.killCount !== undefined) G.killCount = s.killCount;

    if (s.gold !== undefined) G.gold = s.gold;
    if (s.pixr !== undefined) G.pixr = s.pixr;
    if (s.gram !== undefined) G.gram = s.gram;

    if (s.hp !== undefined) G.hp = s.hp;
    if (s.maxHp !== undefined) G.maxHp = s.maxHp;

    if (s.potions !== undefined) G.potions = s.potions;
    if (s.potionLv !== undefined) G.potionLv = s.potionLv;
    if (s.potionThreshold !== undefined) G.potionThreshold = s.potionThreshold;

    if (s.bp) G.bp = s.bp;
    if (s.prem) G.prem = s.prem;
    if (s.boss) G.boss = s.boss;
    if (s.dailyTasks) G.dailyTasks = s.dailyTasks;
    if (s.specialTasksClaimed) G.specialTasksClaimed = s.specialTasksClaimed;

    if (typeof recalcStats === 'function') recalcStats();

    return true;
  }

  // ═══════════════════════════════
  //  ПРИМЕНЕНИЕ ОБНОВЛЕНИЙ (частичных)
  // ═══════════════════════════════

  function applyUpdate(data) {
    if (!data) return;

    Object.keys(data).forEach(function(key) {
      switch (key) {
        case 'inventory':
          if (Array.isArray(data[key])) {
            G.inventory = data[key].map(function(item) {
              var c = Object.assign({}, item);
              c._equipped = false;
              return c;
            });
          }
          break;
        case 'equipped':
          G.equipped = data[key];
          if (G.inventory) {
            G.inventory.forEach(function(item) {
              item._equipped = false;
              Object.keys(G.equipped).forEach(function(slot) {
                if (G.equipped[slot] && G.equipped[slot].id === item.id) {
                  item._equipped = true;
                }
              });
            });
          }
          break;
        case 'upg':
          G.upg = Object.assign({ atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 }, data[key]);
          break;
        case 'skills':
          G.skills = data[key];
          break;
        case 'level':
          G.level = data[key];
          break;
        case 'xp':
          G.xp = data[key];
          break;
        case 'xpNeeded':
          G.xpNeeded = data[key];
          break;
        case 'floor':
          G.floor = data[key];
          break;
        case 'maxFloor':
          G.maxFloor = data[key];
          break;
        case 'gold':
          G.gold = data[key];
          break;
        case 'pixr':
          G.pixr = data[key];
          break;
        case 'gram':
          G.gram = data[key];
          break;
        case 'hp':
          G.hp = data[key];
          break;
        case 'maxHp':
          G.maxHp = data[key];
          break;
        case 'potions':
          G.potions = data[key];
          break;
        case 'potionLv':
          G.potionLv = data[key];
          break;
        case 'potionThreshold':
          G.potionThreshold = data[key];
          break;
        case 'bp':
          G.bp = data[key];
          break;
        case 'prem':
          G.prem = data[key];
          break;
        case 'boss':
          G.boss = data[key];
          break;
        case 'dailyTasks':
          G.dailyTasks = data[key];
          break;
        case 'specialTasksClaimed':
          G.specialTasksClaimed = data[key];
          break;
        case 'killCount':
          G.killCount = data[key];
          break;
        case 'charId':
          G.charId = data[key];
          if (data[key] && typeof CHARS !== 'undefined' && CHARS[data[key]]) {
            G_CHAR = CHARS[data[key]];
            if (typeof applyCharacterSprites === 'function') applyCharacterSprites(G_CHAR);
          }
          break;
        default:
          G[key] = data[key];
      }
    });

    if (data.inventory || data.equipped || data.upg) {
      if (typeof recalcStats === 'function') recalcStats();
    }

    if (typeof updatePotionHud === 'function') updatePotionHud();
    if (typeof updateSkillsHud === 'function') updateSkillsHud();
  }

  // ═══════════════════════════════
  //  ПОЛНЫЙ СНАПШОТ СОСТОЯНИЯ
  // ═══════════════════════════════

  function getFullState() {
    return {
      inventory: G.inventory || [],
      equipped: G.equipped || {},
      upg: G.upg || { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 },
      skills: G.skills || {},
      level: G.level || 1,
      xp: G.xp || 0,
      xpNeeded: G.xpNeeded || 100,
      floor: G.floor || 1,
      maxFloor: G.maxFloor || 1,
      gold: G.gold || 0,
      pixr: G.pixr || 0,
      gram: G.gram || 0,
      hp: G.hp || 100,
      maxHp: G.maxHp || 100,
      potions: G.potions || 0,
      potionLv: G.potionLv || 0,
      potionThreshold: G.potionThreshold || 30,
      bp: G.bp || { active: false, claimed: [] },
      prem: G.prem || { tier: null, expiresAt: 0 },
      boss: G.boss || { floor: 1, lastFightTime: 0 },
      dailyTasks: G.dailyTasks || { date: '', seconds: 0, claimed: [] },
      specialTasksClaimed: G.specialTasksClaimed || {},
      killCount: G.killCount || 0,
      charId: G.charId || null
    };
  }

  // ═══════════════════════════════
  //  СОХРАНЕНИЕ — ТОЛЬКО ИЗМЕНЕНИЯ (DIFF)
  // ═══════════════════════════════

  function getChanges() {
    var current = getFullState();
    var changes = {};
    var hasChanges = false;

    Object.keys(current).forEach(function(key) {
      var oldVal = _lastState[key];
      var newVal = current[key];
      
      var isEqual = JSON.stringify(oldVal) === JSON.stringify(newVal);
      
      if (!isEqual) {
        changes[key] = newVal;
        hasChanges = true;
      }
    });

    return { changes: changes, hasChanges: hasChanges };
  }

  function sendSave(data) {
    if (!isReady || !ws || ws.readyState !== WebSocket.OPEN) {
      saveQueue.push(data);
      return;
    }

    isSaving = true;
    ws.send(JSON.stringify({
      type: 'save',
      data: data
    }));
  }

  function saveEverything() {
    var result = getChanges();
    
    if (!result.hasChanges) {
      return;
    }

    if (!isReady) {
      saveQueue.push(result.changes);
      return;
    }

    if (isSaving) {
      saveQueue.push(result.changes);
      return;
    }

    sendSave(result.changes);
    _lastState = getFullState();
  }

  function saveInstant(data) {
    var full = getFullState();
    Object.keys(data).forEach(function(key) {
      full[key] = data[key];
    });
    
    // Временно обновляем G
    Object.keys(data).forEach(function(key) {
      G[key] = data[key];
    });
    
    var result = getChanges();
    
    if (!result.hasChanges) {
      return;
    }

    if (!isReady || isSaving) {
      saveQueue.push(result.changes);
      return;
    }

    sendSave(result.changes);
    _lastState = getFullState();
  }

  // ═══════════════════════════════
  //  ЗАГРУЗКА С СЕРВЕРА
  // ═══════════════════════════════

  function loadFromServer() {
    if (isReady && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'load' }));
    }
  }

  // ═══════════════════════════════
  //  ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ КЭША
  // ═══════════════════════════════

  function refreshCache() {
    _lastState = getFullState();
  }

  // ═══════════════════════════════
  //  ИНИЦИАЛИЗАЦИЯ TELEGRAM
  // ═══════════════════════════════

  function initTelegram() {
    if (window.Telegram && window.Telegram.WebApp) {
      try {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
        if (window.Telegram.WebApp.disableVerticalSwipes) {
          window.Telegram.WebApp.disableVerticalSwipes();
        }
        TG_INIT = window.Telegram.WebApp.initData || '';
        var unsafe = window.Telegram.WebApp.initDataUnsafe;
        if (unsafe && unsafe.user && unsafe.user.id) {
          TG_ID = String(unsafe.user.id);
        }
      } catch (e) {
        console.error('❌ Ошибка инициализации Telegram:', e.message);
      }
    }

    if (!TG_ID) {
      try {
        TG_ID = localStorage.getItem('tgId');
      } catch (e) {}
    }

    console.log('🟢 [initTelegram] Пользователь:', TG_ID);
    SYNC.online = !!TG_ID;
  }

  // ═══════════════════════════════
  //  ЗАПУСК
  // ═══════════════════════════════

  function startGameFlow() {
    var loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.style.display = 'flex';
      loadingScreen.classList.remove('fade-out', 'hidden-done');
    }
    
    updateLoadingStatus('Подключение...', 10);
    connectWebSocket();
    
    setTimeout(function() {
      if (!isSynced) {
        console.warn('⚠️ Данные не получены, показываем выбор персонажа');
        hideLoadingScreen();
        var cs = document.getElementById('charSelect');
        if (cs) cs.classList.remove('hidden');
      }
    }, 10000);
  }

  function init() {
    initTelegram();
    startGameFlow();
  }

  // ═══════════════════════════════
  //  ЭКСПОРТ
  // ═══════════════════════════════

  window.GameSync = {
    connect: connectWebSocket,
    save: saveEverything,
    saveInstant: saveInstant,
    load: loadFromServer,
    isConnected: function() { return isReady; },
    getTgId: getTgId,
    applyUpdate: applyUpdate,
    applySnapshot: applySnapshot,
    getFullState: getFullState,
    refreshCache: refreshCache,
    state: SYNC,
    getApiUrl: function() { return API; },
    get INIT() { return TG_INIT; }
  };

  // ═══════════════════════════════
  //  АВТОЗАПУСК
  // ═══════════════════════════════

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }

  // Сохраняем при закрытии (отправляем ВСЁ, для надёжности)
  window.addEventListener('beforeunload', function() {
    if (isReady) {
      var data = getFullState();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'save',
          data: data
        }));
      }
    }
  });

})();
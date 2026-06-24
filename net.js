/*
  ══════════════════════════════════════════════════════
  net.js — Сетевой слой (Socket.io) — ТОЛЬКО ОНЛАЙН
  БЕЗ localStorage, БЕЗ офлайн-режима
  ══════════════════════════════════════════════════════
*/

(function() {
  'use strict';

  const API_URL = 'https://ghz-production.up.railway.app';
  window.API_URL = API_URL; // для логгера
  
  let socket = null;
  let connected = false;
  let connecting = false;
  let tgId = null;
  let G = window.G || {};

  // ── ПОЛУЧИТЬ TG ID ──
  function getTgId() {
    try {
      if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe) {
        const user = window.Telegram.WebApp.initDataUnsafe.user;
        if (user && user.id) {
          return String(user.id);
        }
      }
    } catch (e) {}
    return null;
  }

  // ── ПОЛУЧИТЬ INIT DATA ──
  function getInitData() {
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        return window.Telegram.WebApp.initData || '';
      }
    } catch (e) {}
    return '';
  }

  // ── ПРОВЕРКА ИНТЕРНЕТА ──
  function isOnline() {
    return navigator.onLine && connected;
  }

  // ── ПОКАЗАТЬ ОШИБКУ ОФЛАЙН ──
  function showOfflineError() {
    const msg = '❌ Нет соединения с сервером!';
    const el = document.getElementById('floorUnlock');
    if (el) {
      el.querySelector('.fu-title').textContent = '⚠️ ' + msg;
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 4000);
    }
    console.error('❌ [socket] Офлайн, данные не сохранены');
    window.logError && window.logError('Офлайн: ' + msg);
  }

  // ── ПОДКЛЮЧЕНИЕ ──
  function connect(callback) {
    if (socket && connected) {
      if (callback) callback(null);
      return;
    }

    if (connecting) {
      if (callback) {
        const check = setInterval(() => {
          if (connected || !connecting) {
            clearInterval(check);
            callback(connected ? null : new Error('timeout'));
          }
        }, 100);
      }
      return;
    }

    tgId = getTgId();
    if (!tgId) {
      console.warn('⚠️ [socket] Нет tgId');
      window.logWarn && window.logWarn('Нет tgId, ожидание Telegram...');
      if (callback) callback(new Error('no_tg_id'));
      return;
    }

    connecting = true;
    const initData = getInitData();

    console.log('📡 [net] Подключение к:', API_URL);
    window.logNet && window.logNet('Подключение к ' + API_URL);
    window.logInfo && window.logInfo('tgId: ' + tgId);

    if (typeof io === 'undefined') {
      console.error('❌ [socket] io не определён!');
      window.logError && window.logError('Socket.io не загружен!');
      connecting = false;
      if (callback) callback(new Error('socket_not_loaded'));
      return;
    }

    socket = io(API_URL, {
      auth: { initData },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('🟢 [socket] Подключен');
      window.logSocket && window.logSocket('✅ Подключен к серверу!');
      connected = true;
      connecting = false;
      if (callback) callback(null);
      
      // ── АВТОМАТИЧЕСКАЯ ЗАГРУЗКА ДАННЫХ ──
      window.logNet && window.logNet('📥 Запрашиваю данные игрока...');
      loadGame((response) => {
        if (response && response.ok) {
          console.log('✅ [net] Данные загружены!');
          window.logOk && window.logOk('✅ Игрок загружен');
          
          // Скрываем экран загрузки
          const ls = document.getElementById('loadingScreen');
          if (ls) {
            ls.classList.add('fade-out');
            setTimeout(() => ls.classList.add('hidden-done'), 500);
          }
          
          // Если есть персонаж — запускаем игру
          if (response.save && response.save.charId) {
            if (typeof window.startGame === 'function') {
              window.startGame();
            }
          } else {
            // Показать экран выбора персонажа
            const cs = document.getElementById('charSelect');
            if (cs) cs.classList.remove('hidden');
          }
        } else {
          console.error('❌ [net] Ошибка загрузки:', response?.error);
          window.logError && window.logError('Ошибка загрузки: ' + (response?.error || 'unknown'));
          
          // Показываем ошибку на экране загрузки
          const status = document.getElementById('lsStatus');
          if (status) {
            status.innerHTML = '❌ Ошибка: ' + (response?.error || 'неизвестная ошибка');
            status.style.color = '#e74c3c';
          }
        }
      });
    });

    socket.on('connect_error', (err) => {
      console.error('❌ [socket] Ошибка:', err.message);
      window.logError && window.logError('Socket ошибка: ' + err.message);
      connected = false;
      connecting = false;
      showOfflineError();
      if (callback) callback(err);
    });

    socket.on('disconnect', (reason) => {
      console.warn(`⚠️ [socket] Отключен: ${reason}`);
      window.logWarn && window.logWarn('Отключен: ' + reason);
      connected = false;
      showOfflineError();
    });

    socket.io.on('reconnect', () => {
      console.log('🔄 [socket] Переподключен');
      window.logSocket && window.logSocket('🔄 Переподключен!');
      connected = true;
    });

    socket.io.on('reconnect_error', (err) => {
      console.error('❌ [socket] Ошибка переподключения:', err.message);
      window.logError && window.logError('Reconnect error: ' + err.message);
      showOfflineError();
    });

    socket.io.on('reconnect_failed', () => {
      console.error('❌ [socket] Не удалось переподключиться');
      window.logError && window.logError('Reconnect failed');
      showOfflineError();
    });
  }

  // ── ЗАГРУЗКА ──
  function loadGame(callback) {
    console.log('📥 [net] Загрузка игры...');
    window.logNet && window.logNet('Загрузка сохранения...');
    
    if (!socket || !connected) {
      showOfflineError();
      return callback({ ok: false, error: 'offline' });
    }

    socket.emit('load', (response) => {
      console.log('📥 [net] Ответ загрузки:', response);
      window.logNet && window.logNet('Ответ: ' + (response.ok ? '✅ OK' : '❌ ' + (response.error || 'ошибка')));
      
      if (response.ok) {
        if (response.save && response.save.data) {
          applySnapshot(response.save.data);
          if (response.save.charId && typeof window.applyCharacterSprites === 'function') {
            const CHARS = window.CHARS || {};
            if (CHARS[response.save.charId]) {
              window.applyCharacterSprites(CHARS[response.save.charId]);
            }
          }
        }
        callback({ ok: true, save: response.save });
      } else {
        callback({ ok: false, error: response.error });
      }
    });
  }

  // ── СОХРАНЕНИЕ ──
  function saveGame(data, callback) {
    if (!socket || !connected) {
      showOfflineError();
      if (callback) callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('save', data, (response) => {
      if (response && response.ok) {
        if (callback) callback({ ok: true });
      } else {
        console.error('❌ [save] Ошибка сервера:', response?.error);
        if (callback) callback({ ok: false, error: response?.error || 'save_failed' });
      }
    });
  }

  // ── МГНОВЕННОЕ СОХРАНЕНИЕ ──
  function saveInstant(data, callback) {
    if (!socket || !connected) {
      showOfflineError();
      if (callback) callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('save_instant', data, (response) => {
      if (callback) callback(response || { ok: false });
    });
  }

  // ── ПРИМЕНЕНИЕ СНАПШОТА ──
  function applySnapshot(s) {
    if (!s || typeof s !== 'object') return false;
    
    const localG = window.G;
    if (!localG) return false;

    Object.keys(s).forEach(key => {
      if (key !== '_savedAt' && key !== '_offlineOnly') {
        localG[key] = s[key];
      }
    });

    if (typeof window.recalcStats === 'function') window.recalcStats();
    if (typeof window.updateHUD === 'function') window.updateHUD();
    if (typeof window.updatePotionHud === 'function') window.updatePotionHud();

    return true;
  }

  // ── ВЫБОР ПЕРСОНАЖА ──
  function selectCharacter(charId, callback) {
    if (!socket || !connected) {
      showOfflineError();
      if (callback) callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('select_character', charId, (response) => {
      if (callback) callback(response || { ok: false });
    });
  }

  // ── ЛИДЕРБОРД ──
  function getLeaderboard(callback) {
    if (!socket || !connected) {
      showOfflineError();
      callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('leaderboard', (response) => {
      callback(response || { ok: false });
    });
  }

  // ── РЕФЕРАЛЫ ──
  function getRefFriends(callback) {
    if (!socket || !connected) {
      showOfflineError();
      callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('ref_friends', (response) => {
      callback(response || { ok: false });
    });
  }

  function claimRefReward(callback) {
    if (!socket || !connected) {
      showOfflineError();
      callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('ref_claim', (response) => {
      callback(response || { ok: false });
    });
  }

  // ── ТРАНЗАКЦИИ ──
  function deposit(amount, callback) {
    if (!socket || !connected) {
      showOfflineError();
      callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('deposit', amount, (response) => {
      callback(response || { ok: false });
    });
  }

  function withdraw(data, callback) {
    if (!socket || !connected) {
      showOfflineError();
      callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('withdraw', data, (response) => {
      callback(response || { ok: false });
    });
  }

  function getTransactions(callback) {
    if (!socket || !connected) {
      showOfflineError();
      callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('get_transactions', (response) => {
      callback(response || { ok: false });
    });
  }

  // ── ЗАДАНИЯ ──
  function getTasks(callback) {
    if (!socket || !connected) {
      showOfflineError();
      callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('get_tasks', (response) => {
      callback(response || { ok: false });
    });
  }

  function claimDailyTask(milestoneId, callback) {
    if (!socket || !connected) {
      showOfflineError();
      callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('claim_daily_task', milestoneId, (response) => {
      callback(response || { ok: false });
    });
  }

  function claimSpecialTask(taskId, callback) {
    if (!socket || !connected) {
      showOfflineError();
      callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('claim_special_task', taskId, (response) => {
      callback(response || { ok: false });
    });
  }

  // ── ОБМЕН PIXR → GRAM ──
  function exchangePixr(amount, callback) {
    if (!socket || !connected) {
      showOfflineError();
      callback({ ok: false, error: 'offline' });
      return;
    }

    socket.emit('exchange_pixr', amount, (response) => {
      callback(response || { ok: false });
    });
  }

  // ── ПРОВЕРКА СТАТУСА ──
  function isConnected() { return connected; }

  function getSocket() { return socket; }

  // ── ОТПРАВКА СОБЫТИЙ ──
  function emit(event, data, callback) {
    if (!socket || !connected) {
      showOfflineError();
      if (callback) callback({ ok: false, error: 'offline' });
      return;
    }
    socket.emit(event, data, callback);
  }

  // ═══════════════════════════════════
  //  АВТОМАТИЧЕСКОЕ ПОДКЛЮЧЕНИЕ
  // ═══════════════════════════════════

  function autoConnect() {
    const id = getTgId();
    if (id) {
      tgId = id;
      window.logInfo && window.logInfo('Автоподключение...');
      connect((err) => {
        if (err) {
          showOfflineError();
        }
      });
    } else {
      window.logWarn && window.logWarn('Нет tgId, повтор через 2с');
      setTimeout(autoConnect, 2000);
    }
  }

  // ── СЛУШАЕМ ИЗМЕНЕНИЕ СТАТУСА ИНТЕРНЕТА ──
  window.addEventListener('online', () => {
    console.log('🌐 Интернет появился, подключаемся...');
    window.logNet && window.logNet('🌐 Интернет появился');
    if (!connected) {
      connect();
    }
  });

  window.addEventListener('offline', () => {
    console.warn('🌐 Интернет пропал');
    window.logWarn && window.logWarn('🌐 Интернет пропал');
    connected = false;
    showOfflineError();
  });

  // ── ИНИЦИАЛИЗАЦИЯ ──
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    autoConnect();
  } else {
    document.addEventListener('DOMContentLoaded', autoConnect);
  }

  // ═══════════════════════════════════
  //  ЭКСПОРТ
  // ═══════════════════════════════════

  window.GameSocket = {
    connect,
    isConnected,
    getSocket,
    getTgId,
    getInitData,
    isOnline,
    
    loadGame,
    saveGame,
    saveInstant,
    applySnapshot,
    
    selectCharacter,
    
    getLeaderboard,
    
    getRefFriends,
    claimRefReward,
    
    deposit,
    withdraw,
    getTransactions,
    
    getTasks,
    claimDailyTask,
    claimSpecialTask,
    
    exchangePixr,
    
    emit,
    
    _API: API_URL, // для логгера
  };

  console.log('🔌 [net] GameSocket инициализирован (ТОЛЬКО ОНЛАЙН)');
  console.log('📡 API_URL:', API_URL);
  window.logOk && window.logOk('GameSocket инициализирован, API: ' + API_URL);

})();
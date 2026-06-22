/*
  ══════════════════════════════════════════════════════
  state.js — Глобальное состояние игры с синхронизацией
  ══════════════════════════════════════════════════════
*/

// ── API URL ──
const API_URL = 'https://ghz-production.up.railway.app';

// ── Telegram WebApp init ──
let tg = window.Telegram?.WebApp;

function getTelegramInitData() {
  if (tg && tg.initData) {
    return tg.initData;
  }
  // Для локальной разработки
  return 'user=' + encodeURIComponent(JSON.stringify({
    id: Math.floor(Math.random() * 1000000000),
    first_name: 'TestUser',
    username: 'test_user'
  }));
}

// ── Глобальное состояние ──
const G = {
  // Основные данные (загружаются с сервера)
  gold: 0,
  pixr: 0,
  gram: 0,
  level: 1,
  xp: 0,
  xpNeeded: 100,
  floor: 1,
  maxFloor: 1,
  killCount: 0,
  
  stats: {
    atk: 10, def: 5, spd: 3, hp: 100,
    crit: 5, dodge: 3, atkSpd: 1.0,
  },
  hp: 100,
  maxHp: 100,
  baseStats: { atk: 10, def: 5, spd: 3, hp: 100, crit: 5, dodge: 3, atkSpd: 1.0 },
  
  upg: { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 },
  potionLv: 0,
  potions: 0,
  potionThreshold: 30,
  
  inventory: [],
  equipped: { weapon: null, body: null, legs: null, gloves: null, boots: null, helmet: null, ring: null, belt: null },
  invFilter: 'all',
  invIdCounter: 0,
  
  skills: {},
  bp: { active: false, claimed: [] },
  prem: { tier: null, expiresAt: 0 },
  
  character: 'fire',
  
  // Флаг загрузки
  _loaded: false,
  _saveTimer: null,
  _lastSave: 0,
  _pendingChanges: false,
  _changeCounter: 0,
};

// ── API Calls ──

async function apiCall(endpoint, method = 'GET', data = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': getTelegramInitData()
  };
  
  const options = {
    method,
    headers,
    credentials: 'include'
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'API error');
    }
    
    return result;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// ── ФУНКЦИИ СОХРАНЕНИЯ ──

// Получить полный снепшот состояния
function getFullGameState() {
  return {
    gold: G.gold,
    pixr: G.pixr,
    gram: G.gram,
    level: G.level,
    xp: G.xp,
    xpNeeded: G.xpNeeded,
    floor: G.floor,
    maxFloor: G.maxFloor,
    killCount: G.killCount,
    hp: G.hp,
    maxHp: G.maxHp,
    stats: G.stats,
    baseStats: G.baseStats,
    upg: G.upg,
    potionLv: G.potionLv,
    potions: G.potions,
    potionThreshold: G.potionThreshold,
    inventory: G.inventory,
    equipped: G.equipped,
    invFilter: G.invFilter,
    invIdCounter: G.invIdCounter,
    skills: G.skills,
    bp: G.bp,
    prem: G.prem,
    character: G.character
  };
}

// Локальное сохранение (в localStorage)
function saveToLocalStorage() {
  try {
    const data = getFullGameState();
    localStorage.setItem('pixel_runner_backup', JSON.stringify({
      ...data,
      timestamp: Date.now()
    }));
    return true;
  } catch (e) {
    console.warn('⚠️ LocalStorage save failed:', e);
    return false;
  }
}

// Загрузка из localStorage
function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem('pixel_runner_backup');
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Проверяем, не слишком ли старые данные (5 минут)
    if (Date.now() - data.timestamp > 300000) {
      console.warn('⚠️ Local backup is too old');
      return null;
    }
    return data;
  } catch (e) {
    console.warn('⚠️ LocalStorage load failed:', e);
    return null;
  }
}

// Синхронное сохранение (для beforeunload)
function saveGameToServerSync() {
  try {
    // 1. Сохраняем в localStorage (мгновенно)
    saveToLocalStorage();
    
    // 2. Сохраняем в emergency
    const data = getFullGameState();
    localStorage.setItem('pixel_runner_emergency', JSON.stringify({
      ...data,
      emergencySave: true,
      timestamp: Date.now()
    }));
    
    // 3. Отправляем на сервер (синхронно)
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/save`, false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Telegram-Init-Data', getTelegramInitData());
    xhr.timeout = 2000;
    xhr.send(JSON.stringify(data));
    
    console.log('💾 Emergency save completed');
    return true;
  } catch (error) {
    console.warn('⚠️ Emergency save failed, data in localStorage');
    return false;
  }
}

// Асинхронное сохранение на сервер
async function saveGameToServer() {
  try {
    const data = getFullGameState();
    
    const result = await apiCall('/api/save', 'POST', data);
    if (result.success) {
      G._lastSave = Date.now();
      G._pendingChanges = false;
      G._changeCounter = 0;
      console.log('💾 Game saved to server');
      
      // Обновляем локальный бэкап
      saveToLocalStorage();
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Failed to save game:', error);
    // Сохраняем локально при ошибке
    saveToLocalStorage();
    return false;
  }
}

// Отметить, что есть изменения
function markDirty(importance = 'low') {
  G._pendingChanges = true;
  G._changeCounter++;
  
  // Критические изменения — сохраняем сразу
  if (importance === 'critical') {
    saveGameToServer();
    return;
  }
  
  // Высокая важность — сохраняем через 5 секунд
  if (importance === 'high') {
    clearTimeout(G._saveTimer);
    G._saveTimer = setTimeout(() => {
      if (G._pendingChanges) saveGameToServer();
    }, 5000);
    return;
  }
  
  // Средняя важность — через 15 секунд
  if (importance === 'medium') {
    clearTimeout(G._saveTimer);
    G._saveTimer = setTimeout(() => {
      if (G._pendingChanges) saveGameToServer();
    }, 15000);
    return;
  }
  
  // Низкая важность — ждём автосохранения
}

// ── ЗАГРУЗКА ПРОГРЕССА ──

// Применить данные из сервера
function applyServerData(data) {
  if (!data) return;
  
  // Простые поля
  const fields = ['gold', 'pixr', 'gram', 'level', 'xp', 'xpNeeded', 'floor', 
                  'maxFloor', 'killCount', 'hp', 'maxHp', 'potionLv', 'potions',
                  'potionThreshold', 'invFilter', 'invIdCounter', 'character'];
  fields.forEach(key => {
    if (data[key] !== undefined && data[key] !== null) {
      G[key] = data[key];
    }
  });
  
  // Объекты
  if (data.stats) Object.assign(G.stats, data.stats);
  if (data.baseStats) Object.assign(G.baseStats, data.baseStats);
  if (data.upg) Object.assign(G.upg, data.upg);
  if (data.equipped) Object.assign(G.equipped, data.equipped);
  if (data.skills) Object.assign(G.skills, data.skills);
  if (data.bp) Object.assign(G.bp, data.bp);
  if (data.prem) Object.assign(G.prem, data.prem);
  
  // Массивы
  if (data.inventory && Array.isArray(data.inventory)) {
    G.inventory = data.inventory;
  }
}

// Загрузка с сервера
async function loadGameFromServer() {
  try {
    console.log('🔄 Loading game from server...');
    const result = await apiCall('/api/load');
    
    if (result.success && result.stats) {
      applyServerData(result.stats);
      G._loaded = true;
      console.log('✅ Game loaded from server');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Failed to load game:', error);
    return false;
  }
}

// Загрузка с восстановлением
async function loadGameWithRecovery() {
  // 1. Пытаемся загрузить с сервера
  try {
    const result = await apiCall('/api/load');
    if (result.success && result.stats) {
      applyServerData(result.stats);
      G._loaded = true;
      console.log('✅ Loaded from server');
      return true;
    }
  } catch (e) {
    console.warn('⚠️ Server load failed', e);
  }
  
  // 2. Пытаемся загрузить из emergency localStorage
  try {
    const emergency = localStorage.getItem('pixel_runner_emergency');
    if (emergency) {
      const data = JSON.parse(emergency);
      if (Date.now() - data.timestamp < 300000) {
        applyServerData(data);
        console.log('✅ Loaded from emergency backup');
        
        // Отправляем на сервер при первой возможности
        setTimeout(() => saveGameToServer(), 1000);
        return true;
      }
    }
  } catch (e) {
    console.warn('⚠️ Emergency backup load failed', e);
  }
  
  // 3. Пытаемся загрузить из обычного localStorage
  const localData = loadFromLocalStorage();
  if (localData) {
    applyServerData(localData);
    console.log('✅ Loaded from regular backup');
    return true;
  }
  
  // 4. Если ничего не загрузилось — создаём нового пользователя
  console.log('🆕 Creating new user');
  try {
    await apiCall('/api/auth/init', 'POST');
    await loadGameFromServer();
    return true;
  } catch (e) {
    console.error('❌ Failed to create user:', e);
    return false;
  }
}

// ── ИНИЦИАЛИЗАЦИЯ ──

// Настройка автосохранения
function setupAutoSave() {
  // Основной таймер — каждые 30 секунд
  setInterval(() => {
    if (G._pendingChanges) {
      saveGameToServer();
    }
  }, 30000);
  
  // Дополнительный: если много изменений — сохраняем чаще
  setInterval(() => {
    if (G._changeCounter > 5) {
      saveGameToServer();
      G._changeCounter = 0;
    }
  }, 10000);
  
  // Сохранение при закрытии вкладки
  window.addEventListener('beforeunload', (event) => {
    saveGameToServerSync();
    event.preventDefault();
    event.returnValue = '';
  });
  
  // Сохранение при сворачивании
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      saveGameToServer();
    }
  });
  
  // Сохранение при перезагрузке
  window.addEventListener('unload', () => {
    saveGameToServerSync();
  });
  
  // Telegram события
  if (tg) {
    tg.onEvent('viewportChanged', () => {
      saveGameToServer();
    });
  }
  
  console.log('⏱️ Auto-save configured');
}

// Основная инициализация
async function initGame() {
  // Расширяем Telegram WebApp
  if (tg) {
    tg.ready();
    tg.expand();
  }
  
  // Загружаем данные с восстановлением
  await loadGameWithRecovery();
  
  // Настраиваем автосохранение
  setupAutoSave();
  
  G._loaded = true;
  console.log('🎮 Game initialized');
  
  return G._loaded;
}

// ── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ──

// Отметить изменение с важностью
function markChange(importance = 'low') {
  markDirty(importance);
}

// Функция для быстрого сохранения
function quickSave() {
  saveGameToServer();
}

// Функция для принудительной синхронизации
async function forceSync() {
  await saveGameToServer();
  await loadGameFromServer();
  updateHUD();
}

// ── CALC CP ──
function calcCP() {
  const s = G.stats;
  return Math.floor(
    s.atk * 4 + s.def * 3 + s.hp * 0.5 + s.spd * 6 + s.crit * 8 + s.dodge * 8
    + ((s.atkSpd || 1.0) - 1.0) * 200
    + G.level * 20
  );
}

function floorCfg() { return FLOORS[Math.min(G.floor - 1, FLOORS.length - 1)]; }
function nextFloorCfg() { return FLOORS[Math.min(G.floor, FLOORS.length - 1)]; }

// Обмен PIXR → GRAM (с автосохранением)
function exchangePixr() {
  if ((G.pixr || 0) < 1000) return;
  G.pixr -= 1000;
  G.gram = parseFloat(((G.gram || 0) + 1).toFixed(3));
  updateHUD();
  renderWallet();
  saveGameToServer(); // Мгновенное сохранение
}
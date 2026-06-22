/*
  api.js — Клиент к Railway API
  Telegram авторизация + сохранение/загрузка прогресса
  Подключается в index.html ПЕРЕД всеми игровыми скриптами
*/

const API_BASE = 'https://ghz-production.up.railway.app';

// ═══════════════════════════════
//  Telegram initData
// ═══════════════════════════════
const TgApp = window.Telegram && window.Telegram.WebApp;
const _initDataRaw = TgApp ? TgApp.initData : '';

// Для дев-тестирования в браузере без Telegram
const _devInitData = 'user=%7B%22id%22%3A1%2C%22username%22%3A%22devuser%22%2C%22first_name%22%3A%22Dev%22%7D&hash=dev';
const _initData    = _initDataRaw || _devInitData;

// ── Хелпер запросов ──
async function apiRequest(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-init-data': _initData,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'HTTP ' + res.status);
  }
  return res.json();
}

// ═══════════════════════════════
//  AUTH — проверка и получение профиля
// ═══════════════════════════════
async function apiAuth() {
  return apiRequest('POST', '/auth');
}

// ═══════════════════════════════
//  SAVE — сохранить прогресс
// ═══════════════════════════════
async function apiSave(charTypeId, gState) {
  // Сохраняем только нужные поля из G
  const saveData = {
    gold:     gState.gold,
    pixr:     gState.pixr,
    gram:     gState.gram,
    level:    gState.level,
    xp:       gState.xp,
    xpNeeded: gState.xpNeeded,
    floor:    gState.floor,
    maxFloor: gState.maxFloor,
    killCount: gState.killCount,
    stats:    gState.stats,
    hp:       gState.hp,
    maxHp:    gState.maxHp,
    upg:      gState.upg,
    potionLv: gState.potionLv,
    bp:       gState.bp,
    prem:     gState.prem,
    owned:    gState.owned,
    skills:   gState.skills,
    inventory: gState.inventory,
    equipped: gState.equipped,
    baseStats: gState.baseStats,
  };
  return apiRequest('POST', '/save', { charType: charTypeId, saveData });
}

// ═══════════════════════════════
//  LOAD — загрузить прогресс
// ═══════════════════════════════
async function apiLoad() {
  return apiRequest('GET', '/load');
}

// ═══════════════════════════════
//  Применить загруженный saveData к объекту G
// ═══════════════════════════════
function applyLoadedSave(saveData) {
  const fields = [
    'gold','pixr','gram','level','xp','xpNeeded',
    'floor','maxFloor','killCount','hp','maxHp',
    'upg','potionLv','bp','prem','owned','skills',
    'inventory','equipped',
  ];
  fields.forEach(function(k) {
    if (saveData[k] !== undefined) G[k] = saveData[k];
  });
  if (saveData.stats)     Object.assign(G.stats,     saveData.stats);
  if (saveData.baseStats) Object.assign(G.baseStats, saveData.baseStats);
}

// ═══════════════════════════════
//  Автосохранение каждые 30 сек
// ═══════════════════════════════
var _autoSaveTimer   = null;
var _autoSaveRunning = false;

function startAutoSave() {
  if (_autoSaveTimer) return;
  _autoSaveTimer = setInterval(function() {
    triggerSave('auto');
  }, 30000);
}

function stopAutoSave() {
  if (_autoSaveTimer) { clearInterval(_autoSaveTimer); _autoSaveTimer = null; }
}

// Глобальная функция сохранения — вызывается из game.js и ui.js
window._saveInProgress = false;
async function triggerSave(reason) {
  if (window._saveInProgress) return;
  if (!window.G_CHAR) return;           // ещё не выбрали персонажа
  window._saveInProgress = true;
  try {
    await apiSave(window.G_CHAR.id, G);
    if (reason !== 'auto') console.log('[save] ok:', reason);
  } catch (e) {
    console.warn('[save] error:', e.message);
  } finally {
    window._saveInProgress = false;
  }
}

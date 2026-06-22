/*
  api.js — Клиент к Railway API
  Telegram авторизация + сохранение/загрузка прогресса
  Подключается в index.html ПЕРЕД всеми игровыми скриптами
*/

const API_BASE = 'https://ghz-production.up.railway.app';

// ═══════════════════════════════
//  Telegram initData
// ═══════════════════════════════
const TgApp        = window.Telegram && window.Telegram.WebApp;
const _initDataRaw = TgApp ? TgApp.initData : '';

// Dev-заглушка для тестирования вне Telegram
// Сервер принимает её только если BOT_TOKEN='dev' в Railway Variables
const _devInitData = 'user=%7B%22id%22%3A1%2C%22username%22%3A%22devuser%22%7D&hash=devhash';
const _initData    = _initDataRaw || _devInitData;

console.log('[api] TgApp:', !!TgApp, '| initData len:', _initDataRaw.length);

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

  console.log('[api] ->', method, path, body ? JSON.stringify(body).slice(0,80) : '');

  const res = await fetch(API_BASE + path, opts);
  const data = await res.json().catch(() => ({}));

  console.log('[api] <-', res.status, JSON.stringify(data).slice(0, 120));

  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

// ═══════════════════════════════
//  AUTH
// ═══════════════════════════════
async function apiAuth() {
  return apiRequest('POST', '/auth');
}

// ═══════════════════════════════
//  SAVE
// ═══════════════════════════════
async function apiSave(charTypeId, gState) {
  const saveData = {
    gold:      gState.gold,
    pixr:      gState.pixr,
    gram:      gState.gram,
    level:     gState.level,
    xp:        gState.xp,
    xpNeeded:  gState.xpNeeded,
    floor:     gState.floor,
    maxFloor:  gState.maxFloor,
    killCount: gState.killCount,
    stats:     gState.stats,
    hp:        gState.hp,
    maxHp:     gState.maxHp,
    upg:       gState.upg,
    potionLv:  gState.potionLv,
    bp:        gState.bp,
    prem:      gState.prem,
    owned:     gState.owned,
    skills:    gState.skills,
    inventory: gState.inventory,
    equipped:  gState.equipped,
    baseStats: gState.baseStats,
  };
  return apiRequest('POST', '/save', { charType: charTypeId, saveData });
}

// ═══════════════════════════════
//  LOAD
// ═══════════════════════════════
async function apiLoad() {
  return apiRequest('GET', '/load');
}

// ═══════════════════════════════
//  Применить saveData к G
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
var _autoSaveTimer = null;

function startAutoSave() {
  if (_autoSaveTimer) return;
  _autoSaveTimer = setInterval(function() {
    triggerSave('auto');
  }, 30000);
}

function stopAutoSave() {
  if (_autoSaveTimer) { clearInterval(_autoSaveTimer); _autoSaveTimer = null; }
}

// ═══════════════════════════════
//  triggerSave — вызывается из game.js и ui.js
// ═══════════════════════════════
window._saveInProgress = false;

async function triggerSave(reason) {
  if (window._saveInProgress) return;
  // G_CHAR — var в ui.js, доступна глобально
  if (typeof G_CHAR === 'undefined' || !G_CHAR) {
    console.warn('[save] skip: no G_CHAR');
    return;
  }
  window._saveInProgress = true;
  try {
    await apiSave(G_CHAR.id, G);
    console.log('[save] ok:', reason);
  } catch (e) {
    console.warn('[save] error:', e.message);
  } finally {
    window._saveInProgress = false;
  }
}

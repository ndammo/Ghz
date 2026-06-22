/*
  ══════════════════════════════════════════════════════
  state.js — Глобальное состояние игры и базовые расчёты
  Содержит: объект G (все данные игрока), расчёт CP,
  вспомогательные функции для этажей
  ══════════════════════════════════════════════════════
*/

// ═══════════════════════════════
//  ГЛОБАЛЬНОЕ СОСТОЯНИЕ ИГРЫ
//  G — центральный объект: золото, уровень, HP,
//  характеристики, инвентарь, экипировка, навыки
// ═══════════════════════════════
const G = {
  gold: 1000000,
  pixr: 11111110,
  gram: 1110,
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

  // Уровни вложенных улучшений
  upg: { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 },
  potionLv: 0,
  bp: { active: false, claimed: [] },
  prem: { tier: null, expiresAt: 0 },

  // Инвентарь и экипировка
  owned: {},
  skills: {},        // { skillId: { unlocked, level } }
  inventory: [],
  equipped: { weapon: null, armor: null, ring: null, boots: null, helmet: null },
  invFilter: 'all',
};

// Базовые статы — отдельно, чтобы пересчитывать после снятия предметов
G.baseStats = { atk: 10, def: 5, spd: 3, hp: 100, crit: 5, dodge: 3, atkSpd: 1.0 };

// ── Расчёт боевой мощи (CP) ──
function calcCP() {
  const s = G.stats;
  return Math.floor(
    s.atk * 4 + s.def * 3 + s.hp * 0.5 + s.spd * 6 + s.crit * 8 + s.dodge * 8
    + ((s.atkSpd || 1.0) - 1.0) * 200
    + G.level * 20
  );
}

// ── Конфигурации этажей ──
function floorCfg()     { return FLOORS[Math.min(G.floor - 1, FLOORS.length - 1)]; }
function nextFloorCfg() { return FLOORS[Math.min(G.floor,     FLOORS.length - 1)]; }

// ═══════════════════════════════
//  TELEGRAM + BACKEND SYNC
// ═══════════════════════════════

const API_URL = 'https://ghz-production.up.railway.app'; // <-- вставь свой URL после деплоя
let _tgInitData  = '';
let _saveDebounceTm = null;

// ── Инициализация Telegram ──
function tgInit() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) { console.warn('Not in Telegram, offline mode'); return; }
  tg.ready();
  tg.expand();
  _tgInitData = tg.initData;
  _authAndLoad();
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') _saveNow();
  });
  setInterval(_saveSoon, 30000);
}

// ── Авторизация и загрузка сохранения ──
async function _authAndLoad() {
  _showLoadingScreen(true);
  try {
    var res = await fetch(API_URL + '/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'TMA ' + _tgInitData }
    });
    var data = await res.json();
    if (data.ok && !data.isNew) _applyServerSave(data.save);
  } catch(e) { console.error('Auth failed:', e); }
  finally    { _showLoadingScreen(false); }
}

// ── Применить сохранение с сервера → G ──
function _applyServerSave(save) {
  var fields = ['gold','pixr','gram','level','xp','xpNeeded','floor','maxFloor',
                'hp','maxHp','killCount','upg','potionLv','potions','baseStats',
                'inventory','equipped','skills','bp','prem'];
  fields.forEach(function(f) { if (save[f] != null) G[f] = save[f]; });
  if (save.baseStats) { G.baseStats = Object.assign({}, save.baseStats); Object.assign(G.stats, save.baseStats); }
  if (save.charId) G._savedCharId = save.charId;
}

// ── Собрать данные для сохранения ──
function _buildSavePayload() {
  return {
    charId: (window.G_CHAR && window.G_CHAR.id) || G._savedCharId || null,
    gold: G.gold, pixr: G.pixr, gram: G.gram,
    level: G.level, xp: G.xp, xpNeeded: G.xpNeeded,
    floor: G.floor, maxFloor: G.maxFloor, hp: G.hp, maxHp: G.maxHp,
    killCount: G.killCount, upg: G.upg, potionLv: G.potionLv, potions: G.potions,
    baseStats: G.baseStats, inventory: G.inventory, equipped: G.equipped,
    skills: G.skills, bp: G.bp, prem: G.prem
  };
}

// ── Сохранить немедленно ──
async function _saveNow() {
  if (!_tgInitData) return;
  try {
    await fetch(API_URL + '/save', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'TMA ' + _tgInitData },
      body: JSON.stringify(_buildSavePayload())
    });
  } catch(e) { console.error('Save failed:', e); }
}

// ── Debounce 3с — вызывается при важных действиях ──
function triggerSave() {
  clearTimeout(_saveDebounceTm);
  _saveDebounceTm = setTimeout(_saveNow, 3000);
}

// ── Загрузочный экран ──
function _showLoadingScreen(show) {
  var el = document.getElementById('tgLoadScreen');
  if (!el && show) {
    el = document.createElement('div');
    el.id = 'tgLoadScreen';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0d0d1a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
    el.innerHTML = '<svg width="48" height="48" viewBox="0 0 16 16" fill="none" style="image-rendering:pixelated;animation:tgSpin 1s linear infinite"><rect x="7" y="1" width="2" height="4" fill="#f5c542"/><rect x="7" y="11" width="2" height="4" fill="#f5c542" opacity="0.3"/><rect x="1" y="7" width="4" height="2" fill="#f5c542" opacity="0.6"/><rect x="11" y="7" width="4" height="2" fill="#f5c542" opacity="0.6"/><rect x="2" y="2" width="3" height="3" fill="#f5c542" opacity="0.8"/><rect x="11" y="2" width="3" height="3" fill="#f5c542" opacity="0.5"/><rect x="2" y="11" width="3" height="3" fill="#f5c542" opacity="0.4"/><rect x="11" y="11" width="3" height="3" fill="#f5c542" opacity="0.2"/></svg>'
      + '<div style="font-family:Courier New,monospace;color:#f5c542;font-size:13px;letter-spacing:2px;">ЗАГРУЗКА...</div>'
      + '<div style="font-family:Courier New,monospace;color:#556;font-size:10px;">Pixel Runner RPG</div>';
    var st = document.createElement('style');
    st.textContent = '@keyframes tgSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
    document.body.appendChild(el);
  }
  if (el) el.style.display = show ? 'flex' : 'none';
}

// ── Запуск при загрузке страницы ──
window.addEventListener('load', tgInit);

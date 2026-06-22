/*
  ══════════════════════════════════════════════════════
  server.js — Pixel Runner RPG Backend
  Railway + MongoDB
  API: https://ghz-production.up.railway.app/
  ══════════════════════════════════════════════════════
*/

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','OPTIONS'],
  allowedHeaders: ['Content-Type','x-tg-init-data'],
}));
app.use(express.json({ limit: '200kb' }));

// ── MongoDB ─────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
mongoose.connection.on('connected', () => console.log('MongoDB connected'));
mongoose.connection.on('error',     (e) => console.error('MongoDB error:', e));

// ── Schema ──────────────────────────────────────────
const saveSchema = new mongoose.Schema({
  userId:    { type: String, required: true, unique: true, index: true },
  username:  { type: String, default: '' },
  saveData:  { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now },
}, { minimize: false });

const Save = mongoose.model('Save', saveSchema);

// ══════════════════════════════════════════════════════
//  TELEGRAM HMAC ВАЛИДАЦИЯ
// ══════════════════════════════════════════════════════
function validateTelegramData(initDataRaw) {
  if (!process.env.BOT_TOKEN) return { ok: false, reason: 'no BOT_TOKEN' };

  let params;
  try {
    params = new URLSearchParams(initDataRaw);
  } catch (_) {
    return { ok: false, reason: 'bad initData format' };
  }

  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no hash' };

  // Строим строку проверки
  const entries = [];
  params.forEach((v, k) => { if (k !== 'hash') entries.push(`${k}=${v}`); });
  entries.sort();
  const dataCheckString = entries.join('\n');

  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN)
    .digest();

  const expected = crypto
    .createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');

  if (expected !== hash) return { ok: false, reason: 'invalid hash' };

  // Проверяем свежесть (5 минут)
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > 300) return { ok: false, reason: 'data too old' };

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (_) {}

  return { ok: true, user };
}

// ── Auth middleware ──────────────────────────────────
function auth(req, res, next) {
  const initDataRaw = req.headers['x-tg-init-data'] || '';

  // DEV MODE: если токена нет или заголовок содержит dev-userId
  if (!process.env.BOT_TOKEN || initDataRaw.startsWith('dev:')) {
    const devId = initDataRaw.startsWith('dev:')
      ? initDataRaw.slice(4)
      : 'dev_user_0';
    req.userId   = devId;
    req.username = 'DevUser';
    return next();
  }

  const result = validateTelegramData(initDataRaw);
  if (!result.ok) {
    return res.status(401).json({ error: 'Unauthorized', reason: result.reason });
  }

  req.userId   = String(result.user?.id || 'unknown');
  req.username = result.user?.username || result.user?.first_name || '';
  next();
}

// ══════════════════════════════════════════════════════
//  РОУТЫ
// ══════════════════════════════════════════════════════

// Health check
app.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ── GET /save — загрузить сохранение ────────────────
app.get('/save', auth, async (req, res) => {
  try {
    const doc = await Save.findOne({ userId: req.userId }).lean();
    if (!doc) return res.json({ found: false });
    return res.json({ found: true, saveData: doc.saveData, updatedAt: doc.updatedAt });
  } catch (e) {
    console.error('GET /save error:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── POST /save — записать сохранение ────────────────
app.post('/save', auth, async (req, res) => {
  const { saveData } = req.body;
  if (!saveData || typeof saveData !== 'object') {
    return res.status(400).json({ error: 'bad saveData' });
  }

  // Базовая санитизация — убираем лишнее
  const safe = sanitize(saveData);

  try {
    await Save.findOneAndUpdate(
      { userId: req.userId },
      { $set: { saveData: safe, username: req.username, updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /save error:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── GET /leaderboard — топ-20 по CP ─────────────────
app.get('/leaderboard', async (_req, res) => {
  try {
    const docs = await Save.find({}, { userId:1, username:1, 'saveData.cp':1, 'saveData.level':1 })
      .sort({ 'saveData.cp': -1 })
      .limit(20)
      .lean();

    const list = docs.map((d, i) => ({
      rank:     i + 1,
      username: d.username || ('Player_' + String(d.userId).slice(-4)),
      cp:       d.saveData?.cp   || 0,
      level:    d.saveData?.level || 1,
    }));

    res.json({ list });
  } catch (e) {
    console.error('GET /leaderboard error:', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// ══════════════════════════════════════════════════════
//  САНИТИЗАЦИЯ сохранения
//  — принимаем только известные поля, не больше лимитов
// ══════════════════════════════════════════════════════
function sanitize(d) {
  function clamp(v, min, max) {
    const n = Number(v);
    return isNaN(n) ? min : Math.max(min, Math.min(max, n));
  }
  function cleanUpg(upg) {
    if (!upg || typeof upg !== 'object') return {};
    const keys = ['atk','def','hp','spd','crit','dodge','atkSpd'];
    const out = {};
    keys.forEach(k => { out[k] = clamp(upg[k], 0, 60); });
    return out;
  }
  function cleanInventory(inv) {
    if (!Array.isArray(inv)) return [];
    return inv.slice(0, 200).map(item => {
      if (!item || typeof item !== 'object') return null;
      return {
        id:       String(item.id   || '').slice(0, 64),
        name:     String(item.name || '').slice(0, 64),
        slot:     String(item.slot || '').slice(0, 16),
        rarity:   String(item.rarity || 'common').slice(0, 16),
        refine:   clamp(item.refine, 0, 15),
        stats:    cleanItemStats(item.stats),
        forClass: item.forClass ? String(item.forClass).slice(0, 16) : undefined,
      };
    }).filter(Boolean);
  }
  function cleanItemStats(s) {
    if (!s || typeof s !== 'object') return {};
    const allowed = ['atk','def','hp','spd','crit','dodge','atkSpd'];
    const out = {};
    allowed.forEach(k => {
      if (s[k] !== undefined) out[k] = clamp(s[k], 0, 99999);
    });
    return out;
  }
  function cleanEquipped(eq) {
    if (!eq || typeof eq !== 'object') return {};
    const slots = ['weapon','armor','ring','boots','helmet','belt','gloves','legs'];
    const out = {};
    slots.forEach(sl => {
      if (eq[sl] !== null && eq[sl] !== undefined) {
        out[sl] = typeof eq[sl] === 'object' ? cleanInventory([eq[sl]])[0] || null : null;
      } else {
        out[sl] = null;
      }
    });
    return out;
  }
  function cleanSkills(sk) {
    if (!sk || typeof sk !== 'object') return {};
    const out = {};
    Object.keys(sk).slice(0, 20).forEach(id => {
      const v = sk[id];
      if (v && typeof v === 'object') {
        out[String(id).slice(0,32)] = {
          unlocked: !!v.unlocked,
          level:    clamp(v.level, 0, 10),
        };
      }
    });
    return out;
  }
  function cleanBp(bp) {
    if (!bp || typeof bp !== 'object') return { active: false, claimed: [] };
    return {
      active:  !!bp.active,
      claimed: Array.isArray(bp.claimed)
        ? bp.claimed.slice(0,10).map(Number).filter(n => !isNaN(n))
        : [],
    };
  }
  function cleanPrem(p) {
    if (!p || typeof p !== 'object') return { tier: null, expiresAt: 0 };
    return {
      tier:      p.tier ? String(p.tier).slice(0,16) : null,
      expiresAt: clamp(p.expiresAt, 0, 9999999999999),
    };
  }

  return {
    // Валюта
    gold:  clamp(d.gold,  0, 1e12),
    pixr:  clamp(d.pixr,  0, 1e12),
    gram:  clamp(d.gram,  0, 1e9),
    // Прогресс
    level: clamp(d.level, 1, 9999),
    xp:    clamp(d.xp,    0, 1e10),
    xpNeeded: clamp(d.xpNeeded, 1, 1e10),
    floor:    clamp(d.floor,    1, 9999),
    maxFloor: clamp(d.maxFloor, 1, 9999),
    killCount: clamp(d.killCount, 0, 1e9),
    cp:        clamp(d.cp,       0, 1e9),
    // HP
    hp:    clamp(d.hp,    0, 1e7),
    maxHp: clamp(d.maxHp, 1, 1e7),
    // Апгрейды
    upg:      cleanUpg(d.upg),
    potionLv: clamp(d.potionLv, 0, 10),
    potions:  clamp(d.potions,  0, 9999),
    potionThreshold: clamp(d.potionThreshold, 1, 99),
    // Базовые статы
    baseStats: cleanItemStats(d.baseStats),
    stats:     cleanItemStats(d.stats),
    // Персонаж
    charId: d.charId ? String(d.charId).slice(0, 16) : 'fire',
    // Инвентарь и экип
    inventory: cleanInventory(d.inventory),
    equipped:  cleanEquipped(d.equipped),
    owned:     (d.owned && typeof d.owned === 'object')
      ? Object.fromEntries(
          Object.entries(d.owned).slice(0,500).map(([k,v]) => [String(k).slice(0,64), !!v])
        )
      : {},
    // Навыки
    skills: cleanSkills(d.skills),
    // Системы
    bp:   cleanBp(d.bp),
    prem: cleanPrem(d.prem),
    invFilter: d.invFilter ? String(d.invFilter).slice(0,16) : 'all',
  };
}

// ══════════════════════════════════════════════════════
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

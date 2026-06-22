/*
  ══════════════════════════════════════════════════════
  server.js — Pixel Runner RPG Backend
  Railway + Node.js + MongoDB
  Авторизация: Telegram WebApp initData (HMAC-SHA256)
  ══════════════════════════════════════════════════════
*/

const express    = require('express');
const mongoose   = require('mongoose');
const crypto     = require('crypto');
const cors       = require('cors');
const helmet     = require('helmet');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);

// ── MongoDB ──
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ── Schema ──
const SaveSchema = new mongoose.Schema({
  userId:     { type: String, required: true, unique: true, index: true },
  username:   { type: String, default: '' },
  firstName:  { type: String, default: '' },
  charId:     { type: String, default: null },   // 'fire' | 'light' | 'water'

  // Прогресс
  gold:       { type: Number, default: 0 },
  pixr:       { type: Number, default: 0 },
  gram:       { type: Number, default: 0 },
  level:      { type: Number, default: 1 },
  xp:         { type: Number, default: 0 },
  xpNeeded:   { type: Number, default: 100 },
  floor:      { type: Number, default: 1 },
  maxFloor:   { type: Number, default: 1 },
  hp:         { type: Number, default: 100 },
  maxHp:      { type: Number, default: 100 },
  killCount:  { type: Number, default: 0 },

  // Апгрейды
  upg: {
    type: Object,
    default: { atk:0, def:0, hp:0, spd:0, crit:0, dodge:0, atkSpd:0 },
  },
  potionLv:   { type: Number, default: 0 },
  potions:    { type: Number, default: 0 },

  // Базовые статы (зависят от персонажа)
  baseStats: { type: Object, default: null },

  // Инвентарь и навыки
  inventory:  { type: Array, default: [] },
  equipped:   { type: Object, default: { weapon:null, body:null, legs:null, gloves:null, boots:null, helmet:null, ring:null, belt:null } },
  skills:     { type: Object, default: {} },

  // Battle Pass и Premium
  bp:   { type: Object, default: { active: false, claimed: [] } },
  prem: { type: Object, default: { tier: null, expiresAt: 0 } },

  updatedAt: { type: Date, default: Date.now },
}, { minimize: false });

const Save = mongoose.model('Save', SaveSchema);

// ═══════════════════════════════
//  ВАЛИДАЦИЯ TELEGRAM initData
// ═══════════════════════════════
function validateTelegramData(initData) {
  try {
    if (!initData || initData.trim() === '') {
      console.log('[auth] empty initData');
      return null;
    }
    const params = new URLSearchParams(initData);
    const hash   = params.get('hash');
    if (!hash) { console.log('[auth] no hash'); return null; }

    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) {
      console.log('[auth] hash mismatch — wrong BOT_TOKEN or tampered data');
      return null;
    }

    // Даём 48ч (Telegram иногда кэширует initData)
    const authDate = parseInt(params.get('auth_date') || '0');
    if (Date.now() / 1000 - authDate > 172800) {
      console.log('[auth] initData expired');
      return null;
    }

    const userStr = params.get('user');
    if (!userStr) { console.log('[auth] no user field'); return null; }

    const user = JSON.parse(userStr);
    console.log('[auth] ok userId:', user.id);
    return user;
  } catch(e) {
    console.error('[auth] exception:', e.message);
    return null;
  }
}

// ── Middleware авторизации ──
function authMiddleware(req, res, next) {
  const initData = req.headers['authorization']?.replace('TMA ', '');
  if (!initData) return res.status(401).json({ error: 'No initData' });

  const user = validateTelegramData(initData);
  if (!user) return res.status(401).json({ error: 'Invalid initData' });

  req.tgUser = user;
  next();
}

// ═══════════════════════════════
//  ENDPOINTS
// ═══════════════════════════════

// GET /health — проверка сервера
app.get('/health', (req, res) => res.json({ ok: true }));

// POST /auth — авторизация и загрузка сохранения
app.post('/auth', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.tgUser.id);

    let save = await Save.findOne({ userId });

    if (!save) {
      // Новый игрок — создаём пустое сохранение
      save = await Save.create({
        userId,
        username:  req.tgUser.username  || '',
        firstName: req.tgUser.first_name || '',
      });
      return res.json({ ok: true, isNew: true, save: save.toObject() });
    }

    // Обновляем имя на случай смены
    save.username  = req.tgUser.username  || save.username;
    save.firstName = req.tgUser.first_name || save.firstName;
    await save.save();

    res.json({ ok: true, isNew: false, save: save.toObject() });
  } catch (err) {
    console.error('/auth error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /save — сохранение прогресса
app.post('/save', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.tgUser.id);
    const data   = req.body;

    // Белый список полей — не доверяем клиенту полностью
    const allowed = [
      'charId', 'gold', 'pixr', 'gram', 'level', 'xp', 'xpNeeded',
      'floor', 'maxFloor', 'hp', 'maxHp', 'killCount',
      'upg', 'potionLv', 'potions', 'baseStats',
      'inventory', 'equipped', 'skills',
      'bp', 'prem',
    ];

    const update = { updatedAt: new Date() };
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = data[key];
    }

    await Save.findOneAndUpdate(
      { userId },
      { $set: update },
      { upsert: true, new: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('/save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

/*
  ══════════════════════════════════════════════════════
  server.js — Pixel Runner RPG Backend
  Railway + MongoDB
  
  Routes:
    POST /auth          — Telegram HMAC-SHA256 авторизация
    GET  /save          — Загрузка прогресса
    POST /save          — Сохранение прогресса
    GET  /leaderboard   — Топ 50 по CP
  ══════════════════════════════════════════════════════
*/

'use strict';
require('dotenv').config();

const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tg-token'],
}));
app.options('*', cors());
app.use(express.json({ limit: '512kb' }));
app.set('trust proxy', 1);

// ── Rate Limit ──
const limiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/save', limiter);

// ═══════════════════════════════
//  MongoDB Schema
// ═══════════════════════════════
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
}).then(() => console.log('[DB] MongoDB connected'))
  .catch(e => { console.error('[DB] connect error:', e.message); process.exit(1); });

const saveSchema = new mongoose.Schema({
  userId:   { type: String, required: true, unique: true, index: true },
  username: { type: String, default: '' },
  firstName:{ type: String, default: '' },

  // Прогресс игры — сырой снимок объекта G
  gameData: {
    gold:     { type: Number, default: 1000000 },
    pixr:     { type: Number, default: 0 },
    gram:     { type: Number, default: 0 },
    level:    { type: Number, default: 1 },
    xp:       { type: Number, default: 0 },
    xpNeeded: { type: Number, default: 100 },
    floor:    { type: Number, default: 1 },
    maxFloor: { type: Number, default: 1 },
    killCount:{ type: Number, default: 0 },
    hp:       { type: Number, default: 100 },
    maxHp:    { type: Number, default: 100 },
    charId:   { type: String, default: 'fire' },
    stats:    { type: mongoose.Schema.Types.Mixed, default: {} },
    baseStats:{ type: mongoose.Schema.Types.Mixed, default: {} },
    upg:      { type: mongoose.Schema.Types.Mixed, default: {} },
    potionLv: { type: Number, default: 0 },
    potions:  { type: Number, default: 0 },
    potionThreshold: { type: Number, default: 30 },
    bp:       { type: mongoose.Schema.Types.Mixed, default: { active: false, claimed: [] } },
    prem:     { type: mongoose.Schema.Types.Mixed, default: { tier: null, expiresAt: 0 } },
    owned:    { type: mongoose.Schema.Types.Mixed, default: {} },
    skills:   { type: mongoose.Schema.Types.Mixed, default: {} },
    inventory:{ type: mongoose.Schema.Types.Mixed, default: [] },
    equipped: { type: mongoose.Schema.Types.Mixed, default: {} },
    invFilter:{ type: String, default: 'all' },
  },

  cp:        { type: Number, default: 0 },   // для лидерборда
  updatedAt: { type: Date,   default: Date.now },
}, { versionKey: false });

const Save = mongoose.model('Save', saveSchema);

// ═══════════════════════════════
//  Telegram Auth Helper
// ═══════════════════════════════
function verifyTelegramInitData(initData) {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash   = params.get('hash');
  if (!hash) return null;

  params.delete('hash');

  // Сортируем ключи и собираем строку
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN)
    .digest();

  const expected = crypto
    .createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');

  if (expected !== hash) return null;

  // Проверяем свежесть (5 минут)
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (Date.now() / 1000 - authDate > 300) return null;

  const userStr = params.get('user');
  if (!userStr) return null;

  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

// ── Middleware для проверки токена ──
function authMiddleware(req, res, next) {
  const token = req.headers['x-tg-token'] || '';

  // DEV: если передан x-dev-userid, пропускаем в dev-режиме
  if (process.env.NODE_ENV !== 'production' && req.headers['x-dev-userid']) {
    req.tgUser = { id: req.headers['x-dev-userid'], first_name: 'Dev', username: 'dev' };
    return next();
  }

  const user = verifyTelegramInitData(token);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  req.tgUser = user;
  next();
}

// ═══════════════════════════════
//  POST /auth
//  Авторизация и получение/создание профиля
// ═══════════════════════════════
app.post('/auth', authMiddleware, async (req, res) => {
  try {
    const { id, username, first_name } = req.tgUser;
    const userId = String(id);

    let doc = await Save.findOne({ userId });
    if (!doc) {
      doc = await Save.create({
        userId,
        username: username || '',
        firstName: first_name || '',
        gameData: {},
        cp: 0,
      });
    }

    res.json({
      ok: true,
      user: { userId, username, firstName: first_name },
      hasProgress: !!doc.updatedAt && doc.gameData.level > 1,
    });
  } catch (e) {
    console.error('[/auth]', e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ═══════════════════════════════
//  GET /save
//  Загрузка прогресса
// ═══════════════════════════════
app.get('/save', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.tgUser.id);
    const doc    = await Save.findOne({ userId });
    if (!doc) return res.json({ ok: true, data: null });

    res.json({ ok: true, data: doc.gameData });
  } catch (e) {
    console.error('[GET /save]', e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ═══════════════════════════════
//  POST /save
//  Сохранение прогресса
// ═══════════════════════════════
app.post('/save', authMiddleware, async (req, res) => {
  try {
    const userId   = String(req.tgUser.id);
    const gameData = req.body.gameData;
    const cp       = req.body.cp || 0;

    if (!gameData) return res.status(400).json({ ok: false, error: 'No gameData' });

    // Санитизация: только безопасные числа
    const sanitize = (v, def = 0, max = 1e12) => {
      const n = Number(v);
      return isFinite(n) ? Math.min(Math.max(n, 0), max) : def;
    };

    const safe = {
      gold:      sanitize(gameData.gold,      0, 1e12),
      pixr:      sanitize(gameData.pixr,      0, 1e12),
      gram:      sanitize(gameData.gram,      0, 1e9),
      level:     sanitize(gameData.level,     1, 9999),
      xp:        sanitize(gameData.xp,        0, 1e9),
      xpNeeded:  sanitize(gameData.xpNeeded,  100, 1e9),
      floor:     sanitize(gameData.floor,     1, 9999),
      maxFloor:  sanitize(gameData.maxFloor,  1, 9999),
      killCount: sanitize(gameData.killCount, 0, 1e9),
      hp:        sanitize(gameData.hp,        1, 9999),
      maxHp:     sanitize(gameData.maxHp,     1, 9999),
      charId:    ['fire','light','water'].includes(gameData.charId) ? gameData.charId : 'fire',
      stats:      gameData.stats     || {},
      baseStats:  gameData.baseStats || {},
      upg:        gameData.upg       || {},
      potionLv:  sanitize(gameData.potionLv,  0, 10),
      potions:   sanitize(gameData.potions,   0, 9999),
      potionThreshold: sanitize(gameData.potionThreshold, 30, 99),
      bp:        gameData.bp      || { active: false, claimed: [] },
      prem:      gameData.prem    || { tier: null, expiresAt: 0 },
      owned:     gameData.owned   || {},
      skills:    gameData.skills  || {},
      inventory: Array.isArray(gameData.inventory) ? gameData.inventory.slice(0, 500) : [],
      equipped:  gameData.equipped  || {},
      invFilter: gameData.invFilter || 'all',
    };

    await Save.findOneAndUpdate(
      { userId },
      {
        $set: {
          gameData: safe,
          cp: sanitize(cp, 0, 1e9),
          updatedAt: new Date(),
          username:  req.tgUser.username  || '',
          firstName: req.tgUser.first_name || '',
        },
      },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('[POST /save]', e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ═══════════════════════════════
//  GET /leaderboard
//  Топ-50 игроков по CP
// ═══════════════════════════════
app.get('/leaderboard', async (req, res) => {
  try {
    const rows = await Save
      .find({}, { userId: 1, username: 1, firstName: 1, cp: 1, 'gameData.level': 1, 'gameData.maxFloor': 1 })
      .sort({ cp: -1 })
      .limit(50)
      .lean();

    const list = rows.map((r, i) => ({
      rank:      i + 1,
      userId:    r.userId,
      name:      r.firstName || r.username || `Player${r.userId.slice(-4)}`,
      cp:        r.cp || 0,
      level:     r.gameData?.level || 1,
      maxFloor:  r.gameData?.maxFloor || 1,
    }));

    res.json({ ok: true, list });
  } catch (e) {
    console.error('[/leaderboard]', e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ── Health check ──
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── 404 ──
app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

app.listen(PORT, () => console.log(`[Server] Port ${PORT}`));

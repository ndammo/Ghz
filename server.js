/*
  ══════════════════════════════════════════════════════
  server.js — Pixel Runner RPG Backend
  Railway + MongoDB
  Авторизация: HMAC-SHA256 Telegram initData
  Маршруты:
    POST /auth          — верификация initData, возвращает userId
    GET  /save          — загрузка сохранения
    POST /save          — полное сохранение (все поля G)
    POST /save/partial  — частичное обновление (патч отдельных полей)
  ══════════════════════════════════════════════════════
*/

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const crypto   = require('crypto');
const mongoose = require('mongoose');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
}));
app.use(express.json({ limit: '2mb' }));

// ══════════════════════════════════════════════════════
//  MongoDB Schema
// ══════════════════════════════════════════════════════
const saveSchema = new mongoose.Schema({
  userId:    { type: String, required: true, unique: true, index: true },
  username:  { type: String, default: '' },
  firstName: { type: String, default: '' },

  // ── Валюты ──
  gold: { type: Number, default: 0 },
  pixr: { type: Number, default: 0 },
  gram: { type: Number, default: 0 },

  // ── Прогресс ──
  level:    { type: Number, default: 1 },
  xp:       { type: Number, default: 0 },
  xpNeeded: { type: Number, default: 100 },
  floor:    { type: Number, default: 1 },
  maxFloor: { type: Number, default: 1 },
  killCount:{ type: Number, default: 0 },

  // ── Персонаж ──
  charId: { type: String, default: null },  // 'fire' | 'light' | 'water'

  // ── Базовые статы (после выбора героя) ──
  baseStats: {
    atk:    { type: Number, default: 10 },
    def:    { type: Number, default: 5  },
    spd:    { type: Number, default: 3  },
    hp:     { type: Number, default: 100},
    crit:   { type: Number, default: 5  },
    dodge:  { type: Number, default: 3  },
    atkSpd: { type: Number, default: 1.0},
  },

  // ── Текущие статы (после экипировки и бонусов) ──
  stats: {
    atk:    { type: Number, default: 10 },
    def:    { type: Number, default: 5  },
    spd:    { type: Number, default: 3  },
    hp:     { type: Number, default: 100},
    crit:   { type: Number, default: 5  },
    dodge:  { type: Number, default: 3  },
    atkSpd: { type: Number, default: 1.0},
  },

  // ── HP ──
  hp:    { type: Number, default: 100 },
  maxHp: { type: Number, default: 100 },

  // ── Улучшения ──
  upg: {
    atk:    { type: Number, default: 0 },
    def:    { type: Number, default: 0 },
    hp:     { type: Number, default: 0 },
    spd:    { type: Number, default: 0 },
    crit:   { type: Number, default: 0 },
    dodge:  { type: Number, default: 0 },
    atkSpd: { type: Number, default: 0 },
  },

  // ── Зелья ──
  potionLv:        { type: Number, default: 0 },
  potions:         { type: Number, default: 0 },
  potionThreshold: { type: Number, default: 30 },

  // ── Battle Pass ──
  bp: {
    active:  { type: Boolean, default: false },
    claimed: { type: [Number], default: [] },
  },

  // ── Premium ──
  prem: {
    tier:      { type: String, default: null },
    expiresAt: { type: Number, default: 0    },
  },

  // ── Инвентарь ──
  // Каждый предмет: { id, slot, name, rarity, stats, refine, isSkillBook, forClass, ... }
  inventory: { type: [mongoose.Schema.Types.Mixed], default: [] },

  // ── Экипировка ──
  // { weapon: itemId|null, armor: ..., ring: ..., boots: ..., helmet: ... }
  equipped: {
    weapon:  { type: String, default: null },
    armor:   { type: String, default: null },
    ring:    { type: String, default: null },
    boots:   { type: String, default: null },
    helmet:  { type: String, default: null },
    legs:    { type: String, default: null },
    gloves:  { type: String, default: null },
    belt:    { type: String, default: null },
  },

  // ── Навыки ──
  // { skillId: { unlocked: bool, level: number } }
  skills: { type: mongoose.Schema.Types.Mixed, default: {} },

  // ── Мета ──
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
}, { minimize: false });

const Save = mongoose.model('Save', saveSchema);

// ══════════════════════════════════════════════════════
//  Утилиты
// ══════════════════════════════════════════════════════

/**
 * Верифицирует Telegram initData через HMAC-SHA256.
 * Возвращает объект user или бросает ошибку.
 */
function verifyTelegramAuth(initData) {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) throw new Error('BOT_TOKEN not set');

  // Разбираем строку initData
  const params = new URLSearchParams(initData);
  const hash   = params.get('hash');
  if (!hash) throw new Error('No hash in initData');

  // Собираем data-check-string (все поля кроме hash, отсортированные)
  params.delete('hash');
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  // HMAC-SHA256
  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const computedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) throw new Error('Hash mismatch — invalid initData');

  // Проверяем давность (не старше 1 часа)
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const now      = Math.floor(Date.now() / 1000);
  if (now - authDate > 3600) throw new Error('initData expired');

  const userJson = params.get('user');
  if (!userJson) throw new Error('No user in initData');
  return JSON.parse(userJson);
}

/**
 * Middleware: проверяет Authorization: tma <initData>
 * или query param ?tma=<initData> (для sendBeacon который не поддерживает headers)
 */
async function authMiddleware(req, res, next) {
  try {
    const header   = req.headers['authorization'] || '';
    const qparam   = req.query.tma || '';
    let initData   = '';

    if (header.startsWith('tma ')) {
      initData = header.slice(4);
    } else if (qparam) {
      initData = qparam;
    } else {
      return res.status(401).json({ error: 'Missing Authorization' });
    }

    const user    = verifyTelegramAuth(initData);
    req.tgUser    = user;
    req.userId    = String(user.id);
    next();
  } catch (e) {
    console.error('[AUTH]', e.message);
    return res.status(401).json({ error: e.message });
  }
}

// ══════════════════════════════════════════════════════
//  Маршруты
// ══════════════════════════════════════════════════════

// Health-check (Railway ping)
app.get('/', (req, res) => res.json({ ok: true, service: 'PixelRunnerRPG' }));

// ── POST /auth ──────────────────────────────────────────
// Тело: { initData: "..." }
// Ответ: { ok, userId, isNew, save? }
app.post('/auth', async (req, res) => {
  try {
    const { initData } = req.body;
    if (!initData) return res.status(400).json({ error: 'initData required' });

    const user   = verifyTelegramAuth(initData);
    const userId = String(user.id);

    let doc   = await Save.findOne({ userId });
    let isNew = false;

    if (!doc) {
      // Новый игрок — создаём пустое сохранение
      doc   = new Save({ userId, username: user.username || '', firstName: user.first_name || '' });
      await doc.save();
      isNew = true;
    }

    return res.json({ ok: true, userId, isNew, save: docToSave(doc) });
  } catch (e) {
    console.error('[/auth]', e.message);
    return res.status(401).json({ error: e.message });
  }
});

// ── GET /save ───────────────────────────────────────────
// Заголовок: Authorization: tma <initData>
// Ответ: { ok, save }
app.get('/save', authMiddleware, async (req, res) => {
  try {
    let doc = await Save.findOne({ userId: req.userId });
    if (!doc) {
      doc = new Save({ userId: req.userId, username: req.tgUser.username || '', firstName: req.tgUser.first_name || '' });
      await doc.save();
    }
    return res.json({ ok: true, save: docToSave(doc) });
  } catch (e) {
    console.error('[GET /save]', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /save ──────────────────────────────────────────
// Полное сохранение (весь объект G + charId)
// Тело: { charId, gold, pixr, gram, level, xp, ... }
app.post('/save', authMiddleware, async (req, res) => {
  try {
    const patch = buildPatch(req.body);
    patch.updatedAt = new Date();

    await Save.findOneAndUpdate(
      { userId: req.userId },
      { $set: patch },
      { upsert: true, new: true }
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error('[POST /save]', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /save/partial ──────────────────────────────────
// Быстрое частичное обновление — только изменившиеся поля
// Тело: { fields: { gold: 123, level: 5, ... } }
app.post('/save/partial', authMiddleware, async (req, res) => {
  try {
    const { fields } = req.body;
    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ error: 'fields object required' });
    }
    const patch = buildPatch(fields);
    patch.updatedAt = new Date();

    await Save.findOneAndUpdate(
      { userId: req.userId },
      { $set: patch },
      { upsert: true, new: true }
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error('[POST /save/partial]', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════
//  Хелперы
// ══════════════════════════════════════════════════════

/**
 * Превращает Mongoose-документ в чистый объект для фронтенда.
 */
function docToSave(doc) {
  return {
    gold:      doc.gold,
    pixr:      doc.pixr,
    gram:      doc.gram,
    level:     doc.level,
    xp:        doc.xp,
    xpNeeded:  doc.xpNeeded,
    floor:     doc.floor,
    maxFloor:  doc.maxFloor,
    killCount: doc.killCount,
    charId:    doc.charId,
    baseStats: doc.baseStats,
    stats:     doc.stats,
    hp:        doc.hp,
    maxHp:     doc.maxHp,
    upg:       doc.upg,
    potionLv:  doc.potionLv,
    potions:   doc.potions,
    potionThreshold: doc.potionThreshold,
    bp:        doc.bp,
    prem:      doc.prem,
    inventory: doc.inventory || [],
    equipped:  doc.equipped,
    skills:    doc.skills || {},
  };
}

// Поля которые разрешено патчить (whitelist)
const ALLOWED_FLAT = [
  'gold','pixr','gram','level','xp','xpNeeded',
  'floor','maxFloor','killCount','charId',
  'hp','maxHp','potionLv','potions','potionThreshold',
];
const ALLOWED_NESTED = ['baseStats','stats','upg','bp','prem','equipped'];
const ALLOWED_ARRAYS = ['inventory','skills'];

/**
 * Строит объект $set из входных данных, фильтруя лишнее.
 */
function buildPatch(data) {
  const patch = {};

  ALLOWED_FLAT.forEach(key => {
    if (key in data) patch[key] = data[key];
  });

  ALLOWED_NESTED.forEach(key => {
    if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
      // Плоский merge вложенных объектов
      Object.keys(data[key]).forEach(subKey => {
        patch[`${key}.${subKey}`] = data[key][subKey];
      });
    }
  });

  // Инвентарь и навыки — целиком
  if (Array.isArray(data.inventory)) patch.inventory = data.inventory;
  if (data.skills && typeof data.skills === 'object') patch.skills = data.skills;

  return patch;
}

// ══════════════════════════════════════════════════════
//  Старт
// ══════════════════════════════════════════════════════
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('[MongoDB] Connected');
    app.listen(PORT, () => console.log(`[Server] Listening on port ${PORT}`));
  })
  .catch(err => {
    console.error('[MongoDB] Connection error:', err.message);
    process.exit(1);
  });

/*
  ══════════════════════════════════════════════════════
  server.js — Pixel RPG Backend v3.0 (Fastify + REST)
  Гарантия сохранения: версионирование + retry + atomic
  ══════════════════════════════════════════════════════
*/

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import mongoose from 'mongoose';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════
//  КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════

const config = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI,
  botToken: process.env.BOT_TOKEN,
  botUsername: process.env.BOT_USERNAME || 'PixelRPG_Bot',
  adminPassword: process.env.ADMIN_PASSWORD || 'pixel2024',
  adminTgId: process.env.ADMIN_TG_ID,
  webAppUrl: process.env.WEBAPP_URL || 'https://your-domain.railway.app',
  apiUrl: process.env.API_URL || 'https://your-api.railway.app',
  
  save: {
    maxRetries: 3,
    retryDelay: 1000,
    version: 3,
  },
  
  ref: {
    goldPerMilestone: 500,
    milestoneStep: 5,
  },
  
  wallet: {
    address: 'UQD5hiR-ziWL1r2jggCKxzhE7K7yNvH3FqnckOdXosVKYEfb',
    minAmount: 1,
    exchangeRate: 1000,
  },
};

// ═══════════════════════════════════════════════════════
//  MONGODB
// ═══════════════════════════════════════════════════════

await mongoose.connect(config.mongoUri, {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
  maxPoolSize: 50,
  minPoolSize: 10,
});

console.log('✅ MongoDB подключена');

// ═══════════════════════════════════════════════════════
//  СХЕМЫ
// ═══════════════════════════════════════════════════════

const SaveSchema = new mongoose.Schema({
  tgId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: '' },
  firstName: { type: String, default: '' },
  charId: { type: String, default: null },
  level: { type: Number, default: 1 },
  cp: { type: Number, default: 0 },
  floor: { type: Number, default: 1 },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  version: { type: Number, default: config.save.version },
  updatedAt: { type: Number, default: Date.now },
  refBy: { type: String, default: null, index: true },
  refMilestones: { type: mongoose.Schema.Types.Mixed, default: {} },
  refClaimVer: { type: Number, default: 0 },
}, { minimize: false });

SaveSchema.index({ cp: -1, level: -1 });
SaveSchema.index({ updatedAt: -1 });

const Save = mongoose.model('Save', SaveSchema);

const TransactionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  username: { type: String, default: '' },
  type: { type: String, enum: ['deposit', 'withdraw'], required: true },
  amount: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  wallet: { type: String, default: '' },
  memo: { type: String, default: '' },
  createdAt: { type: Number, default: Date.now },
  approvedAt: { type: Number, default: null },
  rejectedAt: { type: Number, default: null },
  adminNote: { type: String, default: '' },
});

TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ status: 1 });

const Transaction = mongoose.model('Transaction', TransactionSchema);

const AdminLogSchema = new mongoose.Schema({
  admin: { type: String, required: true },
  action: { type: String, required: true },
  target: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Number, default: Date.now },
});

AdminLogSchema.index({ timestamp: -1 });

const AdminLog = mongoose.model('AdminLog', AdminLogSchema);

const SpecialTaskSchema = new mongoose.Schema({
  taskId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  link: { type: String, default: '' },
  linkText: { type: String, default: 'Перейти' },
  rewardType: { type: String, enum: ['gold', 'pixr', 'potions', 'gram'], required: true },
  rewardAmount: { type: Number, required: true, min: 1 },
  active: { type: Boolean, default: true },
  createdAt: { type: Number, default: Date.now },
});

SpecialTaskSchema.index({ active: 1, createdAt: -1 });

const SpecialTask = mongoose.model('SpecialTask', SpecialTaskSchema);

// ═══════════════════════════════════════════════════════
//  УТИЛИТЫ
// ═══════════════════════════════════════════════════════

// ── Telegram авторизация ──
function verifyTelegram(initData) {
  if (!initData || typeof initData !== 'string') return null;
  
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  
  params.delete('hash');
  
  const dataCheckString = [...params.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  
  const botToken = config.botToken;
  if (!botToken) return null;
  
  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  
  const calculatedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  
  if (calculatedHash !== hash) return null;
  
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (authDate && (Math.floor(Date.now() / 1000) - authDate) > 86400) return null;
  
  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (e) {}
  if (!user || !user.id) return null;
  
  return {
    id: String(user.id),
    username: user.username || '',
    firstName: user.first_name || '',
    startParam: params.get('start_param') || '',
  };
}

// ── Rate limit ──
const rateLimits = new Map();

function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const record = rateLimits.get(key);
  
  if (!record || now > record.reset) {
    rateLimits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) return false;
  record.count++;
  return true;
}

// ── Логи админа ──
async function logAdminAction(admin, action, target, details = {}) {
  try {
    await AdminLog.create({ admin, action, target, details });
  } catch (e) {
    console.error('❌ Лог админа:', e.message);
  }
}

// ── Генерация ID ──
function generateId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

// ── Кэш лидерборда ──
let leaderboardCache = null;
let leaderboardCacheTime = 0;
const LEADERBOARD_CACHE_TTL = 10000;

function getCachedLeaderboard() {
  if (leaderboardCache && Date.now() - leaderboardCacheTime < LEADERBOARD_CACHE_TTL) {
    return leaderboardCache;
  }
  return null;
}

function setCachedLeaderboard(data) {
  leaderboardCache = data;
  leaderboardCacheTime = Date.now();
}

// ═══════════════════════════════════════════════════════
//  АДМИН-СЕССИИ
// ═══════════════════════════════════════════════════════

const adminSessions = new Map();

function createAdminSession(login) {
  const sessionId = generateId() + generateId();
  adminSessions.set(sessionId, {
    login,
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });
  return sessionId;
}

function getAdminSession(sessionId) {
  const session = adminSessions.get(sessionId);
  if (!session) return null;
  if (session.expires < Date.now()) {
    adminSessions.delete(sessionId);
    return null;
  }
  return session;
}

function requireAdmin(request, reply) {
  const sessionId = request.headers['x-admin-session'] || request.query.session;
  const session = getAdminSession(sessionId);
  
  if (!session) {
    return reply.status(401).send({ ok: false, error: 'unauthorized' });
  }
  
  request.admin = session;
  return true;
}

// ═══════════════════════════════════════════════════════
//  FASTIFY — СЕРВЕР
// ═══════════════════════════════════════════════════════

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  },
});

// ── Плагины ──
await app.register(cors, {
  origin: (origin) => {
    const allowed = ['https://your-domain.railway.app', 'https://t.me', 'http://localhost:3000'];
    return allowed.includes(origin) || !origin;
  },
  credentials: true,
});

await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    ok: false,
    error: 'rate_limit',
    message: 'Слишком много запросов, попробуйте позже',
  }),
});

// ═══════════════════════════════════════════════════════
//  РОУТЫ — ПУБЛИЧНЫЕ
// ═══════════════════════════════════════════════════════

app.get('/', async () => ({
  ok: true,
  service: 'pixel-rpg',
  version: '3.0.0',
  db: mongoose.connection.readyState === 1,
  timestamp: Date.now(),
}));

// ── Загрузка прогресса ──
app.post('/api/load', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  const startParam = tg.startParam || request.body?.startParam || '';
  
  try {
    let doc = await Save.findOne({ tgId: tg.id }).lean();
    
    if (!doc) {
      const refBy = (startParam && startParam !== tg.id) ? startParam : null;
      
      doc = await Save.create({
        tgId: tg.id,
        username: tg.username,
        firstName: tg.firstName,
        refBy,
        refMilestones: {},
        data: { tgId: tg.id },
        version: config.save.version,
        updatedAt: Date.now(),
      });
      
      console.log(`🆕 Новый игрок: ${tg.id}`);
    }
    
    // Обновляем username если изменился
    if (doc.username !== tg.username || doc.firstName !== tg.firstName) {
      await Save.updateOne(
        { tgId: tg.id },
        { $set: { username: tg.username, firstName: tg.firstName } }
      );
      doc.username = tg.username;
      doc.firstName = tg.firstName;
    }
    
    return {
      ok: true,
      save: {
        charId: doc.charId,
        data: doc.data,
        updatedAt: doc.updatedAt || 0,
        version: doc.version || config.save.version,
      },
      user: {
        id: tg.id,
        username: tg.username,
        firstName: tg.firstName,
      },
    };
  } catch (error) {
    app.log.error(error, 'Ошибка загрузки');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Сохранение прогресса (с гарантией) ──
app.post('/api/save', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  // Rate limit: 10 сохранений в 5 секунд
  if (!checkRateLimit(`save_${tg.id}`, 10, 5000)) {
    return reply.status(429).send({ ok: false, error: 'rate_limit' });
  }
  
  const data = request.body?.data;
  if (!data || typeof data !== 'object') {
    return reply.status(400).send({ ok: false, error: 'bad_data' });
  }
  
  // Проверка: данные принадлежат этому пользователю
  if (data.tgId && data.tgId !== tg.id) {
    return reply.status(403).send({ ok: false, error: 'user_mismatch' });
  }
  
  // Версионирование: если версия клиента старше — отклоняем
  const clientVersion = data.version || 1;
  if (clientVersion < config.save.version) {
    return reply.status(400).send({
      ok: false,
      error: 'client_outdated',
      serverVersion: config.save.version,
    });
  }
  
  try {
    // Подготовка данных
    const now = Date.now();
    data.tgId = tg.id;
    data.updatedAt = now;
    data.version = config.save.version;
    
    // Атомарное обновление с версией
    const result = await Save.findOneAndUpdate(
      { 
        tgId: tg.id,
        // Опционально: проверяем что версия не старше
        $or: [
          { version: { $lte: config.save.version } },
          { version: { $exists: false } },
        ],
      },
      {
        $set: {
          username: tg.username,
          firstName: tg.firstName,
          charId: data.charId || null,
          data: data,
          level: Number(data.level) || 1,
          cp: Number(data.cp) || 0,
          floor: Number(data.floor) || 1,
          version: config.save.version,
          updatedAt: now,
        },
      },
      {
        upsert: true,
        new: false,
        lean: true,
      }
    );
    
    app.log.info(`💾 Сохранено: ${tg.id} (v${config.save.version})`);
    
    return {
      ok: true,
      updatedAt: now,
      version: config.save.version,
    };
  } catch (error) {
    app.log.error(error, 'Ошибка сохранения');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Выбор персонажа ──
app.post('/api/character', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  const charId = request.body?.charId;
  if (!charId) {
    return reply.status(400).send({ ok: false, error: 'bad_char' });
  }
  
  try {
    await Save.findOneAndUpdate(
      { tgId: tg.id },
      {
        $set: {
          charId,
          'data.charId': charId,
          'data.tgId': tg.id,
          updatedAt: Date.now(),
        },
        $setOnInsert: {
          tgId: tg.id,
          username: tg.username,
          firstName: tg.firstName,
        },
      },
      { upsert: true }
    );
    
    return { ok: true };
  } catch (error) {
    app.log.error(error, 'Ошибка выбора персонажа');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Лидерборд ──
app.get('/api/leaderboard', async (request, reply) => {
  const tgId = request.query.tgId;
  if (!tgId) {
    return reply.status(401).send({ ok: false, error: 'missing_id' });
  }
  
  if (!checkRateLimit(`lb_${tgId}`, 5, 60000)) {
    return reply.status(429).send({ ok: false, error: 'rate_limit' });
  }
  
  try {
    const cached = getCachedLeaderboard();
    if (cached) {
      return { ok: true, top: cached, cached: true };
    }
    
    const top = await Save.find({ charId: { $ne: null } })
      .sort({ cp: -1, level: -1 })
      .limit(50)
      .select('tgId username firstName level cp floor charId -_id')
      .lean();
    
    setCachedLeaderboard(top);
    
    return { ok: true, top, cached: false };
  } catch (error) {
    app.log.error(error, 'Ошибка лидерборда');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════════════════════════════
//  РОУТЫ — РЕФЕРАЛКА
// ═══════════════════════════════════════════════════════

app.post('/api/ref/friends', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  try {
    const doc = await Save.findOne({ tgId: tg.id })
      .select('refMilestones -_id')
      .lean();
    
    const milestones = doc?.refMilestones || {};
    
    const friends = await Save.find({ refBy: tg.id })
      .select('tgId firstName username level charId -_id')
      .lean();
    
    const refLink = `https://t.me/${config.botUsername}?startapp=${tg.id}`;
    
    // Расчёт ожидаемого золота
    let pendingGold = 0;
    const newMilestones = { ...milestones };
    
    friends.forEach(friend => {
      const paid = newMilestones[friend.tgId] || 0;
      const maxMilestone = Math.floor((friend.level || 1) / config.ref.milestoneStep) * config.ref.milestoneStep;
      if (maxMilestone > paid) {
        const count = (maxMilestone - paid) / config.ref.milestoneStep;
        pendingGold += count * config.ref.goldPerMilestone;
        newMilestones[friend.tgId] = maxMilestone;
      }
    });
    
    return {
      ok: true,
      refLink,
      refCode: tg.id,
      friends: friends.map(f => ({
        name: f.firstName || f.username || `Игрок ${f.tgId.slice(-4)}`,
        level: f.level || 1,
        charId: f.charId,
        nextMilestone: (Math.floor(((milestones[f.tgId] || 0) / config.ref.milestoneStep) + 1)) * config.ref.milestoneStep,
        paid: milestones[f.tgId] || 0,
      })),
      pendingGold,
    };
  } catch (error) {
    app.log.error(error, 'Ошибка рефералки');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

app.post('/api/ref/claim', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  try {
    const doc = await Save.findOne({ tgId: tg.id });
    if (!doc) {
      return { ok: true, goldEarned: 0 };
    }
    
    const friends = await Save.find({ refBy: tg.id })
      .select('tgId level -_id')
      .lean();
    
    const milestones = doc.refMilestones || {};
    let goldEarned = 0;
    const newMilestones = { ...milestones };
    
    friends.forEach(friend => {
      const paid = newMilestones[friend.tgId] || 0;
      const maxMilestone = Math.floor((friend.level || 1) / config.ref.milestoneStep) * config.ref.milestoneStep;
      if (maxMilestone > paid) {
        const count = (maxMilestone - paid) / config.ref.milestoneStep;
        goldEarned += count * config.ref.goldPerMilestone;
        newMilestones[friend.tgId] = maxMilestone;
      }
    });
    
    if (goldEarned === 0) {
      return { ok: true, goldEarned: 0 };
    }
    
    // Атомарное обновление
    await Save.findOneAndUpdate(
      { tgId: tg.id, refClaimVer: doc.refClaimVer || 0 },
      {
        $set: {
          refMilestones: newMilestones,
          'data.gold': (doc.data?.gold || 0) + goldEarned,
        },
        $inc: { refClaimVer: 1 },
      }
    );
    
    return { ok: true, goldEarned };
  } catch (error) {
    app.log.error(error, 'Ошибка получения награды');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════════════════════════════
//  РОУТЫ — КОШЕЛЁК
// ═══════════════════════════════════════════════════════

// ── Пополнение ──
app.post('/api/wallet/deposit', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  const { amount } = request.body;
  if (!amount || amount < config.wallet.minAmount) {
    return reply.status(400).send({
      ok: false,
      error: `Минимальная сумма ${config.wallet.minAmount} GRAM`,
    });
  }
  
  try {
    const txId = 'tx_' + generateId();
    const memo = tg.id + '_' + Date.now().toString(36);
    
    const tx = await Transaction.create({
      id: txId,
      userId: tg.id,
      username: tg.username || tg.firstName || 'Игрок',
      type: 'deposit',
      amount,
      status: 'pending',
      wallet: config.wallet.address,
      memo,
      createdAt: Date.now(),
    });
    
    // Уведомление админа (если бот есть)
    if (bot && config.adminTgId) {
      try {
        await bot.sendMessage(config.adminTgId, `
💰 **НОВАЯ ТРАНЗАКЦИЯ**

**Тип:** Пополнение
**Пользователь:** @${tg.username || 'нет'} (${tg.id})
**Сумма:** ${amount} GRAM
**Кошелек:** \`${config.wallet.address}\`
**Мемо:** \`${memo}\`

Статус: ⏳ Ожидание подтверждения
        `, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Подтвердить', callback_data: `approve_${tx.id}` },
                { text: '❌ Отклонить', callback_data: `reject_${tx.id}` },
              ],
            ],
          },
        });
      } catch (e) {
        app.log.error(e, 'Ошибка уведомления админа');
      }
    }
    
    return {
      ok: true,
      tx: {
        id: tx.id,
        amount: tx.amount,
        wallet: tx.wallet,
        memo: tx.memo,
        status: tx.status,
        createdAt: tx.createdAt,
      },
    };
  } catch (error) {
    app.log.error(error, 'Ошибка пополнения');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Вывод ──
app.post('/api/wallet/withdraw', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  const { amount, wallet } = request.body;
  
  if (!amount || amount < config.wallet.minAmount) {
    return reply.status(400).send({
      ok: false,
      error: `Минимальная сумма ${config.wallet.minAmount} GRAM`,
    });
  }
  
  if (!wallet || wallet.length < 10) {
    return reply.status(400).send({
      ok: false,
      error: 'Укажите корректный адрес кошелька',
    });
  }
  
  try {
    const user = await Save.findOne({ tgId: tg.id });
    const balance = user?.data?.gram || 0;
    
    if (balance < amount) {
      return reply.status(400).send({
        ok: false,
        error: 'Недостаточно GRAM на балансе',
      });
    }
    
    const txId = 'tx_' + generateId();
    
    const tx = await Transaction.create({
      id: txId,
      userId: tg.id,
      username: tg.username || tg.firstName || 'Игрок',
      type: 'withdraw',
      amount,
      status: 'pending',
      wallet,
      memo: tg.id + '_' + Date.now().toString(36),
      createdAt: Date.now(),
    });
    
    if (bot && config.adminTgId) {
      try {
        await bot.sendMessage(config.adminTgId, `
💰 **НОВАЯ ТРАНЗАКЦИЯ**

**Тип:** Вывод
**Пользователь:** @${tg.username || 'нет'} (${tg.id})
**Сумма:** ${amount} GRAM
**Кошелек:** \`${wallet}\`

Статус: ⏳ Ожидание подтверждения
        `, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Подтвердить', callback_data: `approve_${tx.id}` },
                { text: '❌ Отклонить', callback_data: `reject_${tx.id}` },
              ],
            ],
          },
        });
      } catch (e) {
        app.log.error(e, 'Ошибка уведомления админа');
      }
    }
    
    return {
      ok: true,
      tx: {
        id: tx.id,
        amount: tx.amount,
        wallet: tx.wallet,
        status: tx.status,
        createdAt: tx.createdAt,
      },
    };
  } catch (error) {
    app.log.error(error, 'Ошибка вывода');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Транзакции пользователя ──
app.post('/api/wallet/transactions', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  try {
    const txs = await Transaction.find({ userId: tg.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    return { ok: true, transactions: txs };
  } catch (error) {
    app.log.error(error, 'Ошибка получения транзакций');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Обмен PIXR → GRAM ──
app.post('/api/wallet/exchange', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  const { amount } = request.body;
  const rate = config.wallet.exchangeRate;
  
  if (!amount || amount < rate || amount % rate !== 0) {
    return reply.status(400).send({
      ok: false,
      error: `Сумма должна быть кратна ${rate} PIXR (минимум ${rate})`,
    });
  }
  
  const gramEarned = amount / rate;
  
  try {
    const result = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.pixr': { $gte: amount } },
      {
        $inc: {
          'data.pixr': -amount,
          'data.gram': gramEarned,
        },
      },
      { new: true }
    );
    
    if (!result) {
      return reply.status(400).send({
        ok: false,
        error: 'Недостаточно PIXR',
      });
    }
    
    return {
      ok: true,
      pixr: result.data.pixr,
      gram: result.data.gram,
      earned: gramEarned,
    };
  } catch (error) {
    app.log.error(error, 'Ошибка обмена');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════════════════════════════
//  РОУТЫ — ЗАДАНИЯ
// ═══════════════════════════════════════════════════════

const DAILY_MILESTONES = [
  { id: 0, minutes: 10, rewardType: 'potions', amount: 50 },
  { id: 1, minutes: 20, rewardType: 'gold', amount: 1000 },
  { id: 2, minutes: 30, rewardType: 'pixr', amount: 5 },
  { id: 3, minutes: 60, rewardType: 'gold', amount: 2000 },
];

app.post('/api/tasks', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  try {
    const [tasks, user] = await Promise.all([
      SpecialTask.find({ active: true }).sort({ createdAt: -1 }).lean(),
      Save.findOne({ tgId: tg.id }).select('data').lean(),
    ]);
    
    const userData = user?.data || {};
    
    return {
      ok: true,
      tasks,
      dailyTasks: userData.dailyTasks || { date: '', seconds: 0, claimed: [] },
      specialTasksClaimed: userData.specialTasksClaimed || {},
    };
  } catch (error) {
    app.log.error(error, 'Ошибка получения заданий');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

app.post('/api/tasks/daily/claim', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  const { milestoneId } = request.body;
  const milestone = DAILY_MILESTONES.find(m => m.id === milestoneId);
  
  if (!milestone) {
    return reply.status(400).send({ ok: false, error: 'invalid_milestone' });
  }
  
  try {
    const user = await Save.findOne({ tgId: tg.id });
    if (!user || !user.data) {
      return reply.status(404).send({ ok: false, error: 'no_save' });
    }
    
    const daily = user.data.dailyTasks || { date: '', seconds: 0, claimed: [] };
    const todayStr = new Date().toISOString().slice(0, 10);
    
    if (daily.date !== todayStr) {
      return reply.status(400).send({ ok: false, error: 'day_reset' });
    }
    
    if ((daily.claimed || []).includes(milestoneId)) {
      return reply.status(400).send({ ok: false, error: 'already_claimed' });
    }
    
    if (Math.floor((daily.seconds || 0) / 60) < milestone.minutes) {
      return reply.status(400).send({ ok: false, error: 'not_enough_time' });
    }
    
    const newClaimed = [...(daily.claimed || []), milestoneId];
    
    await Save.findOneAndUpdate(
      { tgId: tg.id },
      {
        $inc: { [`data.${milestone.rewardType}`]: milestone.amount },
        $set: { 'data.dailyTasks.claimed': newClaimed },
      }
    );
    
    return {
      ok: true,
      reward: {
        type: milestone.rewardType,
        amount: milestone.amount,
      },
    };
  } catch (error) {
    app.log.error(error, 'Ошибка получения ежедневной награды');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

app.post('/api/tasks/special/claim', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  const { taskId } = request.body;
  if (!taskId) {
    return reply.status(400).send({ ok: false, error: 'missing_taskId' });
  }
  
  try {
    const [task, user] = await Promise.all([
      SpecialTask.findOne({ taskId, active: true }).lean(),
      Save.findOne({ tgId: tg.id }),
    ]);
    
    if (!task) {
      return reply.status(404).send({ ok: false, error: 'task_not_found' });
    }
    
    if (!user) {
      return reply.status(404).send({ ok: false, error: 'no_save' });
    }
    
    const claimed = user.data?.specialTasksClaimed || {};
    if (claimed[taskId]) {
      return reply.status(400).send({ ok: false, error: 'already_claimed' });
    }
    
    const newClaimed = { ...claimed, [taskId]: Date.now() };
    
    await Save.findOneAndUpdate(
      { tgId: tg.id },
      {
        $inc: { [`data.${task.rewardType}`]: task.rewardAmount },
        $set: { 'data.specialTasksClaimed': newClaimed },
      }
    );
    
    return {
      ok: true,
      reward: {
        type: task.rewardType,
        amount: task.rewardAmount,
      },
    };
  } catch (error) {
    app.log.error(error, 'Ошибка получения специальной награды');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════════════════════════════
//  АДМИН-РОУТЫ
// ═══════════════════════════════════════════════════════

// ── Вход ──
app.post('/admin/login', async (request, reply) => {
  const { login, password } = request.body;
  
  if (!login || !password) {
    return reply.status(400).send({ ok: false, error: 'missing_credentials' });
  }
  
  if (login !== 'admin' || password !== config.adminPassword) {
    return reply.status(401).send({ ok: false, error: 'invalid_credentials' });
  }
  
  const sessionId = createAdminSession(login);
  
  return {
    ok: true,
    session: sessionId,
    role: 'superadmin',
    login,
  };
});

// ── Проверка сессии ──
app.get('/admin/check', async (request, reply) => {
  const sessionId = request.headers['x-admin-session'] || request.query.session;
  const session = getAdminSession(sessionId);
  
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }
  
  return { ok: true, role: 'superadmin', login: session.login };
});

// ── Выход ──
app.post('/admin/logout', async (request, reply) => {
  const sessionId = request.headers['x-admin-session'] || request.body?.session;
  if (sessionId) {
    adminSessions.delete(sessionId);
  }
  return { ok: true };
});

// ── Статистика ──
app.get('/admin/api/stats', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  try {
    const [totalUsers, usersWithChar, active24h, floors, topCP] = await Promise.all([
      Save.countDocuments(),
      Save.countDocuments({ charId: { $ne: null } }),
      Save.countDocuments({ updatedAt: { $gt: Date.now() - 24 * 60 * 60 * 1000 } }),
      Save.aggregate([
        { $group: { _id: '$floor', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Save.find({ charId: { $ne: null } })
        .sort({ cp: -1 })
        .limit(10)
        .select('username firstName level cp charId')
        .lean(),
    ]);
    
    return {
      ok: true,
      stats: {
        totalUsers,
        usersWithChar,
        active24h,
        floors,
        topCP,
        online: adminSessions.size,
      },
    };
  } catch (error) {
    app.log.error(error, 'Ошибка статистики');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Список пользователей ──
app.get('/admin/api/users', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  try {
    const page = parseInt(request.query.page) || 1;
    const limit = parseInt(request.query.limit) || 20;
    const search = request.query.search || '';
    const skip = (page - 1) * limit;
    
    let filter = {};
    if (search) {
      filter = {
        $or: [
          { tgId: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
        ],
      };
    }
    
    const [total, users] = await Promise.all([
      Save.countDocuments(filter),
      Save.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);
    
    return {
      ok: true,
      users: users.map(u => ({
        tgId: u.tgId,
        username: u.username,
        firstName: u.firstName,
        charId: u.charId,
        level: u.level,
        cp: u.cp,
        floor: u.floor,
        updatedAt: u.updatedAt,
        data: u.data || {},
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  } catch (error) {
    app.log.error(error, 'Ошибка списка пользователей');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Пользователь по ID ──
app.get('/admin/api/user/:tgId', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  try {
    const user = await Save.findOne({ tgId: request.params.tgId }).lean();
    if (!user) {
      return reply.status(404).send({ ok: false, error: 'user_not_found' });
    }
    
    return {
      ok: true,
      user: {
        tgId: user.tgId,
        username: user.username,
        firstName: user.firstName,
        charId: user.charId,
        level: user.level,
        cp: user.cp,
        floor: user.floor,
        updatedAt: user.updatedAt,
        refBy: user.refBy,
        refMilestones: user.refMilestones,
        data: user.data || {},
      },
    };
  } catch (error) {
    app.log.error(error, 'Ошибка получения пользователя');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Обновление пользователя ──
app.post('/admin/api/user/:tgId/update', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  const { tgId } = request.params;
  const updates = request.body;
  
  try {
    const updateData = {};
    
    if (updates.gold !== undefined) updateData['data.gold'] = updates.gold;
    if (updates.pixr !== undefined) updateData['data.pixr'] = updates.pixr;
    if (updates.gram !== undefined) updateData['data.gram'] = updates.gram;
    if (updates.hp !== undefined) updateData['data.hp'] = updates.hp;
    if (updates.level !== undefined) updateData.level = updates.level;
    if (updates.floor !== undefined) updateData.floor = updates.floor;
    if (updates.charId !== undefined) updateData.charId = updates.charId;
    
    updateData.updatedAt = Date.now();
    
    await Save.updateOne(
      { tgId },
      { $set: updateData }
    );
    
    await logAdminAction(request.admin.login, 'update_user', tgId, updates);
    
    return { ok: true };
  } catch (error) {
    app.log.error(error, 'Ошибка обновления пользователя');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Рефералы пользователя ──
app.get('/admin/api/user/:tgId/referrals', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  try {
    const referrals = await Save.find({ refBy: request.params.tgId })
      .select('tgId username firstName level cp floor charId data.gold data.pixr')
      .lean();
    
    return {
      ok: true,
      referrals: referrals.map(r => ({
        tgId: r.tgId,
        username: r.username || r.firstName || 'Игрок',
        level: r.level || 1,
        cp: r.cp || 0,
        floor: r.floor || 1,
        charId: r.charId,
        gold: r.data?.gold || 0,
        pixr: r.data?.pixr || 0,
      })),
    };
  } catch (error) {
    app.log.error(error, 'Ошибка получения рефералов');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Выдача предмета ──
app.post('/admin/api/user/:tgId/give-item', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  const { tgId } = request.params;
  const { slot, name, rarity, level, stats, icon, forClass } = request.body;
  
  if (!slot || !name || !rarity) {
    return reply.status(400).send({ ok: false, error: 'missing_fields' });
  }
  
  try {
    const user = await Save.findOne({ tgId });
    if (!user) {
      return reply.status(404).send({ ok: false, error: 'user_not_found' });
    }
    
    if (!user.data) user.data = { tgId };
    if (!user.data.inventory) user.data.inventory = [];
    
    const item = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      slot,
      name,
      icon: icon || 'images/ac.png',
      rarity,
      level: level || 1,
      stats: stats || {},
      _equipped: false,
    };
    
    if (forClass) item.forClass = forClass;
    
    user.data.inventory.push(item);
    await user.save();
    
    await logAdminAction(request.admin.login, 'give_item', tgId, { item });
    
    return { ok: true, item };
  } catch (error) {
    app.log.error(error, 'Ошибка выдачи предмета');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Список предметов для выдачи ──
app.get('/admin/api/items/list', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  const itemTypes = [
    { slot: 'body', name: 'Нагрудник', stats: ['def', 'hp'], primary: 'def' },
    { slot: 'legs', name: 'Штаны', stats: ['def', 'dodge'], primary: 'def' },
    { slot: 'gloves', name: 'Перчатки', stats: ['atk', 'crit'], primary: 'atk' },
    { slot: 'boots', name: 'Боты', stats: ['spd', 'dodge'], primary: 'spd' },
    { slot: 'helmet', name: 'Шлем', stats: ['def', 'hp'], primary: 'def' },
    { slot: 'ring', name: 'Кольцо', stats: ['crit', 'atk'], primary: 'crit' },
    { slot: 'belt', name: 'Пояс', stats: ['hp', 'def'], primary: 'hp' },
  ];
  
  const staffTypes = [
    { slot: 'weapon', name: 'Посох огня', stats: ['atk', 'crit'], primary: 'atk', forClass: 'fire', classLabel: 'Пирокан' },
    { slot: 'weapon', name: 'Посох света', stats: ['atk', 'hp'], primary: 'atk', forClass: 'light', classLabel: 'Люмос' },
    { slot: 'weapon', name: 'Посох воды', stats: ['atk', 'dodge'], primary: 'atk', forClass: 'water', classLabel: 'Аквас' },
  ];
  
  const items = [...itemTypes, ...staffTypes];
  
  return { ok: true, items };
});

// ── Транзакции (админ) ──
app.get('/admin/api/transactions', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  try {
    const limit = parseInt(request.query.limit) || 50;
    const status = request.query.status || 'all';
    
    const filter = status !== 'all' ? { status } : {};
    
    const txs = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    return { ok: true, transactions: txs };
  } catch (error) {
    app.log.error(error, 'Ошибка получения транзакций');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Обработка транзакции (админ) ──
app.post('/admin/api/transaction/:txId/:action', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  const { txId, action } = request.params;
  
  if (!['approve', 'reject'].includes(action)) {
    return reply.status(400).send({ ok: false, error: 'invalid_action' });
  }
  
  try {
    const tx = await Transaction.findOne({ id: txId });
    if (!tx) {
      return reply.status(404).send({ ok: false, error: 'transaction_not_found' });
    }
    
    if (tx.status !== 'pending') {
      return reply.status(400).send({ ok: false, error: 'transaction_already_processed' });
    }
    
    if (action === 'approve') {
      tx.status = 'approved';
      tx.approvedAt = Date.now();
      
      const gramDelta = tx.type === 'deposit' ? tx.amount : -tx.amount;
      await Save.findOneAndUpdate(
        { tgId: tx.userId },
        { $inc: { 'data.gram': gramDelta } }
      );
    } else {
      tx.status = 'rejected';
      tx.rejectedAt = Date.now();
    }
    
    await tx.save();
    await logAdminAction(request.admin.login, action + '_transaction', tx.userId, { txId, amount: tx.amount });
    
    // Уведомление пользователя
    if (bot) {
      try {
        const statusText = action === 'approve' ? '✅ Подтверждена' : '❌ Отклонена';
        const msg = `💰 **Транзакция ${statusText}**\n\n**Тип:** ${tx.type === 'deposit' ? 'Пополнение' : 'Вывод'}\n**Сумма:** ${tx.amount} GRAM\n${action === 'approve' ? '✅ Баланс обновлён!' : '❌ Средства не зачислены.'}`;
        await bot.sendMessage(tx.userId, msg, { parse_mode: 'Markdown' });
      } catch (e) {}
    }
    
    return { ok: true };
  } catch (error) {
    app.log.error(error, 'Ошибка обработки транзакции');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Задания (админ) ──
app.get('/admin/api/tasks', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  try {
    const tasks = await SpecialTask.find().sort({ createdAt: -1 }).lean();
    return { ok: true, tasks };
  } catch (error) {
    app.log.error(error, 'Ошибка получения заданий');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

app.post('/admin/api/tasks', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  const { title, description, link, linkText, rewardType, rewardAmount } = request.body;
  
  if (!title || !rewardType || !rewardAmount) {
    return reply.status(400).send({ ok: false, error: 'missing_fields' });
  }
  
  try {
    const taskId = 'task_' + generateId();
    const task = await SpecialTask.create({
      taskId,
      title,
      description: description || '',
      link: link || '',
      linkText: linkText || 'Перейти',
      rewardType,
      rewardAmount: Number(rewardAmount),
      active: true,
      createdAt: Date.now(),
    });
    
    await logAdminAction(request.admin.login, 'create_task', taskId, { title, rewardType, rewardAmount });
    
    return { ok: true, task };
  } catch (error) {
    app.log.error(error, 'Ошибка создания задания');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

app.delete('/admin/api/tasks/:taskId', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  try {
    await SpecialTask.deleteOne({ taskId: request.params.taskId });
    await logAdminAction(request.admin.login, 'delete_task', request.params.taskId, {});
    return { ok: true };
  } catch (error) {
    app.log.error(error, 'Ошибка удаления задания');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

app.patch('/admin/api/tasks/:taskId/toggle', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  try {
    const task = await SpecialTask.findOne({ taskId: request.params.taskId });
    if (!task) {
      return reply.status(404).send({ ok: false, error: 'not_found' });
    }
    
    task.active = !task.active;
    await task.save();
    
    return { ok: true, active: task.active };
  } catch (error) {
    app.log.error(error, 'Ошибка переключения задания');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Логи (админ) ──
app.get('/admin/api/logs', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  try {
    const logs = await AdminLog.find()
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();
    
    return { ok: true, logs };
  } catch (error) {
    app.log.error(error, 'Ошибка получения логов');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ── Рассылка (админ) ──
app.post('/admin/api/broadcast', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  const { message, target } = request.body;
  
  if (!message || message.length < 1) {
    return reply.status(400).send({ ok: false, error: 'empty_message' });
  }
  
  try {
    await logAdminAction(request.admin.login, 'broadcast', 'all', {
      message: message.substring(0, 100),
      target: target || 'all',
    });
    
    let sent = 0;
    if (bot) {
      const users = await Save.find({ charId: { $ne: null } }).select('tgId').lean();
      for (const user of users) {
        try {
          await bot.sendMessage(user.tgId, message);
          sent++;
        } catch (e) {}
      }
    }
    
    return { ok: true, sent };
  } catch (error) {
    app.log.error(error, 'Ошибка рассылки');
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════════════════════════════
//  БОТ
// ═══════════════════════════════════════════════════════

let bot = null;

async function initBot() {
  if (!config.botToken) {
    console.warn('⚠️ BOT_TOKEN не задан');
    return null;
  }
  
  try {
    const { default: TelegramBot } = await import('node-telegram-bot-api');
    
    bot = new TelegramBot(config.botToken, { polling: false });
    
    // Установка webhook
    const webhookUrl = (config.apiUrl || config.webAppUrl) + '/webhook/' + config.botToken;
    await bot.setWebHook(webhookUrl);
    console.log(`✅ Webhook установлен: ${webhookUrl.replace(config.botToken, '<TOKEN>')}`);
    
    // ── Webhook endpoint ──
    app.post('/webhook/' + config.botToken, async (request, reply) => {
      try {
        bot.processUpdate(request.body);
      } catch (error) {
        app.log.error(error, 'Ошибка обработки webhook');
      }
      return reply.status(200).send('OK');
    });
    
    // ── Обработчики команд ──
    bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const username = msg.from.username || msg.from.first_name || 'Игрок';
      const startParam = match?.[1]?.trim() || null;
      
      const webappUrl = config.webAppUrl + (startParam ? `?startapp=${startParam}` : '');
      
      const greeting = (() => {
        const hour = new Date().getHours();
        if (hour < 12) return '🌅 Доброе утро';
        if (hour < 18) return '☀️ Добрый день';
        if (hour < 22) return '🌇 Добрый вечер';
        return '🌙 Доброй ночи';
      })();
      
      const message = `
${greeting}, *${username}!* 👋

🔥 **PIXEL RPG** — эпическая RPG!

━━━━━━━━━━━━━━━━━━━
🎮 **В игре тебя ждут:**
  ✦ 10 этажей с монстрами
  ✦ 3 класса персонажей
  ✦ Улучшения и навыки
  ✦ Редкие предметы
  ✦ Боевой пропуск
  ✦ Реферальная система

━━━━━━━━━━━━━━━━━━━
👤 **Твой ID:** \`${userId}\`
${startParam ? `🔗 **Пригласил:** \`${startParam}\`` : ''}

Нажми на кнопку ниже, чтобы начать!`;
      
      await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎮 ИГРАТЬ', web_app: { url: webappUrl } }],
            [
              { text: '👥 Пригласить друзей', callback_data: 'ref' },
              { text: '📊 Статистика', callback_data: 'profile' },
            ],
          ],
        },
      });
    });
    
    bot.onText(/\/help/, async (msg) => {
      await bot.sendMessage(msg.chat.id, `
📖 **Команды:**

/start — Начать игру
/help — Справка
/ref — Реферальная ссылка
/profile — Мой профиль
      `, { parse_mode: 'Markdown' });
    });
    
    bot.onText(/\/ref/, async (msg) => {
      const userId = msg.from.id;
      const refLink = `https://t.me/${config.botUsername}?startapp=${userId}`;
      await bot.sendMessage(msg.chat.id, `
👥 **Твоя реферальная ссылка:**

\`${refLink}\`
      `, { parse_mode: 'Markdown' });
    });
    
    bot.onText(/\/profile/, async (msg) => {
      const userId = msg.from.id;
      
      try {
        const doc = await Save.findOne({ tgId: String(userId) }).lean();
        if (!doc) {
          await bot.sendMessage(msg.chat.id, '📊 Профиль не найден. Начни игру через /start');
          return;
        }
        
        const data = doc.data || {};
        await bot.sendMessage(msg.chat.id, `
📊 **Твой профиль:**

👤 Имя: ${doc.firstName || doc.username || 'Игрок'}
🎯 Уровень: ${doc.level || 1}
⚔️ CP: ${doc.cp || 0}
🏰 Этаж: ${doc.floor || 1}
👾 Убийств: ${data.killCount || 0}
🪙 Золото: ${data.gold || 0}
💎 PIXR: ${data.pixr || 0}
⭐ GRAM: ${data.gram || 0}
        `, { parse_mode: 'Markdown' });
      } catch (error) {
        app.log.error(error, 'Ошибка профиля');
        await bot.sendMessage(msg.chat.id, '❌ Ошибка получения профиля');
      }
    });
    
    // ── Callback-запросы ──
    bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const userId = query.from.id;
      const data = query.data;
      
      await bot.answerCallbackQuery(query.id);
      
      if (data === 'ref') {
        const refLink = `https://t.me/${config.botUsername}?startapp=${userId}`;
        await bot.sendMessage(chatId, `
👥 **Твоя реферальная ссылка:**

\`${refLink}\`
        `, { parse_mode: 'Markdown' });
        return;
      }
      
      if (data === 'profile') {
        try {
          const doc = await Save.findOne({ tgId: String(userId) }).lean();
          if (!doc) {
            await bot.sendMessage(chatId, '📊 Профиль не найден');
            return;
          }
          
          const d = doc.data || {};
          await bot.sendMessage(chatId, `
📊 **Твой профиль:**

👤 Имя: ${doc.firstName || doc.username || 'Игрок'}
🎯 Уровень: ${doc.level || 1}
⚔️ CP: ${doc.cp || 0}
🏰 Этаж: ${doc.floor || 1}
👾 Убийств: ${d.killCount || 0}
🪙 Золото: ${d.gold || 0}
💎 PIXR: ${d.pixr || 0}
⭐ GRAM: ${d.gram || 0}
          `, { parse_mode: 'Markdown' });
        } catch (error) {
          await bot.sendMessage(chatId, '❌ Ошибка получения профиля');
        }
        return;
      }
      
      // ── Транзакции ──
      if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const action = data.startsWith('approve_') ? 'approve' : 'reject';
        const txId = data.replace(/^(approve|reject)_/, '');
        
        // Меняем кнопки на "обработка"
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [[{ text: '⏳ Обработка...', callback_data: 'noop' }]] },
          { chat_id: chatId, message_id: query.message.message_id }
        ).catch(() => {});
        
        try {
          const response = await fetch(`${config.apiUrl}/admin/api/transaction/${txId}/${action}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-admin-session': request.headers['x-admin-session'] || '',
            },
          });
          
          const result = await response.json();
          
          if (result.ok) {
            const doneText = action === 'approve' ? '✅ Подтверждено' : '❌ Отклонено';
            await bot.editMessageReplyMarkup(
              { inline_keyboard: [[{ text: doneText, callback_data: 'done_' + txId }]] },
              { chat_id: chatId, message_id: query.message.message_id }
            ).catch(() => {});
          } else {
            await bot.editMessageReplyMarkup(
              { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: `approve_${txId}` }, { text: '❌ Отклонить', callback_data: `reject_${txId}` }]] },
              { chat_id: chatId, message_id: query.message.message_id }
            ).catch(() => {});
          }
        } catch (error) {
          app.log.error(error, 'Ошибка обработки транзакции в боте');
        }
        return;
      }
      
      if (data.startsWith('done_') || data === 'noop') {
        await bot.answerCallbackQuery(query.id, { text: 'Транзакция уже обработана' }).catch(() => {});
      }
    });
    
    console.log('✅ Бот инициализирован');
    return bot;
  } catch (error) {
    console.error('❌ Ошибка инициализации бота:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
//  ЗАПУСК
// ═══════════════════════════════════════════════════════

const PORT = config.port;

try {
  await initBot();
  
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 Сервер запущен на :${PORT}`);
  console.log(`📊 База данных: ${mongoose.connection.db.databaseName}`);
} catch (error) {
  console.error('❌ Ошибка запуска:', error.message);
  process.exit(1);
}

export { app };
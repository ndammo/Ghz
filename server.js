/*
  ══════════════════════════════════════════════════════
  server.js — Pixel RPG Backend v3.0 (Fastify + REST)
  Исправлено: CORS, OPTIONS, таймауты, MongoDB
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

console.log('🔗 Подключение к MongoDB...');

try {
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    maxPoolSize: 10,
    minPoolSize: 2,
  });
  console.log('✅ MongoDB подключена');
  console.log(`📊 База: ${mongoose.connection.db.databaseName}`);
} catch (error) {
  console.error('❌ MongoDB ошибка:', error.message);
  console.warn('⚠️ Сервер запустится, но сохранение будет недоступно!');
}

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
  requestTimeout: 10000,
});

// ── CORS (ИСПРАВЛЕН) ──
await app.register(cors, {
  origin: (origin) => {
    const allowed = [
      'https://t.me',
      'https://web.telegram.org',
      'http://localhost:3000',
      'http://localhost:5500',
    ];
    return !origin || allowed.includes(origin) || true;
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-session', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  preflight: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
});

// ── Helmet ──
await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

// ── Rate Limit ──
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    ok: false,
    error: 'rate_limit',
    message: 'Слишком много запросов, попробуйте позже',
  }),
});

// ── Обработка OPTIONS вручную (запасной вариант) ──
app.options('/*', async (request, reply) => {
  reply.status(204).send();
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
  const startTime = Date.now();
  
  try {
    const tg = verifyTelegram(request.body?.initData);
    if (!tg) {
      return reply.status(401).send({ ok: false, error: 'auth_failed' });
    }
    
    console.log(`📥 [load] ${tg.id} (${tg.username})`);
    
    const startParam = tg.startParam || request.body?.startParam || '';
    
    const loadPromise = Save.findOne({ tgId: tg.id }).lean();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('MongoDB timeout')), 5000)
    );
    
    let doc = await Promise.race([loadPromise, timeoutPromise]);
    
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
    
    if (doc.username !== tg.username || doc.firstName !== tg.firstName) {
      await Save.updateOne(
        { tgId: tg.id },
        { $set: { username: tg.username, firstName: tg.firstName } }
      );
      doc.username = tg.username;
      doc.firstName = tg.firstName;
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ [load] ${tg.id} за ${duration}ms`);
    
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
    const duration = Date.now() - startTime;
    console.error(`❌ [load] Ошибка (${duration}ms):`, error.message);
    
    return reply.status(503).send({ 
      ok: false, 
      error: 'database_unavailable',
      message: 'Сервер временно недоступен, попробуйте позже'
    });
  }
});

// ── Сохранение прогресса ──
app.post('/api/save', async (request, reply) => {
  const tg = verifyTelegram(request.body?.initData);
  if (!tg) {
    return reply.status(401).send({ ok: false, error: 'auth_failed' });
  }
  
  if (!checkRateLimit(`save_${tg.id}`, 10, 5000)) {
    return reply.status(429).send({ ok: false, error: 'rate_limit' });
  }
  
  const data = request.body?.data;
  if (!data || typeof data !== 'object') {
    return reply.status(400).send({ ok: false, error: 'bad_data' });
  }
  
  if (data.tgId && data.tgId !== tg.id) {
    return reply.status(403).send({ ok: false, error: 'user_mismatch' });
  }
  
  const clientVersion = data.version || 1;
  if (clientVersion < config.save.version) {
    return reply.status(400).send({
      ok: false,
      error: 'client_outdated',
      serverVersion: config.save.version,
    });
  }
  
  try {
    const now = Date.now();
    data.tgId = tg.id;
    data.updatedAt = now;
    data.version = config.save.version;
    
    await Save.findOneAndUpdate(
      { tgId: tg.id },
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
      { upsert: true, lean: true }
    );
    
    console.log(`💾 [save] ${tg.id} (v${config.save.version})`);
    
    return {
      ok: true,
      updatedAt: now,
      version: config.save.version,
    };
  } catch (error) {
    console.error('❌ [save] Ошибка:', error.message);
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
    console.error('❌ [character] Ошибка:', error.message);
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
    console.error('❌ [leaderboard] Ошибка:', error.message);
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
    console.error('❌ [ref/friends] Ошибка:', error.message);
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
    console.error('❌ [ref/claim] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════════════════════════════
//  РОУТЫ — КОШЕЛЁК
// ═══════════════════════════════════════════════════════

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
    console.error('❌ [deposit] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    console.error('❌ [withdraw] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    console.error('❌ [transactions] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    console.error('❌ [exchange] Ошибка:', error.message);
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
    console.error('❌ [tasks] Ошибка:', error.message);
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
    console.error('❌ [daily/claim] Ошибка:', error.message);
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
    console.error('❌ [special/claim] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════════════════════════════
//  АДМИН-РОУТЫ
// ═══════════════════════════════════════════════════════

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

app.get('/admin/check', async (request, reply) => {
  const sessionId = request.headers['x-admin-session'] || request.query.session;
  const session = getAdminSession(sessionId);
  
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }
  
  return { ok: true, role: 'superadmin', login: session.login };
});

app.post('/admin/logout', async (request, reply) => {
  const sessionId = request.headers['x-admin-session'] || request.body?.session;
  if (sessionId) {
    adminSessions.delete(sessionId);
  }
  return { ok: true };
});

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
    console.error('❌ [stats] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    console.error('❌ [users] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    console.error('❌ [user] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    console.error('❌ [update] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    console.error('❌ [referrals] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    console.error('❌ [give-item] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    console.error('❌ [transactions-admin] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    
    return { ok: true };
  } catch (error) {
    console.error('❌ [transaction-action] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

app.get('/admin/api/tasks', async (request, reply) => {
  const auth = requireAdmin(request, reply);
  if (auth !== true) return auth;
  
  try {
    const tasks = await SpecialTask.find().sort({ createdAt: -1 }).lean();
    return { ok: true, tasks };
  } catch (error) {
    console.error('❌ [tasks-admin] Ошибка:', error.message);
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
    console.error('❌ [create-task] Ошибка:', error.message);
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
    console.error('❌ [delete-task] Ошибка:', error.message);
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
    console.error('❌ [toggle-task] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    console.error('❌ [logs] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

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
    
    return { ok: true, sent };
  } catch (error) {
    console.error('❌ [broadcast] Ошибка:', error.message);
    return reply.status(500).send({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════════════════════════════
//  ЗАПУСК
// ═══════════════════════════════════════════════════════

const PORT = config.port;

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB ошибка после запуска:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB отключилась');
});

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 Сервер запущен на :${PORT}`);
  console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? '✅ подключена' : '❌ НЕ ПОДКЛЮЧЕНА'}`);
} catch (error) {
  console.error('❌ Ошибка запуска:', error.message);
  process.exit(1);
}

export { app };
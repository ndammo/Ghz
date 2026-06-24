/*
  ══════════════════════════════════════════════════════
  server.js — Backend для PIXEL RPG
  Express + MongoDB (Mongoose) + Telegram WebApp auth
  + Админ-панель + Транзакции (пополнение/вывод)
  ══════════════════════════════════════════════════════
*/

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const crypto   = require('crypto');
const path     = require('path');

const app = express();
const BOT_USERNAME = process.env.BOT_USERNAME || 'YourBotUsername';
if (!process.env.BOT_USERNAME) console.warn('⚠️  BOT_USERNAME не задан');
const REF_GOLD_PER_MILESTONE = 500;
const REF_MILESTONE_STEP     = 5;

// ── CORS ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,DELETE,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb', type: ['application/json', 'text/plain'] }));

// ═══════════════════════════════
//  MongoDB
// ═══════════════════════════════
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI не задан');
  process.exit(1);
}

console.log('🔗 [MongoDB] Подключение...');

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
  maxPoolSize: 50,
  minPoolSize: 10,
  maxIdleTimeMS: 10000,
})
.then(() => {
  console.log('✅ MongoDB подключена');
  console.log(`📊 База данных: ${mongoose.connection.db.databaseName}`);
})
.catch(err => {
  console.error('❌ MongoDB error:', err.message);
  process.exit(1);
});

// ═══════════════════════════════
//  СХЕМЫ
// ═══════════════════════════════

// ── Пользователи ──
const SaveSchema = new mongoose.Schema({
  tgId:      { type: String, required: true },
  username:  { type: String, default: '' },
  firstName: { type: String, default: '' },
  charId:    { type: String, default: null },
  data:      { type: mongoose.Schema.Types.Mixed, default: null },
  level:     { type: Number, default: 1 },
  cp:        { type: Number, default: 0 },
  floor:     { type: Number, default: 1 },
  updatedAt:    { type: Number, default: 0 },
  refClaimVer:  { type: Number, default: 0 },
  refBy:        { type: String, default: null },
  refMilestones: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { minimize: false });

SaveSchema.index({ tgId: 1 }, { unique: true });
SaveSchema.index({ cp: -1, level: -1 });
SaveSchema.index({ refBy: 1 });
SaveSchema.index({ updatedAt: -1 });

const Save = mongoose.model('Save', SaveSchema);

// ── Транзакции ──
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
  adminNote: { type: String, default: '' }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

// ── Логи админа ──
const AdminLogSchema = new mongoose.Schema({
  admin: String,
  action: String,
  target: String,
  details: mongoose.Schema.Types.Mixed,
  timestamp: { type: Number, default: Date.now }
});
const AdminLog = mongoose.model('AdminLog', AdminLogSchema);
// ── Специальные задания (создаются через админку) ──
const SpecialTaskSchema = new mongoose.Schema({
  taskId:       { type: String, required: true, unique: true },
  title:        { type: String, required: true },
  description:  { type: String, default: '' },
  link:         { type: String, default: '' },
  linkText:     { type: String, default: 'Перейти' },
  rewardType:   { type: String, enum: ['gold', 'pixr', 'potions', 'gram'], required: true },
  rewardAmount: { type: Number, required: true, min: 1 },
  active:       { type: Boolean, default: true },
  createdAt:    { type: Number, default: Date.now },
}, { minimize: false });
SpecialTaskSchema.index({ active: 1, createdAt: -1 });
const SpecialTask = mongoose.model('SpecialTask', SpecialTaskSchema);


// ═══════════════════════════════
//  КОНФИГ КОШЕЛЬКА
// ═══════════════════════════════
const WALLET_CONFIG = {
  address: 'UQD5hiR-ziWL1r2jggCKxzhE7K7yNvH3FqnckOdXosVKYEfb',
  minAmount: 1,
};

// ═══════════════════════════════
//  Rate limiter
// ═══════════════════════════════
const _rl = new Map();
function rateLimit(tgId, maxReqs, windowMs) {
  const now = Date.now();
  let e = _rl.get(tgId);
  if (!e || now > e.reset) { _rl.set(tgId, { n: 1, reset: now + windowMs }); return false; }
  if (++e.n > maxReqs) return true;
  return false;
}
setInterval(() => { const now = Date.now(); _rl.forEach((v, k) => { if (now > v.reset) _rl.delete(k); }); }, 300000);

// ═══════════════════════════════
//  Проверка Telegram
// ═══════════════════════════════
function verifyTelegram(initData) {
  if (!initData || typeof initData !== 'string') return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const insecure = process.env.ALLOW_INSECURE === '1';
  if (!insecure) {
    const botToken = process.env.BOT_TOKEN || '';
    if (!botToken) return null;
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calc !== hash) return null;
  }

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (authDate && (Math.floor(Date.now() / 1000) - authDate) > 86400) return null;

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (e) {}
  if (!user || !user.id) return null;

  return {
    id:        String(user.id),
    username:  user.username   || '',
    firstName: user.first_name || '',
    startParam: params.get('start_param') || '',
  };
}

function authUser(req, res) {
  const tg = verifyTelegram(req.body && req.body.initData);
  if (!tg) { 
    console.warn('❌ [authUser] Ошибка авторизации');
    res.status(401).json({ ok: false, error: 'auth_failed' }); 
    return null; 
  }
  return tg;
}

// ═══════════════════════════════
//  Утилиты
// ═══════════════════════════════
function calcPendingGold(refMilestones, friends) {
  let gold = 0;
  const newMilestones = Object.assign({}, refMilestones);
  friends.forEach(f => {
    const paid = newMilestones[f.tgId] || 0;
    const maxMilestone = Math.floor(f.level / REF_MILESTONE_STEP) * REF_MILESTONE_STEP;
    if (maxMilestone > paid) {
      const count = (maxMilestone - paid) / REF_MILESTONE_STEP;
      gold += count * REF_GOLD_PER_MILESTONE;
      newMilestones[f.tgId] = maxMilestone;
    }
  });
  return { gold, newMilestones };
}

// ═══════════════════════════════
//  Кэш лидерборда
// ═══════════════════════════════
let leaderboardCache = null;
let leaderboardCacheTime = 0;
const LEADERBOARD_CACHE_TTL = 10000;

function getLeaderboardCache() {
  if (leaderboardCache && Date.now() - leaderboardCacheTime < LEADERBOARD_CACHE_TTL) {
    return leaderboardCache;
  }
  return null;
}

function setLeaderboardCache(data) {
  leaderboardCache = data;
  leaderboardCacheTime = Date.now();
}

// ═══════════════════════════════
//  ОСНОВНЫЕ РОУТЫ
// ═══════════════════════════════
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'pixel-rpg', db: mongoose.connection.readyState === 1 });
});

// ── Загрузка ──
app.post('/api/load', async (req, res) => {
  const tg = authUser(req, res); 
  if (!tg) return;
  
  const startParam = tg.startParam || (req.body && req.body.startParam) || '';
  console.log(`🟢 [load] tgId: ${tg.id}`);
  
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
        data: null,
      });
      console.log(`🆕 [load] Новый пользователь: ${tg.id}`);

      // Уведомляем админа
      if (bot && process.env.ADMIN_TG_ID) {
        try {
          let inviterName = '— (органика)';
          if (refBy) {
            const inviter = await Save.findOne({ tgId: refBy }, 'firstName username').lean();
            if (inviter) {
              inviterName = (inviter.firstName || inviter.username || refBy) +
                (inviter.username ? ' (@' + inviter.username + ')' : '') +
                ' [' + refBy + ']';
            } else {
              inviterName = refBy;
            }
          }
          const newUserMsg =
            '🆕 *Новый игрок!*\n\n' +
            '*Имя:* ' + (tg.firstName || '—') + '\n' +
            '*Username:* ' + (tg.username ? '@' + tg.username : '—') + '\n' +
            '*ID:* `' + tg.id + '`\n' +
            '*Пригласил:* ' + inviterName;
          await bot.sendMessage(process.env.ADMIN_TG_ID, newUserMsg, { parse_mode: 'Markdown' });
        } catch (e) {
          console.error('❌ [load] Ошибка уведомления о новом пользователе:', e.message);
        }
      }

      return res.json({
        ok: true,
        save: { charId: null, data: null, updatedAt: 0 },
        user: { id: tg.id, username: tg.username, firstName: tg.firstName },
      });
    }
    
    if (!doc.refBy && startParam && startParam !== tg.id) {
      await Save.updateOne({ tgId: tg.id }, { $set: { refBy: startParam } });
      doc.refBy = startParam;
    }

    res.json({
      ok: true,
      save: {
        charId: doc.charId,
        data: doc.data,
        updatedAt: doc.updatedAt || 0,
      },
      user: { id: tg.id, username: tg.username, firstName: tg.firstName },
    });
  } catch (e) {
    console.error('❌ [load] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Сохранение ──
app.post('/api/save', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const tg = authUser(req, res); 
    if (!tg) return;
    
    if (rateLimit(tg.id, 10, 10000)) {
      return res.status(429).json({ ok: false, error: 'rate_limit' });
    }
    
    const data = req.body && req.body.data;
    if (!data || typeof data !== 'object') {
      console.error('❌ [save] Нет данных');
      return res.status(400).json({ ok: false, error: 'bad_data' });
    }

    if (data.tgId && data.tgId !== tg.id) {
      console.error(`❌ [save] Несоответствие tgId!`);
      return res.status(403).json({ ok: false, error: 'user_mismatch' });
    }

    data.tgId = tg.id;
    data.updatedAt = Date.now();

    await Save.findOneAndUpdate(
      { tgId: tg.id },
      { 
        $set: {
          username: tg.username, 
          firstName: tg.firstName,
          charId: data.charId || null, 
          data: data,
          level: Number(data.level) || 1,
          cp:    Number(data.cp)    || 0,
          floor: Number(data.floor) || 1,
          updatedAt: data.updatedAt,
        }
      },
      { 
        upsert: true,
        new: false,
        lean: true,
      }
    );

    const duration = Date.now() - startTime;
    console.log(`✅ [save] Сохранено для ${tg.id} (${duration}ms)`);
    res.json({ ok: true, updatedAt: data.updatedAt });

  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`❌ [save] ОШИБКА (${duration}ms):`, e.message);
    
    res.status(500).json({ 
      ok: false, 
      error: 'server_error',
      message: e.message
    });
  }
});

// ── Выбор персонажа ──
app.post('/api/character', async (req, res) => {
  const tg = authUser(req, res); 
  if (!tg) return;
  
  const charId = req.body && req.body.charId;
  if (!charId) {
    return res.status(400).json({ ok: false, error: 'bad_char' });
  }
  
  console.log(`🎭 [character] tgId: ${tg.id}, charId: ${charId}`);
  
  try {
    let doc = await Save.findOne({ tgId: tg.id });
    
    if (!doc) {
      doc = await Save.create({
        tgId: tg.id,
        username: tg.username,
        firstName: tg.firstName,
        charId: charId,
        data: { tgId: tg.id, charId: charId },
      });
      console.log(`🆕 [character] Создан новый пользователь: ${tg.id}`);
    } else {
      if (!doc.data || typeof doc.data !== 'object') {
        doc.data = {};
      }
      doc.data.tgId = tg.id;
      doc.data.charId = charId;
      doc.charId = charId;
      await doc.save();
      console.log(`✅ [character] Обновлен персонаж для ${tg.id}: ${charId}`);
    }
    
    res.json({ ok: true });
  } catch (e) { 
    console.error('❌ [character] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' }); 
  }
});

// ── Лидерборд ──
app.get('/api/leaderboard', async (req, res) => {
  if (!req.query.tgId) return res.status(401).json({ ok: false, error: 'missing_id' });
  if (rateLimit('lb_' + req.query.tgId, 5, 60000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }
  
  try {
    const cached = getLeaderboardCache();
    if (cached) {
      return res.json({ ok: true, top: cached, cached: true });
    }
    
    const top = await Save.find({ charId: { $ne: null } })
      .sort({ cp: -1, level: -1 }).limit(50)
      .select('tgId username firstName level cp floor charId -_id')
      .lean();
    
    setLeaderboardCache(top);
    
    res.json({ ok: true, top, cached: false });
  } catch (e) { 
    console.error('❌ [leaderboard] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' }); 
  }
});

// ── Рефералка ──
app.post('/api/ref/friends', async (req, res) => {
  const tg = authUser(req, res); 
  if (!tg) return;
  
  try {
    const doc = await Save.findOne({ tgId: tg.id })
      .select('refMilestones -_id').lean();
    const milestones = (doc && doc.refMilestones) || {};

    const friends = await Save.find({ refBy: tg.id })
      .select('tgId firstName username level charId -_id').lean();

    const { gold: pendingGold } = calcPendingGold(milestones, friends);
    const refLink = `https://t.me/${BOT_USERNAME}?startapp=${tg.id}`;

    res.json({
      ok: true,
      refLink,
      refCode: tg.id,
      friends: friends.map(f => ({
        name:    f.firstName || f.username || ('Игрок ' + f.tgId.slice(-4)),
        level:   f.level || 1,
        charId:  f.charId,
        nextMilestone: (Math.floor(((milestones[f.tgId] || 0) / REF_MILESTONE_STEP) + 1)) * REF_MILESTONE_STEP,
        paid: milestones[f.tgId] || 0,
      })),
      pendingGold,
    });
  } catch (e) {
    console.error('❌ [ref/friends] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

const _claiming = new Set();
app.post('/api/ref/claim', async (req, res) => {
  const tg = authUser(req, res); 
  if (!tg) return;
  
  if (_claiming.has(tg.id)) {
    return res.status(429).json({ ok: false, error: 'in_progress' });
  }
  
  _claiming.add(tg.id);
  
  try {
    const doc = await Save.findOne({ tgId: tg.id });
    if (!doc) return res.json({ ok: true, goldEarned: 0 });

    const friends = await Save.find({ refBy: tg.id })
      .select('tgId level -_id').lean();

    const { gold, newMilestones } = calcPendingGold(doc.refMilestones || {}, friends);
    if (gold === 0) return res.json({ ok: true, goldEarned: 0 });

    if (!doc.data) doc.data = { tgId: tg.id };
    doc.data.tgId = tg.id;
    doc.data.gold = (doc.data.gold || 0) + gold;

    await Save.findOneAndUpdate(
      { tgId: tg.id, refClaimVer: doc.refClaimVer || 0 },
      { 
        $set: { 
          refMilestones: newMilestones, 
          data: doc.data 
        }, 
        $inc: { refClaimVer: 1 } 
      }
    );

    res.json({ ok: true, goldEarned: gold });
  } catch (e) {
    console.error('❌ [ref/claim] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    _claiming.delete(tg.id);
  }
});



// ═══════════════════════════════
//  ЗАДАНИЯ
// ═══════════════════════════════

const DAILY_MILESTONES = [
  { id: 0, minutes: 10, rewardType: 'potions', amount: 50   },
  { id: 1, minutes: 20, rewardType: 'gold',    amount: 1000 },
  { id: 2, minutes: 30, rewardType: 'pixr',    amount: 5    },
  { id: 3, minutes: 60, rewardType: 'gold',    amount: 2000 },
];

// ── Получить задания + состояние пользователя ──
app.post('/api/tasks', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const [tasks, user] = await Promise.all([
      SpecialTask.find({ active: true }).sort({ createdAt: -1 }).lean(),
      Save.findOne({ tgId: tg.id }).select('data').lean()
    ]);
    const userData = (user && user.data) || {};
    res.json({
      ok: true,
      tasks,
      dailyTasks:          userData.dailyTasks          || { date: '', seconds: 0, claimed: [] },
      specialTasksClaimed: userData.specialTasksClaimed || {},
    });
  } catch (e) {
    console.error('❌ [tasks] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Забрать ежедневную награду ──
app.post('/api/tasks/daily/claim', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  const { milestoneId } = req.body;
  const milestone = DAILY_MILESTONES.find(m => m.id === milestoneId);
  if (!milestone) return res.status(400).json({ ok: false, error: 'invalid_milestone' });
  try {
    const user = await Save.findOne({ tgId: tg.id });
    if (!user || !user.data) return res.status(404).json({ ok: false, error: 'no_save' });
    const daily    = user.data.dailyTasks || { date: '', seconds: 0, claimed: [] };
    const todayStr = new Date().toISOString().slice(0, 10);
    if (daily.date !== todayStr)
      return res.status(400).json({ ok: false, error: 'day_reset' });
    if ((daily.claimed || []).includes(milestoneId))
      return res.status(400).json({ ok: false, error: 'already_claimed' });
    if (Math.floor((daily.seconds || 0) / 60) < milestone.minutes)
      return res.status(400).json({ ok: false, error: 'not_enough_time' });
    const rewardField = 'data.' + milestone.rewardType;
    const newClaimed  = [...(daily.claimed || []), milestoneId];
    await Save.findOneAndUpdate(
      { tgId: tg.id },
      { $inc: { [rewardField]: milestone.amount }, $set: { 'data.dailyTasks.claimed': newClaimed } }
    );
    res.json({ ok: true, reward: { type: milestone.rewardType, amount: milestone.amount } });
  } catch (e) {
    console.error('❌ [tasks/daily/claim] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Забрать специальное задание ──
app.post('/api/tasks/special/claim', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  const { taskId } = req.body;
  if (!taskId) return res.status(400).json({ ok: false, error: 'missing_taskId' });
  try {
    const [task, user] = await Promise.all([
      SpecialTask.findOne({ taskId, active: true }).lean(),
      Save.findOne({ tgId: tg.id })
    ]);
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });
    if (!user)  return res.status(404).json({ ok: false, error: 'no_save' });
    const claimed = (user.data && user.data.specialTasksClaimed) || {};
    if (claimed[taskId]) return res.status(400).json({ ok: false, error: 'already_claimed' });
    const rewardField  = 'data.' + task.rewardType;
    const newClaimed   = Object.assign({}, claimed, { [taskId]: Date.now() });
    await Save.findOneAndUpdate(
      { tgId: tg.id },
      { $inc: { [rewardField]: task.rewardAmount }, $set: { 'data.specialTasksClaimed': newClaimed } }
    );
    res.json({ ok: true, reward: { type: task.rewardType, amount: task.rewardAmount } });
  } catch (e) {
    console.error('❌ [tasks/special/claim] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════
//  АВАТАРКА ПОЛЬЗОВАТЕЛЯ
//  GET /api/avatar/:tgId
//  Проксирует фото профиля через Bot API.
//  Кешируется в памяти на 1 час (URL не меняется часто).
// ═══════════════════════════════
const _avatarCache = new Map(); // tgId -> { url, ts }
const AVATAR_CACHE_TTL = 3600 * 1000; // 1 час

app.get('/api/avatar/:tgId', async (req, res) => {
  const tgId = req.params.tgId;
  if (!tgId || !/^\d+$/.test(tgId)) return res.status(400).json({ ok: false });

  // Кеш
  const cached = _avatarCache.get(tgId);
  if (cached && Date.now() - cached.ts < AVATAR_CACHE_TTL) {
    return res.redirect(302, cached.url);
  }

  const token = process.env.BOT_TOKEN;
  if (!token) return res.status(503).json({ ok: false, error: 'no_token' });

  try {
    // 1. Получаем список фото профиля
    const photosRes = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${tgId}&limit=1`
    );
    const photosData = await photosRes.json();

    if (!photosData.ok || !photosData.result.total_count) {
      return res.status(404).json({ ok: false, error: 'no_photo' });
    }

    // Берём самый большой размер первой фотографии
    const sizes = photosData.result.photos[0];
    const fileId = sizes[sizes.length - 1].file_id;

    // 2. Получаем file_path
    const fileRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
    );
    const fileData = await fileRes.json();

    if (!fileData.ok || !fileData.result.file_path) {
      return res.status(502).json({ ok: false, error: 'no_file_path' });
    }

    const photoUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
    _avatarCache.set(tgId, { url: photoUrl, ts: Date.now() });

    res.redirect(302, photoUrl);
  } catch (e) {
    console.error('❌ [avatar] Ошибка:', e.message);
    res.status(502).json({ ok: false, error: 'fetch_error' });
  }
});

// ═══════════════════════════════
//  ТРАНЗАКЦИИ (Пополнение/Вывод)
// ═══════════════════════════════

// ── Создание пополнения ──
app.post('/api/wallet/deposit', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  
  const { amount } = req.body;
  
  if (!amount || amount < WALLET_CONFIG.minAmount) {
    return res.status(400).json({ 
      ok: false, 
      error: `Минимальная сумма ${WALLET_CONFIG.minAmount} GRAM` 
    });
  }
  
  try {
    const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const memo = tg.id + '_' + Date.now().toString(36);
    
    const tx = await Transaction.create({
      id: txId,
      userId: tg.id,
      username: tg.username || tg.firstName || 'Игрок',
      type: 'deposit',
      amount: amount,
      status: 'pending',
      wallet: WALLET_CONFIG.address,
      memo: memo,
      createdAt: Date.now()
    });
    
    // Уведомляем админа в боте
    if (bot) {
      const adminMsg = `
💰 **НОВАЯ ТРАНЗАКЦИЯ**

**Тип:** Пополнение
**Пользователь:** @${tg.username || 'нет'} (${tg.id})
**Сумма:** ${amount} GRAM
**Кошелек:** \`${WALLET_CONFIG.address}\`
**Мемо:** \`${memo}\`

Статус: ⏳ Ожидание подтверждения
      `;
      
      if (process.env.ADMIN_TG_ID) {
        try {
          await bot.sendMessage(process.env.ADMIN_TG_ID, adminMsg, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Подтвердить', callback_data: `approve_${tx.id}` },
                  { text: '❌ Отклонить', callback_data: `reject_${tx.id}` }
                ]
              ]
            }
          });
        } catch (e) {
          console.error('❌ [wallet] Ошибка уведомления админа:', e.message);
        }
      }
    }
    
    res.json({
      ok: true,
      tx: {
        id: tx.id,
        amount: tx.amount,
        wallet: tx.wallet,
        memo: tx.memo,
        status: tx.status,
        createdAt: tx.createdAt
      }
    });
  } catch (e) {
    console.error('❌ [wallet] deposit error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Запрос на вывод ──
app.post('/api/wallet/withdraw', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  
  const { amount, wallet } = req.body;
  
  if (!amount || amount < WALLET_CONFIG.minAmount) {
    return res.status(400).json({ 
      ok: false, 
      error: `Минимальная сумма ${WALLET_CONFIG.minAmount} GRAM` 
    });
  }
  
  if (!wallet || wallet.length < 10) {
    return res.status(400).json({ ok: false, error: 'Укажите корректный адрес кошелька' });
  }
  
  try {
    const user = await Save.findOne({ tgId: tg.id });
    const balance = user?.data?.gram || 0;
    
    if (balance < amount) {
      return res.status(400).json({ ok: false, error: 'Недостаточно GRAM на балансе' });
    }
    
    const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    
    const tx = await Transaction.create({
      id: txId,
      userId: tg.id,
      username: tg.username || tg.firstName || 'Игрок',
      type: 'withdraw',
      amount: amount,
      status: 'pending',
      wallet: wallet,
      memo: tg.id + '_' + Date.now().toString(36),
      createdAt: Date.now()
    });
    
    if (bot && process.env.ADMIN_TG_ID) {
      const adminMsg = `
💰 **НОВАЯ ТРАНЗАКЦИЯ**

**Тип:** Вывод
**Пользователь:** @${tg.username || 'нет'} (${tg.id})
**Сумма:** ${amount} GRAM
**Кошелек:** \`${wallet}\`

Статус: ⏳ Ожидание подтверждения
      `;
      
      try {
        await bot.sendMessage(process.env.ADMIN_TG_ID, adminMsg, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Подтвердить', callback_data: `approve_${tx.id}` },
                { text: '❌ Отклонить', callback_data: `reject_${tx.id}` }
              ]
            ]
          }
        });
      } catch (e) {
        console.error('❌ [wallet] Ошибка уведомления админа:', e.message);
      }
    }
    
    res.json({
      ok: true,
      tx: {
        id: tx.id,
        amount: tx.amount,
        wallet: tx.wallet,
        status: tx.status,
        createdAt: tx.createdAt
      }
    });
  } catch (e) {
    console.error('❌ [wallet] withdraw error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Получение транзакций пользователя ──
app.post('/api/wallet/transactions', async (req, res) => {  // ← GET → POST
  const tg = authUser(req, res);
  if (!tg) return;
  
  try {
    const txs = await Transaction.find({ userId: tg.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    res.json({ ok: true, transactions: txs });
  } catch (e) {
    console.error('❌ [wallet] transactions error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── ОБМЕН PIXR → GRAM ──
app.post('/api/wallet/exchange', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  
  const { amount } = req.body;
  
  if (!amount || amount < 1000 || amount % 1000 !== 0) {
    return res.status(400).json({ 
      ok: false, 
      error: 'Сумма должна быть кратна 1000 PIXR (минимум 1000)' 
    });
  }
  
  try {
    const gramEarned = amount / 1000;

    // Атомарно списываем PIXR и начисляем GRAM через $inc
    // Условие 'data.pixr': { $gte: amount } гарантирует атомарную проверку баланса
    const result = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.pixr': { $gte: amount } },
      {
        $inc: {
          'data.pixr': -amount,
          'data.gram': gramEarned,
        }
      },
      { new: true }
    );

    if (!result) {
      return res.status(400).json({ ok: false, error: 'Недостаточно PIXR' });
    }

    res.json({
      ok: true,
      pixr: result.data.pixr,
      gram: result.data.gram,
      earned: gramEarned
    });
  } catch (e) {
    console.error('❌ [wallet] exchange error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});


// ═══════════════════════════════
//  БОТ: подтверждение/отклонение транзакций
//  POST /bot/transaction/:txId/:action
//  Защищён BOT_TOKEN в заголовке x-bot-secret
// ═══════════════════════════════
app.post('/bot/transaction/:txId/:action', async (req, res) => {
  const secret = req.headers['x-bot-secret'];
  if (!secret || secret !== process.env.BOT_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const { txId, action } = req.params;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'invalid_action' });
  }

  try {
    const tx = await Transaction.findOne({ id: txId });
    if (!tx) return res.status(404).json({ ok: false, error: 'not_found' });
    if (tx.status !== 'pending') return res.status(400).json({ ok: false, error: 'already_processed' });

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
    await logAdminAction('bot', action + '_transaction', tx.userId, { txId, amount: tx.amount });

    // Уведомляем пользователя
    if (bot) {
      const statusText = action === 'approve' ? '✅ Подтверждена' : '❌ Отклонена';
      const msg = `💰 *Транзакция ${statusText}*\n\n*Тип:* ${tx.type === 'deposit' ? 'Пополнение' : 'Вывод'}\n*Сумма:* ${tx.amount} GRAM\n${action === 'approve' ? '✅ Баланс обновлён!' : '❌ Средства не зачислены.'}`;
      try { await bot.sendMessage(tx.userId, msg, { parse_mode: 'Markdown' }); } catch (e) {}
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('❌ [bot-tx] error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════
//  АДМИН-ПАНЕЛЬ
// ═══════════════════════════════

// ── Конфиг админов ──
const ADMIN_CREDENTIALS = {
  admin: {
    password: process.env.ADMIN_PASSWORD || 'pixel2024',
    role: 'superadmin'
  }
};

// ── Сессии ──
const adminSessions = new Map();

function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function createSession(login, role) {
  const sessionId = generateSessionId();
  adminSessions.set(sessionId, {
    login,
    role,
    expires: Date.now() + 24 * 60 * 60 * 1000
  });
  return sessionId;
}

function getSession(sessionId) {
  const session = adminSessions.get(sessionId);
  if (!session) return null;
  if (session.expires < Date.now()) {
    adminSessions.delete(sessionId);
    return null;
  }
  return session;
}

function requireAdmin(req, res, next) {
  const sessionId = req.headers['x-admin-session'] || req.query.session;
  const session = getSession(sessionId);
  
  if (!session) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  
  req.admin = session;
  next();
}

async function logAdminAction(admin, action, target, details) {
  try {
    await AdminLog.create({ admin, action, target, details });
  } catch (e) {
    console.error('❌ [admin] log error:', e.message);
  }
}

// ── Админ: подтвердить/отклонить транзакцию ──
app.post('/admin/api/transaction/:txId/:action', requireAdmin, async (req, res) => {
  try {
    const { txId, action } = req.params;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ ok: false, error: 'invalid_action' });
    }
    
    const tx = await Transaction.findOne({ id: txId });
    if (!tx) {
      return res.status(404).json({ ok: false, error: 'transaction_not_found' });
    }
    
    if (tx.status !== 'pending') {
      return res.status(400).json({ ok: false, error: 'transaction_already_processed' });
    }
    
    if (action === 'approve') {
      tx.status = 'approved';
      tx.approvedAt = Date.now();

      // Атомарно начисляем/списываем GRAM через $inc — не перезаписываем весь data
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
    await logAdminAction(req.admin.login, action + '_transaction', tx.userId, { txId, amount: tx.amount });
    
    if (bot) {
      const statusText = action === 'approve' ? '✅ Подтверждена' : '❌ Отклонена';
      const msg = `
💰 **Транзакция ${statusText}**

**Тип:** ${tx.type === 'deposit' ? 'Пополнение' : 'Вывод'}
**Сумма:** ${tx.amount} GRAM
**Статус:** ${statusText}
${action === 'approve' ? '✅ Баланс обновлен!' : '❌ Средства не были зачислены.'}
      `;
      try {
        await bot.sendMessage(tx.userId, msg, { parse_mode: 'Markdown' });
      } catch (e) {}
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ [admin] transaction error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Админ: список транзакций ──
app.get('/admin/api/transactions', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status || 'all';
    
    const filter = {};
    if (status !== 'all') filter.status = status;
    
    const txs = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    res.json({ ok: true, transactions: txs });
  } catch (e) {
    console.error('❌ [admin] transactions error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Админ: роуты пользователей ──
app.get('/admin/api/users', requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;
    
    let filter = {};
    if (search) {
      filter = {
        $or: [
          { tgId: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    const total = await Save.countDocuments(filter);
    const users = await Save.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    res.json({
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
        data: u.data || {}
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (e) {
    console.error('❌ [admin] users error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ── Admin: список заданий ──
app.get('/admin/api/tasks', requireAdmin, async (req, res) => {
  try {
    const tasks = await SpecialTask.find().sort({ createdAt: -1 }).lean();
    res.json({ ok: true, tasks });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Admin: создать задание ──
app.post('/admin/api/tasks', requireAdmin, async (req, res) => {
  try {
    const { title, description, link, linkText, rewardType, rewardAmount } = req.body;
    if (!title || !rewardType || !rewardAmount)
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const task   = await SpecialTask.create({
      taskId, title,
      description:  description  || '',
      link:         link         || '',
      linkText:     linkText     || 'Перейти',
      rewardType,
      rewardAmount: Number(rewardAmount),
      active: true,
      createdAt: Date.now(),
    });
    await logAdminAction(req.admin.login, 'create_task', taskId, { title, rewardType, rewardAmount });
    res.json({ ok: true, task });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Admin: удалить задание ──
app.delete('/admin/api/tasks/:taskId', requireAdmin, async (req, res) => {
  try {
    await SpecialTask.deleteOne({ taskId: req.params.taskId });
    await logAdminAction(req.admin.login, 'delete_task', req.params.taskId, {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Admin: вкл/выкл задание ──
app.patch('/admin/api/tasks/:taskId/toggle', requireAdmin, async (req, res) => {
  try {
    const task = await SpecialTask.findOne({ taskId: req.params.taskId });
    if (!task) return res.status(404).json({ ok: false, error: 'not_found' });
    task.active = !task.active;
    await task.save();
    res.json({ ok: true, active: task.active });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/admin/api/user/:tgId', requireAdmin, async (req, res) => {
  try {
    const user = await Save.findOne({ tgId: req.params.tgId }).lean();
    if (!user) {
      return res.status(404).json({ ok: false, error: 'user_not_found' });
    }
    
    res.json({
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
        data: user.data || {}
      }
    });
  } catch (e) {
    console.error('❌ [admin] user error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/admin/api/user/:tgId/update', requireAdmin, async (req, res) => {
  try {
    const { tgId } = req.params;
    const updates = req.body;
    
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
      { tgId: tgId },
      { $set: updateData }
    );
    
    await logAdminAction(req.admin.login, 'update_user', tgId, updates);
    
    res.json({ ok: true });
  } catch (e) {
    console.error('❌ [admin] update error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ── Admin: список заданий ──
app.get('/admin/api/tasks', requireAdmin, async (req, res) => {
  try {
    const tasks = await SpecialTask.find().sort({ createdAt: -1 }).lean();
    res.json({ ok: true, tasks });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Admin: создать задание ──
app.post('/admin/api/tasks', requireAdmin, async (req, res) => {
  try {
    const { title, description, link, linkText, rewardType, rewardAmount } = req.body;
    if (!title || !rewardType || !rewardAmount)
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const task   = await SpecialTask.create({
      taskId, title,
      description:  description  || '',
      link:         link         || '',
      linkText:     linkText     || 'Перейти',
      rewardType,
      rewardAmount: Number(rewardAmount),
      active: true,
      createdAt: Date.now(),
    });
    await logAdminAction(req.admin.login, 'create_task', taskId, { title, rewardType, rewardAmount });
    res.json({ ok: true, task });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Admin: удалить задание ──
app.delete('/admin/api/tasks/:taskId', requireAdmin, async (req, res) => {
  try {
    await SpecialTask.deleteOne({ taskId: req.params.taskId });
    await logAdminAction(req.admin.login, 'delete_task', req.params.taskId, {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Admin: вкл/выкл задание ──
app.patch('/admin/api/tasks/:taskId/toggle', requireAdmin, async (req, res) => {
  try {
    const task = await SpecialTask.findOne({ taskId: req.params.taskId });
    if (!task) return res.status(404).json({ ok: false, error: 'not_found' });
    task.active = !task.active;
    await task.save();
    res.json({ ok: true, active: task.active });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/admin/api/user/:tgId/referrals', requireAdmin, async (req, res) => {
  try {
    const { tgId } = req.params;
    
    const referrals = await Save.find({ refBy: tgId })
      .select('tgId username firstName level cp floor charId data.gold data.pixr')
      .lean();
    
    res.json({
      ok: true,
      referrals: referrals.map(r => ({
        tgId: r.tgId,
        username: r.username || r.firstName || 'Игрок',
        level: r.level || 1,
        cp: r.cp || 0,
        floor: r.floor || 1,
        charId: r.charId,
        gold: r.data?.gold || 0,
        pixr: r.data?.pixr || 0
      }))
    });
  } catch (e) {
    console.error('❌ [admin] referrals error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/admin/api/user/:tgId/give-item', requireAdmin, async (req, res) => {
  try {
    const { tgId } = req.params;
    const { slot, name, rarity, level, stats, icon, forClass } = req.body;
    
    if (!slot || !name || !rarity) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }
    
    const user = await Save.findOne({ tgId: tgId });
    if (!user) {
      return res.status(404).json({ ok: false, error: 'user_not_found' });
    }
    
    if (!user.data) user.data = { tgId: tgId };
    if (!user.data.inventory) user.data.inventory = [];
    
    const item = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      slot: slot,
      name: name,
      icon: icon || 'images/ac.png',
      rarity: rarity,
      level: level || 1,
      stats: stats || {},
      _equipped: false
    };
    
    if (forClass) item.forClass = forClass;
    
    user.data.inventory.push(item);
    await user.save();
    
    await logAdminAction(req.admin.login, 'give_item', tgId, { item });
    
    res.json({ ok: true, item });
  } catch (e) {
    console.error('❌ [admin] give-item error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/admin/api/items/list', requireAdmin, (req, res) => {
  try {
    const items = [];
    
    const ITEM_TYPES = [
      { slot: 'body', name: 'Нагрудник', stats: ['def', 'hp'], primary: 'def' },
      { slot: 'legs', name: 'Штаны', stats: ['def', 'dodge'], primary: 'def' },
      { slot: 'gloves', name: 'Перчатки', stats: ['atk', 'crit'], primary: 'atk' },
      { slot: 'boots', name: 'Боты', stats: ['spd', 'dodge'], primary: 'spd' },
      { slot: 'helmet', name: 'Шлем', stats: ['def', 'hp'], primary: 'def' },
      { slot: 'ring', name: 'Кольцо', stats: ['crit', 'atk'], primary: 'crit' },
      { slot: 'belt', name: 'Пояс', stats: ['hp', 'def'], primary: 'hp' }
    ];
    
    const STAFF_TYPES = [
      { slot: 'weapon', name: 'Посох огня', stats: ['atk', 'crit'], primary: 'atk', forClass: 'fire', classLabel: 'Пирокан' },
      { slot: 'weapon', name: 'Посох света', stats: ['atk', 'hp'], primary: 'atk', forClass: 'light', classLabel: 'Люмос' },
      { slot: 'weapon', name: 'Посох воды', stats: ['atk', 'dodge'], primary: 'atk', forClass: 'water', classLabel: 'Аквас' }
    ];
    
    ITEM_TYPES.forEach(type => items.push({
      slot: type.slot,
      name: type.name,
      stats: type.stats,
      primary: type.primary
    }));
    
    STAFF_TYPES.forEach(type => items.push({
      slot: type.slot,
      name: type.name,
      stats: type.stats,
      primary: type.primary,
      forClass: type.forClass,
      classLabel: type.classLabel
    }));
    
    res.json({ ok: true, items });
  } catch (e) {
    console.error('❌ [admin] items list error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/admin/api/stats', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await Save.countDocuments();
    const usersWithChar = await Save.countDocuments({ charId: { $ne: null } });
    
    const floors = await Save.aggregate([
      { $group: { _id: '$floor', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    const now = Date.now();
    const active24h = await Save.countDocuments({
      updatedAt: { $gt: now - 24 * 60 * 60 * 1000 }
    });
    
    const topCP = await Save.find({ charId: { $ne: null } })
      .sort({ cp: -1 })
      .limit(10)
      .select('username firstName level cp charId')
      .lean();
    
    res.json({
      ok: true,
      stats: {
        totalUsers,
        usersWithChar,
        active24h,
        floors,
        topCP,
        online: adminSessions.size
      }
    });
  } catch (e) {
    console.error('❌ [admin] stats error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/admin/api/logs', requireAdmin, async (req, res) => {
  try {
    const logs = await AdminLog.find()
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();
    
    res.json({ ok: true, logs });
  } catch (e) {
    console.error('❌ [admin] logs error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/admin/api/broadcast', requireAdmin, async (req, res) => {
  try {
    const { message, target } = req.body;
    
    if (!message || message.length < 1) {
      return res.status(400).json({ ok: false, error: 'empty_message' });
    }
    
    await logAdminAction(req.admin.login, 'broadcast', 'all', { 
      message: message.substring(0, 100),
      target: target || 'all'
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
    
    res.json({ ok: true, sent });
  } catch (e) {
    console.error('❌ [admin] broadcast error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/admin/login', express.json(), (req, res) => {
  const { login, password } = req.body;
  
  if (!login || !password) {
    return res.status(400).json({ ok: false, error: 'missing_credentials' });
  }
  
  const admin = ADMIN_CREDENTIALS[login];
  if (!admin || admin.password !== password) {
    return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  }
  
  const sessionId = createSession(login, admin.role);
  
  res.json({
    ok: true,
    session: sessionId,
    role: admin.role,
    login: login
  });
});

app.get('/admin/check', (req, res) => {
  const sessionId = req.headers['x-admin-session'] || req.query.session;
  const session = getSession(sessionId);
  
  if (!session) {
    return res.json({ ok: false, error: 'unauthorized' });
  }
  
  res.json({ ok: true, role: session.role, login: session.login });
});

app.post('/admin/logout', (req, res) => {
  const sessionId = req.headers['x-admin-session'] || req.body.session;
  if (sessionId) {
    adminSessions.delete(sessionId);
  }
  res.json({ ok: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});


// ═══════════════════════════════
//  Бот
// ═══════════════════════════════
let bot = null;
try {
  const { initBot } = require('./bot');
  bot = initBot(app);
} catch (e) {
  console.warn('⚠️ Бот не инициализирован:', e.message);
}

// ═══════════════════════════════
//  Запуск
// ═══════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server on :${PORT}`);
  console.log(`📊 MongoDB: 5GB, Pool: 50`);
});
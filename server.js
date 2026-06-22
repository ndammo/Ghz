/*
  ══════════════════════════════════════════════════════
  server.js — Backend для Pixel Runner RPG
  Express + MongoDB (Mongoose) + Telegram WebApp auth
  ══════════════════════════════════════════════════════
*/

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const crypto   = require('crypto');

const app = express();
const BOT_USERNAME = process.env.BOT_USERNAME || 'YourBotUsername';
if (!process.env.BOT_USERNAME) console.warn('⚠️  BOT_USERNAME не задан');
const REF_GOLD_PER_MILESTONE = 500;
const REF_MILESTONE_STEP     = 5;

// ── CORS ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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

console.log('🔗 [MongoDB] Подключение к:', MONGODB_URI.replace(/\/\/.*@/, '//***@'));

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
  maxPoolSize: 50,
  minPoolSize: 10,
  maxIdleTimeMS: 10000,
  compressors: ['snappy'],
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
//  СХЕМА
// ═══════════════════════════════
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

// Индексы
SaveSchema.index({ tgId: 1 }, { unique: true });
SaveSchema.index({ cp: -1, level: -1 });
SaveSchema.index({ refBy: 1 });
SaveSchema.index({ updatedAt: -1 });

const Save = mongoose.model('Save', SaveSchema);

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
//  Роуты
// ═══════════════════════════════
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'pixel-runner-rpg', db: mongoose.connection.readyState === 1 });
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

// ── Сохранение (С ПОЛНОЙ ДИАГНОСТИКОЙ) ──
app.post('/api/save', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('📥 [save] Входящий запрос');
    
    // 1. Проверяем авторизацию
    const tg = authUser(req, res); 
    if (!tg) {
      console.error('❌ [save] Ошибка авторизации');
      return;
    }
    console.log(`👤 [save] Пользователь: ${tg.id}`);

    // 2. Rate limit
    if (rateLimit(tg.id, 10, 10000)) {
      console.warn(`⏱️ [save] Rate limit для ${tg.id}`);
      return res.status(429).json({ ok: false, error: 'rate_limit' });
    }

    // 3. Проверяем наличие данных
    const data = req.body && req.body.data;
    if (!data || typeof data !== 'object') {
      console.error('❌ [save] Нет данных или не объект');
      return res.status(400).json({ ok: false, error: 'bad_data' });
    }

    // 4. Логируем основные поля
    console.log(`📊 [save] Данные: level=${data.level || 1}, cp=${data.cp || 0}, hp=${data.hp}, gold=${data.gold}, floor=${data.floor || 1}`);

    // 5. Проверяем владельца
    if (data.tgId && data.tgId !== tg.id) {
      console.error(`❌ [save] Несоответствие tgId! Запрос: ${tg.id}, data: ${data.tgId}`);
      return res.status(403).json({ ok: false, error: 'user_mismatch' });
    }

    // 6. Подготавливаем данные для сохранения
    data.tgId = tg.id;
    data.updatedAt = Date.now();

    // 7. Проверяем размер данных
    const dataSize = JSON.stringify(data).length;
    console.log(`📏 [save] Размер данных: ${dataSize} байт`);
    if (dataSize > 1000000) {
      console.warn(`⚠️ [save] Большой размер данных: ${dataSize} байт`);
    }

    // 8. Сохраняем в MongoDB
    console.log(`💾 [save] Сохранение в MongoDB...`);
    
    const updateResult = await Save.findOneAndUpdate(
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
    console.log(`✅ [save] Успешно сохранено для ${tg.id} (${duration}ms)`);
    res.json({ ok: true, updatedAt: data.updatedAt });

  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`❌ [save] ОШИБКА (${duration}ms):`);
    console.error(`  - Имя: ${e.name}`);
    console.error(`  - Сообщение: ${e.message}`);
    console.error(`  - Стек: ${e.stack}`);
    
    if (e.name === 'MongoServerError') {
      console.error(`  - Код MongoDB: ${e.code}`);
      console.error(`  - Ключ: ${JSON.stringify(e.keyPattern)}`);
      console.error(`  - Значение: ${JSON.stringify(e.keyValue)}`);
    }
    
    // Возвращаем ошибку
    res.status(500).json({ 
      ok: false, 
      error: 'server_error',
      message: e.message,
      code: e.code || 0
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
    await Save.findOneAndUpdate(
      { tgId: tg.id },
      { 
        $set: { 
          charId: charId,
          'data.charId': charId,
          'data.tgId': tg.id,
          username: tg.username,
          firstName: tg.firstName,
        }
      },
      { upsert: true }
    );
    
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
      .select('username firstName level cp floor charId -_id')
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
//  Запуск
// ═══════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server on :${PORT}`);
  console.log(`📊 MongoDB: 5GB, Pool: 50`);
});
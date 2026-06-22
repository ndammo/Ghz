/*
  ══════════════════════════════════════════════════════
  server.js — Backend для Pixel Runner RPG
  Express + MongoDB (Mongoose) + Telegram WebApp auth

  ❌ БЕЗ REDIS — только MongoDB
  ══════════════════════════════════════════════════════
*/

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const crypto   = require('crypto');

const app = express();
const BOT_USERNAME = process.env.BOT_USERNAME || 'YourBotUsername';
if (!process.env.BOT_USERNAME) console.warn('⚠️  BOT_USERNAME не задан — реферальные ссылки сломаны!');
const REF_GOLD_PER_MILESTONE = 500;
const REF_MILESTONE_STEP     = 5;

// ── Rate limiter ──
const _rl = new Map();
function rateLimit(tgId, maxReqs, windowMs) {
  const now = Date.now();
  let e = _rl.get(tgId);
  if (!e || now > e.reset) { _rl.set(tgId, { n: 1, reset: now + windowMs }); return false; }
  if (++e.n > maxReqs) return true;
  return false;
}
setInterval(() => { const now = Date.now(); _rl.forEach((v, k) => { if (now > v.reset) _rl.delete(k); }); }, 300000);

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
if (!MONGODB_URI) console.error('❌ MONGODB_URI не задан');
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
  .then(() => console.log('✅ MongoDB подключена'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

const SaveSchema = new mongoose.Schema({
  tgId:      { type: String, required: true, unique: true, index: true },
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

const Save = mongoose.model('Save', SaveSchema);

// ═══════════════════════════════
//  Проверка подписи Telegram initData
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
//  Утилита: посчитать pending gold
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
//  Роуты
// ═══════════════════════════════
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'pixel-runner-rpg', db: mongoose.connection.readyState === 1 });
});

// ── Загрузка прогресса ──
app.post('/api/load', async (req, res) => {
  const tg = authUser(req, res); 
  if (!tg) return;
  
  const startParam = tg.startParam || (req.body && req.body.startParam) || '';
  console.log(`🟢 [load] tgId: ${tg.id}, startParam: ${startParam || 'none'}`);
  
  try {
    let doc = await Save.findOne({ tgId: tg.id });

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
      console.log(`🆕 [load] Новый пользователь: ${tg.id}, refBy: ${refBy || 'none'}`);
      
      return res.json({
        ok: true,
        save: {
          charId: null,
          data: null,
          updatedAt: 0,
        },
        user: { id: tg.id, username: tg.username, firstName: tg.firstName },
      });
    }
    
    if (!doc.refBy && startParam && startParam !== tg.id) {
      await Save.updateOne({ tgId: tg.id }, { $set: { refBy: startParam } });
      doc.refBy = startParam;
      console.log(`🔗 [load] Добавлен реферер для ${tg.id}: ${startParam}`);
    }

    if (doc.data && doc.data.tgId && doc.data.tgId !== tg.id) {
      console.error(`❌ [load] Несоответствие tgId! БД: ${doc.data.tgId}, запрос: ${tg.id}`);
      doc.data.tgId = tg.id;
      await doc.save();
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

// ── Сохранение полного снапшота ──
app.post('/api/save', async (req, res) => {
  const tg = authUser(req, res); 
  if (!tg) return;
  
  if (rateLimit(tg.id, 10, 10000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }
  
  const data = req.body && req.body.data;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ ok: false, error: 'bad_data' });
  }

  if (data.tgId && data.tgId !== tg.id) {
    console.error(`❌ [save] Попытка сохранить чужие данные! tgId из запроса: ${tg.id}, tgId в data: ${data.tgId}`);
    return res.status(403).json({ ok: false, error: 'user_mismatch' });
  }

  data.tgId = tg.id;
  data.updatedAt = Date.now();
  
  console.log(`💾 [save] tgId: ${tg.id}, level: ${data.level || 1}, cp: ${data.cp || 0}`);
  
  try {
    await Save.updateOne(
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
      { upsert: true }
    );
    res.json({ ok: true, updatedAt: data.updatedAt });
  } catch (e) {
    console.error('❌ [save] MongoDB error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
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
    } else {
      doc.charId = charId;
      if (!doc.data) doc.data = {};
      doc.data.charId = charId;
      doc.data.tgId = tg.id;
      await doc.save();
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
    const top = await Save.find({ charId: { $ne: null } })
      .sort({ cp: -1, level: -1 }).limit(50)
      .select('username firstName level cp floor charId -_id').lean();
    res.json({ ok: true, top });
  } catch (e) { 
    console.error('❌ [leaderboard] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' }); 
  }
});

// ── Реферальная система ──
app.post('/api/ref/friends', async (req, res) => {
  const tg = authUser(req, res); 
  if (!tg) return;
  
  console.log(`👥 [ref/friends] tgId: ${tg.id}`);
  
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
  console.log(`💰 [ref/claim] tgId: ${tg.id}`);
  
  try {
    const doc = await Save.findOne({ tgId: tg.id });
    if (!doc) return res.json({ ok: true, goldEarned: 0 });

    const friends = await Save.find({ refBy: tg.id })
      .select('tgId level -_id').lean();

    const { gold, newMilestones } = calcPendingGold(doc.refMilestones || {}, friends);
    if (gold === 0) return res.json({ ok: true, goldEarned: 0 });

    if (!doc.data) doc.data = { tgId: tg.id };
    if (doc.data.tgId !== tg.id) doc.data.tgId = tg.id;
    
    if (typeof doc.data.gold === 'number') {
      doc.data.gold += gold;
    } else {
      doc.data.gold = gold;
    }

    const result = await Save.findOneAndUpdate(
      { tgId: tg.id, refClaimVer: doc.refClaimVer || 0 },
      { 
        $set: { 
          refMilestones: newMilestones, 
          data: doc.data 
        }, 
        $inc: { refClaimVer: 1 } 
      },
      { new: false }
    );
    
    if (!result) return res.json({ ok: true, goldEarned: 0, error: 'concurrent' });

    console.log(`✅ [ref/claim] tgId: ${tg.id}, goldEarned: ${gold}`);
    res.json({ ok: true, goldEarned: gold });
  } catch (e) {
    console.error('❌ [ref/claim] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    _claiming.delete(tg.id);
  }
});

// ═══════════════════════════════
//  Запуск сервера
// ═══════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 Server on :' + PORT);
  try { require('./bot').initBot(app); } catch (e) { console.warn('Bot init skipped:', e.message); }
});
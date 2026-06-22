/*
  ══════════════════════════════════════════════════════
  server.js — Backend для Pixel Runner RPG
  Express + MongoDB (Mongoose) + Telegram WebApp auth

  Роуты:
    GET  /                    — health-check
    POST /api/load            — { initData, startParam }  -> { ok, save, user }
    POST /api/save            — { initData, data }        -> { ok, updatedAt }
    POST /api/character       — { initData, charId }      -> { ok }
    GET  /api/leaderboard     — топ игроков по CP
    POST /api/ref/friends     — { initData }              -> { ok, refLink, friends, pendingGold }
    POST /api/ref/claim       — { initData }              -> { ok, goldEarned }

  ENV (Railway -> Variables):
    MONGODB_URI    — строка подключения MongoDB Atlas
    BOT_TOKEN      — токен бота из @BotFather
    BOT_USERNAME   — username бота (без @), напр. PixelRunnerBot
    PORT           — задаётся Railway автоматически
    ALLOW_INSECURE — '1' чтобы пропускать проверку подписи (только для теста)
  ══════════════════════════════════════════════════════
*/

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const crypto   = require('crypto');

const app = express();
const BOT_USERNAME = process.env.BOT_USERNAME || 'YourBotUsername';
const REF_GOLD_PER_MILESTONE = 500;
const REF_MILESTONE_STEP     = 5;   // каждые 5 уровней друга

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
  // Денормализовано для лидерборда
  level:     { type: Number, default: 1 },
  cp:        { type: Number, default: 0 },
  floor:     { type: Number, default: 1 },
  updatedAt: { type: Number, default: 0 },
  // Реферальная система
  refBy:        { type: String, default: null },  // tgId пригласившего
  // Для каждого друга — максимальный уже вознаграждённый уровень
  // { "friendTgId": 10, "anotherFriend": 5 }
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
  if (!tg) { res.status(401).json({ ok: false, error: 'auth_failed' }); return null; }
  return tg;
}

// ═══════════════════════════════
//  Утилита: посчитать pending gold реферера
//  refMilestones — объект { friendId: highestPaidLevel }
//  friends — массив { tgId, level }
// ═══════════════════════════════
function calcPendingGold(refMilestones, friends) {
  let gold = 0;
  const newMilestones = Object.assign({}, refMilestones);
  friends.forEach(f => {
    const paid = newMilestones[f.tgId] || 0;
    // сколько ещё не оплаченных "пятёрок"
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
  const tg = authUser(req, res); if (!tg) return;
  // startParam может прийти из initData (Telegram парсит start_param автоматически)
  // или явно из тела запроса как fallback
  const startParam = tg.startParam || (req.body && req.body.startParam) || '';
  try {
    let doc = await Save.findOne({ tgId: tg.id });

    // Новый пользователь пришёл по реферальной ссылке
    if (!doc) {
      const refBy = (startParam && startParam !== tg.id) ? startParam : null;
      doc = await Save.create({
        tgId: tg.id, username: tg.username, firstName: tg.firstName,
        refBy, refMilestones: {},
      });
    } else if (!doc.refBy && startParam && startParam !== tg.id) {
      // Уже есть аккаунт но реферер не был задан (открыл ссылку повторно)
      await Save.updateOne({ tgId: tg.id }, { $set: { refBy: startParam } });
      doc.refBy = startParam;
    }

    res.json({
      ok: true,
      save: {
        charId:    doc.charId,
        data:      doc.data,
        updatedAt: doc.updatedAt || 0,
      },
      user: { id: tg.id, username: tg.username, firstName: tg.firstName },
    });
  } catch (e) {
    console.error('load error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Сохранение полного снапшота ──
app.post('/api/save', async (req, res) => {
  const tg = authUser(req, res); if (!tg) return;
  const data = req.body && req.body.data;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ ok: false, error: 'bad_data' });
  }
  const clientTs = Number(data.updatedAt) || Date.now();
  try {
    await Save.updateOne(
      { tgId: tg.id },
      { $set: {
        tgId: tg.id, username: tg.username, firstName: tg.firstName,
        charId: data.charId || null, data,
        level: Number(data.level) || 1,
        cp:    Number(data.cp)    || 0,
        floor: Number(data.floor) || 1,
        updatedAt: clientTs,
      }},
      { upsert: true }
    );
    res.json({ ok: true, updatedAt: clientTs });
  } catch (e) {
    console.error('save error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Выбор персонажа ──
app.post('/api/character', async (req, res) => {
  const tg = authUser(req, res); if (!tg) return;
  const charId = req.body && req.body.charId;
  if (!charId) return res.status(400).json({ ok: false, error: 'bad_char' });
  try {
    await Save.updateOne(
      { tgId: tg.id },
      { $set: { tgId: tg.id, username: tg.username, firstName: tg.firstName, charId } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: 'server_error' }); }
});

// ── Лидерборд ──
app.get('/api/leaderboard', async (req, res) => {
  try {
    const top = await Save.find({ charId: { $ne: null } })
      .sort({ cp: -1, level: -1 }).limit(50)
      .select('username firstName level cp floor charId -_id').lean();
    res.json({ ok: true, top });
  } catch (e) { res.status(500).json({ ok: false, error: 'server_error' }); }
});

// ═══════════════════════════════
//  РЕФЕРАЛЬНАЯ СИСТЕМА
// ═══════════════════════════════

// ── Список друзей + реферальная ссылка + сколько gold можно забрать ──
app.post('/api/ref/friends', async (req, res) => {
  const tg = authUser(req, res); if (!tg) return;
  try {
    const doc = await Save.findOne({ tgId: tg.id })
      .select('refMilestones -_id').lean();
    const milestones = (doc && doc.refMilestones) || {};

    // Все игроки, которых пригласил этот пользователь
    const friends = await Save.find({ refBy: tg.id })
      .select('tgId firstName username level charId -_id').lean();

    // Считаем сколько золота можно забрать (без записи в БД)
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
        // следующая ступень вознаграждения для этого друга
        nextMilestone: (Math.floor(((milestones[f.tgId] || 0) / REF_MILESTONE_STEP) + 1)) * REF_MILESTONE_STEP,
        paid: milestones[f.tgId] || 0,
      })),
      pendingGold,
    });
  } catch (e) {
    console.error('ref/friends error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Забрать награды за друзей ──
app.post('/api/ref/claim', async (req, res) => {
  const tg = authUser(req, res); if (!tg) return;
  try {
    const doc = await Save.findOne({ tgId: tg.id });
    if (!doc) return res.json({ ok: true, goldEarned: 0 });

    const friends = await Save.find({ refBy: tg.id })
      .select('tgId level -_id').lean();

    const { gold, newMilestones } = calcPendingGold(doc.refMilestones || {}, friends);
    if (gold === 0) return res.json({ ok: true, goldEarned: 0 });

    // Обновляем milestones и добавляем золото в снапшот
    const update = { $set: { refMilestones: newMilestones } };
    // Если есть снапшот — прибавляем золото прямо в data.gold (атомарно)
    if (doc.data && typeof doc.data.gold === 'number') {
      doc.data.gold += gold;
      update.$set.data = doc.data;
    }
    await Save.updateOne({ tgId: tg.id }, update);

    res.json({ ok: true, goldEarned: gold });
  } catch (e) {
    console.error('ref/claim error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Server on :' + PORT));

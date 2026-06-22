/*
  ══════════════════════════════════════════════════════
  server.js — Backend для Pixel Runner RPG
  Express + MongoDB (Mongoose) + Telegram WebApp auth
  Railway: https://ghz-production.up.railway.app/

  Роуты:
    GET  /                 — health-check
    POST /api/load         — { initData }            -> { ok, save }
    POST /api/save         — { initData, data }       -> { ok, updatedAt }
    POST /api/character    — { initData, charId }     -> { ok }
    GET  /api/leaderboard  — топ игроков по CP/уровню

  ENV (Railway -> Variables):
    MONGODB_URI   — строка подключения MongoDB Atlas
    BOT_TOKEN     — токен бота из @BotFather (для проверки initData)
    PORT          — задаётся Railway автоматически
    ALLOW_INSECURE — '1' чтобы пропускать проверку подписи (только для теста)
  ══════════════════════════════════════════════════════
*/

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const crypto   = require('crypto');

const app = express();

// ── CORS (GitHub Pages + Telegram WebView) ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// sendBeacon шлёт тело как application/json ИЛИ text/plain — парсим оба
app.use(express.json({ limit: '1mb', type: ['application/json', 'text/plain'] }));

// ═══════════════════════════════
//  MongoDB
// ═══════════════════════════════
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI не задан'); }
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
  .then(() => console.log('✅ MongoDB подключена'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

const SaveSchema = new mongoose.Schema({
  tgId:      { type: String, required: true, unique: true, index: true },
  username:  { type: String, default: '' },
  firstName: { type: String, default: '' },
  charId:    { type: String, default: null },
  // Полный снапшот состояния игры (объект G в сериализованном виде)
  data:      { type: mongoose.Schema.Types.Mixed, default: null },
  // Денормализованные поля для лидерборда
  level:     { type: Number, default: 1 },
  cp:        { type: Number, default: 0 },
  floor:     { type: Number, default: 1 },
  updatedAt: { type: Number, default: 0 },
}, { minimize: false });

const Save = mongoose.model('Save', SaveSchema);

// ═══════════════════════════════
//  Проверка подписи Telegram initData
//  https://core.telegram.org/bots/webapps#validating-data
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

  const botToken = process.env.BOT_TOKEN || '';
  const insecure = process.env.ALLOW_INSECURE === '1';

  if (!insecure) {
    if (!botToken) return null;
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calc !== hash) return null;
  }

  // Достаём пользователя
  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (e) { user = null; }
  if (!user || !user.id) return null;

  return {
    id:        String(user.id),
    username:  user.username   || '',
    firstName: user.first_name || '',
  };
}

// Достаёт пользователя из тела запроса, иначе шлёт 401
function authUser(req, res) {
  const tg = verifyTelegram(req.body && req.body.initData);
  if (!tg) { res.status(401).json({ ok: false, error: 'auth_failed' }); return null; }
  return tg;
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
  try {
    const doc = await Save.findOne({ tgId: tg.id }).lean();
    res.json({
      ok: true,
      save: doc ? {
        charId:    doc.charId,
        data:      doc.data,
        updatedAt: doc.updatedAt || 0,
      } : null,
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
  const now = Date.now();
  const clientTs = Number(data.updatedAt) || now;
  try {
    await Save.updateOne(
      { tgId: tg.id },
      {
        $set: {
          tgId:      tg.id,
          username:  tg.username,
          firstName: tg.firstName,
          charId:    data.charId || null,
          data:      data,
          level:     Number(data.level) || 1,
          cp:        Number(data.cp)    || 0,
          floor:     Number(data.floor) || 1,
          updatedAt: clientTs,
        },
      },
      { upsert: true }
    );
    res.json({ ok: true, updatedAt: clientTs });
  } catch (e) {
    console.error('save error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Быстрое сохранение выбора персонажа (на всякий случай отдельно) ──
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
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Лидерборд (опционально) ──
app.get('/api/leaderboard', async (req, res) => {
  try {
    const top = await Save.find({ charId: { $ne: null } })
      .sort({ cp: -1, level: -1 })
      .limit(50)
      .select('username firstName level cp floor charId -_id')
      .lean();
    res.json({ ok: true, top });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Server on :' + PORT));

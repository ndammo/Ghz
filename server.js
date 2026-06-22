/*
  ══════════════════════════════════════════════════════
  server.js — Backend для Pixel Runner RPG
  Express + MongoDB (Mongoose) + Telegram WebApp auth
  ══════════════════════════════════════════════════════
*/

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();

// ═══════════════════════════════
//  1. CORS
// ═══════════════════════════════
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ═══════════════════════════════
//  2. БЕЗОПАСНЫЙ ПАРСИНГ JSON (вместо express.json)
// ═══════════════════════════════
app.use((req, res, next) => {
  // GET запросы пропускаем
  if (req.method === 'GET') {
    return next();
  }

  let body = '';
  
  req.on('data', chunk => {
    body += chunk;
  });
  
  req.on('end', () => {
    try {
      req.body = body ? JSON.parse(body) : {};
      next();
    } catch (err) {
      // Битый JSON — сразу отвечаем 400
      res.status(400).json({ 
        ok: false, 
        error: 'invalid_json',
        message: 'Invalid JSON format'
      });
    }
  });
  
  req.on('error', (err) => {
    // Клиент оборвал соединение — просто выходим
    if (err.code === 'ECONNRESET' || err.message?.includes('aborted')) {
      return;
    }
    next(err);
  });
});

// ═══════════════════════════════
//  3. MongoDB
// ═══════════════════════════════
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI не задан в переменных окружения');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
})
.then(() => console.log('✅ MongoDB подключена'))
.catch(err => {
  console.error('❌ MongoDB ошибка подключения:', err.message);
  process.exit(1);
});

// Схема
const SaveSchema = new mongoose.Schema({
  tgId:      { type: String, required: true, unique: true, index: true },
  username:  { type: String, default: '' },
  firstName: { type: String, default: '' },
  charId:    { type: String, default: null },
  data:      { type: mongoose.Schema.Types.Mixed, default: null },
  level:     { type: Number, default: 1 },
  cp:        { type: Number, default: 0 },
  floor:     { type: Number, default: 1 },
  updatedAt: { type: Number, default: 0 },
}, { 
  minimize: false,
  timestamps: true 
});

const Save = mongoose.model('Save', SaveSchema);

// ═══════════════════════════════
//  4. Проверка Telegram
// ═══════════════════════════════
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

  const botToken = process.env.BOT_TOKEN || '';
  const insecure = process.env.ALLOW_INSECURE === '1';

  if (!insecure) {
    if (!botToken) {
      console.error('❌ BOT_TOKEN не задан');
      return null;
    }
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calc !== hash) return null;
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch (e) {
    user = null;
  }
  
  if (!user || !user.id) return null;

  return {
    id:        String(user.id),
    username:  user.username || '',
    firstName: user.first_name || '',
  };
}

function authUser(req, res) {
  const tg = verifyTelegram(req.body?.initData);
  if (!tg) {
    res.status(401).json({ ok: false, error: 'auth_failed' });
    return null;
  }
  return tg;
}

// ═══════════════════════════════
//  5. Роуты
// ═══════════════════════════════

// Health check
app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'pixel-runner-rpg',
    db: mongoose.connection.readyState === 1,
    timestamp: Date.now()
  });
});

// Загрузка прогресса
app.post('/api/load', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  try {
    const doc = await Save.findOne({ tgId: tg.id }).lean();
    res.json({
      ok: true,
      save: doc ? {
        charId: doc.charId,
        data: doc.data,
        updatedAt: doc.updatedAt || 0,
      } : null,
      user: {
        id: tg.id,
        username: tg.username,
        firstName: tg.firstName
      }
    });
  } catch (err) {
    console.error('❌ /api/load error:', err.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Сохранение
app.post('/api/save', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  const data = req.body?.data;
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
          tgId: tg.id,
          username: tg.username,
          firstName: tg.firstName,
          charId: data.charId || null,
          data: data,
          level: Number(data.level) || 1,
          cp: Number(data.cp) || 0,
          floor: Number(data.floor) || 1,
          updatedAt: clientTs,
        }
      },
      { upsert: true }
    );
    res.json({ ok: true, updatedAt: clientTs });
  } catch (err) {
    console.error('❌ /api/save error:', err.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Выбор персонажа
app.post('/api/character', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  const charId = req.body?.charId;
  if (!charId) {
    return res.status(400).json({ ok: false, error: 'bad_char' });
  }

  try {
    await Save.updateOne(
      { tgId: tg.id },
      {
        $set: {
          tgId: tg.id,
          username: tg.username,
          firstName: tg.firstName,
          charId: charId
        }
      },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('❌ /api/character error:', err.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Лидерборд
app.get('/api/leaderboard', async (req, res) => {
  try {
    const top = await Save.find({ charId: { $ne: null } })
      .sort({ cp: -1, level: -1 })
      .limit(50)
      .select('username firstName level cp floor charId -_id')
      .lean();
    res.json({ ok: true, top });
  } catch (err) {
    console.error('❌ /api/leaderboard error:', err.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════
//  6. ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ОШИБОК (самый важный)
// ═══════════════════════════════
app.use((err, req, res, next) => {
  // Игнорируем ошибки обрыва соединения — они не критичны
  if (err.code === 'ECONNRESET' ||
      err.code === 'EPIPE' ||
      err.message?.includes('aborted') ||
      err.message?.includes('request aborted') ||
      err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
    return; // Молча выходим, не логируем
  }

  // Все остальные ошибки логируем
  console.error('❌ Unhandled error:', {
    url: req.url,
    method: req.method,
    error: err.message,
    stack: err.stack,
    body: req.body ? JSON.stringify(req.body).slice(0, 200) : null
  });

  if (!res.headersSent) {
    res.status(500).json({ 
      ok: false, 
      error: 'internal_error' 
    });
  }
});

// ═══════════════════════════════
//  7. Запуск сервера с таймаутами
// ═══════════════════════════════
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Устанавливаем таймауты
server.timeout = 120000;        // 2 минуты на ответ
server.keepAliveTimeout = 65000; // Дольше чем у Railway
server.headersTimeout = 66000;   // Должен быть > keepAliveTimeout

// Обработка ошибок сервера
server.on('error', (err) => {
  console.error('❌ Server error:', err.message);
});
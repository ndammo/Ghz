/*
  ══════════════════════════════════════════════════════
  server.js — Backend для Pixel Runner RPG
  Express + MongoDB (Mongoose) + Telegram WebApp auth
  Версия: 2.0 (исправленная)
  ══════════════════════════════════════════════════════
*/

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ═══════════════════════════════
//  1. SECURITY MIDDLEWARE
// ═══════════════════════════════
app.use(helmet());
app.use(compression());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'too_many_requests' }
});

const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 10, // максимум 10 запросов
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'too_many_requests' }
});

// ═══════════════════════════════
//  2. CORS
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
//  3. БЕЗОПАСНЫЙ ПАРСИНГ JSON (исправленный)
// ═══════════════════════════════
const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB

app.use((req, res, next) => {
  // GET запросы пропускаем
  if (req.method === 'GET') {
    return next();
  }

  const chunks = [];
  let totalLength = 0;
  let bodyReceived = false;
  
  const onData = (chunk) => {
    chunks.push(chunk);
    totalLength += chunk.length;
    
    // Защита от огромных тел
    if (totalLength > MAX_PAYLOAD_SIZE) {
      cleanup();
      return res.status(413).json({ 
        ok: false, 
        error: 'payload_too_large',
        message: 'Request body too large'
      });
    }
  };
  
  const onEnd = () => {
    bodyReceived = true;
    cleanup();
    
    try {
      const body = totalLength > 0 
        ? Buffer.concat(chunks, totalLength).toString('utf8') 
        : '{}';
      req.body = JSON.parse(body);
      next();
    } catch (err) {
      // Битый JSON — сразу отвечаем 400
      res.status(400).json({ 
        ok: false, 
        error: 'invalid_json',
        message: 'Invalid JSON format'
      });
    }
  };
  
  const onError = (err) => {
    cleanup();
    if (err.code === 'ECONNRESET' || err.message?.includes('aborted')) {
      return;
    }
    next(err);
  };
  
  const cleanup = () => {
    req.removeListener('data', onData);
    req.removeListener('end', onEnd);
    req.removeListener('error', onError);
  };
  
  req.on('data', onData);
  req.on('end', onEnd);
  req.on('error', onError);
  
  // Очистка при обрыве соединения
  req.on('close', () => {
    if (!bodyReceived) {
      cleanup();
    }
  });
});

// ═══════════════════════════════
//  4. REQUEST MONITORING
// ═══════════════════════════════
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.log(`⚠️ Slow request: ${req.method} ${req.url} - ${duration}ms`);
    }
  });
  
  next();
});

// ═══════════════════════════════
//  5. MongoDB
// ═══════════════════════════════
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI не задан в переменных окружения');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
  maxPoolSize: 10,
  minPoolSize: 2,
  socketTimeoutMS: 45000,
})
.then(() => console.log('✅ MongoDB подключена'))
.catch(err => {
  console.error('❌ MongoDB ошибка подключения:', err.message);
  process.exit(1);
});

// Обработка событий подключения
mongoose.connection.on('error', err => {
  console.error('❌ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔄 MongoDB отключена');
});

// Схема
const SaveSchema = new mongoose.Schema({
  tgId:      { type: String, required: true, unique: true, index: true },
  username:  { type: String, default: '' },
  firstName: { type: String, default: '' },
  charId:    { type: String, default: null, index: true },
  data:      { type: mongoose.Schema.Types.Mixed, default: null },
  level:     { type: Number, default: 1, min: 1 },
  cp:        { type: Number, default: 0, min: 0 },
  floor:     { type: Number, default: 1, min: 1 },
  updatedAt: { type: Number, default: 0, index: true },
}, { 
  minimize: false,
  timestamps: true 
});

// Составной индекс для лидерборда
SaveSchema.index({ charId: 1, cp: -1, level: -1 });

const Save = mongoose.model('Save', SaveSchema);

// ═══════════════════════════════
//  6. Telegram Verification
// ═══════════════════════════════
function verifyTelegram(initData) {
  if (!initData || typeof initData !== 'string') return null;

  try {
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
      
      // Добавляем тайминг-атаку защиту
      if (calc.length !== hash.length) return null;
      const valid = crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
      if (!valid) return null;
    }

    let user = null;
    try {
      const userStr = params.get('user');
      if (userStr) {
        user = JSON.parse(userStr);
      }
    } catch (e) {
      console.error('❌ User parsing error:', e.message);
      return null;
    }
    
    if (!user || !user.id) return null;

    return {
      id:        String(user.id),
      username:  String(user.username || ''),
      firstName: String(user.first_name || ''),
    };
  } catch (err) {
    console.error('❌ Telegram verification error:', err.message);
    return null;
  }
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
//  7. LEADERBOARD CACHE
// ═══════════════════════════════
const leaderboardCache = {
  data: null,
  timestamp: 0,
  ttl: 30000, // 30 секунд кэш
};

function invalidateCache() {
  leaderboardCache.data = null;
  leaderboardCache.timestamp = 0;
}

// ═══════════════════════════════
//  8. ROUTES
// ═══════════════════════════════

// Health check
app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'pixel-runner-rpg',
    db: mongoose.connection.readyState === 1,
    timestamp: Date.now(),
    uptime: process.uptime(),
    memory: process.memoryUsage().heapUsed
  });
});

// Загрузка прогресса
app.post('/api/load', apiLimiter, async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  try {
    const doc = await Save.findOne({ tgId: tg.id })
      .select('charId data updatedAt level cp floor -_id')
      .lean();

    res.json({
      ok: true,
      save: doc ? {
        charId: doc.charId,
        data: doc.data,
        updatedAt: doc.updatedAt || 0,
        level: doc.level || 1,
        cp: doc.cp || 0,
        floor: doc.floor || 1
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

// Сохранение (исправленное с защитой от race condition)
app.post('/api/save', apiLimiter, async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  const data = req.body?.data;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ ok: false, error: 'bad_data' });
  }

  // Проверка размера данных
  const dataSize = JSON.stringify(data).length;
  if (dataSize > MAX_PAYLOAD_SIZE) {
    return res.status(413).json({ ok: false, error: 'data_too_large' });
  }

  // Валидация обязательных полей
  if (typeof data.level !== 'number' || data.level < 1) {
    return res.status(400).json({ ok: false, error: 'invalid_level' });
  }

  const now = Date.now();
  const clientTs = Number(data.updatedAt) || now;

  try {
    // Используем findOneAndUpdate с условием для предотвращения race condition
    const result = await Save.findOneAndUpdate(
      { 
        tgId: tg.id,
        $or: [
          { updatedAt: { $lt: clientTs } },
          { updatedAt: { $exists: false } }
        ]
      },
      {
        $set: {
          tgId: tg.id,
          username: tg.username,
          firstName: tg.firstName,
          charId: data.charId || null,
          data: data,
          level: Math.max(1, Number(data.level) || 1),
          cp: Math.max(0, Number(data.cp) || 0),
          floor: Math.max(1, Number(data.floor) || 1),
          updatedAt: clientTs,
        }
      },
      { 
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    // Инвалидируем кэш лидерборда если сохранились
    invalidateCache();

    res.json({ 
      ok: true, 
      updatedAt: clientTs,
      saved: !!result
    });
  } catch (err) {
    console.error('❌ /api/save error:', err.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Выбор персонажа
app.post('/api/character', apiLimiter, async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  const charId = req.body?.charId;
  if (!charId || typeof charId !== 'string') {
    return res.status(400).json({ ok: false, error: 'bad_char' });
  }

  try {
    const result = await Save.findOneAndUpdate(
      { tgId: tg.id },
      {
        $set: {
          tgId: tg.id,
          username: tg.username,
          firstName: tg.firstName,
          charId: charId
        }
      },
      { 
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    // Инвалидируем кэш при смене персонажа
    invalidateCache();

    res.json({ 
      ok: true,
      charId: result.charId
    });
  } catch (err) {
    console.error('❌ /api/character error:', err.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Лидерборд (с кэшированием)
app.get('/api/leaderboard', leaderboardLimiter, async (req, res) => {
  try {
    const now = Date.now();
    
    // Проверяем кэш
    if (leaderboardCache.data && (now - leaderboardCache.timestamp) < leaderboardCache.ttl) {
      return res.json({ 
        ok: true, 
        top: leaderboardCache.data,
        cached: true,
        timestamp: leaderboardCache.timestamp
      });
    }

    const top = await Save.find({ 
      charId: { $ne: null },
      cp: { $gt: 0 } // Показываем только с очками
    })
      .sort({ cp: -1, level: -1 })
      .limit(100)
      .select('username firstName level cp floor charId -_id')
      .lean();

    // Обновляем кэш
    leaderboardCache.data = top;
    leaderboardCache.timestamp = now;

    res.json({ 
      ok: true, 
      top,
      timestamp: now
    });
  } catch (err) {
    console.error('❌ /api/leaderboard error:', err.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Получение статистики игрока
app.get('/api/stats/:tgId', apiLimiter, async (req, res) => {
  try {
    const { tgId } = req.params;
    
    if (!tgId || tgId.length < 5) {
      return res.status(400).json({ ok: false, error: 'invalid_id' });
    }

    const player = await Save.findOne({ tgId })
      .select('username firstName level cp floor charId updatedAt -_id')
      .lean();

    if (!player) {
      return res.status(404).json({ ok: false, error: 'player_not_found' });
    }

    // Находим позицию в рейтинге
    const rank = await Save.countDocuments({
      cp: { $gt: player.cp || 0 }
    }) + 1;

    res.json({
      ok: true,
      player: {
        ...player,
        rank
      }
    });
  } catch (err) {
    console.error('❌ /api/stats error:', err.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════
//  9. 404 HANDLER
// ═══════════════════════════════
app.use((req, res) => {
  res.status(404).json({ 
    ok: false, 
    error: 'not_found',
    path: req.path 
  });
});

// ═══════════════════════════════
//  10. GLOBAL ERROR HANDLER
// ═══════════════════════════════
app.use((err, req, res, next) => {
  // Игнорируем ошибки обрыва соединения
  if (err.code === 'ECONNRESET' ||
      err.code === 'EPIPE' ||
      err.message?.includes('aborted') ||
      err.message?.includes('request aborted') ||
      err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
    return;
  }

  // Игнорируем ошибки парсинга JSON (уже обработаны)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return;
  }

  // Логируем все остальные ошибки
  console.error('❌ Unhandled error:', {
    url: req.url,
    method: req.method,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
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
//  11. GRACEFUL SHUTDOWN
// ═══════════════════════════════
const shutdown = async (signal) => {
  console.log(`🔄 ${signal} received. Starting graceful shutdown...`);
  
  // Больше не принимаем новые запросы
  server.close(async () => {
    console.log('👋 HTTP server closed');
    
    try {
      await mongoose.connection.close();
      console.log('📦 MongoDB connection closed');
    } catch (err) {
      console.error('❌ Error closing MongoDB:', err);
    }
    
    process.exit(0);
  });

  // Принудительное завершение через 15 секунд
  setTimeout(() => {
    console.error('⏰ Forced shutdown after timeout');
    process.exit(1);
  }, 15000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Обработка необработанных ошибок
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// ═══════════════════════════════
//  12. START SERVER
// ═══════════════════════════════
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⚙️  Rate limiting: ${apiLimiter.max} requests per ${apiLimiter.windowMs / 1000}s`);
});

// Настройка таймаутов сервера
server.timeout = 120000;        // 2 минуты на ответ
server.keepAliveTimeout = 65000; // Дольше чем у Railway (обычно 60с)
server.headersTimeout = 66000;   // Должен быть > keepAliveTimeout

// Обработка ошибок сервера
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', err.message);
  }
});

module.exports = app; // Для тестирования
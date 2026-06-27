/*
  ══════════════════════════════════════════════════════
  server.js — Backend для PIXEL RPG
  Express + MongoDB (Mongoose) + Telegram WebApp auth
  + Админ-панель + Транзакции (пополнение/вывод)
  + Long Polling для уведомлений клиентов
  + Telegram Bot (встроенный)
  ══════════════════════════════════════════════════════
*/

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const crypto   = require('crypto');
const path     = require('path');

// ── Telegram Bot ──
const TelegramBot = require('node-telegram-bot-api');

const http = require('http');

const app    = express();
const server = http.createServer(app);
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

// ── Маркет ──
const MarketListingSchema = new mongoose.Schema({
  listingId:   { type: String, required: true, unique: true },
  sellerId:    { type: String, required: true, index: true },
  sellerName:  { type: String, default: '' },
  item:        { type: mongoose.Schema.Types.Mixed, required: true },
  price:       { type: Number, required: true, min: 1 },
  status:      { type: String, enum: ['active', 'sold', 'cancelled'], default: 'active', index: true },
  buyerId:     { type: String, default: null },
  buyerName:   { type: String, default: null },
  createdAt:   { type: Number, default: Date.now },
  expiresAt:   { type: Number, required: true },
  soldAt:      { type: Number, default: null },
  cancelledAt: { type: Number, default: null },
}, { minimize: false });
MarketListingSchema.index({ status: 1, createdAt: -1 });
MarketListingSchema.index({ sellerId: 1, status: 1 });
MarketListingSchema.index({ expiresAt: 1 });
const MarketListing = mongoose.model('MarketListing', MarketListingSchema);

// Авто-истечение лотов каждые 10 минут
setInterval(async () => {
  try {
    const now = Date.now();
    const expired = await MarketListing.find({ status: 'active', expiresAt: { $lte: now } }).lean();
    for (const listing of expired) {
      // Атомарно переводим в cancelled
      const updated = await MarketListing.findOneAndUpdate(
        { listingId: listing.listingId, status: 'active' },
        { $set: { status: 'cancelled', cancelledAt: now } },
        { new: false }
      );
      if (!updated) continue;
      // Возвращаем предмет владельцу
      await Save.findOneAndUpdate(
        { tgId: listing.sellerId },
        { $push: { 'data.inventory': listing.item } }
      );
      notifyClient(listing.sellerId, 'market_expired', { listingId: listing.listingId, item: listing.item });
      console.log(`⏰ [market] Лот ${listing.listingId} истёк — предмет возвращён ${listing.sellerId}`);
    }
  } catch (e) {
    console.error('❌ [market] expire job error:', e.message);
  }
}, 10 * 60 * 1000);

// ── PvP история боёв ──
const PvpBattleSchema = new mongoose.Schema({
  battleId:     { type: String, required: true, unique: true },
  attackerId:   { type: String, required: true, index: true },
  defenderId:   { type: String, required: true },
  attackerName: { type: String, default: '' },
  defenderName: { type: String, default: '' },
  attackerChar: { type: String, default: null },
  defenderChar: { type: String, default: null },
  winnerId:     { type: String, required: true },
  ratingChange: { type: Number, default: 0 },
  attackerRatingBefore: { type: Number, default: 1000 },
  defenderRatingBefore: { type: Number, default: 1000 },
  attackerDmgDealt: { type: Number, default: 0 },
  defenderDmgDealt: { type: Number, default: 0 },
  createdAt:    { type: Number, default: Date.now },
}, { minimize: false });
PvpBattleSchema.index({ attackerId: 1, createdAt: -1 });
PvpBattleSchema.index({ defenderId: 1, createdAt: -1 });
const PvpBattle = mongoose.model('PvpBattle', PvpBattleSchema);

// ── Специальные задания ──
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
  if (authDate && (Math.floor(Date.now() / 1000) - authDate) > 172800) return null; // 48h

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
//  ПОЛЛИНГ — простой опрос (без долгого ожидания)
// ═══════════════════════════════

const pendingNotifications = new Map();

// ── Простой опрос (без Long Polling) ──
app.post('/api/poll', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  const tgId = tg.id;
  const notifs = pendingNotifications.get(tgId) || [];
  
  if (notifs.length > 0) {
    pendingNotifications.set(tgId, []);
    console.log(`📨 [Poll] Отдано ${notifs.length} уведомлений для ${tgId}`);
    return res.json({
      ok: true,
      notifications: notifs,
      timestamp: Date.now()
    });
  }
  
  // Просто возвращаем пустой ответ
  res.json({
    ok: true,
    notifications: [],
    timestamp: Date.now()
  });
});


// ✅ Очистка старых уведомлений (утечка памяти)
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  pendingNotifications.forEach((notifs, tgId) => {
    const fresh = notifs.filter(n => n.timestamp > cutoff);
    if (fresh.length === 0) pendingNotifications.delete(tgId);
    else if (fresh.length !== notifs.length) pendingNotifications.set(tgId, fresh);
  });
}, 5 * 60 * 1000);

function notifyClient(tgId, eventType, data) {
  if (!tgId) return false;

  const notification = {
    event: eventType,
    data: data || {},
    timestamp: Date.now()
  };

  if (!pendingNotifications.has(tgId)) {
    pendingNotifications.set(tgId, []);
  }
  pendingNotifications.get(tgId).push(notification);

  console.log(`📨 [Poll] Уведомление для ${tgId}: ${eventType}`);
  return true;
}

function forceReloadClient(tgId) {
  return notifyClient(tgId, 'reload', { reason: 'data_updated' });
}

// ═══════════════════════════════
//  ОСНОВНЫЕ РОУТЫ
// ═══════════════════════════════
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'pixel-rpg', db: mongoose.connection.readyState === 1 });
});

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
    
    const currentDoc = await Save.findOne({ tgId: tg.id }).lean();
    if (currentDoc && currentDoc.data && currentDoc.data.updatedAt) {
      const clientUpdatedAt = data.updatedAt || 0;
      const serverUpdatedAt = currentDoc.data.updatedAt || 0;
      
      if (serverUpdatedAt > clientUpdatedAt) {
        console.log(`⚠️ [save] Игнорируем устаревшие данные для ${tg.id}`);
        return res.json({ ok: true, updatedAt: serverUpdatedAt, ignored: true });
      }

      // ✅ Защита от перезаписи AdminUpdatedAt
      const adminUpdatedAt = (currentDoc.data._adminUpdatedAt) || 0;
      if (adminUpdatedAt > clientUpdatedAt) {
        console.log(`🛡️ [save] Мёрж с админскими изменениями для ${tg.id}`);
        if (currentDoc.data.gram      !== undefined) data.gram      = currentDoc.data.gram;
        if (currentDoc.data.gold      !== undefined) data.gold      = currentDoc.data.gold;
        if (currentDoc.data.pixr      !== undefined) data.pixr      = currentDoc.data.pixr;
        if (currentDoc.data.inventory !== undefined) data.inventory = currentDoc.data.inventory;
        data._adminUpdatedAt = adminUpdatedAt;
      }
    }

    data.updatedAt = Date.now();

    await Save.findOneAndUpdate(
      { tgId: tg.id },
      { 
        $set: {
          username:  tg.username, 
          firstName: tg.firstName,
          charId:    data.charId || null, 
          data:      data,
          level:     Number(data.level) || 1,
          cp:        Number(data.cp)    || 0,
          floor:     Number(data.floor) || 1,
          updatedAt: data.updatedAt,
        }
      },
      { upsert: true, new: false, lean: true }
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


// ═══════════════════════════════
//  ДЕЛЬТА-СОХРАНЕНИЕ — только изменившиеся поля
// ═══════════════════════════════
app.post('/api/save/delta', async (req, res) => {
  const startTime = Date.now();

  try {
    const tg = authUser(req, res);
    if (!tg) return;

    if (rateLimit(tg.id, 10, 10000)) {
      return res.status(429).json({ ok: false, error: 'rate_limit' });
    }

    const delta = req.body && req.body.delta;
    if (!delta || typeof delta !== 'object') {
      return res.status(400).json({ ok: false, error: 'bad_delta' });
    }

    if (delta.tgId && delta.tgId !== tg.id) {
      return res.status(403).json({ ok: false, error: 'user_mismatch' });
    }

    // Загружаем текущий документ
    const currentDoc = await Save.findOne({ tgId: tg.id }).lean();
    if (!currentDoc || !currentDoc.data) {
      return res.status(404).json({ ok: false, error: 'no_save' });
    }

    const srv = currentDoc.data;
    const clientUpdatedAt = delta.updatedAt || 0;
    const serverUpdatedAt = srv.updatedAt || 0;

    // Если сервер свежее клиента — игнорируем дельту
    if (serverUpdatedAt > clientUpdatedAt) {
      console.log(`⚠️ [delta] Игнорируем устаревшую дельту для ${tg.id}`);
      return res.json({ ok: true, updatedAt: serverUpdatedAt, ignored: true });
    }

    // ✅ Мёржим дельту с текущими данными
    const merged = Object.assign({}, srv);
    const ALLOWED_DELTA_FIELDS = [
      'hp', 'gold', 'xp', 'xpNeeded', 'killCount', 'potions',
      'level', 'floor', 'maxFloor', 'pixr', 'cp', 'charId'
    ];
    ALLOWED_DELTA_FIELDS.forEach(function(field) {
      if (delta[field] !== undefined) merged[field] = delta[field];
    });
    merged.updatedAt = Date.now();
    merged.tgId = tg.id;

    // ✅ Если были админские изменения — клиент не знал, берём серверные значения
    const adminUpdatedAt = srv._adminUpdatedAt || 0;
    const syncToClient = {};
    if (adminUpdatedAt > clientUpdatedAt) {
      console.log(`🛡️ [delta] Мёрж с админскими изменениями для ${tg.id}`);
      if (srv.gram      !== undefined) { merged.gram      = srv.gram;      syncToClient.gram      = srv.gram; }
      if (srv.gold      !== undefined) { merged.gold      = srv.gold;      syncToClient.gold      = srv.gold; }
      if (srv.pixr      !== undefined) { merged.pixr      = srv.pixr;      syncToClient.pixr      = srv.pixr; }
      if (srv.inventory !== undefined) { merged.inventory = srv.inventory; syncToClient.inventory = srv.inventory; }
      merged._adminUpdatedAt = adminUpdatedAt;
    }

    await Save.findOneAndUpdate(
      { tgId: tg.id },
      {
        $set: {
          data: merged,
          level:     Number(merged.level) || 1,
          cp:        Number(merged.cp)    || 0,
          floor:     Number(merged.floor) || 1,
          updatedAt: merged.updatedAt,
        }
      },
      { upsert: false, new: false, lean: true }
    );

    const duration = Date.now() - startTime;
    console.log(`✅ [delta] Сохранено для ${tg.id} (${duration}ms), полей: ${Object.keys(delta).length}`);

    const response = { ok: true, updatedAt: merged.updatedAt };
    if (Object.keys(syncToClient).length > 0) response.sync = syncToClient;
    res.json(response);

  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`❌ [delta] ОШИБКА (${duration}ms):`, e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

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
    const refLink = `https://t.me/${BOT_USERNAME}?start=${tg.id}`;

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
//  АВАТАРКА
// ═══════════════════════════════
const _avatarCache = new Map();
const AVATAR_CACHE_TTL = 3600 * 1000;

app.get('/api/avatar/:tgId', async (req, res) => {
  const tgId = req.params.tgId;
  if (!tgId || !/^\d+$/.test(tgId)) return res.status(400).json({ ok: false });

  const cached = _avatarCache.get(tgId);
  if (cached && Date.now() - cached.ts < AVATAR_CACHE_TTL) {
    if (!cached.url) return res.status(404).json({ ok: false, error: 'no_photo' });
    return res.redirect(302, cached.url);
  }

  const token = process.env.BOT_TOKEN;
  if (!token) return res.status(503).json({ ok: false, error: 'no_token' });

  try {
    const photosRes = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${tgId}&limit=1`
    );
    const photosData = await photosRes.json();

    if (!photosData.ok || !photosData.result.total_count) {
      _avatarCache.set(tgId, { url: null, ts: Date.now() });
      return res.status(404).json({ ok: false, error: 'no_photo' });
    }

    const sizes = photosData.result.photos[0];
    const fileId = sizes[sizes.length - 1].file_id;

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
//  ТРАНЗАКЦИИ
// ═══════════════════════════════

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
    // ✅ Атомарно резервируем баланс — защита от двойного вывода
    const reserved = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.gram': { $gte: amount } },
      { $inc: { 'data.gram': -amount } },
      { new: false }
    );
    if (!reserved) {
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
    // ✅ Возвращаем зарезервированный баланс при ошибке
    try {
      await Save.updateOne({ tgId: tg.id }, { $inc: { 'data.gram': amount } });
    } catch (_) {}
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.post('/api/wallet/transactions', async (req, res) => {
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
//  БОТ: ВСТРОЕННЫЙ
// ═══════════════════════════════

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-domain.railway.app';
const API_URL = process.env.API_URL || 'https://ghz-production.up.railway.app';

let bot = null;

function initBot() {
  if (!BOT_TOKEN) {
    console.error('❌ [bot] BOT_TOKEN не задан!');
    return null;
  }

  try {
    bot = new TelegramBot(BOT_TOKEN, { polling: false });

    const webhookUrl = (process.env.WEBHOOK_URL || API_URL) + '/webhook/' + BOT_TOKEN;
    
    bot.setWebHook(webhookUrl)
      .then(() => {
        console.log('✅ [bot] Webhook установлен: ' + webhookUrl.replace(BOT_TOKEN, '<TOKEN>'));
      })
      .catch((err) => {
        console.error('❌ [bot] Ошибка установки webhook:', err.message);
      });

    // ── Webhook маршрут ──
    app.post('/webhook/' + BOT_TOKEN, (req, res) => {
      try {
        bot.processUpdate(req.body);
      } catch (e) {
        console.error('❌ [bot] processUpdate error:', e.message);
      }
      res.sendStatus(200);
    });

    // ── /start ──
    bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
      try {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || msg.from.first_name || 'Игрок';
        const startParam = (match && match[1]) ? match[1].trim() : null;

        console.log('📨 [bot] /start от ' + username + ' (' + userId + '), param: ' + (startParam || 'none'));

        let webappUrl = WEBAPP_URL;
        if (startParam) {
          webappUrl = webappUrl + '?startapp=' + startParam;
        }

        const hour = new Date().getHours();
        let greeting = 'Добрый день';
        if (hour < 12) greeting = '🌅 Доброе утро';
        else if (hour < 18) greeting = '☀️ Добрый день';
        else if (hour < 22) greeting = '🌇 Добрый вечер';
        else greeting = '🌙 Доброй ночи';

        const message =
          greeting + ', *' + username + '*! 👋\n\n' +
          '🔥 **PIXEL RPG** — эпическая RPG!\n\n' +
          '━━━━━━━━━━━━━━━━━━━\n' +
          '🎮 **В игре тебя ждут:**\n' +
          '  ✦ 10 этажей с монстрами\n' +
          '  ✦ 3 класса персонажей\n' +
          '  ✦ Улучшения и навыки\n' +
          '  ✦ Редкие предметы\n' +
          '  ✦ Боевой пропуск\n' +
          '  ✦ Реферальная система\n\n' +
          '━━━━━━━━━━━━━━━━━━━\n' +
          '👤 **Твой ID:** `' + userId + '`\n' +
          (startParam ? '🔗 **Пригласил:** `' + startParam + '`\n' : '') +
          '\nНажми на кнопку ниже, чтобы начать!';

        bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 ИГРАТЬ', web_app: { url: webappUrl } }],
              [
                { text: '👥 Пригласить друзей', callback_data: 'ref' },
                { text: '📊 Статистика', callback_data: 'profile' }
              ]
            ]
          }
        });
      } catch (e) {
        console.error('❌ [bot] Ошибка в /start:', e.message);
      }
    });

    // ── /help ──
    bot.onText(/\/help/, (msg) => {
      bot.sendMessage(msg.chat.id,
        '📖 **Команды:**\n\n' +
        '/start — Начать игру\n' +
        '/help — Справка\n' +
        '/ref — Реферальная ссылка\n' +
        '/profile — Мой профиль',
        { parse_mode: 'Markdown' }
      );
    });

    // ── /ref ──
bot.onText(/\/ref/, (msg) => {
  const userId = msg.from.id;
  const refLink = 'https://t.me/' + BOT_USERNAME + '?start=' + userId;
  bot.sendMessage(msg.chat.id,
    '👥 **Твоя реферальная ссылка:**\n\n' +
    '`' + refLink + '`',
    { parse_mode: 'Markdown' }
  );
});

    // ── /profile ──
    bot.onText(/\/profile/, (msg) => {
      const userId = msg.from.id;
      getPlayerProfile(userId).then((profile) => {
        bot.sendMessage(msg.chat.id,
          '📊 **Твой профиль:**\n\n' +
          '👤 Имя: ' + profile.username + '\n' +
          '🎯 Уровень: ' + profile.level + '\n' +
          '⚔️ CP: ' + profile.cp + '\n' +
          '🏰 Этаж: ' + profile.floor + '\n' +
          '👾 Убийств: ' + profile.killCount + '\n' +
          '🪙 Золото: ' + profile.gold + '\n' +
          '💎 PIXR: ' + profile.pixr + '\n' +
          '⭐ GRAM: ' + profile.gram,
          { parse_mode: 'Markdown' }
        );
      });
    });

    // ═══════════════════════════════
    //  ОБРАБОТКА ТРАНЗАКЦИЙ
    // ═══════════════════════════════
    bot.on('callback_query', (query) => {
      try {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;

        console.log('📨 [bot] Callback: ' + data + ' от ' + userId);

        bot.answerCallbackQuery(query.id).catch(() => {});

        if (data === 'ref') {
  const refLink = 'https://t.me/' + BOT_USERNAME + '?start=' + userId;
  bot.sendMessage(chatId, '👥 **Твоя реферальная ссылка:**\n\n`' + refLink + '`', { parse_mode: 'Markdown' });
  return;
}

        if (data === 'profile') {
          getPlayerProfile(userId).then((profile) => {
            bot.sendMessage(chatId,
              '📊 **Твой профиль:**\n\n' +
              '👤 Имя: ' + profile.username + '\n' +
              '🎯 Уровень: ' + profile.level + '\n' +
              '⚔️ CP: ' + profile.cp + '\n' +
              '🏰 Этаж: ' + profile.floor + '\n' +
              '👾 Убийств: ' + profile.killCount + '\n' +
              '🪙 Золото: ' + profile.gold + '\n' +
              '💎 PIXR: ' + profile.pixr + '\n' +
              '⭐ GRAM: ' + profile.gram,
              { parse_mode: 'Markdown' }
            );
          });
          return;
        }

        if (data.startsWith('approve_') || data.startsWith('reject_')) {
          const action = data.startsWith('approve_') ? 'approve' : 'reject';
          const txId = data.replace(/^(approve|reject)_/, '');
          const msgId = query.message.message_id;

          console.log('💳 [bot] Обработка транзакции: ' + txId + ' -> ' + action);

          bot.editMessageReplyMarkup(
            { inline_keyboard: [[{ text: '⏳ Обработка...', callback_data: 'noop' }]] },
            { chat_id: chatId, message_id: msgId }
          ).catch(() => {});

          const _fetch = typeof fetch !== 'undefined' ? fetch : require('node-fetch');

          _fetch(API_URL + '/bot/transaction/' + txId + '/' + action, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-bot-secret': BOT_TOKEN
            },
            body: JSON.stringify({})
          })
          .then(r => r.json())
          .then((result) => {
            if (result.ok) {
              const doneText = action === 'approve' ? '✅ Подтверждено' : '❌ Отклонено';
              bot.editMessageReplyMarkup(
                { inline_keyboard: [[{ text: doneText, callback_data: 'done_' + txId }]] },
                { chat_id: chatId, message_id: msgId }
              ).catch(() => {});
              bot.answerCallbackQuery(query.id, { text: doneText }).catch(() => {});
            } else {
              const already = result.error === 'already_processed';
              bot.editMessageReplyMarkup(
                already
                  ? { inline_keyboard: [[{ text: '⚠️ Уже обработана', callback_data: 'done_' + txId }]] }
                  : { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'approve_' + txId }, { text: '❌ Отклонить', callback_data: 'reject_' + txId }]] },
                { chat_id: chatId, message_id: msgId }
              ).catch(() => {});
              bot.answerCallbackQuery(query.id, {
                text: already ? '⚠️ Транзакция уже обработана' : '❌ Ошибка: ' + (result.error || 'unknown'),
                show_alert: true
              }).catch(() => {});
            }
          })
          .catch((err) => {
            console.error('❌ [bot] Ошибка обработки транзакции:', err.message);
            bot.editMessageReplyMarkup(
              { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'approve_' + txId }, { text: '❌ Отклонить', callback_data: 'reject_' + txId }]] },
              { chat_id: chatId, message_id: msgId }
            ).catch(() => {});
            bot.answerCallbackQuery(query.id, { text: '❌ Ошибка сервера' }).catch(() => {});
          });
          return;
        }

        if (data.startsWith('done_') || data === 'noop') {
          bot.answerCallbackQuery(query.id, { text: 'Транзакция уже обработана' }).catch(() => {});
          return;
        }
      } catch (e) {
        console.error('❌ [bot] Callback error:', e.message);
      }
    });

    console.log('✅ [bot] Все обработчики зарегистрированы');
    return bot;

  } catch (e) {
    console.error('❌ [bot] Ошибка:', e.message);
    return null;
  }
}

// ── Получение профиля ──
function getPlayerProfile(userId) {
  try {
    return Save.findOne({ tgId: String(userId) }).lean()
      .then((doc) => {
        if (!doc) {
          return { username: 'Новичок', level: 1, cp: 0, floor: 1, killCount: 0, gold: 0, pixr: 0, gram: 0 };
        }
        const data = doc.data || {};
        return {
          username:  doc.firstName || doc.username || 'Игрок',
          level:     doc.level     || 1,
          cp:        doc.cp        || 0,
          floor:     doc.floor     || 1,
          killCount: data.killCount || 0,
          gold:      data.gold     || 0,
          pixr:      data.pixr     || 0,
          gram:      data.gram     || 0
        };
      })
      .catch((e) => {
        console.error('❌ [bot] getPlayerProfile error:', e.message);
        return { username: 'Ошибка', level: 0, cp: 0, floor: 0, killCount: 0, gold: 0, pixr: 0, gram: 0 };
      });
  } catch (e) {
    console.error('❌ [bot] getPlayerProfile error:', e.message);
    return Promise.resolve({ username: 'Ошибка', level: 0, cp: 0, floor: 0, killCount: 0, gold: 0, pixr: 0, gram: 0 });
  }
}

// ── Инициализация бота ──
// Запускаем бота сразу при старте сервера
initBot();

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
  return require('crypto').randomBytes(24).toString('hex'); // ✅ криптостойкий
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


// ✅ Очистка протухших сессий (утечка памяти)
setInterval(() => {
  const now = Date.now();
  adminSessions.forEach((s, k) => { if (s.expires < now) adminSessions.delete(k); });
}, 60 * 60 * 1000);

async function logAdminAction(admin, action, target, details) {
  try {
    await AdminLog.create({ admin, action, target, details });
  } catch (e) {
    console.error('❌ [admin] log error:', e.message);
  }
}

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
    if (updates.level !== undefined) updateData.level = updates.level;
    if (updates.floor !== undefined) updateData.floor = updates.floor;
    if (updates.charId !== undefined) updateData.charId = updates.charId;
    
    updateData.updatedAt = Date.now();
    
    const result = await Save.findOneAndUpdate(
      { tgId: tgId },
      { $set: updateData },
      { new: true }
    );
    
    if (!result) {
      return res.status(404).json({ ok: false, error: 'user_not_found' });
    }
    
    console.log(`✅ [admin] Обновлён пользователь ${tgId}:`, updates);
    
    await logAdminAction(req.admin.login, 'update_user', tgId, updates);
    
    notifyClient(tgId, 'reload', { reason: 'user_updated' });
    
    res.json({ 
      ok: true, 
      user: {
        tgId: result.tgId,
        username: result.username,
        firstName: result.firstName,
        charId: result.charId,
        level: result.level,
        cp: result.cp,
        floor: result.floor,
        data: result.data
      }
    });
  } catch (e) {
    console.error('❌ [admin] update error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
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

// ── Админ: выдача предмета ──
app.post('/admin/api/user/:tgId/give-item', requireAdmin, async (req, res) => {
  try {
    const { tgId } = req.params;
    const { slot, name, rarity, level, stats, icon, forClass } = req.body;
    
    if (!slot || !name || !rarity) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }
    
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
    
    const result = await Save.findOneAndUpdate(
      { tgId: tgId },
      { 
        $push: { 'data.inventory': item },
        $set: { updatedAt: Date.now() }
      },
      { new: true }
    );
    
    if (!result) {
      return res.status(404).json({ ok: false, error: 'user_not_found' });
    }
    
    console.log(`✅ [admin] Предмет выдан ${tgId}: ${name}`);
    
    await logAdminAction(req.admin.login, 'give_item', tgId, { item });
    
    notifyClient(tgId, 'reload', { reason: 'item_given' });
    
    res.json({ ok: true, item });
  } catch (e) {
    console.error('❌ [admin] give-item error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Админ: подтверждение транзакции ──
app.post('/admin/api/transaction/:txId/:action', requireAdmin, async (req, res) => {
  try {
    const { txId, action } = req.params;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ ok: false, error: 'invalid_action' });
    }
    
    // ✅ Атомарно — защита от двойного одобрения
    const tx = await Transaction.findOneAndUpdate(
      { id: txId, status: 'pending' },
      { $set: { status: action === 'approve' ? 'approved' : 'rejected',
                [action === 'approve' ? 'approvedAt' : 'rejectedAt']: Date.now() } },
      { new: false }
    );
    if (!tx) {
      const existing = await Transaction.findOne({ id: txId }).lean();
      if (!existing) return res.status(404).json({ ok: false, error: 'transaction_not_found' });
      return res.status(400).json({ ok: false, error: 'transaction_already_processed' });
    }

    if (action === 'approve') {
      
      const gramDelta = tx.type === 'deposit' ? tx.amount : -tx.amount;
      
      console.log(`💰 [admin] Начисление ${gramDelta} GRAM пользователю ${tx.userId}`);
      
      const newUpdatedAt = Date.now();
      
      const result = await Save.findOneAndUpdate(
        { tgId: tx.userId },
        { 
          $inc: { 'data.gram': gramDelta },
          $set: { 
            'data.updatedAt': newUpdatedAt,
            updatedAt: newUpdatedAt 
          }
        },
        { new: true }
      );
      
      console.log(`💰 [admin] Новый баланс: ${result?.data?.gram || 0} GRAM`);
      
      notifyClient(tx.userId, 'reload', { 
        reason: 'balance_updated',
        gram: result?.data?.gram || 0
      });
    }
    
    await logAdminAction(req.admin.login, action + '_transaction', tx.userId, { txId, amount: tx.amount });
    
    if (bot) {
      const statusText = action === 'approve' ? '✅ Подтверждена' : '❌ Отклонена';
      const msg = `
💰 **Транзакция ${statusText}**

**Тип:** ${tx.type === 'deposit' ? 'Пополнение' : 'Вывод'}
**Сумма:** ${tx.amount} GRAM
**Статус:** ${statusText}
${action === 'approve' ? '✅ Баланс обновлен!' : '❌ Средства не были зачислены.'}

🔄 *Для обновления баланса перезапустите игру или нажмите "Обновить" в кошельке.*
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
//  МАРКЕТ
// ═══════════════════════════════

const MARKET_OPEN_COST  = 1000;
const MARKET_MAX_LOTS   = 3;
const MARKET_TTL_MS     = 48 * 60 * 60 * 1000; // 48 часов
const MARKET_COMMISSION = 0.10;
const MARKET_MIN_RARITY = ['uncommon', 'rare', 'epic', 'legend']; // common запрещён

// ── Открытие маркета (разовая покупка) ──
app.post('/api/market/open', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const user = await Save.findOne({ tgId: tg.id }).lean();
    if (!user || !user.data) return res.status(404).json({ ok: false, error: 'no_save' });

    // Уже открыт
    if (user.data.marketUnlocked) return res.json({ ok: true, alreadyUnlocked: true });

    // Атомарно списываем PIXR
    const result = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.pixr': { $gte: MARKET_OPEN_COST } },
      {
        $inc: { 'data.pixr': -MARKET_OPEN_COST },
        $set: { 'data.marketUnlocked': true, updatedAt: Date.now() }
      },
      { new: true }
    );
    if (!result) return res.status(400).json({ ok: false, error: 'not_enough_pixr' });

    console.log(`✅ [market] ${tg.id} открыл маркет`);
    res.json({ ok: true, pixr: result.data.pixr });
  } catch (e) {
    console.error('❌ [market/open] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Список активных лотов ──
app.post('/api/market/list', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const { rarity, type } = req.body || {};
    const filter = { status: 'active', expiresAt: { $gt: Date.now() } };
    if (rarity && rarity !== 'all') {
      if (rarity === 'book') {
        filter['item.isSkillBook'] = true;
      } else {
        filter['item.rarity'] = rarity;
        filter['item.isSkillBook'] = { $ne: true };
      }
    }
    const listings = await MarketListing.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ ok: true, listings });
  } catch (e) {
    console.error('❌ [market/list] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Мои лоты ──
app.post('/api/market/my', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const listings = await MarketListing.find({ sellerId: tg.id, status: 'active' })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ ok: true, listings });
  } catch (e) {
    console.error('❌ [market/my] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Выставить предмет ──
const _listingLocks = new Set();
app.post('/api/market/sell', async (req, res) => {
  console.log('📦 [market/sell] BODY:', req.body);
  
  const tg = authUser(req, res);
  if (!tg) {
    console.log('❌ [market/sell] auth failed');
    return res.status(401).json({ ok: false, error: 'auth_failed' });
  }
  
  if (_listingLocks.has(tg.id)) {
    return res.status(429).json({ ok: false, error: 'in_progress' });
  }
  _listingLocks.add(tg.id);
  
  try {
    const { itemId, price } = req.body || {};
    
    console.log(`📦 [market/sell] itemId=${itemId}, price=${price}, tg=${tg.id}`);
    
    // ✅ Проверяем что itemId и price есть
    if (itemId === undefined || itemId === null || !price || price < 1) {
      console.log('❌ [market/sell] bad_params:', { itemId, price });
      return res.status(400).json({ ok: false, error: 'bad_params' });
    }

    const user = await Save.findOne({ tgId: tg.id }).lean();
    if (!user || !user.data) {
      return res.status(404).json({ ok: false, error: 'no_save' });
    }
    
    if (!user.data.marketUnlocked) {
      return res.status(403).json({ ok: false, error: 'market_locked' });
    }

    const activeCount = await MarketListing.countDocuments({ 
      sellerId: tg.id, 
      status: 'active' 
    });
    if (activeCount >= MARKET_MAX_LOTS) {
      return res.status(400).json({ ok: false, error: 'max_lots' });
    }

    const inventory = user.data.inventory || [];
    // ✅ ИСПРАВЛЕННОЕ СРАВНЕНИЕ
    const itemIdx = inventory.findIndex(i => Number(i.id) === Number(itemId));
    if (itemIdx === -1) {
      console.log(`❌ [market/sell] item not found: ${itemId}`);
      return res.status(400).json({ ok: false, error: 'item_not_found' });
    }

    const item = inventory[itemIdx];
    console.log(`✅ [market/sell] item found: ${item.name}`);

    if (!item.isSkillBook && !MARKET_MIN_RARITY.includes(item.rarity)) {
      return res.status(400).json({ ok: false, error: 'rarity_too_low' });
    }
    if (item._equipped) {
      return res.status(400).json({ ok: false, error: 'item_equipped' });
    }

    // Удаляем предмет из инвентаря
    const updated = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.inventory': { $elemMatch: { id: item.id } } },
      { $pull: { 'data.inventory': { id: item.id } }, $set: { updatedAt: Date.now() } },
      { new: true }
    );
    if (!updated) {
      return res.status(400).json({ ok: false, error: 'item_not_found' });
    }

    const now = Date.now();
    const listingId = 'lst_' + now + '_' + Math.random().toString(36).substring(2, 6);
    const listing = await MarketListing.create({
      listingId,
      sellerId:   tg.id,
      sellerName: user.firstName || user.username || 'Игрок',
      item,
      price:      Math.floor(price),
      status:     'active',
      createdAt:  now,
      expiresAt:  now + MARKET_TTL_MS,
    });

    console.log(`✅ [market] ${tg.id} выставил ${item.name} за ${price} PIXR`);
    res.json({ ok: true, listing, inventory: updated.data.inventory });
    
  } catch (e) {
    console.error('❌ [market/sell] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    _listingLocks.delete(tg.id);
  }
});

// ── Купить лот ──
const _buyLocks = new Set();
app.post('/api/market/buy', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  if (_buyLocks.has(tg.id)) return res.status(429).json({ ok: false, error: 'in_progress' });
  _buyLocks.add(tg.id);
  try {
    const { listingId } = req.body || {};
    if (!listingId) return res.status(400).json({ ok: false, error: 'bad_params' });

    const user = await Save.findOne({ tgId: tg.id }).lean();
    if (!user || !user.data) return res.status(404).json({ ok: false, error: 'no_save' });
    if (!user.data.marketUnlocked) return res.status(403).json({ ok: false, error: 'market_locked' });

    // Берём лот
    const listing = await MarketListing.findOne({ listingId, status: 'active' }).lean();
    if (!listing) return res.status(400).json({ ok: false, error: 'listing_not_found' });
    if (listing.expiresAt <= Date.now()) return res.status(400).json({ ok: false, error: 'listing_expired' });
    if (listing.sellerId === tg.id) return res.status(400).json({ ok: false, error: 'own_listing' });

    const price = listing.price;

    // Атомарно списываем PIXR у покупателя
    const buyer = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.pixr': { $gte: price } },
      {
        $inc: { 'data.pixr': -price },
        $push: { 'data.inventory': listing.item },
        $set: { updatedAt: Date.now() }
      },
      { new: true }
    );
    if (!buyer) return res.status(400).json({ ok: false, error: 'not_enough_pixr' });

    // Атомарно закрываем лот — защита от гонки, двое не купят одновременно
    const sold = await MarketListing.findOneAndUpdate(
      { listingId, status: 'active' },
      {
        $set: {
          status: 'sold',
          buyerId: tg.id,
          buyerName: user.data.firstName || user.username || 'Игрок',
          soldAt: Date.now(),
        }
      },
      { new: false }
    );
    if (!sold) {
      // Лот уже купили — откатываем у покупателя
      await Save.findOneAndUpdate(
        { tgId: tg.id },
        {
          $inc: { 'data.pixr': price },
          $pull: { 'data.inventory': { id: listing.item.id } }
        }
      );
      return res.status(400).json({ ok: false, error: 'already_sold' });
    }

    // Начисляем продавцу 90%
    const sellerEarns = Math.floor(price * (1 - MARKET_COMMISSION));
    await Save.findOneAndUpdate(
      { tgId: listing.sellerId },
      { $inc: { 'data.pixr': sellerEarns } }
    );

    notifyClient(listing.sellerId, 'market_sold', {
      listingId,
      itemName: listing.item.name,
      earned:   sellerEarns,
    });

    console.log(`✅ [market] ${tg.id} купил "${listing.item.name}" у ${listing.sellerId} за ${price} PIXR`);
    res.json({ ok: true, item: listing.item, pixr: buyer.data.pixr });
  } catch (e) {
    console.error('❌ [market/buy] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    _buyLocks.delete(tg.id);
  }
});

// ── Снять лот с продажи ──
app.post('/api/market/cancel', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const { listingId } = req.body || {};
    if (!listingId) return res.status(400).json({ ok: false, error: 'bad_params' });

    // Атомарно — только свой лот, только active
    const cancelled = await MarketListing.findOneAndUpdate(
      { listingId, sellerId: tg.id, status: 'active' },
      { $set: { status: 'cancelled', cancelledAt: Date.now() } },
      { new: false }
    );
    if (!cancelled) return res.status(400).json({ ok: false, error: 'listing_not_found' });

    // Возвращаем предмет в инвентарь
    const updated = await Save.findOneAndUpdate(
      { tgId: tg.id },
      { $push: { 'data.inventory': cancelled.item }, $set: { updatedAt: Date.now() } },
      { new: true }
    );

    console.log(`✅ [market] ${tg.id} снял лот ${listingId}`);
    res.json({ ok: true, item: cancelled.item, inventory: updated.data.inventory });
  } catch (e) {
    console.error('❌ [market/cancel] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});


// ═══════════════════════════════
//  ПОКУПКА УЛУЧШЕНИЙ (атомарно)
// ═══════════════════════════════
app.post('/api/upgrade', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  
  const { upgId, cost, stat, bonus } = req.body;
  if (!upgId || !cost) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  
  try {
    const user = await Save.findOne({ tgId: tg.id });
    if (!user) {
      return res.status(404).json({ ok: false, error: 'user_not_found' });
    }
    
    if (!user.data) user.data = {};
    if (!user.data.upg) user.data.upg = {};
    if (!user.data.baseStats) user.data.baseStats = {};
    
    const currentGold = user.data.gold || 0;
    if (currentGold < cost) {
      return res.status(400).json({ ok: false, error: 'not_enough_gold' });
    }
    
    const currentLv = user.data.upg[upgId] || 0;
    const maxLv = 60;
    if (currentLv >= maxLv) {
      return res.status(400).json({ ok: false, error: 'max_level' });
    }
    
    const incObj = {
      'data.gold': -cost,
    };
    incObj['data.upg.' + upgId] = 1;
    if (stat && bonus) {
      incObj['data.baseStats.' + stat] = bonus;
    }
    
    const result = await Save.findOneAndUpdate(
      { 
        tgId: tg.id,
        'data.gold': { $gte: cost }
      },
      {
        $inc: incObj,
        $set: { updatedAt: Date.now() }
      },
      { new: true }
    );
    
    if (!result) {
      return res.status(400).json({ ok: false, error: 'not_enough_gold' });
    }
    
    console.log(`✅ [upgrade] ${tg.id} купил ${upgId}, осталось ${result.data.gold}`);
    
    res.json({
      ok: true,
      gold: result.data.gold || 0,
      upgLevel: (result.data.upg && result.data.upg[upgId]) || 1,
      baseStats: result.data.baseStats || {}
    });
  } catch (e) {
    console.error('❌ [upgrade] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});


// ═══════════════════════════════
//  PvP АРЕНА
// ═══════════════════════════════

// Базовые статы персонажей (зеркало data.js CHARS.baseStats)
const CHARS_BASE = {
  fire:  { atk: 18, def: 4,  spd: 3,  hp: 85,  crit: 6,  dodge: 3, atkSpd: 1.2, critDmg: 0 },
  light: { atk: 8,  def: 14, spd: 3,  hp: 130, crit: 4,  dodge: 4, atkSpd: 0.8, critDmg: 0 },
  water: { atk: 12, def: 6,  spd: 4,  hp: 95,  crit: 22, dodge: 5, atkSpd: 1.0, critDmg: 0 },
};

// Зеркало UPG_DEFS из data.js
const UPG_DEFS_SRV = [
  { id: 'atk',     stat: 'atk',     bonus: 3    },
  { id: 'def',     stat: 'def',     bonus: 2    },
  { id: 'hp',      stat: 'hp',      bonus: 15   },
  { id: 'spd',     stat: 'spd',     bonus: 1    },
  { id: 'atkSpd',  stat: 'atkSpd',  bonus: 0.15 },
  { id: 'crit',    stat: 'crit',    bonus: 3    },
  { id: 'critDmg', stat: 'critDmg', bonus: 0.1  },
  { id: 'dodge',   stat: 'dodge',   bonus: 2    },
];

// Пересчёт полных статов игрока (база + улучшения + уровень + экипировка)
// Зеркало логики applySnapshot + recalcStats с клиента
function calcFullStats(data) {
  const charId = data.charId;
  const charBase = CHARS_BASE[charId];
  if (!charBase) return data.stats || {};

  // 1. Начинаем с базы персонажа
  const base = Object.assign({}, charBase);

  // 2. Применяем улучшения (upg)
  const upg = data.upg || {};
  UPG_DEFS_SRV.forEach(u => {
    const lv = upg[u.id] || 0;
    if (lv > 0) {
      base[u.stat] = parseFloat(((base[u.stat] || 0) + u.bonus * lv).toFixed(4));
    }
  });

  // 3. Бонусы уровня (как в applySnapshot)
  const lvBonuses = (data.level || 1) - 1;
  if (lvBonuses > 0) {
    base.atk    = (base.atk    || 0) + lvBonuses * 2;
    base.def    = (base.def    || 0) + lvBonuses * 1;
    base.hp     = (base.hp     || 0) + lvBonuses * 10;
    base.atkSpd = parseFloat(((base.atkSpd || 1.0) + lvBonuses * 0.02).toFixed(4));
  }

  // 4. Суммируем бонусы от экипировки
  // inventory хранит полные объекты, equipped хранит id предметов
  const inventory = data.inventory || [];
  const equipped  = data.equipped  || {};
  const EQUIP_SLOTS = ['weapon','body','legs','gloves','belt','ring','boots','helmet'];
  const bonus = { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0, critDmg: 0 };

  EQUIP_SLOTS.forEach(slot => {
    const itemId = equipped[slot];
    if (!itemId) return;
    // Ищем предмет в инвентаре по id
    const item = inventory.find(i => i.id === itemId);
    if (!item || !item.stats) return;
    Object.keys(item.stats).forEach(stat => {
      bonus[stat] = (bonus[stat] || 0) + (item.stats[stat] || 0);
    });
  });

  // 5. Итоговые статы
  const stats = {};
  ['atk','def','hp','spd','crit','dodge','atkSpd','critDmg'].forEach(s => {
    stats[s] = (base[s] || 0) + (bonus[s] || 0);
  });
  stats.hp    = Math.floor(stats.hp);
  stats.atk   = Math.floor(stats.atk);
  stats.def   = Math.floor(stats.def);
  stats.crit  = Math.floor(stats.crit);
  stats.dodge = Math.floor(stats.dodge);
  stats.atkSpd = parseFloat((stats.atkSpd || 1.0).toFixed(4));

  return stats;
}

// Получить 3 случайных противника из рейтинга ±200 очков
app.post('/api/pvp/opponents', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const doc = await Save.findOne({ tgId: tg.id }).lean();
    if (!doc || !doc.data) return res.json({ ok: false, error: 'no_save' });

    const myRating = doc.data.arenaRating || 1000;
    const minR = myRating - 200;
    const maxR = myRating + 200;

    // Берём игроков в диапазоне рейтинга, исключая себя
    const pool = await Save.find({
      tgId: { $ne: tg.id },
      'data.arenaRating': { $gte: minR, $lte: maxR },
      'data.charId': { $ne: null },
    }, 'tgId firstName username charId data.arenaRating data.stats data.baseStats data.upg data.skills data.equipped data.level data.charId').lean();

    // Если мало игроков в диапазоне — добавляем произвольных
    let candidates = pool;
    if (candidates.length < 5) {
      const extra = await Save.find({
        tgId: { $ne: tg.id },
        'data.charId': { $ne: null },
      }, 'tgId firstName username charId data.arenaRating data.stats data.baseStats data.upg data.skills data.equipped data.level data.charId').limit(30).lean();
      const extraFiltered = extra.filter(e => !candidates.find(c => c.tgId === e.tgId));
      candidates = candidates.concat(extraFiltered);
    }

    // Перемешиваем и берём 3
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const chosen = candidates.slice(0, 3).map(p => {
      const d = p.data || {};
      const fullStats = calcFullStats(d);
      return {
        tgId:     p.tgId,
        name:     p.firstName || p.username || 'Игрок',
        charId:   d.charId || p.charId,
        level:    d.level  || 1,
        rating:   d.arenaRating || 1000,
        stats:    fullStats,
        maxHp:    fullStats.hp || 100,
        skills:   d.skills || {},
      };
    });

    res.json({ ok: true, opponents: chosen, myRating });
  } catch (e) {
    console.error('❌ [pvp/opponents]', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Сохранить результат PvP боя
app.post('/api/pvp/result', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const { opponentId, won, myDmg, oppDmg } = req.body;
    if (!opponentId) return res.json({ ok: false, error: 'bad_params' });

    const [myDoc, oppDoc] = await Promise.all([
      Save.findOne({ tgId: tg.id }).lean(),
      Save.findOne({ tgId: opponentId }).lean(),
    ]);
    if (!myDoc || !myDoc.data) return res.json({ ok: false, error: 'no_save' });

    // Проверка попыток (10 в день, сброс в полночь UTC)
    const todayStr = new Date().toISOString().slice(0, 10);
    const data = myDoc.data;
    const pvpDate = data.pvpAttemptsDate || '';
    let pvpAttempts = (pvpDate === todayStr) ? (data.pvpAttempts || 0) : 0;

    if (pvpAttempts >= 10) {
      return res.json({ ok: false, error: 'no_attempts' });
    }

    const myRating   = data.arenaRating || 1000;
    const oppRating  = (oppDoc && oppDoc.data && oppDoc.data.arenaRating) || 1000;

    // Очки: победа над сильнее = +10, над слабее = +5; поражение = -5
    let ratingChange = 0;
    if (won) {
      ratingChange = (oppRating >= myRating) ? 10 : 5;
    } else {
      ratingChange = -5;
    }

    const newMyRating  = Math.max(0, myRating + ratingChange);
    const newOppRating = oppDoc ? Math.max(0, oppRating + (won ? 0 : 0)) : oppRating;
    const now = Date.now();

    // Обновляем рейтинг атакующего
    await Save.findOneAndUpdate(
      { tgId: tg.id },
      {
        $set: {
          'data.arenaRating':      newMyRating,
          'data.pvpAttempts':      pvpAttempts + 1,
          'data.pvpAttemptsDate':  todayStr,
          'data.updatedAt':        now,
          updatedAt:               now,
        }
      }
    );

    // Сохраняем историю боя
    const battleId = tg.id + '_' + opponentId + '_' + now;
    const oppName  = (oppDoc && (oppDoc.firstName || oppDoc.username)) || 'Игрок';
    const oppChar  = (oppDoc && oppDoc.data && oppDoc.data.charId) || null;

    await PvpBattle.create({
      battleId,
      attackerId:   tg.id,
      defenderId:   opponentId,
      attackerName: tg.firstName || tg.username || 'Игрок',
      defenderName: oppName,
      attackerChar: data.charId || null,
      defenderChar: oppChar,
      winnerId:     won ? tg.id : opponentId,
      ratingChange,
      attackerRatingBefore: myRating,
      defenderRatingBefore: oppRating,
      attackerDmgDealt: myDmg || 0,
      defenderDmgDealt: oppDmg || 0,
      createdAt: now,
    }).catch(() => {}); // Игнорируем ошибки дубликата

    res.json({
      ok: true,
      won,
      ratingChange,
      newRating: newMyRating,
      attemptsLeft: 10 - (pvpAttempts + 1),
    });
  } catch (e) {
    console.error('❌ [pvp/result]', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Топ-50 по рейтингу арены
app.post('/api/pvp/rating', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const top = await Save.find(
      { 'data.arenaRating': { $exists: true }, 'data.charId': { $ne: null } },
      'tgId firstName username charId data.arenaRating data.level data.charId'
    ).sort({ 'data.arenaRating': -1 }).limit(50).lean();

    const players = top.map(p => ({
      tgId:   p.tgId,
      name:   p.firstName || p.username || 'Игрок',
      charId: (p.data && p.data.charId) || p.charId,
      level:  (p.data && p.data.level) || 1,
      rating: (p.data && p.data.arenaRating) || 1000,
    }));

    const myDoc = await Save.findOne({ tgId: tg.id }, 'data.arenaRating').lean();
    const myRating = (myDoc && myDoc.data && myDoc.data.arenaRating) || 1000;

    res.json({ ok: true, players, myRating, tgId: tg.id });
  } catch (e) {
    console.error('❌ [pvp/rating]', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// История боёв (20 последних)
app.post('/api/pvp/history', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const battles = await PvpBattle.find({
      $or: [{ attackerId: tg.id }, { defenderId: tg.id }]
    }).sort({ createdAt: -1 }).limit(20).lean();

    res.json({ ok: true, battles, tgId: tg.id });
  } catch (e) {
    console.error('❌ [pvp/history]', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════
//  БОТ: внутренний роут для транзакций
// ═══════════════════════════════
app.post('/bot/transaction/:txId/:action', async (req, res) => {
  const secret = req.headers['x-bot-secret'];
  if (!secret || secret !== BOT_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const { txId, action } = req.params;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'invalid_action' });
  }

  try {
    // ✅ Атомарно меняем статус — защита от двойного одобрения
    const tx = await Transaction.findOneAndUpdate(
      { id: txId, status: 'pending' },
      { $set: { status: action === 'approve' ? 'approved' : 'rejected',
                [action === 'approve' ? 'approvedAt' : 'rejectedAt']: Date.now() } },
      { new: false }
    );
    if (!tx) {
      const existing = await Transaction.findOne({ id: txId }).lean();
      if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.status(400).json({ ok: false, error: 'already_processed' });
    }

    if (action === 'approve') {
      const gramDelta = tx.type === 'deposit' ? tx.amount : -tx.amount;
      
      console.log(`💰 [bot] Начисление ${gramDelta} GRAM пользователю ${tx.userId} (tx: ${txId})`);
      
      const newUpdatedAt = Date.now();
      
      const result = await Save.findOneAndUpdate(
        { tgId: tx.userId },
        { 
          $inc: { 'data.gram': gramDelta },
          $set: { 
            'data.updatedAt': newUpdatedAt,
            updatedAt: newUpdatedAt 
          }
        },
        { new: true }
      );
      
      console.log(`💰 [bot] Новый баланс пользователя ${tx.userId}: ${result?.data?.gram || 0} GRAM`);
      
      notifyClient(tx.userId, 'reload', { 
        reason: 'balance_updated',
        gram: result?.data?.gram || 0
      });
    }

    await logAdminAction('bot', action + '_transaction', tx.userId, { txId, amount: tx.amount });

    if (bot) {
      const statusText = action === 'approve' ? '✅ Подтверждена' : '❌ Отклонена';
      const msg = `💰 *Транзакция ${statusText}*\n\n*Тип:* ${tx.type === 'deposit' ? 'Пополнение' : 'Вывод'}\n*Сумма:* ${tx.amount} GRAM\n${action === 'approve' ? '✅ Баланс обновлён!' : '❌ Средства не зачислены.'}\n\n🔄 *Для обновления баланса перезапустите игру или нажмите "Обновить" в кошельке.*`;
      try { await bot.sendMessage(tx.userId, msg, { parse_mode: 'Markdown' }); } catch (e) {}
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('❌ [bot-tx] error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ═══════════════════════════════
//  Запуск
// ═══════════════════════════════
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server on :${PORT}`);
  console.log(`📊 MongoDB: 5GB, Pool: 50`);
});

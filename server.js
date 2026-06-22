require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================
// КОНФИГУРАЦИЯ
// ============================================
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pixelrunner';
const BOT_TOKEN = process.env.BOT_TOKEN;

// ============================================
// ПОДКЛЮЧЕНИЕ К MONGODB
// ============================================
mongoose.connect(MONGODB_URI);
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB error:'));
db.once('open', () => console.log('✅ MongoDB connected'));

// ============================================
// СХЕМА ИГРОКА
// ============================================
const playerSchema = new mongoose.Schema({
  // Telegram данные
  telegramId: { type: String, required: true, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  photoUrl: String,

  // Выбранный персонаж
  charClass: { type: String, default: null }, // fire | light | water | null

  // Прогресс
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  xpNeeded: { type: Number, default: 100 },
  floor: { type: Number, default: 1 },
  maxFloor: { type: Number, default: 1 },
  killCount: { type: Number, default: 0 },

  // Характеристики
  stats: {
    atk: { type: Number, default: 10 },
    def: { type: Number, default: 5 },
    spd: { type: Number, default: 3 },
    hp: { type: Number, default: 100 },
    crit: { type: Number, default: 5 },
    dodge: { type: Number, default: 3 },
    atkSpd: { type: Number, default: 1.0 }
  },
  hp: { type: Number, default: 100 },
  maxHp: { type: Number, default: 100 },

  // Улучшения
  upg: {
    atk: { type: Number, default: 0 },
    def: { type: Number, default: 0 },
    hp: { type: Number, default: 0 },
    spd: { type: Number, default: 0 },
    crit: { type: Number, default: 0 },
    dodge: { type: Number, default: 0 },
    atkSpd: { type: Number, default: 0 }
  },

  // Инвентарь (полный массив)
  inventory: { type: Array, default: [] },

  // Экипировка
  equipped: {
    weapon: { type: Object, default: null },
    body: { type: Object, default: null },
    legs: { type: Object, default: null },
    gloves: { type: Object, default: null },
    boots: { type: Object, default: null },
    helmet: { type: Object, default: null },
    ring: { type: Object, default: null },
    belt: { type: Object, default: null }
  },

  // Навыки
  skills: { type: Object, default: {} },

  // Ресурсы
  gold: { type: Number, default: 0 },
  pixr: { type: Number, default: 0 },
  gram: { type: Number, default: 0 },
  potions: { type: Number, default: 0 },
  potionLv: { type: Number, default: 0 },
  potionThreshold: { type: Number, default: 30 },

  // Battle Pass
  bp: {
    active: { type: Boolean, default: false },
    claimed: { type: Array, default: [] }
  },

  // Premium
  prem: {
    tier: { type: String, default: null },
    expiresAt: { type: Number, default: 0 }
  },

  // Версия и метаданные
  version: { type: Number, default: 0 },
  updatedAt: { type: Number, default: Date.now },
  createdAt: { type: Number, default: Date.now }
});

const Player = mongoose.model('Player', playerSchema);

// ============================================
// ВАЛИДАЦИЯ TELEGRAM INITDATA
// ============================================
function validateTelegramInitData(initData) {
  if (!initData || !BOT_TOKEN) return false;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const sortedKeys = Array.from(params.keys()).sort();
  const dataCheckString = sortedKeys.map(key => `${key}=${params.get(key)}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return computedHash === hash;
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================
function getDefaultPlayer() {
  return {
    level: 1,
    xp: 0,
    xpNeeded: 100,
    floor: 1,
    maxFloor: 1,
    killCount: 0,
    stats: { atk: 10, def: 5, spd: 3, hp: 100, crit: 5, dodge: 3, atkSpd: 1.0 },
    hp: 100,
    maxHp: 100,
    upg: { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0 },
    inventory: [],
    equipped: { weapon: null, body: null, legs: null, gloves: null, boots: null, helmet: null, ring: null, belt: null },
    skills: {},
    gold: 0,
    pixr: 0,
    gram: 0,
    potions: 0,
    potionLv: 0,
    potionThreshold: 30,
    bp: { active: false, claimed: [] },
    prem: { tier: null, expiresAt: 0 },
    version: 0
  };
}

// ============================================
// API РОУТЫ
// ============================================

// ─── АВТОРИЗАЦИЯ ───
app.post('/api/auth', async (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!validateTelegramInitData(initData)) {
      return res.status(401).json({ error: 'Invalid Telegram data' });
    }

    const params = new URLSearchParams(initData);
    const userData = JSON.parse(params.get('user') || '{}');
    
    const telegramId = String(userData.id);
    const username = userData.username || userData.first_name || 'Player';

    // Ищем или создаем игрока
    let player = await Player.findOne({ telegramId });

    if (!player) {
      player = new Player({
        telegramId,
        username,
        firstName: userData.first_name,
        lastName: userData.last_name,
        photoUrl: userData.photo_url,
        ...getDefaultPlayer()
      });
      await player.save();
      console.log(`🆕 New player: ${username} (${telegramId})`);
    }

    res.json({
      success: true,
      player: {
        telegramId: player.telegramId,
        username: player.username,
        charClass: player.charClass,
        hasCharacter: !!player.charClass
      }
    });

  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Auth failed' });
  }
});

// ─── ПОЛУЧИТЬ ИГРОКА ───
app.get('/api/player/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const player = await Player.findOne({ telegramId });

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({
      success: true,
      player: {
        telegramId: player.telegramId,
        username: player.username,
        charClass: player.charClass,
        level: player.level,
        xp: player.xp,
        xpNeeded: player.xpNeeded,
        floor: player.floor,
        maxFloor: player.maxFloor,
        killCount: player.killCount,
        stats: player.stats,
        hp: player.hp,
        maxHp: player.maxHp,
        upg: player.upg,
        inventory: player.inventory,
        equipped: player.equipped,
        skills: player.skills,
        gold: player.gold,
        pixr: player.pixr,
        gram: player.gram,
        potions: player.potions,
        potionLv: player.potionLv,
        potionThreshold: player.potionThreshold,
        bp: player.bp,
        prem: player.prem,
        version: player.version,
        updatedAt: player.updatedAt
      }
    });

  } catch (error) {
    console.error('Get player error:', error);
    res.status(500).json({ error: 'Failed to get player' });
  }
});

// ─── СОХРАНИТЬ ВЫБОР ПЕРСОНАЖА ───
app.post('/api/char', async (req, res) => {
  try {
    const { telegramId, charClass } = req.body;

    if (!['fire', 'light', 'water'].includes(charClass)) {
      return res.status(400).json({ error: 'Invalid character class' });
    }

    const player = await Player.findOne({ telegramId });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    player.charClass = charClass;
    player.version += 1;
    player.updatedAt = Date.now();
    await player.save();

    res.json({ success: true, charClass });

  } catch (error) {
    console.error('Save char error:', error);
    res.status(500).json({ error: 'Failed to save character' });
  }
});

// ─── СОХРАНИТЬ ПОЛНЫЙ СНЕПШОТ ───
app.post('/api/save', async (req, res) => {
  try {
    const { telegramId, data, version } = req.body;

    if (!telegramId || !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    const player = await Player.findOne({ telegramId });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Проверяем версию (защита от конфликтов)
    if (version < player.version) {
      return res.status(409).json({ 
        error: 'Conflict: server has newer version',
        serverVersion: player.version 
      });
    }

    // Обновляем все поля
    const allowedFields = [
      'level', 'xp', 'xpNeeded', 'floor', 'maxFloor', 'killCount',
      'stats', 'hp', 'maxHp', 'upg', 'inventory', 'equipped', 'skills',
      'gold', 'pixr', 'gram', 'potions', 'potionLv', 'potionThreshold',
      'bp', 'prem'
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        player[field] = data[field];
      }
    }

    player.version = version + 1;
    player.updatedAt = Date.now();
    await player.save();

    res.json({ 
      success: true, 
      version: player.version,
      updatedAt: player.updatedAt
    });

  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to save' });
  }
});

// ─── РЕЙТИНГ ───
app.get('/api/ranking', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const players = await Player.find()
      .select('telegramId username level floor gold stats')
      .sort({ level: -1 })
      .limit(limit);

    // Рассчитываем CP
    const ranking = players.map(p => {
      const s = p.stats || { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0 };
      const cp = Math.floor(
        (s.atk || 0) * 4 + 
        (s.def || 0) * 3 + 
        (s.hp || 0) * 0.5 + 
        (s.spd || 0) * 6 + 
        (s.crit || 0) * 8 + 
        (s.dodge || 0) * 8 +
        (p.level || 1) * 20
      );
      return {
        username: p.username || 'Player',
        level: p.level || 1,
        floor: p.floor || 1,
        gold: p.gold || 0,
        cp
      };
    });

    res.json({ success: true, ranking });

  } catch (error) {
    console.error('Ranking error:', error);
    res.status(500).json({ error: 'Failed to get ranking' });
  }
});

// ─── ПРОВЕРКА ЗДОРОВЬЯ ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
});
/*
  ══════════════════════════════════════════════════════
  api.js — Клиент для общения с сервером
  ══════════════════════════════════════════════════════
*/

const API_URL = 'https://ghz-production.up.railway.app/api';

// ============================================
// СОСТОЯНИЕ
// ============================================
let apiTelegramId = null;
let apiCharClass = null;
let apiHasCharacter = false;
let apiIsAuthenticated = false;
let apiSaveQueue = [];
let apiIsSaving = false;
let apiVersion = 0;

// ============================================
// АВТОРИЗАЦИЯ
// ============================================
async function apiAuth() {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      console.warn('⚠️ Telegram WebApp not available');
      return false;
    }

    const initData = tg.initData;
    if (!initData) {
      console.warn('⚠️ No initData');
      return false;
    }

    const response = await fetch(`${API_URL}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });

    if (!response.ok) {
      throw new Error('Auth failed');
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error('Auth failed');
    }

    apiTelegramId = data.player.telegramId;
    apiCharClass = data.player.charClass;
    apiHasCharacter = data.player.hasCharacter;
    apiIsAuthenticated = true;

    console.log(`✅ Authenticated: ${apiTelegramId}`);
    return true;

  } catch (error) {
    console.error('❌ Auth error:', error);
    return false;
  }
}

// ============================================
// ЗАГРУЗКА ИГРОКА С СЕРВЕРА
// ============================================
async function apiLoadPlayer() {
  if (!apiTelegramId) {
    console.error('❌ Not authenticated');
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/player/${apiTelegramId}`);
    if (!response.ok) {
      throw new Error('Failed to load player');
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error('Failed to load player');
    }

    apiVersion = data.player.version || 0;
    return data.player;

  } catch (error) {
    console.error('❌ Load player error:', error);
    return null;
  }
}

// ============================================
// СОХРАНЕНИЕ ВЫБОРА ПЕРСОНАЖА
// ============================================
async function apiSaveChar(charClass) {
  if (!apiTelegramId) {
    console.error('❌ Not authenticated');
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/char`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: apiTelegramId, charClass })
    });

    if (!response.ok) {
      throw new Error('Failed to save character');
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error('Failed to save character');
    }

    apiCharClass = charClass;
    apiHasCharacter = true;
    console.log(`✅ Character saved: ${charClass}`);
    return true;

  } catch (error) {
    console.error('❌ Save char error:', error);
    return false;
  }
}

// ============================================
// СОХРАНЕНИЕ ПОЛНОГО СНЕПШОТА
// ============================================
async function apiSaveFullSnapshot() {
  if (!apiTelegramId) {
    console.error('❌ Not authenticated');
    return false;
  }

  if (apiIsSaving) {
    // Если уже сохраняем, добавляем в очередь
    return false;
  }

  apiIsSaving = true;

  try {
    // Формируем данные для сохранения
    const data = {
      level: G.level,
      xp: G.xp,
      xpNeeded: G.xpNeeded,
      floor: G.floor,
      maxFloor: G.maxFloor,
      killCount: G.killCount,
      stats: G.stats,
      hp: G.hp,
      maxHp: G.maxHp,
      upg: G.upg,
      inventory: G.inventory,
      equipped: G.equipped,
      skills: G.skills,
      gold: G.gold,
      pixr: G.pixr,
      gram: G.gram,
      potions: G.potions,
      potionLv: G.potionLv,
      potionThreshold: G.potionThreshold,
      bp: G.bp,
      prem: G.prem
    };

    const response = await fetch(`${API_URL}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramId: apiTelegramId,
        data: data,
        version: apiVersion
      })
    });

    if (response.status === 409) {
      // Конфликт версий - загружаем свежие данные
      console.warn('⚠️ Version conflict, reloading...');
      await syncFullReload();
      apiIsSaving = false;
      return false;
    }

    if (!response.ok) {
      throw new Error('Save failed');
    }

    const result = await response.json();
    apiVersion = result.version;

    // Очищаем очередь сохранений
    apiSaveQueue = [];
    return true;

  } catch (error) {
    console.error('❌ Save error:', error);
    // Добавляем в очередь для повторной попытки
    apiSaveQueue.push(Date.now());
    return false;
  } finally {
    apiIsSaving = false;
  }
}

// ============================================
// ПОЛНАЯ СИНХРОНИЗАЦИЯ
// ============================================
async function syncFullReload() {
  try {
    const player = await apiLoadPlayer();
    if (!player) return false;

    // Обновляем G объект
    Object.assign(G, {
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
      prem: player.prem
    });

    // Обновляем базовые статы
    G.baseStats = { ...player.stats };

    // Применяем персонажа
    if (player.charClass && player.charClass !== G_CHAR?.id) {
      const charData = CHARS[player.charClass];
      if (charData) {
        G_CHAR = charData;
        applyCharacter(charData);
      }
    }

    // Пересчитываем статы и обновляем HUD
    recalcStats();
    updateHUD();
    updatePotionHud();
    updateSkillsHud();

    console.log('✅ Full sync completed');
    return true;

  } catch (error) {
    console.error('❌ Full reload error:', error);
    return false;
  }
}

// ============================================
// СИНХРОНИЗАЦИЯ ПО РАСПИСАНИЮ
// ============================================
function apiStartSync(intervalMs = 30000) {
  // Очищаем старый интервал
  if (window._syncInterval) {
    clearInterval(window._syncInterval);
  }

  // Запускаем новый
  window._syncInterval = setInterval(async () => {
    // Проверяем есть ли изменения
    const hasChanges = apiSaveQueue.length > 0 || true; // Сохраняем всегда
    if (hasChanges) {
      await apiSaveFullSnapshot();
    }
  }, intervalMs);

  console.log(`🔄 Sync started (interval: ${intervalMs}ms)`);
}

// ============================================
// ЭКСТРЕННОЕ СОХРАНЕНИЕ (при закрытии)
// ============================================
function apiEmergencySave() {
  // Используем sendBeacon для надежности
  if (!apiTelegramId) return;

  try {
    const data = {
      telegramId: apiTelegramId,
      data: {
        level: G.level,
        xp: G.xp,
        floor: G.floor,
        stats: G.stats,
        hp: G.hp,
        maxHp: G.maxHp,
        inventory: G.inventory,
        equipped: G.equipped,
        gold: G.gold,
        pixr: G.pixr,
        gram: G.gram,
        potions: G.potions
      },
      version: apiVersion
    };

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    navigator.sendBeacon(`${API_URL}/save`, blob);

    console.log('📤 Emergency save sent');

  } catch (error) {
    console.error('❌ Emergency save error:', error);
  }
}

// ============================================
// ЗАГРУЗКА РЕЙТИНГА
// ============================================
async function apiLoadRanking(limit = 50) {
  try {
    const response = await fetch(`${API_URL}/ranking?limit=${limit}`);
    if (!response.ok) {
      throw new Error('Failed to load ranking');
    }

    const data = await response.json();
    return data.ranking || [];

  } catch (error) {
    console.error('❌ Ranking error:', error);
    return [];
  }
}

// ============================================
// ПРОВЕРКА СОЕДИНЕНИЯ С СЕРВЕРОМ
// ============================================
async function apiCheckHealth() {
  try {
    const response = await fetch(`${API_URL}/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ API
// ============================================
async function initAPI() {
  // 1. Авторизация
  const authOk = await apiAuth();
  if (!authOk) {
    return { success: false, error: 'auth' };
  }

  // 2. Загрузка игрока
  const player = await apiLoadPlayer();
  if (!player) {
    return { success: false, error: 'load' };
  }

  // 3. Проверяем есть ли персонаж
  if (!apiHasCharacter) {
    return { success: true, needCharSelect: true };
  }

  // 4. Применяем данные
  Object.assign(G, {
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
    prem: player.prem
  });

  G.baseStats = { ...player.stats };
  apiVersion = player.version;

  // 5. Применяем персонажа
  if (player.charClass) {
    const charData = CHARS[player.charClass];
    if (charData) {
      G_CHAR = charData;
      applyCharacter(charData);
    }
  }

  // 6. Пересчитываем и обновляем
  recalcStats();
  updateHUD();
  updatePotionHud();
  updateSkillsHud();

  // 7. Запускаем синхронизацию
  apiStartSync(30000);

  // 8. Настраиваем экстренное сохранение
  window.addEventListener('pagehide', apiEmergencySave);
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      apiEmergencySave();
    }
  });

  // 9. Настраиваем Telegram события
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.onEvent('viewportChanged', () => {
      if (tg.viewportHeight < 100) {
        apiEmergencySave();
      }
    });
  }

  return { success: true, needCharSelect: false };
}
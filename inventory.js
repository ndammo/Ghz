/*
  ══════════════════════════════════════════════════════
  inventory.js — Система инвентаря и предметов
  Содержит: генерацию предметов, шанс дропа, надевание/
  снятие/уничтожение, модальное окно предмета, систему
  заточки (+1..+10), книги навыков, рендер инвентаря
  ══════════════════════════════════════════════════════
*/

var _invIdCounter  = 0;
var _modalItemId   = null;
var _invSelectMode = false;
var _invSelected   = {};  // { itemId: true }

// ═══════════════════════════════
//  ГЕНЕРАЦИЯ ПРЕДМЕТОВ
// ═══════════════════════════════

// Диапазон редкости по этажу
var FLOOR_MAX_RARITY = { 1:'common', 2:'uncommon', 3:'uncommon', 4:'rare', 5:'rare', 6:'rare', 7:'epic', 8:'epic', 9:'legend', 10:'legend' };
var FLOOR_MIN_RARITY = { 1:'common', 2:'common', 3:'common', 4:'common', 5:'common', 6:'common', 7:'common', 8:'uncommon', 9:'uncommon', 10:'uncommon' };

// Розыгрыш редкости с учётом этажа (выше этаж — выше шанс редкого)
function rollRarity(floor) {
  var rarityOrder = ['common','uncommon','rare','epic','legend'];
  var maxIdx = rarityOrder.indexOf(FLOOR_MAX_RARITY[floor] || 'legend');
  var minIdx = rarityOrder.indexOf(FLOOR_MIN_RARITY[floor] || 'common');
  var bonus = (floor - 1) * 0.3;
  var weights = RARITIES.map(function(r, i) {
    if (i > maxIdx || i < minIdx) return 0;
    return Math.max(0.1, r.weight - i * bonus * 0.8 + (i > 1 ? bonus * i * 0.5 : 0));
  });
  var total = weights.reduce(function(a, b) { return a + b; }, 0);
  var roll = Math.random() * total, cum = 0;
  for (var i = 0; i < RARITIES.length; i++) {
    if (weights[i] === 0) continue;
    cum += weights[i];
    if (roll <= cum) return RARITIES[i];
  }
  return RARITIES[minIdx];
}

// Множитель статов по редкости
function rarityMultiplier(rarityId) {
  var idx = RARITIES.findIndex(function(r) { return r.id === rarityId; });
  return 1 + idx * 0.55;
}

// Создание случайного предмета
function generateItem(floor) {
  var rarity = rollRarity(floor);
  var itemLv  = Math.max(1, floor * 2 + Math.floor(Math.random() * 3) - 1);
  var mult    = rarityMultiplier(rarity.id);
  var base    = itemLv * 2.5;

  // 25% шанс — посох (только для своего класса)
  var type;
  if (Math.random() < 0.25) {
    type = STAFF_TYPES[Math.floor(Math.random() * STAFF_TYPES.length)];
  } else {
    type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
  }

  var stats = {};
  type.stats.forEach(function(s) {
    var isPrimary = (s === type.primary);
    var val = Math.floor(base * mult * (isPrimary ? 1.0 : 0.45) * (0.85 + Math.random() * 0.3));
    if (val > 0) stats[s] = val;
  });
  // Легендарный — дополнительный случайный стат
  if (rarity.id === 'legend') {
    var bonus = ['atk','def','hp','crit','dodge','spd'].filter(function(s) { return !stats[s]; });
    if (bonus.length) stats[bonus[Math.floor(Math.random() * bonus.length)]] = Math.floor(base * 0.5);
  }

  return {
    id: ++_invIdCounter, slot: type.slot, name: type.name,
    icon: itemIcon(type.slot, rarity.id, type.forClass || null),
    rarity: rarity.id, level: itemLv, stats: stats,
    forClass: type.forClass || null,
    classLabel: type.classLabel || null,
    classColor: type.classColor || null,
  };
}

// Шанс выпадения предмета (растёт с этажом)
function dropChance(floor)          { return 0.00833 + (floor - 1) * 0.00167; }
// Шанс выпадения книги навыка (очень редко)
function skillBookDropChance(floor) { return 0.000267 + (floor - 1) * 0.0000333; }

// ── Попытка выдать книгу навыка после убийства монстра ──
function tryDropSkillBook(floor) {
  if (Math.random() > skillBookDropChance(floor)) return;
  if (!G_CHAR) return;
  if (G.inventory.length >= 40) return;
  var allSkills = [];
  Object.values(SKILLS_DEF).forEach(function(arr) { allSkills = allSkills.concat(arr); });
  if (!allSkills.length) return;
  var sk = allSkills[Math.floor(Math.random() * allSkills.length)];
  var skClass = null;
  Object.keys(SKILLS_DEF).forEach(function(cls) {
    if (SKILLS_DEF[cls].find(function(s){ return s.id === sk.id; })) skClass = cls;
  });
  var classLabels = { fire: 'Пирокан', light: 'Люмос', water: 'Аквас' };
  var classColors = { fire: '#ff7030', light: '#ffd040', water: '#40d0ff' };
  var book = {
    id: ++_invIdCounter, slot: 'book',
    name: 'Книга: ' + sk.name, icon: '📖', rarity: 'epic', level: 1, stats: {},
    isSkillBook: true, bookSkillId: sk.id,
    bookSkillIcon: sk.icon, bookSkillName: sk.name,
    forClass: skClass,
    classLabel: skClass ? classLabels[skClass] : null,
    classColor: skClass ? classColors[skClass] : null,
  };
  G.inventory.push(book);
  showDropNotif(book);
  if (activeTab === 'inv') renderInventory();
}

// ── Попытка выдать предмет после убийства монстра ──
function tryDropItem(floor) {
  tryDropSkillBook(floor);
  if (Math.random() > dropChance(floor) * premMult('drop')) return;
  if (G.inventory.length >= 40) return;
  var item = generateItem(floor);
  G.inventory.push(item);
  showDropNotif(item);
}

// ── Дроп руды после убийства монстра ──
function tryDropOre(floor) {
  if (!G.ore) G.ore = {};
  var table = ORE_DROP_TABLE[Math.min(floor, 10)] || ORE_DROP_TABLE[10];
  ORE_TYPES.forEach(function(ore) {
    var chance = table[ore.id] || 0;
    if (chance <= 0 || Math.random() * 100 >= chance) return;
    var qty = 1 + Math.floor(Math.random() * 3);
    G.ore[ore.id] = (G.ore[ore.id] || 0) + qty;
    // Мини-нотиф о руде
    var el = document.createElement('div');
    el.className = 'drop-notif';
    var r = RARITIES.find(function(x) { return x.id === ore.rarity; }) || { color: '#888' };
    el.innerHTML =
      '<span><img src="' + ore.icon + '" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;image-rendering:pixelated;" onerror="this.style.opacity=0"></span>' +
      '<span style="color:' + r.color + '">' + ore.name + ' ×' + qty + '</span>';
    document.getElementById('app').appendChild(el);
    setTimeout(function() { el.remove(); }, 2000);
  });
  if (activeTab === 'craft') renderCraft();
}

// ── Уведомление о новом дропе ──
function showDropNotif(item) {
  var r  = RARITIES.find(function(x) { return x.id === item.rarity; });
  var el = document.createElement('div');
  el.className = 'drop-notif';
  el.innerHTML = '<span><img src="' + item.icon + '" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;image-rendering:pixelated;" onerror="this.remove()"></span>' +
    '<span style="color:' + r.color + '">' + item.name + ' Lv.' + item.level + '</span>' +
    '<span style="color:#778;font-size:9px;"> [' + r.name + ']</span>';
  document.getElementById('app').appendChild(el);
  setTimeout(function() { el.remove(); }, 2500);
}

// ═══════════════════════════════
//  ЭКИПИРОВКА И СТАТЫ
// ═══════════════════════════════

// Суммарный бонус от надетых предметов
function equippedStats() {
  var bonus = { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0 };
  Object.values(G.equipped).forEach(function(item) {
    if (!item) return;
    Object.keys(item.stats).forEach(function(s) { bonus[s] = (bonus[s] || 0) + item.stats[s]; });
  });
  return bonus;
}

// Пересчёт характеристик (база + экипировка + улучшения)
function recalcStats() {
  var base  = G.baseStats;
  var bonus = equippedStats();
  G.stats.atk    = base.atk    + bonus.atk;
  G.stats.def    = base.def    + bonus.def;
  G.stats.spd    = base.spd    + bonus.spd;
  G.stats.crit   = base.crit   + bonus.crit;
  G.stats.critDmg = base.critDmg || 0;
  G.stats.dodge  = base.dodge  + bonus.dodge;
  G.stats.atkSpd = (base.atkSpd || 1.0) + (bonus.atkSpd || 0);
  var oldMaxHp   = G.maxHp;
  G.stats.hp     = base.hp + bonus.hp;
  G.maxHp        = G.stats.hp;
  if (G.maxHp > oldMaxHp) G.hp = Math.min(G.hp + (G.maxHp - oldMaxHp), G.maxHp);
  G.hp = Math.min(G.hp, G.maxHp);
}

// ── Надеть предмет ──
function equipItem(itemId) {
  var item = G.inventory.find(function(i) { return i.id === itemId; });
  if (!item) return;
  if (item.forClass && G_CHAR && item.forClass !== G_CHAR.id) {
    showDmgPop('НЕ ТВОЙ!', W * 0.4, GROUND * 0.5, '#e74c3c');
    return;
  }
  var old = G.equipped[item.slot];
  if (old) old._equipped = false;
  G.equipped[item.slot] = item;
  item._equipped = true;
  recalcStats(); updateHUD(); closeItemModal();
  if (activeTab === 'inv') renderInventory();
}

// ── Снять предмет ──
function unequipItem(itemId) {
  var item = G.inventory.find(function(i) { return i.id === itemId; });
  if (!item) return;
  G.equipped[item.slot] = null;
  item._equipped = false;
  recalcStats(); updateHUD(); closeItemModal();
  if (activeTab === 'inv') renderInventory();
}

// ── Уничтожить предмет ──
function destroyItem(itemId) {
  var idx = G.inventory.findIndex(function(i) { return i.id === itemId; });
  if (idx === -1) return;
  var item = G.inventory[idx];
  if (item._equipped) { G.equipped[item.slot] = null; recalcStats(); }
  G.inventory.splice(idx, 1);
  updateHUD(); closeItemModal();
  if (activeTab === 'inv') renderInventory();
}

// ═══════════════════════════════
//  ЗАТОЧКА ПРЕДМЕТОВ (+1..+10)
// ═══════════════════════════════
//  ЗАТОЧКА ПРЕДМЕТОВ (+1..+15)
// ═══════════════════════════════
// REFINE_CHANCES_V2 / REFINE_MAX_V2 / REFINE_GOLD_COST — из data.js
// REFINE_CHANCES и REFINE_MAX оставлены для совместимости (книги навыков)
var REFINE_CHANCES = [75, 60, 50, 40, 30, 20, 12, 7, 4, 2];
var REFINE_MAX     = 10;

function refineCost(refLv)         { return REFINE_GOLD_COST[Math.min(refLv, REFINE_GOLD_COST.length - 1)]; }
function refineStatBonus(refLv)    { return Math.floor(3 * Math.pow(1.5, refLv)); }
function refineSuccessChance(refLv){ return REFINE_CHANCES_V2[Math.min(refLv, REFINE_CHANCES_V2.length - 1)]; }
function refineStars(item)         { return item.isSkillBook ? REFINE_MAX : (item.refine || 0); }
function refineStarsStr(n) {
  if (n === 0) return '✧✧✧✧✧✧✧✧✧✧';
  var show = Math.min(n, 10);
  var tail = n > 10 ? '<sup style="color:#f5c542;font-size:9px">+' + (n - 10) + '</sup>' : '✧'.repeat(10 - show);
  return '★'.repeat(show) + tail;
}

// ── Открыть модал выбора типа заточки ──
function refineItem(itemId) { openRefineModal(itemId); }

function openRefineModal(itemId) {
  var item = G.inventory.find(function(i) { return i.id === itemId; });
  if (!item) return;
  var stars = refineStars(item);
  if (stars >= REFINE_MAX_V2) { showRefineResult(false, item, true); return; }
  var cost   = refineCost(stars);
  var chance = refineSuccessChance(stars);
  var hasBless = (G.blessStones || 0) > 0;
  var r = RARITIES.find(function(x) { return x.id === item.rarity; }) || { color: '#888' };

  var old = document.getElementById('refineChoiceModal');
  if (old) old.remove();
  var modal = document.createElement('div');
  modal.id = 'refineChoiceModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9000;display:flex;align-items:center;justify-content:center;';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML =
    '<div style="background:#13132a;border:2px solid #2a2a5a;border-radius:12px;padding:20px;width:300px;max-width:90vw;text-align:center;">' +
      '<div style="font-size:10px;color:#556;letter-spacing:1px;margin-bottom:6px;">ЗАТОЧКА</div>' +
      '<div style="font-size:14px;color:' + r.color + ';font-weight:700;margin-bottom:4px;">' + item.name + '</div>' +
      '<div style="font-size:20px;color:#a78bfa;margin-bottom:4px;">' + refineStarsStr(stars) + ' → +' + (stars + 1) + '</div>' +
      '<div style="font-size:12px;color:#556;margin-bottom:16px;">Шанс: <span style="color:#2ecc71;font-weight:700;">' + chance + '%</span> &nbsp;·&nbsp; Цена: <span style="color:#f5c542;font-weight:700;">' + cost + ' 💰</span></div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button onclick="doRefineItem(' + itemId + ',false)" style="flex:1;background:#1e1e40;border:2px solid #3a3a70;border-radius:8px;color:#ccd;padding:12px 8px;font-size:12px;cursor:pointer;font-family:inherit;">' +
          '<div style="font-size:20px;margin-bottom:4px;">⚒</div>' +
          '<div style="font-weight:700;margin-bottom:2px;">Обычная</div>' +
          '<div style="color:#e74c3c;font-size:10px;">Провал = сломан</div>' +
        '</button>' +
        '<button onclick="doRefineItem(' + itemId + ',true)" ' +
          (!hasBless
            ? 'disabled style="flex:1;background:#161624;border:2px solid #2a2a40;border-radius:8px;color:#445;padding:12px 8px;font-size:12px;cursor:not-allowed;font-family:inherit;"'
            : 'style="flex:1;background:#142014;border:2px solid #2ecc71;border-radius:8px;color:#cdc;padding:12px 8px;font-size:12px;cursor:pointer;font-family:inherit;"') + '>' +
          '<div style="font-size:20px;margin-bottom:4px;">🛡</div>' +
          '<div style="font-weight:700;margin-bottom:2px;">Безопасная</div>' +
          '<div style="font-size:10px;color:' + (hasBless ? '#2ecc71' : '#e74c3c') + ';">' + (hasBless ? '✓ Камень ×' + G.blessStones : '✗ Нет камней') + '</div>' +
        '</button>' +
      '</div>' +
      '<button onclick="document.getElementById("refineChoiceModal").remove()" style="margin-top:12px;background:transparent;border:1px solid #334;border-radius:6px;color:#445;padding:6px 24px;cursor:pointer;font-size:11px;font-family:inherit;">Отмена</button>' +
    '</div>';
  document.getElementById('app').appendChild(modal);
}

// ── Выполнить заточку ──
function doRefineItem(itemId, useBless) {
  var m = document.getElementById('refineChoiceModal');
  if (m) m.remove();
  var item = G.inventory.find(function(i) { return i.id === itemId; });
  if (!item) return;
  var stars = refineStars(item);
  if (stars >= REFINE_MAX_V2) { showRefineResult(false, item, true); return; }
  var cost = refineCost(stars);
  if (G.gold < cost) { showRefineResult(null, item, false, cost); return; }
  if (useBless && !(G.blessStones > 0)) {
    showRefineResult(null, item, false, cost, 0, 'nostone'); return;
  }
  G.gold -= cost;
  if (useBless) G.blessStones = Math.max(0, (G.blessStones || 0) - 1);
  updateHUD();
  var success = Math.random() * 100 < refineSuccessChance(stars);
  if (success) {
    item.refine = stars + 1;
    var bonus = refineStatBonus(stars);
    Object.keys(item.stats).forEach(function(s) { item.stats[s] = (item.stats[s] || 0) + bonus; });
    if (item._equipped) recalcStats();
    showRefineResult(true, item, false, cost, bonus, useBless ? 'bless' : 'normal');
  } else if (useBless) {
    showRefineResult('safe', item, false, cost, 0, 'bless');
  } else {
    // Обычная — предмет ломается, возврат руды x2^stars
    var oreBack = Math.pow(2, stars);
    var oreKey  = { common:'core', uncommon:'uore', rare:'rore', epic:'eore', legend:'lore' }[item.rarity] || 'core';
    if (!G.ore) G.ore = {};
    G.ore[oreKey] = (G.ore[oreKey] || 0) + oreBack;
    if (item._equipped) { G.equipped[item.slot] = null; recalcStats(); }
    var idx = G.inventory.findIndex(function(i) { return i.id === itemId; });
    G.inventory.splice(idx, 1);
    showRefineResult(false, item, false, cost, 0, 'normal', oreBack, oreKey);
  }
  updateHUD();
  if (typeof saveNow === 'function') saveNow();
}

// ── Оверлей результата заточки ──
function showRefineResult(success, item, maxed, cost, bonus, mode, oreBack, oreKey) {
  var overlay = document.getElementById('refineOverlay');
  var icon    = document.getElementById('refineIcon');
  var text    = document.getElementById('refineText');
  var sub     = document.getElementById('refineSub');
  document.getElementById('itemModal').classList.remove('show');
  if (maxed) {
    icon.textContent = '⛔'; text.textContent = 'МАКСИМУМ'; text.style.color = '#778';
    sub.textContent  = 'Заточка ' + REFINE_MAX_V2 + ' — предел';
  } else if (mode === 'nostone') {
    icon.textContent = '🛡'; text.textContent = 'НЕТ КАМНЕЙ'; text.style.color = '#2ecc71';
    sub.textContent  = 'Скрафти камни безопасной заточки';
  } else if (success === null) {
    icon.textContent = '💰'; text.textContent = 'НЕТ ЗОЛОТА'; text.style.color = '#f5c542';
    sub.textContent  = 'Нужно ' + cost + ' 💰';
  } else if (success === true) {
    icon.textContent = '✨'; text.textContent = '+' + item.refine + ' УСПЕХ!'; text.style.color = '#a78bfa';
    sub.textContent  = 'Все статы +' + bonus + (mode === 'bless' ? ' · Камней: ' + G.blessStones : '');
  } else if (success === 'safe') {
    icon.textContent = '🛡'; text.textContent = 'ПРОВАЛ (защита)'; text.style.color = '#2ecc71';
    sub.textContent  = 'Предмет цел · Камней: ' + (G.blessStones || 0);
  } else {
    icon.textContent = '💥'; text.textContent = 'СЛОМАЛСЯ!'; text.style.color = '#e74c3c';
    var oreTxt = oreBack ? ' · +' + oreBack + ' руды' : '';
    sub.textContent  = item.name + ' уничтожен · -' + cost + ' 💰' + oreTxt;
  }
  icon.style.animation = 'none'; icon.offsetHeight; icon.style.animation = '';
  overlay.classList.add('show');
  setTimeout(function() {
    overlay.classList.remove('show');
    if (activeTab === 'inv') renderInventory();
    if (activeTab === 'craft') renderCraft();
  }, 2200);
}

// ═══════════════════════════════
//  КНИГИ НАВЫКОВ
// ═══════════════════════════════

// Стоимость использования: unlock=1, затем N*30+1 книг
// inventory.js ~ строка 350

// ── Стоимость книг для навыка ──
function skillBookCost(st) {
  // Открытие навыка
  if (!st.unlocked) return 1;
  
  // Прогрессивная шкала: 5, 10, 20, 40, 100
  const costs = {
    0: 5,
    1: 10,
    2: 20,
    3: 40,
    4: 100,
  };
  
  // Если навык уже на максимуме (Lv.5)
  if (st.level >= 5) return Infinity;
  
  return costs[st.level] || 999;
}

function countBooksInInv(skillId) {
  return G.inventory.filter(function(i) { return i.isSkillBook && i.bookSkillId === skillId; }).length;
}

function removeBooksFromInv(skillId, count) {
  var removed = 0;
  G.inventory = G.inventory.filter(function(i) {
    if (i.isSkillBook && i.bookSkillId === skillId && removed < count) { removed++; return false; }
    return true;
  });
}

// inventory.js ~ строка 370

function useSkillBook(skillId) {
  var skClass = null;
  Object.keys(SKILLS_DEF).forEach(function(cls) {
    if (SKILLS_DEF[cls].find(function(s){ return s.id === skillId; })) skClass = cls;
  });
  if (skClass && G_CHAR && skClass !== G_CHAR.id) {
    showDmgPop('Не твой класс!', PLAYER_SCREEN_X, player.y - 30, '#e74c3c');
    return;
  }
  var st    = getSkillState(skillId);
  var isMax = st.unlocked && st.level >= 5;
  if (isMax) {
    showDmgPop('✨ Уже максимум!', PLAYER_SCREEN_X, player.y - 30, '#a78bfa');
    return;
  }
  
  var cost = skillBookCost(st);
  if (cost === Infinity) return;
  
  var have = countBooksInInv(skillId);
  if (have < cost) {
    showDmgPop('📖 Нужно ' + cost + ' книг', PLAYER_SCREEN_X, player.y - 30, '#f5c542');
    return;
  }
  
  removeBooksFromInv(skillId, cost);
  
  if (!st.unlocked) {
    st.unlocked = true;
    st.level = 0;
    showDmgPop('✨ Навык открыт!', PLAYER_SCREEN_X, player.y - 30, '#a78bfa');
  } else {
    st.level++;
    showDmgPop('⬆ Навык Lv.' + st.level + '!', PLAYER_SCREEN_X, player.y - 30, '#a78bfa');
  }
  
  updateSkillsHud();
  renderUpgrades();
  if (activeTab === 'inv') renderInventory();
}

// ═══════════════════════════════
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════
function slotName(slot) {
  var map = { weapon: 'Оружие', body: 'Тело', legs: 'Штаны', gloves: 'Перчи', boots: 'Боты', helmet: 'Шлем', ring: 'Кольцо', belt: 'Пояс', book: 'Книга' };
  return map[slot] || slot;
}
function slotEmptyIcon(slot) {
  var pfx = { weapon: 'wwc', body: 'ac', legs: 'lc', gloves: 'pc', boots: 'bc', helmet: 'hc', ring: 'ringc', belt: 'beltc' }[slot] || 'ac';
  return 'images/' + pfx + '.png';
}

function rarityOrder(id) {
  return RARITIES.findIndex(function(r) { return r.id === id; });
}

// ── Режим мультивыбора ──
function toggleInvSelectMode() { _invSelectMode = !_invSelectMode; _invSelected = {}; renderInventory(); }
function toggleInvSelect(itemId) {
  if (_invSelected[itemId]) delete _invSelected[itemId]; else _invSelected[itemId] = true;
  renderInventory();
}
function invSelectAll() {
  var items = G.inventory.slice();
  if (G.invFilter !== 'all') items = items.filter(function(i){ return i.slot === G.invFilter; });
  items.forEach(function(i) { if (!i._equipped) _invSelected[i.id] = true; });
  renderInventory();
}
function invDeselectAll() { _invSelected = {}; renderInventory(); }
function deleteSelected() {
  var ids = Object.keys(_invSelected).map(Number);
  if (!ids.length) return;
  ids.forEach(function(id) {
    var idx = G.inventory.findIndex(function(i){ return i.id === id; });
    if (idx === -1) return;
    var item = G.inventory[idx];
    if (item._equipped) { G.equipped[item.slot] = null; recalcStats(); }
    G.inventory.splice(idx, 1);
  });
  _invSelected = {};
  updateHUD(); renderInventory();
}

// ── Закрытие модалки предмета ──
function closeItemModal() {
  document.getElementById('itemModal').classList.remove('show');
  _modalItemId = null;
}

// ── Фильтр инвентаря ──
function setInvFilter(f) { G.invFilter = f; renderInventory(); }

// ═══════════════════════════════
//  ОТКРЫТИЕ МОДАЛЬНОГО ОКНА ПРЕДМЕТА
// ═══════════════════════════════
function openItemModal(itemId) {
  var item = G.inventory.find(function(i) { return i.id === itemId; });
  if (!item) return;
  _modalItemId = itemId;
  var r     = RARITIES.find(function(x) { return x.id === item.rarity; });
  var stars = refineStars(item);

  document.getElementById('mIcon').innerHTML = '<img src="' + item.icon + '" style="width:48px;height:48px;object-fit:contain;image-rendering:pixelated;" onerror="this.remove()">';
  document.getElementById('mName').textContent      = item.name + (stars > 0 ? '  +' + stars : '');
  document.getElementById('mName').style.color      = r.color;

  var subText = r.name + ' · ' + slotName(item.slot);
  if (item.forClass && item.classLabel) {
    subText += ' · <span style="color:' + (item.classColor || '#aaa') + ';font-weight:bold;">Только ' + item.classLabel + '</span>';
  }
  document.getElementById('mSub').innerHTML = subText;

  // ── Книга навыка ──
  if (item.isSkillBook) {
    var sk_id  = item.bookSkillId;
    var sk_cls = item.forClass;
    var isWrongClass = sk_cls && G_CHAR && sk_cls !== G_CHAR.id;
    var sk_st  = getSkillState(sk_id);
    var sk_cost = skillBookCost(sk_st);
    var sk_have = countBooksInInv(sk_id);
    var sk_isMax = sk_st.unlocked && sk_st.level >= 5;
    var sk_action = !sk_st.unlocked ? 'Открыть навык' : 'Улучшить навык Lv.' + sk_st.level + '→' + (sk_st.level + 1);
    var sk_canUse = sk_have >= sk_cost && !sk_isMax && !isWrongClass;
    var charCols2 = { fire: '#ff6600', light: '#ffd060', water: '#44aaff' };
    var skCol = sk_cls ? (charCols2[sk_cls] || '#a78bfa') : '#a78bfa';
    var classRow = '';
    if (item.classLabel) {
      classRow = '<div class="modal-stat-row"><span style="color:#aaa">Класс</span>' +
        '<span style="color:' + (item.classColor || '#aaa') + ';font-weight:bold;">' + item.classLabel + '</span></div>';
    }
    document.getElementById('mStats').innerHTML =
      '<div style="background:rgba(167,139,250,0.07);border:1px solid #3a2a6a;border-radius:8px;padding:10px;margin-bottom:2px;">' +
      '<div style="margin-bottom:6px;text-align:center;"><img src="' + (item.bookSkillIcon || '') + '" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;vertical-align:middle;" onerror="this.remove()"> ' + (item.bookSkillName || '') + '</div>' +
      classRow +
      '<div class="modal-stat-row"><span style="color:#aaa">Статус</span><span style="color:' + (sk_st.unlocked ? skCol : '#778') + '">' + (!sk_st.unlocked ? '🔒 Заблокирован' : 'Lv.' + sk_st.level + '/5') + '</span></div>' +
      '<div class="modal-stat-row"><span style="color:#aaa">Книг в инвентаре</span><span>📖 ' + sk_have + '</span></div>' +
      '<div class="modal-stat-row"><span style="color:#aaa">Нужно книг</span><span style="color:' + (sk_canUse ? '#2ecc71' : '#e74c3c') + ';">' + sk_cost + '</span></div>' +
      (isWrongClass ? '<div style="color:#e74c3c;font-size:11px;text-align:center;margin-top:6px;">🔒 Только для ' + item.classLabel + '</div>' : '') +
      (sk_isMax ? '<div style="color:#a78bfa;font-size:11px;text-align:center;margin-top:6px;">✨ НАВЫК НА МАКСИМУМЕ</div>' : '') +
      '</div>';
    var er2 = document.getElementById('mRefine');
    if (!er2) { var rd2 = document.createElement('div'); rd2.id = 'mRefine'; document.getElementById('mStats').after(rd2); }
    document.getElementById('mRefine').innerHTML = '';
    var actHtml2 = '';
    var canSellBook = G.marketUnlocked;
    if (isWrongClass) {
      actHtml2 += '<button class="modal-btn" disabled style="flex:1;opacity:0.5;border:1.5px solid #553;color:#665;cursor:not-allowed;">🔒 Только ' + item.classLabel + '</button>';
    } else if (!sk_isMax) {
      actHtml2 += '<button class="modal-btn ' + (sk_canUse ? 'equip' : '') + '" ' +
        (sk_canUse ? '' : 'disabled style="opacity:0.5;"') +
        ' onclick="useSkillBook(\'' + sk_id + '\');closeItemModal();">📖 ' + sk_action + '</button>';
    }
    if (canSellBook) {
      actHtml2 += '<button class="modal-btn" style="background:rgba(0,200,80,0.12);border-color:#00c850;color:#00c850;" onclick="openSellModal(' + itemId + ')">💰 Продать</button>';
    }
    actHtml2 += '<button class="modal-btn destroy" onclick="destroyItem(' + itemId + ')">🗑</button>';
    document.getElementById('mActions').innerHTML = actHtml2;
    document.getElementById('itemModal').classList.add('show');
    return;
  }

  // ── Обычный предмет ──
  var statLabels = { atk: 'ATK', def: 'DEF', hp: 'HP', spd: 'SPD', crit: 'CRIT %', dodge: 'DODGE %' };

  // Статы текущего предмета
  var statsHtml = '';
  Object.keys(item.stats).forEach(function(s) {
    if (!item.stats[s]) return;
    var diff = '';
    var eqItem = G.equipped[item.slot];
    if (eqItem && eqItem.id !== item.id) {
      var d = (item.stats[s] || 0) - (eqItem.stats[s] || 0);
      diff = d > 0 ? ' <span style="color:#2ecc71;font-size:10px;">▲+' + d + '</span>'
           : d < 0 ? ' <span style="color:#e74c3c;font-size:10px;">▼' + d + '</span>'
           : ' <span style="color:#556;font-size:10px;">=</span>';
    }
    statsHtml += '<div class="modal-stat-row"><span style="color:#aaa">' + (statLabels[s] || s) + '</span><span>+' + item.stats[s] + diff + '</span></div>';
  });
  document.getElementById('mStats').innerHTML = statsHtml || '<div style="color:#445;font-size:11px;">Нет бонусов</div>';

  // Блок руны
  var runeInfoHtml = '';
  if (item.rune) {
    var rtt = RUNE_TYPES.find(function(r) { return r.id === item.rune.type; });
    if (rtt) {
      var rc = RARITIES.find(function(x) { return x.id === rtt.rarity; }) || { color: '#888' };
      var runeStats = '';
      if (item.rune.atk) runeStats += ' +' + item.rune.atk + ' ATK';
      if (item.rune.def) runeStats += ' +' + item.rune.def + ' DEF';
      if (item.rune.hp)  runeStats += ' +' + item.rune.hp + ' HP';
      runeInfoHtml = '<div style="margin-top:6px;padding:7px 10px;background:rgba(255,255,255,0.04);border:1px solid ' + rc.color + '55;border-radius:8px;display:flex;align-items:center;gap:8px;">' +
        '<img src="' + rtt.icon + '" style="width:20px;height:20px;image-rendering:pixelated;flex-shrink:0;" onerror="this.style.display=\'none\'">' +
        '<div><div style="font-size:10px;color:' + rc.color + ';font-weight:700;">' + rtt.name + '</div>' +
        '<div style="font-size:11px;color:#aaa;">' + runeStats.trim() + '</div></div>' +
      '</div>';
    }
  }
  document.getElementById('mStats').innerHTML = statsHtml + runeInfoHtml || '<div style="color:#445;font-size:11px;">Нет бонусов</div>';

  // Окошко надетого предмета того же слота
  var eqEl = document.getElementById('mEquipped');
  var equippedItem = G.equipped[item.slot] || null;
  if (eqEl) {
    if (equippedItem && equippedItem.id !== item.id) {
      var eqR     = RARITIES.find(function(x) { return x.id === equippedItem.rarity; }) || { color: '#888', name: '—' };
      var eqStars = refineStars(equippedItem);
      var eqStatRows = '';
      Object.keys(equippedItem.stats).forEach(function(s) {
        if (!equippedItem.stats[s]) return;
        var d = (item.stats[s] || 0) - (equippedItem.stats[s] || 0);
        // На надетом инвертируем: если новый лучше (d>0) — надетый хуже → ▼
        var diffStr = d > 0 ? ' <span style="color:#e74c3c;font-size:10px;">▼-' + d + '</span>'
                   : d < 0 ? ' <span style="color:#2ecc71;font-size:10px;">▲+' + (-d) + '</span>'
                   : ' <span style="color:#556;font-size:10px;">=</span>';
        eqStatRows += '<div class="modal-stat-row" style="font-size:11px;"><span style="color:#667">' + (statLabels[s] || s) + '</span><span style="color:#999;">+' + equippedItem.stats[s] + diffStr + '</span></div>';
      });
      eqEl.innerHTML =
        '<div style="padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid #2a2a4a;border-radius:10px;margin-bottom:10px;">' +
          '<div style="font-size:9px;color:#556;letter-spacing:1px;margin-bottom:6px;">НАДЕТ</div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            '<img src="' + equippedItem.icon + '" style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated;flex-shrink:0;" onerror="this.style.opacity=0">' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:12px;font-weight:bold;color:' + eqR.color + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
                equippedItem.name + (eqStars > 0 ? ' <span style="color:#a78bfa">+' + eqStars + '</span>' : '') +
              '</div>' +
              '<div style="font-size:9px;color:#556;margin-top:1px;">' + eqR.name + ' · Lv.' + equippedItem.level + '</div>' +
            '</div>' +
          '</div>' +
          eqStatRows +
        '</div>';
    } else {
      eqEl.innerHTML = '';
    }
  }

  // Блок заточки
  var refineHtml = '';
  if (stars < REFINE_MAX_V2) {
    var cost    = refineCost(stars);
    var chance  = refineSuccessChance(stars);
    var nextBonus = refineStatBonus(stars);
    refineHtml = '<div class="refine-info"><span class="refine-stars">' + refineStarsStr(stars) + '</span>' +
      '<span class="refine-chance">' + chance + '% · ' + cost + '💰</span></div>' +
      '<div style="font-size:10px;color:#665;margin-bottom:8px;text-align:right;">успех: все статы +' + nextBonus + ' · провал: предмет исчезнет</div>';
  } else {
    refineHtml = '<div class="refine-info"><span class="refine-stars">' + refineStarsStr(stars) + '</span>' +
      '<span style="color:#a78bfa;font-size:11px;">МАКС</span></div>';
  }
  var existingRefine = document.getElementById('mRefine');
  if (!existingRefine) { var refineDiv = document.createElement('div'); refineDiv.id = 'mRefine'; document.getElementById('mStats').after(refineDiv); }
  document.getElementById('mRefine').innerHTML = refineHtml;

  var actHtml = '';
  var wrongClass = item.forClass && G_CHAR && item.forClass !== G_CHAR.id;
  var canSell = G.marketUnlocked && !item._equipped &&
    ['uncommon','rare','epic','legend'].includes(item.rarity);

  if (item._equipped) {
    actHtml += '<button class="modal-btn unequip" onclick="unequipItem(' + itemId + ')">Снять</button>';
  } else if (wrongClass) {
    actHtml += '<button class="modal-btn" disabled style="flex:1;padding:10px;font-size:11px;font-family:Courier New,monospace;border-radius:8px;border:1.5px solid #553;background:rgba(80,60,0,0.1);color:#665;cursor:not-allowed;">🔒 Только ' + item.classLabel + '</button>';
  } else {
    actHtml += '<button class="modal-btn equip" onclick="equipItem(' + itemId + ')">Надеть</button>';
  }
  if (canSell) {
    actHtml += '<button class="modal-btn" style="background:rgba(0,200,80,0.12);border-color:#00c850;color:#00c850;" onclick="openSellModal(' + itemId + ')">💰 Продать</button>';
  }
  if (stars < REFINE_MAX_V2) actHtml += '<button class="modal-btn refine" onclick="openRefineModal(' + itemId + ')">⚒ Точить</button>';
  actHtml += '<button class="modal-btn destroy" onclick="destroyItem(' + itemId + ')">🗑</button>';
  document.getElementById('mActions').innerHTML = actHtml;
  document.getElementById('itemModal').classList.add('show');
}

// ═══════════════════════════════
//  РЕНДЕР ИНВЕНТАРЯ
// ═══════════════════════════════
function renderInventory() {
  var body  = document.getElementById('invBody');
  var cp    = calcCP();
  var bonus = equippedStats();

  var filters = ['all','weapon','body','legs','gloves','boots','helmet','ring','belt','book'];
  var fNames  = ['Все','⚔️','🧥','👖','🧤','👟','⛑️','💍','🔱','📖'];
  var filterHtml = '<div style="display:flex;gap:4px;margin-bottom:10px;overflow-x:auto;padding-bottom:2px;">';
  filters.forEach(function(f, i) {
    var active = G.invFilter === f;
    filterHtml += '<button onclick="setInvFilter(\'' + f + '\')" style="flex-shrink:0;padding:4px 10px;font-size:10px;font-family:Courier New,monospace;border-radius:20px;border:1px solid ' +
      (active ? '#f5c542' : '#2a2a5a') + ';background:' + (active ? 'rgba(245,197,66,0.15)' : 'rgba(255,255,255,0.03)') +
      ';color:' + (active ? '#f5c542' : '#778') + ';cursor:pointer;">' + fNames[i] + '</button>';
  });
  filterHtml += '</div>';

  // Слоты экипировки
  var eqHtml = '<div style="font-size:9px;color:#556;letter-spacing:1px;margin-bottom:6px;">ЭКИПИРОВАНО</div>';
  eqHtml += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:12px;">';
  ['weapon','body','legs','gloves','boots','helmet','ring','belt'].forEach(function(slot) {
    var item = G.equipped[slot];
    var r = item ? RARITIES.find(function(x) { return x.id === item.rarity; }) : null;
    var iconSrc = item ? item.icon : slotEmptyIcon(slot);
    eqHtml += '<div onclick="' + (item ? 'openItemModal(' + item.id + ')' : '') + '" style="' +
      'border-radius:8px;border:1.5px solid ' + (item ? r.color : '#2a2a3a') +
      ';background:rgba(0,0,0,0);display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'cursor:' + (item ? 'pointer' : 'default') + ';padding:4px 2px;">';
    eqHtml += '<img src="' + iconSrc + '" style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated;' + (item ? '' : 'opacity:0.25;') + '" onerror="this.style.display=\'none\'">';
    eqHtml += '<span style="font-size:7px;color:' + (item ? r.color : '#334') + ';margin-top:1px;">' +
      (item ? 'Lv.' + item.level + (item.refine ? '+' + item.refine : '') : slotName(slot)) + '</span>';
    eqHtml += '</div>';
  });
  eqHtml += '</div>';

  // Суммарный бонус
  var bonusHtml = '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px;">';
  var statLabels = { atk: 'ATK', def: 'DEF', hp: 'HP', spd: 'SPD', crit: 'CRIT%', dodge: 'DODGE%' };
  Object.keys(bonus).forEach(function(s) {
    if (!bonus[s]) return;
    bonusHtml += '<div style="font-size:10px;background:rgba(255,255,255,0.04);border:1px solid #2a2a5a;border-radius:4px;padding:2px 7px;color:#4cf;">+' +
      bonus[s] + ' ' + (statLabels[s] || s) + '</div>';
  });
  bonusHtml += '</div>';

  var selCount = Object.keys(_invSelected).length;
  var headerHtml = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
    '<span style="font-size:10px;color:#778">CP: <strong style="color:#fa0">' + cp + '</strong></span>' +
    '<span style="font-size:10px;color:#556">' + G.inventory.length + '/40</span>' +
    '<button onclick="toggleInvSelectMode()" style="font-size:9px;font-family:Courier New,monospace;padding:3px 9px;border-radius:12px;border:1px solid ' + (_invSelectMode ? '#e74c3c' : '#2a2a5a') + ';background:' + (_invSelectMode ? 'rgba(231,76,60,0.15)' : 'rgba(255,255,255,0.04)') + ';color:' + (_invSelectMode ? '#e74c3c' : '#778') + ';cursor:pointer;">' +
    (_invSelectMode ? '✕ Отмена' : '☑ Выбрать') + '</button></div>';

  var selBar = '';
  if (_invSelectMode) {
    selBar = '<div style="display:flex;gap:5px;margin-bottom:10px;align-items:center;">' +
      '<button onclick="invSelectAll()" style="flex:1;font-size:10px;font-family:Courier New,monospace;padding:5px 0;border-radius:6px;border:1px solid #2a2a5a;background:rgba(255,255,255,0.04);color:#aaa;cursor:pointer;">Все</button>' +
      '<button onclick="invDeselectAll()" style="flex:1;font-size:10px;font-family:Courier New,monospace;padding:5px 0;border-radius:6px;border:1px solid #2a2a5a;background:rgba(255,255,255,0.04);color:#aaa;cursor:pointer;">Сбросить</button>' +
      '<button onclick="deleteSelected()" ' + (selCount > 0 ? '' : 'disabled') + ' style="flex:2;font-size:10px;font-family:Courier New,monospace;padding:5px 0;border-radius:6px;border:1.5px solid ' + (selCount > 0 ? '#e74c3c' : '#333') + ';background:' + (selCount > 0 ? 'rgba(231,76,60,0.15)' : 'rgba(255,255,255,0.02)') + ';color:' + (selCount > 0 ? '#e74c3c' : '#444') + ';cursor:' + (selCount > 0 ? 'pointer' : 'not-allowed') + ';">🗑 Удалить (' + selCount + ')</button></div>';
  }

  var items = G.inventory.filter(function(i) { return !i._equipped; });
  if (G.invFilter !== 'all') items = items.filter(function(i) { return i.slot === G.invFilter; });
  items.sort(function(a, b) {
    var rd = rarityOrder(b.rarity) - rarityOrder(a.rarity);
    if (rd) return rd;
    return b.level - a.level;
  });

  var gridHtml = '';
  if (items.length === 0) {
    gridHtml = '<div style="text-align:center;color:#445;font-size:12px;padding:40px 0;">' +
      (G.invFilter === 'all' ? '🎒 Инвентарь пуст.<br><span style="font-size:10px">Убивай монстров — предметы падают случайно!</span>' : 'Нет предметов этого типа') +
      '</div>';
  } else {
    gridHtml = '<div class="inv-grid">';
    items.forEach(function(item) {
      var r        = RARITIES.find(function(x) { return x.id === item.rarity; });
      var isSel    = !!_invSelected[item.id];
      var selModeClass = _invSelectMode ? ' sel-mode' : '';
      var selClass = isSel ? ' selected' : '';
      var clickHandler = _invSelectMode
        ? 'toggleInvSelect(' + item.id + ')'
        : 'openItemModal(' + item.id + ')';
      var checkmark = _invSelectMode ? '<div class="sel-check">' + (isSel ? '✓' : '○') + '</div>' : '';

      if (item.isSkillBook) {
        var have    = countBooksInInv(item.bookSkillId);
        var bkst    = getSkillState(item.bookSkillId);
        var bkcost  = skillBookCost(bkst);
        var isWrong = item.forClass && G_CHAR && item.forClass !== G_CHAR.id;
        var classCol = isWrong ? '#554' : '#a78bfa';
        gridHtml += '<div class="inv-slot rarity-epic' + selModeClass + selClass + '" onclick="' + clickHandler + '">' +
          checkmark +
          '<div style="font-size:10px;line-height:1;margin-bottom:1px;">📖</div>' +
          '<div style="line-height:1"><img src="' + (item.bookSkillIcon || '') + '" style="width:24px;height:24px;object-fit:contain;image-rendering:pixelated;" onerror="this.remove()"></div>' +
          '<div style="font-size:7px;color:' + classCol + ';margin-top:2px;">' + (isWrong ? '🔒' : have + '/' + bkcost) + '</div>' +
          '<div class="inv-rarity-dot" style="background:#9b59b6"></div></div>';
      } else {
        var runeOverlay = '';
        if (item.rune) {
          var rt = RUNE_TYPES.find(function(r) { return r.id === item.rune.type; });
          if (rt) runeOverlay = '<div style="position:absolute;bottom:2px;right:2px;width:12px;height:12px;z-index:2;">' +
            '<img src="' + rt.icon + '" style="width:12px;height:12px;image-rendering:pixelated;" onerror="this.style.display=\'none\'">' +
            '</div>';
        }
        gridHtml += '<div class="inv-slot rarity-' + item.rarity + selModeClass + selClass + '" onclick="' + clickHandler + '" style="position:relative;">' +
          checkmark +
          runeOverlay +
          '<div class="inv-icon"><img src="' + item.icon + '" style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated;" onerror="this.style.display=\'none\'"></div>' +
          '<div class="inv-lvl">Lv.' + item.level + (item.refine ? ' <span style="color:#a78bfa">+' + item.refine + '</span>' : '') + '</div>' +
          '<div class="inv-rarity-dot" style="background:' + r.dot + '"></div></div>';
      }
    });
    gridHtml += '</div>';
  }

  body.innerHTML = headerHtml + selBar + filterHtml + eqHtml + bonusHtml +
    '<div style="font-size:9px;color:#556;letter-spacing:1px;margin-bottom:6px;">ПРЕДМЕТЫ (' + items.length + ')</div>' + gridHtml + _renderOreSection();
}

// ── Секция руды в инвентаре ──
function _renderOreSection() {
  if (!G.ore) return '';
  var hasOre = ORE_TYPES.some(function(o) { return (G.ore[o.id] || 0) > 0; });
  var html = '<div style="margin-top:14px;">' +
    '<div style="font-size:9px;color:#556;letter-spacing:1px;margin-bottom:6px;">МАТЕРИАЛЫ</div>' +
    '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">';
  var anyShown = false;
  ORE_TYPES.forEach(function(ore) {
    var qty = G.ore[ore.id] || 0;
    if (qty <= 0) return;
    anyShown = true;
    var r = RARITIES.find(function(x) { return x.id === ore.rarity; }) || { color: '#888' };
    html += '<div onclick="openOreSellModal(\'' + ore.id + '\')" style="' +
      'display:flex;align-items:center;gap:8px;' +
      'background:rgba(255,255,255,0.03);border:1px solid ' + r.color + '44;' +
      'border-radius:8px;padding:7px 10px;cursor:pointer;' +
      'transition:background .15s;" ' +
      'onmousedown="this.style.background=\'rgba(255,255,255,0.07)\'" ' +
      'onmouseup="this.style.background=\'rgba(255,255,255,0.03)\'">' +
      '<img src="' + ore.icon + '" style="width:28px;height:28px;image-rendering:pixelated;flex-shrink:0;" onerror="this.style.opacity=0.3">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:11px;color:' + r.color + ';font-weight:700;">' + ore.name + '</div>' +
        '<div style="font-size:12px;color:#ccd;">×' + qty + '</div>' +
      '</div>' +
      '<div style="font-size:9px;color:#445;">продать</div>' +
    '</div>';
  });
  if (!anyShown) {
    html += '<div style="grid-column:1/-1;text-align:center;color:#334;font-size:11px;padding:16px 0;">Руды нет — фармь этажи!</div>';
  }
  html += '</div></div>';
  return html;
}

// ═══════════════════════════════
//  ПРОДАЖА РУДЫ
// ═══════════════════════════════
function openOreSellModal(oreId) {
  if (!G.marketUnlocked) {
    showDmgPop('Маркет закрыт!', W * 0.4, GROUND * 0.5, '#e74c3c');
    return;
  }
  var ore = ORE_TYPES.find(function(o) { return o.id === oreId; });
  if (!ore) return;
  var maxQty = G.ore[oreId] || 0;
  if (maxQty <= 0) return;
  var r = RARITIES.find(function(x) { return x.id === ore.rarity; }) || { color: '#888', name: '—' };

  var old = document.getElementById('oreSellModal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'oreSellModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9100;display:flex;align-items:center;justify-content:center;';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

  modal.innerHTML =
    '<div style="background:#13132a;border:2px solid ' + r.color + '66;border-radius:12px;padding:20px;width:300px;max-width:92vw;">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">' +
        '<img src="' + ore.icon + '" style="width:36px;height:36px;image-rendering:pixelated;" onerror="this.style.opacity=0.3">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:' + r.color + ';">' + ore.name + '</div>' +
          '<div style="font-size:10px;color:#556;">В наличии: <span style="color:#ccd;">×' + maxQty + '</span></div>' +
        '</div>' +
      '</div>' +

      '<div style="margin-bottom:10px;">' +
        '<label style="font-size:10px;color:#556;display:block;margin-bottom:4px;">КОЛИЧЕСТВО (макс ' + maxQty + ')</label>' +
        '<div style="display:flex;gap:6px;align-items:center;">' +
          '<button onclick="_oreQtyAdj(-10)" style="width:32px;height:32px;border-radius:6px;border:1px solid #2a2a5a;background:rgba(255,255,255,0.04);color:#aaa;cursor:pointer;font-size:14px;">−</button>' +
          '<input id="oreSellQty" type="number" min="1" max="' + maxQty + '" value="1" ' +
            'style="flex:1;background:#0d0d22;border:1.5px solid #2a2a5a;border-radius:6px;color:#ccd;font-size:15px;text-align:center;padding:6px;font-family:inherit;" ' +
            'oninput="_oreUpdateNote()">' +
          '<button onclick="_oreQtyAdj(10)" style="width:32px;height:32px;border-radius:6px;border:1px solid #2a2a5a;background:rgba(255,255,255,0.04);color:#aaa;cursor:pointer;font-size:14px;">+</button>' +
        '</div>' +
        '<div style="display:flex;gap:4px;margin-top:6px;">' +
          '<button onclick="_oreQtySet(1)" style="flex:1;font-size:10px;font-family:inherit;padding:4px;border-radius:4px;border:1px solid #2a2a5a;background:rgba(255,255,255,0.03);color:#778;cursor:pointer;">1</button>' +
          '<button onclick="_oreQtySet(10)" style="flex:1;font-size:10px;font-family:inherit;padding:4px;border-radius:4px;border:1px solid #2a2a5a;background:rgba(255,255,255,0.03);color:#778;cursor:pointer;">10</button>' +
          '<button onclick="_oreQtySet(50)" style="flex:1;font-size:10px;font-family:inherit;padding:4px;border-radius:4px;border:1px solid #2a2a5a;background:rgba(255,255,255,0.03);color:#778;cursor:pointer;">50</button>' +
          '<button onclick="_oreQtySet(' + maxQty + ')" style="flex:1;font-size:10px;font-family:inherit;padding:4px;border-radius:4px;border:1px solid #f5c542;background:rgba(245,197,66,0.08);color:#f5c542;cursor:pointer;">MAX</button>' +
        '</div>' +
      '</div>' +

      '<div style="margin-bottom:14px;">' +
        '<label style="font-size:10px;color:#556;display:block;margin-bottom:4px;">ЦЕНА ЗА ШТУКУ (PIXR)</label>' +
        '<input id="oreSellPrice" type="number" min="1" placeholder="Цена за 1 шт." ' +
          'style="width:100%;box-sizing:border-box;background:#0d0d22;border:1.5px solid #2a2a5a;border-radius:6px;color:#ccd;font-size:15px;text-align:center;padding:8px;font-family:inherit;" ' +
          'oninput="_oreUpdateNote()">' +
      '</div>' +

      '<div id="oreSellNote" style="font-size:11px;color:#556;text-align:center;margin-bottom:14px;">Итого: —</div>' +

      '<div style="display:flex;gap:8px;">' +
        '<button onclick="document.getElementById(\'oreSellModal\').remove()" ' +
          'style="flex:1;padding:10px;border-radius:8px;font-family:inherit;font-size:12px;border:1px solid #334;background:transparent;color:#556;cursor:pointer;">Отмена</button>' +
        '<button onclick="confirmOreSell(\'' + oreId + '\')" ' +
          'style="flex:2;padding:10px;border-radius:8px;font-family:inherit;font-size:12px;font-weight:700;border:1.5px solid #00c850;background:rgba(0,200,80,0.12);color:#00c850;cursor:pointer;">💰 Выставить</button>' +
      '</div>' +
    '</div>';

  document.getElementById('app').appendChild(modal);
}

function _oreQtyAdj(delta) {
  var input = document.getElementById('oreSellQty');
  if (!input) return;
  var max = parseInt(input.max) || 1;
  input.value = Math.max(1, Math.min(max, (parseInt(input.value) || 1) + delta));
  _oreUpdateNote();
}

function _oreQtySet(v) {
  var input = document.getElementById('oreSellQty');
  if (!input) return;
  var max = parseInt(input.max) || 1;
  input.value = Math.min(v, max);
  _oreUpdateNote();
}

function _oreUpdateNote() {
  var qty   = parseInt(document.getElementById('oreSellQty').value) || 0;
  var price = parseInt(document.getElementById('oreSellPrice').value) || 0;
  var note  = document.getElementById('oreSellNote');
  if (!note) return;
  if (qty > 0 && price > 0) {
    var total = qty * price;
    var earn  = Math.floor(total * 0.9);
    note.innerHTML = 'Итого: <strong style="color:#ff44cc;">' + total + ' PIXR</strong>' +
      ' · Вы получите: <strong style="color:#2ecc71;">' + earn + ' PIXR</strong> (−10% комиссия)';
  } else {
    note.textContent = 'Итого: —';
  }
}

function confirmOreSell(oreId) {
  var qty   = parseInt(document.getElementById('oreSellQty').value);
  var price = parseInt(document.getElementById('oreSellPrice').value);
  var max   = G.ore[oreId] || 0;

  if (!qty || qty < 1)        { _taskToast('❌ Укажи количество'); return; }
  if (!price || price < 1)    { _taskToast('❌ Укажи цену'); return; }
  if (qty > max)              { _taskToast('❌ Недостаточно руды'); return; }

  var API  = window.GameSync._API;
  var init = window.GameSync._INIT;

  fetch(API + '/api/market/sell-ore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: init, oreId: oreId, qty: qty, price: price })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      G.ore[oreId] = Math.max(0, (G.ore[oreId] || 0) - qty);
      document.getElementById('oreSellModal').remove();
      renderInventory();
      _taskToast('✅ Руда выставлена на маркет!');
      if (typeof saveNow === 'function') saveNow();
    } else {
      var msgs = {
        max_lots:    '❌ Максимум 3 активных лота',
        not_enough:  '❌ Недостаточно руды',
        market_locked: '❌ Маркет не открыт',
      };
      _taskToast(msgs[d.error] || '❌ Ошибка: ' + d.error);
    }
  })
  .catch(function() { _taskToast('❌ Ошибка сети'); });
}

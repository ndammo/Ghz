/*
  ══════════════════════════════════════════════════════
  inventory.js — Система инвентаря и предметов
  Содержит: генерацию предметов, шанс дропа, надевание/
  снятие/уничтожение, модальное окно предмета, систему
  заточки (+1..+10), книги навыков, рендер инвентаря
  ══════════════════════════════════════════════════════
*/

var _invIdCounter  = G.invIdCounter || 0;

function nextInvId() {
  _invIdCounter = Math.max(_invIdCounter, G.invIdCounter || 0) + 1;
  G.invIdCounter = _invIdCounter;
  return _invIdCounter;
}
var _modalItemId   = null;
var _invSelectMode = false;
var _invSelected   = {};  // { itemId: true }

// ═══════════════════════════════
//  ГЕНЕРАЦИЯ ПРЕДМЕТОВ
// ═══════════════════════════════

// Розыгрыш редкости с учётом этажа (выше этаж — выше шанс редкого)
function rollRarity(floor) {
  var bonus = (floor - 1) * 0.3;
  var weights = RARITIES.map(function(r, i) {
    return Math.max(0.1, r.weight - i * bonus * 0.8 + (i > 1 ? bonus * i * 0.5 : 0));
  });
  var total = weights.reduce(function(a, b) { return a + b; }, 0);
  var roll = Math.random() * total, cum = 0;
  for (var i = 0; i < RARITIES.length; i++) {
    cum += weights[i];
    if (roll <= cum) return RARITIES[i];
  }
  return RARITIES[0];
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
    id: nextInvId(), slot: type.slot, name: type.name,
    icon: itemIcon(type.slot, rarity.id, type.forClass || null),
    rarity: rarity.id, level: itemLv, stats: stats,
    forClass: type.forClass || null,
    classLabel: type.classLabel || null,
    classColor: type.classColor || null,
  };
}

// Шанс выпадения предмета (растёт с этажом)
function dropChance(floor)          { return 0.025 + (floor - 1) * 0.005; }
// Шанс выпадения книги навыка (очень редко)
function skillBookDropChance(floor) { return 0.0008 + (floor - 1) * 0.0001; }

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
    id: nextInvId(), slot: 'book',
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
  markChange('high');
}

// ── Снять предмет ──
function unequipItem(itemId) {
  var item = G.inventory.find(function(i) { return i.id === itemId; });
  if (!item) return;
  G.equipped[item.slot] = null;
  item._equipped = false;
  recalcStats(); updateHUD(); closeItemModal();
  if (activeTab === 'inv') renderInventory();
  markChange('medium');
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
  markChange('medium');
}

// ═══════════════════════════════
//  ЗАТОЧКА ПРЕДМЕТОВ (+1..+10)
// ═══════════════════════════════
// Шанс успеха: +0=75%, +1=60%, +2=50% ... +9=2%
var REFINE_CHANCES = [75, 60, 50, 40, 30, 20, 12, 7, 4, 2];
var REFINE_MAX     = 10;

function refineCost(refLv)         { return Math.floor(50 * Math.pow(2, refLv)); }
function refineStatBonus(refLv)    { return Math.floor(3 * Math.pow(1.5, refLv)); }
function refineSuccessChance(refLv){ return REFINE_CHANCES[Math.min(refLv, REFINE_CHANCES.length - 1)]; }
function refineStars(item)         { return item.isSkillBook ? REFINE_MAX : (item.refine || 0); }
function refineStarsStr(n) {
  if (n === 0) return '✧✧✧✧✧✧✧✧✧✧';
  return '★'.repeat(n) + '✧'.repeat(Math.max(0, REFINE_MAX - n));
}

// ── Попытка заточить предмет ──
function refineItem(itemId) {
  var item = G.inventory.find(function(i) { return i.id === itemId; });
  if (!item) return;
  var stars = refineStars(item);
  if (stars >= REFINE_MAX) { showRefineResult(false, item, true); return; }
  var cost = refineCost(stars);
  if (G.gold < cost) { showRefineResult(null, item, false, cost); return; }
  G.gold -= cost;
  updateHUD();
  var success = Math.random() * 100 < refineSuccessChance(stars);
  if (success) {
    item.refine = stars + 1;
    var bonus = refineStatBonus(stars);
    Object.keys(item.stats).forEach(function(s) { item.stats[s] = (item.stats[s] || 0) + bonus; });
    if (item._equipped) recalcStats();
    showRefineResult(true, item, false, cost, bonus);
  } else {
    // Провал — предмет уничтожается
    if (item._equipped) { G.equipped[item.slot] = null; recalcStats(); }
    var idx = G.inventory.findIndex(function(i) { return i.id === itemId; });
    G.inventory.splice(idx, 1);
    showRefineResult(false, item, false, cost);
  }
  updateHUD();
  markChange('high');
}

// ── Оверлей результата заточки ──
function showRefineResult(success, item, maxed, cost, bonus) {
  var overlay = document.getElementById('refineOverlay');
  var icon    = document.getElementById('refineIcon');
  var text    = document.getElementById('refineText');
  var sub     = document.getElementById('refineSub');
  document.getElementById('itemModal').classList.remove('show');
  if (maxed) {
    icon.textContent = '⛔'; text.textContent = 'МАКСИМУМ'; text.style.color = '#778';
    sub.textContent  = 'Заточка ' + REFINE_MAX + ' — предел';
  } else if (success === null) {
    icon.textContent = '💰'; text.textContent = 'НЕТ ЗОЛОТА'; text.style.color = '#f5c542';
    sub.textContent  = 'Нужно ' + cost + ' 💰';
  } else if (success) {
    icon.textContent = '✨'; text.textContent = '+' + item.refine + ' УСПЕХ!'; text.style.color = '#a78bfa';
    sub.textContent  = 'Все статы +' + bonus + ' · Осталось ' + G.gold + ' 💰';
  } else {
    icon.textContent = '💥'; text.textContent = 'СЛОМАЛСЯ!'; text.style.color = '#e74c3c';
    sub.textContent  = item.name + ' уничтожен · -' + cost + ' 💰';
  }
  icon.style.animation = 'none'; icon.offsetHeight; icon.style.animation = '';
  overlay.classList.add('show');
  setTimeout(function() {
    overlay.classList.remove('show');
    if (activeTab === 'inv') renderInventory();
  }, 2000);
}

// ═══════════════════════════════
//  КНИГИ НАВЫКОВ
// ═══════════════════════════════

// Стоимость использования: unlock=1, затем N*30+1 книг
function skillBookCost(st) {
  if (!st.unlocked)     return 1;
  if (st.level === 0)   return 1;
  return st.level * 30 + 1;
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
  if (isMax) return;
  var cost = skillBookCost(st);
  var have = countBooksInInv(skillId);
  if (have < cost) return;
  removeBooksFromInv(skillId, cost);
  if (!st.unlocked) { st.unlocked = true; } else { st.level++; }
  updateSkillsHud();
  renderUpgrades();
  if (activeTab === 'inv') renderInventory();
  markChange('high');
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
    if (isWrongClass) {
      actHtml2 += '<button class="modal-btn" disabled style="flex:1;opacity:0.5;border:1.5px solid #553;color:#665;cursor:not-allowed;">🔒 Только ' + item.classLabel + '</button>';
    } else if (!sk_isMax) {
      actHtml2 += '<button class="modal-btn ' + (sk_canUse ? 'equip' : '') + '" ' +
        (sk_canUse ? '' : 'disabled style="opacity:0.5;"') +
        ' onclick="useSkillBook(\'' + sk_id + '\');closeItemModal();">📖 ' + sk_action + '</button>';
    }
    actHtml2 += '<button class="modal-btn destroy" onclick="destroyItem(' + itemId + ')">🗑</button>';
    document.getElementById('mActions').innerHTML = actHtml2;
    document.getElementById('itemModal').classList.add('show');
    return;
  }

  // ── Обычный предмет ──
  var statLabels = { atk: 'ATK', def: 'DEF', hp: 'HP', spd: 'SPD', crit: 'CRIT %', dodge: 'DODGE %' };
  var statsHtml = '';
  Object.keys(item.stats).forEach(function(s) {
    statsHtml += '<div class="modal-stat-row"><span style="color:#aaa">' + (statLabels[s] || s) + '</span><span>+' + item.stats[s] + '</span></div>';
  });
  document.getElementById('mStats').innerHTML = statsHtml || '<div style="color:#445;font-size:11px;">Нет бонусов</div>';

  // Блок заточки
  var refineHtml = '';
  if (stars < REFINE_MAX) {
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
  if (item._equipped) {
    actHtml += '<button class="modal-btn unequip" onclick="unequipItem(' + itemId + ')">Снять</button>';
  } else if (wrongClass) {
    actHtml += '<button class="modal-btn" disabled style="flex:1;padding:10px;font-size:11px;font-family:Courier New,monospace;border-radius:8px;border:1.5px solid #553;background:rgba(80,60,0,0.1);color:#665;cursor:not-allowed;">🔒 Только ' + item.classLabel + '</button>';
  } else {
    actHtml += '<button class="modal-btn equip" onclick="equipItem(' + itemId + ')">Надеть</button>';
  }
  if (stars < REFINE_MAX) actHtml += '<button class="modal-btn refine" onclick="refineItem(' + itemId + ')">⚒ Точить</button>';
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

  var items = G.inventory.slice();
  if (G.invFilter !== 'all') items = items.filter(function(i) { return i.slot === G.invFilter; });
  items.sort(function(a, b) {
    if (a._equipped && !b._equipped) return -1;
    if (!a._equipped && b._equipped) return 1;
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
        ? (item._equipped ? '' : 'toggleInvSelect(' + item.id + ')')
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
        gridHtml += '<div class="inv-slot rarity-' + item.rarity + (item._equipped ? ' equipped' : '') + selModeClass + selClass + '" onclick="' + clickHandler + '">' +
          checkmark +
          (item._equipped ? '<div class="inv-eq-badge">E</div>' : '') +
          '<div class="inv-icon"><img src="' + item.icon + '" style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated;" onerror="this.style.display=\'none\'"></div>' +
          '<div class="inv-lvl">Lv.' + item.level + (item.refine ? ' <span style="color:#a78bfa">+' + item.refine + '</span>' : '') + '</div>' +
          '<div class="inv-rarity-dot" style="background:' + r.dot + '"></div></div>';
      }
    });
    gridHtml += '</div>';
  }

  body.innerHTML = headerHtml + selBar + filterHtml + eqHtml + bonusHtml +
    '<div style="font-size:9px;color:#556;letter-spacing:1px;margin-bottom:6px;">ПРЕДМЕТЫ (' + items.length + ')</div>' + gridHtml;
}

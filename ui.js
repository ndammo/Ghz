/*
  ══════════════════════════════════════════════════════
  ui.js — Интерфейс панелей и вкладок
  Содержит: renderUpgrades, buyUpgrade, renderFloors,
  openFloorLoot, goToFloor, renderRating, renderWallet,
  switchTab, экран выбора персонажа (selectChar,
  confirmChar, applyCharacter, startGame, анимации)
  ══════════════════════════════════════════════════════
*/

// ── Кеш аватаров (чтобы не спамить 404 запросами) ──
var _avatarFailedCache = {};

function avatarUrl(tgId) {
  if (!tgId || !window.GameSync || !window.GameSync._API) return '';
  if (_avatarFailedCache[tgId]) return '';
  return window.GameSync._API + '/api/avatar/' + tgId;
}

function onAvatarError(img, tgId, fallbackHtml) {
  _avatarFailedCache[tgId] = true;
  img.style.display = 'none';
  img.parentElement.innerHTML = fallbackHtml;
  img.parentElement.style.cssText += ';display:flex;align-items:center;justify-content:center;font-size:16px;';
}

// ═══════════════════════════════
//  ВКЛАДКА УЛУЧШЕНИЙ
// ═══════════════════════════════
var _upgTab = 'stats'; // 'stats' | 'skills'
function setUpgTab(t) { _upgTab = t; renderUpgrades(); }

function upgCost(u) {
  const lv = G.upg[u.id] || 0;
  if (u.currency === 'pixr') return { gold: 0, pixr: u.baseCost };
  const goldCost = Math.floor(u.baseCost * Math.pow(1.6, lv));
  const pixrCost = lv >= 15 ? (lv - 14) : 0;
  return { gold: goldCost, pixr: pixrCost };
}

function buyUpgrade(u) {
  if ((G.upg[u.id] || 0) >= u.maxLv) return;
  const cost = upgCost(u);
  if (u.currency === 'pixr') {
    if ((G.pixr || 0) < cost.pixr) { flashRed(); return; }
    G.pixr -= cost.pixr;
  } else {
    if (G.gold < cost.gold) { flashRed(); return; }
    if ((G.pixr || 0) < cost.pixr) { flashRed(); return; }
    G.gold -= cost.gold;
    G.pixr = (G.pixr || 0) - cost.pixr;
  }
  G.upg[u.id] = (G.upg[u.id] || 0) + 1;
  G.baseStats[u.stat] = parseFloat(((G.baseStats[u.stat] || 0) + u.bonus).toFixed(4));
  recalcStats(); updateHUD(); renderUpgrades();
}

function renderUpgrades() {
  const body = document.getElementById('upgradesBody');
  const cp   = calcCP();

  const tabBar = `<div style="display:flex;gap:6px;margin-bottom:10px;">
    <button onclick="setUpgTab('stats')" style="flex:1;padding:7px 0;font-size:11px;font-family:Courier New,monospace;
      border-radius:6px;border:1.5px solid ${_upgTab==='stats'?'#f5c542':'#2a2a5a'};
      background:${_upgTab==='stats'?'rgba(245,197,66,0.1)':'rgba(255,255,255,0.03)'};
      color:${_upgTab==='stats'?'#f5c542':'#556'};cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="image-rendering:pixelated"><rect x="2" y="2" width="2" height="2" fill="currentColor"/><rect x="4" y="4" width="2" height="2" fill="currentColor"/><rect x="6" y="6" width="2" height="2" fill="currentColor"/><rect x="13" y="1" width="2" height="2" fill="currentColor"/><rect x="11" y="3" width="2" height="2" fill="currentColor"/><rect x="9" y="5" width="2" height="2" fill="currentColor"/><rect x="4" y="2" width="8" height="2" fill="currentColor"/><rect x="12" y="2" width="2" height="8" fill="currentColor"/></svg>
      Характеристики</button>
    <button onclick="setUpgTab('skills')" style="flex:1;padding:7px 0;font-size:11px;font-family:Courier New,monospace;
      border-radius:6px;border:1.5px solid ${_upgTab==='skills'?'#a78bfa':'#2a2a5a'};
      background:${_upgTab==='skills'?'rgba(167,139,250,0.1)':'rgba(255,255,255,0.03)'};
      color:${_upgTab==='skills'?'#a78bfa':'#556'};cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="image-rendering:pixelated"><rect x="2" y="0" width="12" height="2" fill="currentColor"/><rect x="2" y="0" width="2" height="16" fill="currentColor"/><rect x="12" y="0" width="2" height="16" fill="currentColor"/><rect x="2" y="14" width="12" height="2" fill="currentColor"/><rect x="4" y="4" width="8" height="2" fill="currentColor" opacity="0.7"/><rect x="4" y="7" width="6" height="2" fill="currentColor" opacity="0.7"/><rect x="4" y="10" width="7" height="2" fill="currentColor" opacity="0.7"/></svg>
      Навыки</button>
  </div>`;

  const coinSvg = `<svg width="13" height="13" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated;vertical-align:middle;flex-shrink:0"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>`;
  const swordSvg = `<svg width="13" height="13" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated;vertical-align:middle;flex-shrink:0"><rect x="4" y="0" width="2" height="7" fill="#ffaa00"/><rect x="2" y="3" width="6" height="2" fill="#ffaa00"/><rect x="4" y="7" width="2" height="1" fill="#c8850a"/><rect x="3" y="8" width="4" height="1" fill="#c8850a"/><rect x="4" y="9" width="2" height="1" fill="#c8850a"/></svg>`;

  const header = `<div style="font-size:11px;color:#778;margin-bottom:10px;padding:7px 10px;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid #2a2a5a;display:flex;align-items:center;gap:8px;">
    ${swordSvg} <span>CP: <span style="color:#fa0;font-weight:bold">${cp}</span></span>
    <span style="color:#2a2a5a;margin:0 2px">|</span>
    ${coinSvg} <span>Золото: <span style="color:#f5c542;font-weight:bold">${G.gold}</span></span>
    <span style="color:#2a2a5a;margin:0 2px">|</span>
    <img src="images/pixr.png" style="width:13px;height:13px;image-rendering:pixelated;vertical-align:middle;"> <span>PIXR: <span style="color:#ff44cc;font-weight:bold">${G.pixr || 0}</span></span>
  </div>`;

  // ── Характеристики ──
  if (_upgTab === 'stats') {
    body.innerHTML = header + tabBar + UPG_DEFS.map(u => {
      const lv = G.upg[u.id] || 0, maxLv = u.maxLv;
      const cost    = lv < maxLv ? upgCost(u) : null;
      const pct     = (lv / maxLv * 100) + '%';
      const statVal = u.id === 'atkSpd'
        ? G.stats.atkSpd.toFixed(2) + 'x (' + getAtkCooldown().toFixed(1) + 's)'
        : u.id === 'critDmg'
          ? effectiveCritDmg().toFixed(1) + 'x'
          : G.stats[u.stat];
      let btnContent;
      if (lv >= maxLv) {
        btnContent = 'MAX';
      } else if (u.currency === 'pixr') {
        btnContent = `<span style="display:flex;align-items:center;gap:3px;justify-content:center;"><img src="images/pixr.png" style="width:13px;height:13px;image-rendering:pixelated;vertical-align:middle;"><span>${cost.pixr}</span></span>`;
      } else if (cost.pixr > 0) {
        btnContent = `<span style="display:flex;align-items:center;gap:4px;justify-content:center;">${coinSvg}<span>${cost.gold}</span><span style="color:#444">+</span><img src="images/pixr.png" style="width:13px;height:13px;image-rendering:pixelated;vertical-align:middle;"><span style="color:#ff44cc">${cost.pixr}</span></span>`;
      } else {
        btnContent = `<span style="display:flex;align-items:center;gap:3px;justify-content:center;">${coinSvg}<span>${cost.gold}</span></span>`;
      }
      return `<div class="upg-item">
        <div class="upg-icon">${upgIcon(u.svgId)}</div>
        <div class="upg-info">
          <div class="upg-name">${u.name}</div>
          <div class="upg-level">Уровень ${lv}/${maxLv} &nbsp; ${u.stat.toUpperCase()}: ${statVal}</div>
          <div class="upg-bar-wrap"><div class="upg-bar" style="width:${pct}"></div></div>
        </div>
        <button class="upg-btn" ${lv >= maxLv ? 'disabled style="opacity:0.4"' : ''}
          onclick="buyUpgrade(UPG_DEFS.find(u=>u.id==='${u.id}'))">
          ${btnContent}
        </button>
      </div>`;
    }).join('');
    return;
  }

  // ── Навыки ──
  if (!G_CHAR) {
    body.innerHTML = header + tabBar + '<div style="color:#445;text-align:center;padding:40px 0;font-size:12px;">Выбери персонажа для просмотра навыков</div>';
    return;
  }
  var skills   = SKILLS_DEF[G_CHAR.id] || [];
  var charCols = { fire: '#ff6600', light: '#ffd060', water: '#44aaff' };
  var col      = charCols[G_CHAR.id] || '#aaa';
  var totalBooks = G.inventory.filter(function(i){ return i.isSkillBook; }).length;
  var booksInfo  = '<div style="font-size:10px;color:#778;margin-bottom:10px;padding:6px 10px;background:rgba(167,139,250,0.06);border:1px solid #3a2a6a;border-radius:6px;display:flex;align-items:center;gap:6px;">' +
    '<span style="font-size:16px">📖</span><span>Книг в инвентаре: <strong style="color:#a78bfa">' + totalBooks + '</strong></span>' +
    '<span style="color:#445;font-size:9px;margin-left:auto">Шанс: ~' + ((0.000267 + (G.floor - 1) * 0.0000333) * 100).toFixed(4) + '% / убийство</span></div>';

  var skillsHtml = skills.map(function(sk) {
    var st      = getSkillState(sk.id);
    var have    = countBooksInInv(sk.id);
    var cost    = skillBookCost(st);
    var isMax   = st.unlocked && st.level >= 5;
    var canUse  = have >= cost && !isMax;
    var statusText = !st.unlocked ? '🔒 Заблокирован' : 'Lv.' + st.level + '/5';
    var statusCol  = !st.unlocked ? '#554' : col;
    var barPct     = st.unlocked ? (st.level / 5 * 100) : 0;
    var nextAction;
    if (isMax)             nextAction = 'МАКС';
    else if (!st.unlocked) nextAction = 'Открыть (1 книга)';
    else                   nextAction = 'Lv.' + st.level + '→' + (st.level+1) + ' (' + cost + ' книг)';
    var btnStyle;
    if (isMax)       btnStyle = 'border:1px solid #444;background:rgba(255,255,255,0.02);color:#555;cursor:not-allowed;opacity:0.5;';
    else if (canUse) btnStyle = 'border:1.5px solid ' + (st.unlocked ? col : '#a78bfa') + ';background:rgba(167,139,250,0.12);color:' + (st.unlocked ? col : '#a78bfa') + ';cursor:pointer;';
    else             btnStyle = 'border:1px solid #333;background:rgba(255,255,255,0.02);color:#445;cursor:not-allowed;';
    var bonusDesc = '';
    if      (sk.id === 'fire_fireball' || sk.id === 'light_smite') bonusDesc = '+10% урон / ур.';
    else if (sk.id === 'fire_curse')    bonusDesc = '+3% снижение защиты / ур.';
    else if (sk.id === 'fire_haste')    bonusDesc = '+0.5с длительность / ур.';
    else if (sk.id === 'light_shield')  bonusDesc = '+3% защита / ур.';
    else if (sk.id === 'light_reflect') bonusDesc = '+1% отражение / ур.';
    else if (sk.id === 'water_burst')   bonusDesc = '+1 выстрел / 2 ур.';
    else if (sk.id === 'water_critup')  bonusDesc = '+3% крит / ур.';
    else if (sk.id === 'water_freeze')  bonusDesc = '+0.4с заморозка / ур.';
    return '<div style="margin-bottom:12px;border-radius:10px;border:1.5px solid ' + (st.unlocked ? col + '55' : '#2a2a3a') + ';overflow:hidden;background:rgba(255,255,255,0.02);">' +
      '<div style="padding:10px 12px;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);">' +
      '<img src="' + sk.icon + '" style="width:44px;height:44px;object-fit:contain;image-rendering:pixelated;flex-shrink:0;" onerror="this.style.opacity=0.3">' +
      '<div style="flex:1;"><div style="font-size:13px;font-weight:bold;color:' + (st.unlocked ? '#ddd' : '#556') + '">' + sk.name + '</div>' +
      '<div style="font-size:10px;color:#667;margin-top:2px;">' + sk.desc + ' · КД: ' + sk.cd + 'с</div>' +
      '<div style="font-size:9px;color:#445;margin-top:2px;">' + bonusDesc + '</div></div>' +
      '<div style="text-align:right;"><div style="font-size:12px;font-weight:bold;color:' + statusCol + '">' + statusText + '</div>' +
      '<div style="font-size:10px;color:' + (have >= cost && !isMax ? '#a78bfa' : '#445') + ';margin-top:2px;">📖 ' + have + ' / ' + (isMax ? '—' : cost) + '</div></div></div>' +
      '<div style="padding:8px 12px;"><div style="height:4px;background:#111;border-radius:2px;margin-bottom:8px;">' +
      '<div style="height:4px;background:' + col + ';border-radius:2px;width:' + barPct + '%;transition:width .3s"></div></div>' +
      '<button onclick="useSkillBook(\'' + sk.id + '\')" ' + (canUse ? '' : 'disabled') +
      ' style="width:100%;padding:8px;font-size:11px;font-family:Courier New,monospace;border-radius:6px;' + btnStyle + '">📖 ' + nextAction + '</button></div></div>';
  }).join('');

  body.innerHTML = header + tabBar + booksInfo + skillsHtml;
}

// ═══════════════════════════════
//  ВКЛАДКА ЭТАЖЕЙ
// ═══════════════════════════════
function openFloorLoot(floorN) {
  var f = FLOORS[floorN - 1];
  if (!f) return;
  var rarityColors = { common:'#888', uncommon:'#2ecc71', rare:'#3498db', epic:'#9b59b6', legend:'#f5c542' };
  var rarityNames  = { common:'Обычный', uncommon:'Необычный', rare:'Редкий', epic:'Эпический', legend:'Легендарный' };
  var classColors  = { fire:'#ff7030', light:'#ffd040', water:'#40d0ff' };
  var classLabels  = { fire:'Пирокан', light:'Люмос', water:'Аквас' };
  var maxRarityMap = { 1:'common', 2:'uncommon', 3:'uncommon', 4:'rare', 5:'rare', 6:'rare', 7:'epic', 8:'epic', 9:'legend', 10:'legend' };
  var minRarityMap = { 1:'common', 2:'common', 3:'common', 4:'common', 5:'common', 6:'common', 7:'common', 8:'uncommon', 9:'uncommon', 10:'uncommon' };
  var minR = minRarityMap[f.n] || 'common';
  var maxR = maxRarityMap[f.n] || 'legend';
  var minCol = rarityColors[minR], maxCol = rarityColors[maxR];

  var realItemChance = ((0.00833 + (f.n - 1) * 0.00167) * 100).toFixed(2);
  var realBookChance = ((0.000267 + (f.n - 1) * 0.0000333) * 100).toFixed(4);
  var pixrChance     = (0.02 * Math.pow(1.5, f.n - 1)).toFixed(3);

  var html = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
    '<span style="font-size:28px">' + f.emoji + '</span>' +
    '<div><div style="font-size:15px;font-weight:bold;color:#f5c542;">Этаж ' + f.n + ': ' + f.name + '</div>' +
    '<div style="font-size:10px;color:#778;margin-top:2px;">Дроп за убийство: <span style="color:#f5c542;">' + realItemChance + '%</span> · Редкость: ' +
    '<span style="color:' + minCol + ';">' + rarityNames[minR] + '</span>' +
    ' — <span style="color:' + maxCol + ';">' + rarityNames[maxR] + '</span></div></div></div>';

  if (f.loot && f.loot.length) {
    var totalWeight = f.loot.reduce(function(s, i) { return s + i.chance; }, 0);
    f.loot.forEach(function(item) {
      var col    = rarityColors[item.rarity] || '#888';
      var rname  = rarityNames[item.rarity]  || item.rarity;
      var iconSrc = itemIcon(item.slot, item.rarity, item.forClass || null);
      var realChance = ((item.chance / totalWeight) * parseFloat(realItemChance)).toFixed(2);
      html += '<div class="loot-row"><img src="' + iconSrc + '" style="width:24px;height:24px;object-fit:contain;image-rendering:pixelated;margin-right:8px;vertical-align:middle;" onerror="this.style.opacity=0">';
      html += '<span style="flex:1;color:#ddd;">' + item.name;
      if (item.forClass) html += ' <span style="font-size:9px;color:' + (classColors[item.forClass]||'#aaa') + ';border:1px solid ' + (classColors[item.forClass]||'#aaa') + ';padding:1px 4px;border-radius:3px;">' + (classLabels[item.forClass]||item.forClass) + '</span>';
      html += '</span><span class="loot-rarity-badge" style="color:' + col + ';border-color:' + col + ';margin-right:8px;">' + rname + '</span>';
      html += '<span style="color:#f5c542;font-weight:bold;min-width:38px;text-align:right;">' + realChance + '%</span></div>';
    });
  } else {
    html += '<div style="color:#445;font-size:11px;text-align:center;padding:20px 0;">Нет данных о дропе</div>';
  }

  // PIXR
  html += '<div class="loot-row"><img src="images/pixr.png" style="width:24px;height:24px;object-fit:contain;image-rendering:pixelated;margin-right:8px;vertical-align:middle;" onerror="this.style.opacity=0">';
  html += '<span style="flex:1;color:#ff44cc;">PIXR монетка</span>';
  html += '<span class="loot-rarity-badge" style="color:#ff44cc;border-color:#ff44cc;margin-right:8px;">Валюта</span>';
  html += '<span style="color:#f5c542;font-weight:bold;min-width:38px;text-align:right;">' + pixrChance + '%</span></div>';

  // Книги по классам
  var bookClasses = [
    { id:'fire',  label:'Пирокан', color:'#ff7030', skills:'Огн. шар, Проклятие, Ярость' },
    { id:'light', label:'Люмос',   color:'#ffd040', skills:'Кара света, Щит света, Отражение' },
    { id:'water', label:'Аквас',   color:'#40d0ff', skills:'Тройной удар, Концентрация, Заморозка' },
  ];
  bookClasses.forEach(function(bc) {
    html += '<div class="loot-row"><span style="font-size:20px;margin-right:8px;">📖</span>';
    html += '<span style="flex:1;color:#b88cf8;">Книга навыка <span style="font-size:9px;color:' + bc.color + ';border:1px solid ' + bc.color + ';padding:1px 4px;border-radius:3px;">' + bc.label + '</span>';
    html += ' <span style="font-size:9px;color:#556;">(' + bc.skills + ')</span></span>';
    html += '<span class="loot-rarity-badge" style="color:#9b59b6;border-color:#9b59b6;margin-right:8px;">Эпический</span>';
    html += '<span style="color:#f5c542;font-weight:bold;min-width:38px;text-align:right;">' + realBookChance + '%</span></div>';
  });

  html += '<div style="margin-top:10px;font-size:9px;color:#445;text-align:center;">% — шанс выпадения за каждое убийство</div>';
  html += '<button onclick="closeFloorLootModal()" style="width:100%;margin-top:12px;padding:10px;font-size:12px;font-family:Courier New,monospace;border-radius:8px;border:1.5px solid #2a2a5a;background:rgba(255,255,255,0.04);color:#778;cursor:pointer;">Закрыть</button>';
  document.getElementById('floorLootContent').innerHTML = html;
  document.getElementById('floorLootModal').classList.add('show');
}

function closeFloorLootModal() { document.getElementById('floorLootModal').classList.remove('show'); }

function renderFloors() {
  const cp   = calcCP();
  const body = document.getElementById('floorsBody');
  let html   = '';
  html += '<div style="font-size:11px;color:#778;margin-bottom:12px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid #2a2a5a;display:flex;justify-content:space-between;align-items:center;">';
  html += '<span>CP: <strong style="color:#fa0">' + cp + '</strong></span>';
  html += '<span style="color:#8af">Этаж: <strong style="color:#fff">' + G.floor + '</strong></span>';
  html += '<span style="color:#556;font-size:10px;">' + G.floor + '/' + FLOORS.length + '</span></div>';

  FLOORS.forEach(function(f) {
    var unlocked  = cp >= f.cpReq;
    var isCurrent = G.floor === f.n;
    var visited   = G.maxFloor >= f.n;
    var locked    = !unlocked;
    
    // ✅ ИСПРАВЛЕННЫЙ РАСЧЁТ XP и Gold
    var allXp = f.baseXp.map(function(xp) { return Math.round(xp * f.xpMult); });
    var allGold = f.baseGold.map(function(gold) { return Math.round(gold * f.goldMult); });
    
    var avgXp   = Math.round(Math.min.apply(null, allXp));
    var maxXp   = Math.round(Math.max.apply(null, allXp));
    var avgGold = Math.round(Math.min.apply(null, allGold));
    var maxGold = Math.round(Math.max.apply(null, allGold));
    
    var cpLeft  = f.cpReq - cp;
    var borderColor = '#2a2a5a', extraStyle = '';
    if (isCurrent)                { borderColor = '#f5c542'; extraStyle = 'box-shadow:0 0 14px rgba(245,197,66,0.22);'; }
    else if (visited && unlocked) { borderColor = '#2ecc71'; }
    else if (locked)              { borderColor = '#2a2a3a'; extraStyle = 'opacity:0.6;'; }

    html += '<div style="margin-bottom:14px;border-radius:10px;border:1.5px solid ' + borderColor + ';' + extraStyle + 'overflow:hidden;">';
    html += '<div style="padding:10px 12px;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.05);border-bottom:1px solid #1a1a35;">';
    html += '<span style="font-size:26px;line-height:1">' + f.emoji + '</span>';
    html += '<div style="flex:1;"><div style="font-size:13px;font-weight:bold;color:' + (isCurrent ? '#f5c542' : '#ddd') + ';letter-spacing:0.5px;">Этаж ' + f.n + ': ' + f.name;
    if (isCurrent) html += ' <span style="font-size:9px;color:#fa0;border:1px solid #fa0;padding:1px 5px;border-radius:3px;margin-left:4px;">ЗДЕСЬ</span>';
    if (visited && !isCurrent && unlocked) html += ' <span style="font-size:10px;color:#2ecc71;">&#10003;</span>';
    html += '</div><div style="font-size:10px;color:#778;margin-top:3px;">' + f.desc + '</div></div>';
    if (locked) html += '<div style="font-size:10px;color:#e74c3c;text-align:right;min-width:55px;">&#128274;<br><span style="color:#f88">ещё +' + cpLeft + ' CP</span></div>';
    html += '</div>';
    html += '<div style="padding:8px 12px 10px;background:rgba(0,0,0,0.18);">';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">';
    html += '<div style="background:rgba(255,255,255,0.04);border:1px solid #1a1a35;border-radius:6px;padding:6px 4px;text-align:center;"><div style="font-size:9px;color:#556;">Нужно CP</div><div style="font-size:14px;font-weight:bold;color:' + (unlocked ? '#2ecc71' : '#e74c3c') + ';">' + (f.cpReq === 0 ? 'Старт' : f.cpReq) + '</div></div>';
    html += '<div style="background:rgba(155,89,182,0.08);border:1px solid #3a1a5a;border-radius:6px;padding:6px 4px;text-align:center;"><div style="font-size:9px;color:#778;">XP/враг</div><div style="font-size:13px;font-weight:bold;color:#b88cf8;">' + avgXp + '&ndash;' + maxXp + '</div></div>';
    html += '<div style="background:rgba(245,197,66,0.07);border:1px solid #4a3a10;border-radius:6px;padding:6px 4px;text-align:center;"><div style="font-size:9px;color:#887733;">Золото</div><div style="font-size:13px;font-weight:bold;color:#f5c542;">' + avgGold + '&ndash;' + maxGold + '</div></div>';
    html += '</div>';
    html += '<div style="display:flex;gap:6px;margin-bottom:10px;">';
    html += '<div style="flex:1;background:rgba(155,89,182,0.1);border:1px solid #3a1a5a;border-radius:5px;padding:4px 8px;font-size:10px;color:#b88cc8;">XP &times;' + f.xpMult.toFixed(1) + '</div>';
    html += '<div style="flex:1;background:rgba(245,197,66,0.08);border:1px solid #4a3a10;border-radius:5px;padding:4px 8px;font-size:10px;color:#c8a040;">Золото &times;' + f.goldMult.toFixed(1) + '</div>';
    html += '</div>';
    html += '<div style="display:flex;gap:6px;">';
    html += '<button onclick="openFloorLoot(' + f.n + ')" style="flex:0 0 auto;padding:8px 12px;font-size:11px;font-family:Courier New,monospace;border-radius:6px;border:1.5px solid #3a3a7a;background:rgba(60,60,180,0.1);color:#88a;cursor:pointer;">👁 Дроп</button>';
    if (isCurrent) {
      html += '<div style="flex:1;padding:8px;font-size:11px;border-radius:6px;border:1.5px solid #f5c542;background:rgba(245,197,66,0.07);color:#f5c542;text-align:center;box-sizing:border-box;letter-spacing:1px;">&#10022; ТЕКУЩИЙ ЭТАЖ &#10022;</div>';
    } else if (unlocked) {
      var btnColor = visited ? '#2ecc71' : '#f5c542';
      var btnBg    = visited ? 'rgba(46,204,113,0.1)' : 'rgba(245,197,66,0.1)';
      var btnText  = visited ? '&#9654; ПЕРЕЙТИ' : '&#9654; ВОЙТИ ВПЕРВЫЕ';
      html += '<button onclick="goToFloor(' + f.n + ')" style="flex:1;padding:9px;font-size:12px;font-family:Courier New,monospace;border-radius:6px;border:1.5px solid ' + btnColor + ';background:' + btnBg + ';color:' + btnColor + ';cursor:pointer;letter-spacing:1px;">' + btnText + '</button>';
    } else {
      html += '<div style="flex:1;padding:8px;font-size:11px;border-radius:6px;border:1px solid #333;background:rgba(255,255,255,0.02);color:#446;text-align:center;box-sizing:border-box;">&#128274; Нужно ' + f.cpReq + ' CP</div>';
    }
    html += '</div></div></div>';
  });
  body.innerHTML = html;
}

function goToFloor(n) {
  const cp = calcCP();
  const f  = FLOORS[n - 1];
  if (cp < f.cpReq) { flashRed(); return; }
  G.floor = n;
  G.maxFloor = Math.max(G.maxFloor, n);
  monsters = [];
  nextMonsterSpawn = player.worldX + 400;
  updateHUD(); switchTab('game');
}

// ═══════════════════════════════
//  ВКЛАДКА РЕЙТИНГА (исправленная)
// ═══════════════════════════════

// Кэш рейтинга
var _ratingCache = null;
var _ratingCacheTime = 0;
var _ratingLoading = false;

function renderRating() {
  var body = document.getElementById('ratingBody');
  if (!body) return;
  
  // Показываем кэш если есть
  if (_ratingCache && Date.now() - _ratingCacheTime < 30000) {
    renderRatingData(_ratingCache, body);
    return;
  }
  
  // Показываем загрузку
  body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">⏳ Загрузка рейтинга...</div>';
  
  // Если нет GameSync или не онлайн — показываем заглушку
  if (!window.GameSync || !window.GameSync.state.online) {
    body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">📱 Рейтинг доступен только в Telegram</div>';
    return;
  }
  
  if (_ratingLoading) return;
  _ratingLoading = true;
  
  var tgId = window.GameSync.getTgId();
  var api = window.GameSync._API;
  
  fetch(api + '/api/leaderboard?tgId=' + encodeURIComponent(tgId))
    .then(function(r) { return r.json(); })
    .then(function(r) {
      _ratingLoading = false;
      if (!r.ok || !r.top) {
        body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#e74c3c;font-size:12px;">❌ Ошибка загрузки</div>';
        return;
      }
      
      // Кэшируем
      _ratingCache = r.top;
      _ratingCacheTime = Date.now();
      
      renderRatingData(r.top, body);
    })
    .catch(function() {
      _ratingLoading = false;
      body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#e74c3c;font-size:12px;">❌ Нет соединения</div>';
    });
}

function renderRatingData(players, body) {
  var medals = ['🥇', '🥈', '🥉'];
  var charEmojis = { fire: '🔥', light: '✨', water: '💧' };
  var charColors = { fire: '#ff7030', light: '#ffd040', water: '#40d0ff' };
  
  // Находим текущего игрока
  var tgId = window.GameSync ? window.GameSync.getTgId() : null;
  var myIndex = -1;
  
  var html = '<div style="font-size:10px;color:#778;margin-bottom:12px;">🏆 Топ ' + Math.min(players.length, 50) + ' игроков по Боевой мощи</div>';
  
  if (!players || players.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">👥 Пока нет игроков</div>';
    return;
  }
  
  // Используем только топ-50
  var topPlayers = players.slice(0, 50);
  
  topPlayers.forEach(function(p, i) {
    var isMe = (p.tgId && p.tgId === tgId);
    if (isMe) myIndex = i;
    
    var rank = i + 1;
    var medal = medals[i] || rank;
    var name = p.firstName || p.username || ('Игрок ' + (p.tgId || '').slice(-4));
    var charEmoji = charEmojis[p.charId] || '❓';
    var charColor = charColors[p.charId] || '#aaa';
    var level = p.level || 1;
    var cp = p.cp || 0;
    
    var aUrl = avatarUrl(p.tgId);
    
    html += 
      '<div class="rating-row" style="' + (isMe ? 'border-color:#fa0;background:rgba(245,197,66,0.08);' : '') + '">' +
        '<div class="rating-rank">' + medal + '</div>' +
        '<div style="flex:0 0 32px;width:32px;height:32px;border-radius:50%;overflow:hidden;border:1.5px solid ' + (isMe ? '#f5c542' : '#2a2a5a') + ';background:#0d0d22;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px;">' +
          (aUrl ? '<img src="' + aUrl + '" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="onAvatarError(this,\'' + p.tgId + '\',\'' + (charEmoji||'👤') + '\')">' : (charEmoji||'👤')) +
        '</div>' +
        '<div style="flex:1;min-width:0;padding-left:10px;">' +
          '<div style="font-size:12px;color:' + (isMe ? '#f5c542' : '#ddd') + ';">' +
            name + 
            ' <span style="font-size:9px;color:' + charColor + ';">' + charEmoji + '</span>' +
          '</div>' +
          '<div style="font-size:9px;color:#556;">Lv.' + level + '</div>' +
        '</div>' +
        '<div class="rating-cp"><svg width="12" height="12" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated;vertical-align:middle"><rect x="4" y="0" width="2" height="7" fill="#ffaa00"/><rect x="2" y="3" width="6" height="2" fill="#ffaa00"/><rect x="4" y="7" width="2" height="1" fill="#c8850a"/><rect x="3" y="8" width="4" height="1" fill="#c8850a"/><rect x="4" y="9" width="2" height="1" fill="#c8850a"/></svg> ' + cp + '</div>' +
      '</div>';
  });
  
  // Если текущий игрок не в топ-50, добавляем его внизу
  if (myIndex === -1 && tgId) {
    var myCp = typeof calcCP === 'function' ? calcCP() : 0;
    var myLevel = G.level || 1;
    var myChar = G_CHAR ? G_CHAR.id : null;
    var myName = '👤 Ты';
    var myEmoji = charEmojis[myChar] || '';
    var myColor = charColors[myChar] || '#aaa';
    
    // Аватарка текущего игрока
    var myAvatarUrl = (window.GameSync && window.GameSync._API)
      ? window.GameSync._API + '/api/avatar/' + tgId : '';
    
    html += 
      '<div style="margin-top:10px;border-top:1px solid #2a2a5a;padding-top:8px;font-size:9px;color:#556;text-align:center;">— Ты не в топе —</div>' +
      '<div class="rating-row" style="border-color:#fa0;background:rgba(245,197,66,0.08);">' +
        '<div class="rating-rank">' + (topPlayers.length + 1) + '</div>' +
        '<div style="flex:0 0 32px;width:32px;height:32px;border-radius:50%;overflow:hidden;border:1.5px solid #f5c542;background:#0d0d22;flex-shrink:0;">' +
          '<img src="' + myAvatarUrl + '" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'' + (myEmoji || '👤') + '\';this.parentElement.style.display=\'flex\';this.parentElement.style.alignItems=\'center\';this.parentElement.style.justifyContent=\'center\';this.parentElement.style.fontSize=\'16px\';">' +
        '</div>' +
        '<div style="flex:1;min-width:0;padding-left:10px;">' +
          '<div style="font-size:12px;color:#f5c542;">' + myName + ' <span style="font-size:9px;color:' + myColor + ';">' + myEmoji + '</span></div>' +
          '<div style="font-size:9px;color:#556;">Lv.' + myLevel + '</div>' +
        '</div>' +
        '<div class="rating-cp"><svg width="12" height="12" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated;vertical-align:middle"><rect x="4" y="0" width="2" height="7" fill="#ffaa00"/><rect x="2" y="3" width="6" height="2" fill="#ffaa00"/><rect x="4" y="7" width="2" height="1" fill="#c8850a"/><rect x="3" y="8" width="4" height="1" fill="#c8850a"/><rect x="4" y="9" width="2" height="1" fill="#c8850a"/></svg> ' + myCp + '</div>' +
      '</div>';
  }
  
  body.innerHTML = html;
}

// ── SVG иконки для кошелька/статистики ──
function swordStatSvg(c) { return `<svg width="20" height="20" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="4" y="0" width="2" height="7" fill="${c}"/><rect x="2" y="3" width="6" height="2" fill="${c}"/><rect x="4" y="7" width="2" height="1" fill="${c}" opacity="0.7"/><rect x="3" y="8" width="4" height="1" fill="${c}" opacity="0.7"/><rect x="4" y="9" width="2" height="1" fill="${c}" opacity="0.7"/></svg>`; }
function shieldSvg()   { return `<svg width="20" height="20" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="2" y="0" width="6" height="2" fill="#3498db"/><rect x="0" y="2" width="2" height="4" fill="#3498db"/><rect x="8" y="2" width="2" height="4" fill="#3498db"/><rect x="2" y="0" width="2" height="3" fill="#5dade2"/><rect x="6" y="0" width="2" height="3" fill="#5dade2"/><rect x="2" y="6" width="3" height="2" fill="#3498db"/><rect x="5" y="6" width="3" height="2" fill="#3498db"/><rect x="4" y="8" width="2" height="2" fill="#2980b9"/></svg>`; }
function heartSvg()    { return `<svg width="20" height="20" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="1" y="1" width="3" height="2" fill="#e74c3c"/><rect x="6" y="1" width="3" height="2" fill="#e74c3c"/><rect x="0" y="2" width="10" height="4" fill="#e74c3c"/><rect x="1" y="6" width="8" height="2" fill="#e74c3c"/><rect x="2" y="8" width="6" height="1" fill="#c0392b"/><rect x="3" y="9" width="4" height="1" fill="#c0392b"/></svg>`; }
function windSvg()     { return `<svg width="20" height="20" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="0" y="3" width="6" height="2" fill="#2ecc71"/><rect x="2" y="1" width="4" height="2" fill="#27ae60"/><rect x="0" y="5" width="8" height="2" fill="#2ecc71"/><rect x="2" y="7" width="6" height="2" fill="#27ae60"/><rect x="6" y="1" width="2" height="4" fill="#2ecc71"/><rect x="8" y="5" width="2" height="2" fill="#27ae60"/></svg>`; }
function critSvg()     { return `<svg width="20" height="20" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="4" y="0" width="2" height="3" fill="#f5c542"/><rect x="4" y="7" width="2" height="3" fill="#f5c542"/><rect x="0" y="4" width="3" height="2" fill="#f5c542"/><rect x="7" y="4" width="3" height="2" fill="#f5c542"/><rect x="1" y="1" width="2" height="2" fill="#f5c542"/><rect x="7" y="1" width="2" height="2" fill="#f5c542"/><rect x="1" y="7" width="2" height="2" fill="#f5c542"/><rect x="7" y="7" width="2" height="2" fill="#f5c542"/><rect x="3" y="3" width="4" height="4" fill="#fff8d0"/></svg>`; }
function dodgeSvg()    { return `<svg width="20" height="20" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="3" y="0" width="2" height="3" fill="#9b59b6"/><rect x="7" y="0" width="2" height="3" fill="#9b59b6"/><rect x="0" y="3" width="3" height="2" fill="#9b59b6"/><rect x="7" y="3" width="3" height="2" fill="#9b59b6"/><rect x="0" y="6" width="3" height="2" fill="#9b59b6"/><rect x="7" y="6" width="3" height="2" fill="#9b59b6"/><rect x="3" y="7" width="2" height="3" fill="#9b59b6"/><rect x="7" y="7" width="2" height="3" fill="#9b59b6"/><rect x="4" y="3" width="2" height="2" fill="#c39bd3"/><rect x="3" y="4" width="4" height="2" fill="#c39bd3"/></svg>`; }
function skullSvg()    { return `<svg width="20" height="20" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="2" y="1" width="6" height="6" fill="#aaa"/><rect x="0" y="3" width="2" height="4" fill="#aaa"/><rect x="8" y="3" width="2" height="4" fill="#aaa"/><rect x="2" y="7" width="6" height="2" fill="#aaa"/><rect x="3" y="9" width="2" height="1" fill="#888"/><rect x="6" y="9" width="2" height="1" fill="#888"/><rect x="2" y="3" width="2" height="2" fill="#0d0d1a"/><rect x="6" y="3" width="2" height="2" fill="#0d0d1a"/><rect x="4" y="6" width="2" height="1" fill="#0d0d1a"/></svg>`; }
function cupSvg()      { return `<svg width="20" height="20" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="2" y="1" width="6" height="4" fill="#f5c542"/><rect x="0" y="1" width="2" height="3" fill="#f5c542"/><rect x="8" y="1" width="2" height="3" fill="#f5c542"/><rect x="3" y="5" width="4" height="2" fill="#f5c542"/><rect x="4" y="7" width="2" height="1" fill="#c8a000"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/></svg>`; }
function towerSvg()    { return `<svg width="20" height="20" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="2" y="2" width="6" height="8" fill="#7ab8ff"/><rect x="2" y="1" width="2" height="3" fill="#7ab8ff"/><rect x="5" y="0" width="2" height="4" fill="#7ab8ff"/><rect x="8" y="1" width="2" height="3" fill="#7ab8ff"/><rect x="3" y="4" width="2" height="2" fill="#0d0d1a"/><rect x="6" y="4" width="2" height="2" fill="#0d0d1a"/><rect x="4" y="7" width="2" height="3" fill="#0d0d1a"/></svg>`; }
function atkSpdSvg()   { return `<svg width="20" height="20" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="1" y="1" width="2" height="2" fill="#ffaa00"/><rect x="3" y="3" width="2" height="2" fill="#ffaa00"/><rect x="5" y="1" width="2" height="2" fill="#ffaa00"/><rect x="7" y="3" width="2" height="2" fill="#ffaa00"/><rect x="3" y="5" width="4" height="2" fill="#ffcc44"/><rect x="2" y="7" width="6" height="2" fill="#ff8800"/></svg>`; }

// ═══════════════════════════════
//  ВКЛАДКА КОШЕЛЕК (исправленная)
// ═══════════════════════════════

var _walletTab = 'wallet'; // 'wallet' | 'stats'

function renderWallet() {
  const cp = calcCP();
  const pixr = G.pixr || 0;
  const gram = (G.gram || 0).toFixed(3);
  
  const tabsHtml = `
    <div style="display:flex;gap:4px;margin-bottom:12px;">
      <button onclick="switchWalletTab('wallet')" style="flex:1;padding:8px;font-size:12px;font-family:Courier New,monospace;
        border-radius:8px;border:1.5px solid ${_walletTab === 'wallet' ? '#40d0ff' : '#2a2a5a'};
        background:${_walletTab === 'wallet' ? 'rgba(64,208,255,0.1)' : 'rgba(255,255,255,0.03)'};
        color:${_walletTab === 'wallet' ? '#40d0ff' : '#556'};cursor:pointer;">
        👛 Кошелек
      </button>
      <button onclick="switchWalletTab('stats')" style="flex:1;padding:8px;font-size:12px;font-family:Courier New,monospace;
        border-radius:8px;border:1.5px solid ${_walletTab === 'stats' ? '#f5c542' : '#2a2a5a'};
        background:${_walletTab === 'stats' ? 'rgba(245,197,66,0.1)' : 'rgba(255,255,255,0.03)'};
        color:${_walletTab === 'stats' ? '#f5c542' : '#556'};cursor:pointer;">
        📊 Статистика
      </button>
    </div>
  `;
  
  if (_walletTab === 'stats') {
    document.getElementById('walletBody').innerHTML = tabsHtml + renderStats();
    return;
  }
  
  // ── КОШЕЛЕК ──
  const canExchange = pixr >= 1000;
  
  const html = `
    ${tabsHtml}
    
    <!-- Балансы -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
      <div style="padding:14px;background:rgba(255,68,204,0.06);border:1.5px solid #4a2a5a;border-radius:12px;text-align:center;">
        <img src="images/pixr.png" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;display:block;margin:0 auto 4px;">
        <div style="font-size:9px;color:#778;letter-spacing:1px;">PIXR</div>
        <div style="font-size:20px;font-weight:bold;color:#ff44cc;">${pixr}</div>
      </div>
      <div style="padding:14px;background:rgba(64,208,255,0.06);border:1.5px solid #2a4a6a;border-radius:12px;text-align:center;">
        <img src="images/gram.png" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;display:block;margin:0 auto 4px;">
        <div style="font-size:9px;color:#778;letter-spacing:1px;">GRAM</div>
        <div style="font-size:20px;font-weight:bold;color:#40d0ff;">${gram}</div>
      </div>
    </div>
    
    <!-- Обмен PIXR → GRAM -->
    <div style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid #2a2a5a;border-radius:10px;margin-bottom:12px;">
      <div style="font-size:10px;color:#778;margin-bottom:6px;display:flex;align-items:center;gap:4px;"><img src="images/pixr.png" style="width:14px;height:14px;object-fit:contain;image-rendering:pixelated;vertical-align:middle"> ОБМЕН PIXR → <img src="images/gram.png" style="width:14px;height:14px;object-fit:contain;image-rendering:pixelated;vertical-align:middle"> GRAM (1000:1)</div>
      <div style="display:flex;gap:8px;">
        <input id="exchangeAmount" type="number" min="1000" step="1000" value="1000" 
          style="flex:1;padding:8px 10px;background:#0d0d22;border:1px solid #2a2a5a;border-radius:6px;color:#fff;font-size:14px;font-family:'Courier New',monospace;">
        <button onclick="submitExchange()" style="padding:8px 16px;background:linear-gradient(90deg,#4a2a8a,#7a4ad0);border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:bold;cursor:pointer;font-family:'Courier New',monospace;">
          Обменять
        </button>
      </div>
      <div id="exchangeResult" style="font-size:10px;color:#556;margin-top:4px;min-height:16px;"></div>
    </div>
    
    <!-- Кнопки Пополнить/Вывести -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
      <button onclick="openDepositModal()" style="padding:14px;background:linear-gradient(90deg,#1a5a3a,#2a8a4a);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:bold;cursor:pointer;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;gap:6px;">
        <img src="images/gram.png" style="width:18px;height:18px;object-fit:contain;image-rendering:pixelated"> Пополнить
      </button>
      <button onclick="openWithdrawModal()" style="padding:14px;background:linear-gradient(90deg,#5a2a2a,#8a3a3a);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:bold;cursor:pointer;font-family:'Courier New',monospace;display:flex;align-items:center;justify-content:center;gap:6px;">
        <img src="images/gram.png" style="width:18px;height:18px;object-fit:contain;image-rendering:pixelated"> Вывести
      </button>
    </div>
    
    <!-- Последние транзакции -->
    <div id="txList" style="margin-top:10px;">
      <div style="font-size:10px;color:#556;letter-spacing:1px;margin-bottom:6px;">ИСТОРИЯ ТРАНЗАКЦИЙ</div>
      <div style="color:#445;text-align:center;padding:20px 0;font-size:12px;">Загрузка...</div>
    </div>
  `;
  
  document.getElementById('walletBody').innerHTML = html;
  loadTransactions();
}

// ── ОБМЕН PIXR → GRAM ──
function submitExchange() {
  const amount = parseInt(document.getElementById('exchangeAmount').value);
  const result = document.getElementById('exchangeResult');
  
  if (!amount || amount < 1000 || amount % 1000 !== 0) {
    result.innerHTML = '<span style="color:#e74c3c;">Сумма должна быть кратна 1000 PIXR</span>';
    return;
  }
  
  if (amount > (G.pixr || 0)) {
    result.innerHTML = '<span style="color:#e74c3c;">Недостаточно PIXR</span>';
    return;
  }
  
  result.innerHTML = '<span style="color:#f5c542;">Обмен...</span>';
  
  fetch(window.GameSync._API + '/api/wallet/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData: window.GameSync._INIT,
      amount: amount
    })
  })
  .then(r => r.json())
  .then(r => {
    if (r.ok) {
      G.pixr = r.pixr;
      G.gram = r.gram;
      updateHUD();
      result.innerHTML = `<span style="color:#2ecc71;">✅ Обменяно ${amount} PIXR → ${r.earned} GRAM</span>`;
      setTimeout(function() {
        renderWallet();
      }, 1000);
    } else {
      result.innerHTML = '<span style="color:#e74c3c;">❌ ' + (r.error || 'Ошибка') + '</span>';
    }
  })
  .catch(function() {
    result.innerHTML = '<span style="color:#e74c3c;">❌ Ошибка соединения</span>';
  });
}

// ── ЗАГРУЗКА ТРАНЗАКЦИЙ (ИСПРАВЛЕННАЯ) ──
// ✅ Единственная версия loadTransactions (дубликат удалён)
function loadTransactions() {
  if (!window.GameSync || !window.GameSync._INIT) return;
  
  var list = document.getElementById('txList');
  if (!list) return;
  
  list.innerHTML = '<div style="color:#445;text-align:center;padding:20px 0;font-size:12px;">Загрузка...</div>';
  
  fetch(window.GameSync._API + '/api/wallet/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: window.GameSync._INIT })
  })
  .then(function(r) { 
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json(); 
  })
  .then(function(r) {
    if (!r.ok) throw new Error(r.error || 'Unknown error');
    
    if (!r.transactions || r.transactions.length === 0) {
      list.innerHTML = `
        <div style="color:#445;text-align:center;padding:20px 0;font-size:12px;">
          <div style="font-size:24px;margin-bottom:8px;">📭</div>
          Нет транзакций
        </div>
      `;
      return;
    }
    
    var statusColors = {
      pending: '#f5c542',
      approved: '#2ecc71',
      rejected: '#e74c3c'
    };
    var statusLabels = {
      pending: '⏳ Ожидание',
      approved: '✅ Подтверждено',
      rejected: '❌ Отклонено'
    };
    var typeLabels = {
      deposit: '📥 Пополнение',
      withdraw: '📤 Вывод'
    };
    
    var html = '';
    r.transactions.slice(0, 10).forEach(function(tx) {
      var date = new Date(tx.createdAt).toLocaleDateString('ru-RU');
      
      html += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #0a0a1a;font-size:11px;">
          <div>
            <div style="color:#ddd;">${typeLabels[tx.type] || tx.type}</div>
            <div style="color:#556;font-size:9px;">${date}</div>
          </div>
          <div style="text-align:right;">
            <div style="color:${tx.type === 'deposit' ? '#2ecc71' : '#e74c3c'};font-weight:bold;display:flex;align-items:center;gap:3px;justify-content:flex-end;">
              ${tx.type === 'deposit' ? '+' : '-'} ${tx.amount} <img src="images/gram.png" style="width:13px;height:13px;object-fit:contain;image-rendering:pixelated;vertical-align:middle">
            </div>
            <div style="color:${statusColors[tx.status] || '#556'};font-size:9px;">
              ${statusLabels[tx.status] || tx.status}
            </div>
          </div>
        </div>
      `;
    });
    list.innerHTML = html;
  })
  .catch(function(err) {
    console.error('❌ [wallet] loadTransactions error:', err.message);
    list.innerHTML = '<div style="color:#e74c3c;text-align:center;padding:20px 0;font-size:12px;">Ошибка загрузки</div>';
  });
}

function switchWalletTab(tab) {
  _walletTab = tab;
  renderWallet();
}

function renderStats() {
  const cp = calcCP();
  return `
    <div class="stats-grid">
      <div class="stat-cell"><div class="stat-icon">${swordStatSvg('#ffaa00')}</div><div class="stat-label">Боевая мощь</div><div class="stat-val">${cp}</div></div>
      <div class="stat-cell"><div class="stat-icon">${skullSvg()}</div><div class="stat-label">Убийств</div><div class="stat-val">${G.killCount}</div></div>
      <div class="stat-cell"><div class="stat-icon">${cupSvg()}</div><div class="stat-label">Уровень</div><div class="stat-val">${G.level}</div></div>
      <div class="stat-cell"><div class="stat-icon">${towerSvg()}</div><div class="stat-label">Этаж</div><div class="stat-val">${G.floor} / ${FLOORS.length}</div></div>
      <div class="stat-cell"><div class="stat-icon">${swordStatSvg('#ff6060')}</div><div class="stat-label">Атака</div><div class="stat-val">${G.stats.atk}</div></div>
      <div class="stat-cell"><div class="stat-icon">${shieldSvg()}</div><div class="stat-label">Защита</div><div class="stat-val">${G.stats.def}</div></div>
      <div class="stat-cell"><div class="stat-icon">${windSvg()}</div><div class="stat-label">Скорость</div><div class="stat-val">${G.stats.spd}</div></div>
      <div class="stat-cell"><div class="stat-icon">${critSvg()}</div><div class="stat-label">Крит %</div><div class="stat-val">${G.stats.crit}%</div></div>
      <div class="stat-cell"><div class="stat-icon">${critSvg()}</div><div class="stat-label">Сила крита</div><div class="stat-val">${effectiveCritDmg().toFixed(1)}x</div></div>
      <div class="stat-cell"><div class="stat-icon">${dodgeSvg()}</div><div class="stat-label">Уклон %</div><div class="stat-val">${G.stats.dodge}%</div></div>
      <div class="stat-cell"><div class="stat-icon">${heartSvg()}</div><div class="stat-label">Макс. HP</div><div class="stat-val">${G.maxHp}</div></div>
      <div class="stat-cell"><div class="stat-icon">${atkSpdSvg()}</div><div class="stat-label">Ск. атаки</div><div class="stat-val">${(G.stats.atkSpd||1).toFixed(2)}x</div></div>
    </div>
  `;
}


// ═══════════════════════════════
//  МОДАЛКИ ПОПОЛНЕНИЯ/ВЫВОДА
// ═══════════════════════════════

function openDepositModal() {
  const modal = document.getElementById('depositModal');
  if (!modal) createDepositModal();
  document.getElementById('depositModal').classList.remove('hidden');
}

function createDepositModal() {
  const WALLET_ADDR = 'UQD5hiR-ziWL1r2jggCKxzhE7K7yNvH3FqnckOdXosVKYEfb';
  const html = `
    <div id="depositModal" class="wallet-modal hidden" onclick="closeWalletModal(event)">
      <div class="wallet-modal-content" onclick="event.stopPropagation()">
        <div class="wallet-modal-header">
          <span class="wallet-modal-title"><svg width="14" height="14" viewBox="0 0 12 10" fill="none" style="image-rendering:pixelated;vertical-align:middle;margin-right:4px"><rect x="1" y="3" width="10" height="6" fill="#2a8a4a"/><rect x="2" y="4" width="8" height="4" fill="#3aaa5a"/><rect x="0" y="5" width="2" height="2" fill="#2a8a4a"/><rect x="10" y="5" width="2" height="2" fill="#2a8a4a"/><rect x="4" y="0" width="4" height="3" fill="#f5c542"/><rect x="3" y="1" width="6" height="2" fill="#ffd700"/></svg>Пополнение <img src="images/gram.png" style="width:14px;height:14px;object-fit:contain;image-rendering:pixelated;vertical-align:middle"></span>
          <button class="wallet-modal-close" onclick="closeWalletModal()">✕</button>
        </div>
        <div class="wallet-modal-body">
          <div class="wallet-info">
            <div style="font-size:12px;color:#778;margin-bottom:12px;">Минимальная сумма: <b style="color:#40d0ff;">1 <img src="images/gram.png" style="width:12px;height:12px;object-fit:contain;image-rendering:pixelated;vertical-align:middle"></b></div>
          </div>

          <div style="margin-bottom:12px;">
            <label style="font-size:11px;color:#778;">Сумма (<img src="images/gram.png" style="width:11px;height:11px;object-fit:contain;image-rendering:pixelated;vertical-align:middle">)</label>
            <input id="depositAmount" type="number" min="1" value="1"
              style="width:100%;padding:10px;background:#0d0d22;border:1px solid #2a2a5a;border-radius:8px;color:#fff;font-size:16px;font-family:'Courier New',monospace;margin-top:4px;">
          </div>

          <div style="background:rgba(64,208,255,0.06);border:1px solid #2a4a6a;border-radius:8px;padding:12px;margin-bottom:12px;">
            <div style="font-size:10px;color:#556;margin-bottom:8px;letter-spacing:1px;">РЕКВИЗИТЫ ДЛЯ ПЕРЕВОДА</div>

            <div style="font-size:10px;color:#778;margin-bottom:4px;">Адрес кошелька</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
              <div id="depositWalletAddr" style="flex:1;font-size:11px;color:#ddd;word-break:break-all;background:#0a0a1a;padding:8px;border-radius:6px;font-family:monospace;">${WALLET_ADDR}</div>
              <button onclick="_copyDepositField('depositWalletAddr','addrCopyBtn')" id="addrCopyBtn"
                style="flex-shrink:0;padding:8px 10px;background:rgba(64,208,255,0.12);border:1.5px solid #2a4a6a;border-radius:6px;color:#40d0ff;font-size:11px;font-family:'Courier New',monospace;cursor:pointer;white-space:nowrap;">
                📋 Копировать
              </button>
            </div>

            <div style="font-size:10px;color:#778;margin-bottom:4px;">Мемо (обязательно!)</div>
            <div style="display:flex;align-items:center;gap:6px;">
              <div id="depositMemo" style="flex:1;font-size:11px;color:#40d0ff;background:#0a0a1a;padding:8px;border-radius:6px;font-family:monospace;">загружается...</div>
              <button onclick="_copyDepositField('depositMemo','memoCopyBtn')" id="memoCopyBtn"
                style="flex-shrink:0;padding:8px 10px;background:rgba(64,208,255,0.12);border:1.5px solid #2a4a6a;border-radius:6px;color:#40d0ff;font-size:11px;font-family:'Courier New',monospace;cursor:pointer;white-space:nowrap;">
                📋 Копировать
              </button>
            </div>
          </div>

          <button onclick="submitDeposit()" style="width:100%;padding:12px;background:linear-gradient(90deg,#1a5a3a,#2a8a4a);border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:bold;cursor:pointer;font-family:'Courier New',monospace;">
            ✅ Я оплатил
          </button>
          <div id="depositResult" style="margin-top:8px;font-size:12px;text-align:center;"></div>
        </div>
      </div>
    </div>
  `;

  const div = document.createElement('div');
  div.innerHTML = html;
  document.getElementById('app').appendChild(div.firstElementChild);

  var tgId = window.GameSync ? window.GameSync.getTgId() : 'user';
  document.getElementById('depositMemo').textContent = tgId + '_' + Date.now().toString(36);
}

// ── Копирование поля реквизитов ──
function _copyDepositField(fieldId, btnId) {
  var el  = document.getElementById(fieldId);
  var btn = document.getElementById(btnId);
  if (!el || !btn) return;
  var text = el.textContent.trim();
  var done = function() {
    btn.textContent = '✅ Скопировано';
    btn.style.color = '#2ecc71';
    btn.style.borderColor = '#2ecc71';
    btn.style.background = 'rgba(46,204,113,0.12)';
    setTimeout(function() {
      btn.textContent = '📋 Копировать';
      btn.style.color = '#40d0ff';
      btn.style.borderColor = '#2a4a6a';
      btn.style.background = 'rgba(64,208,255,0.12)';
    }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(function() { _copyFallback(text, done); });
  } else {
    _copyFallback(text, done);
  }
}

function _copyFallback(text, cb) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (cb) cb();
  } catch(e) {}
}

function openWithdrawModal() {
  const modal = document.getElementById('withdrawModal');
  if (!modal) createWithdrawModal();
  document.getElementById('withdrawModal').classList.remove('hidden');
}

function createWithdrawModal() {
  const gram = (G.gram || 0).toFixed(3);
  const maxWithdraw = Math.floor(G.gram || 0);
  
  const html = `
    <div id="withdrawModal" class="wallet-modal hidden" onclick="closeWalletModal(event)">
      <div class="wallet-modal-content" onclick="event.stopPropagation()">
        <div class="wallet-modal-header">
          <span class="wallet-modal-title"><svg width="14" height="14" viewBox="0 0 12 10" fill="none" style="image-rendering:pixelated;vertical-align:middle;margin-right:4px"><rect x="1" y="1" width="10" height="6" fill="#8a3a3a"/><rect x="2" y="2" width="8" height="4" fill="#aa4a4a"/><rect x="0" y="3" width="2" height="2" fill="#8a3a3a"/><rect x="10" y="3" width="2" height="2" fill="#8a3a3a"/><rect x="4" y="7" width="4" height="3" fill="#f5c542"/><rect x="3" y="7" width="6" height="2" fill="#ffd700"/></svg>Вывод <img src="images/gram.png" style="width:14px;height:14px;object-fit:contain;image-rendering:pixelated;vertical-align:middle"></span>
          <button class="wallet-modal-close" onclick="closeWalletModal()">✕</button>
        </div>
        <div class="wallet-modal-body">
          <div class="wallet-info">
            <div style="font-size:12px;color:#778;margin-bottom:4px;">Минимальная сумма: <b style="color:#40d0ff;">1 <img src="images/gram.png" style="width:12px;height:12px;object-fit:contain;image-rendering:pixelated;vertical-align:middle"></b></div>
            <div style="font-size:12px;color:#778;margin-bottom:12px;">Доступно: <b style="color:#40d0ff;">${gram} <img src="images/gram.png" style="width:12px;height:12px;object-fit:contain;image-rendering:pixelated;vertical-align:middle"></b></div>
          </div>
          
          <div style="margin-bottom:12px;">
            <label style="font-size:11px;color:#778;">Сумма (<img src="images/gram.png" style="width:11px;height:11px;object-fit:contain;image-rendering:pixelated;vertical-align:middle">)</label>
            <input id="withdrawAmount" type="number" min="1" max="${maxWithdraw}" value="1" 
              style="width:100%;padding:10px;background:#0d0d22;border:1px solid #2a2a5a;border-radius:8px;color:#fff;font-size:16px;font-family:'Courier New',monospace;margin-top:4px;">
          </div>
          
          <div style="margin-bottom:12px;">
            <label style="font-size:11px;color:#778;">Адрес кошелька</label>
            <input id="withdrawWallet" type="text" placeholder="Введите адрес..." 
              style="width:100%;padding:10px;background:#0d0d22;border:1px solid #2a2a5a;border-radius:8px;color:#fff;font-size:13px;font-family:'Courier New',monospace;margin-top:4px;">
          </div>
          
          <button onclick="submitWithdraw()" style="width:100%;padding:12px;background:linear-gradient(90deg,#5a2a2a,#8a3a3a);border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:bold;cursor:pointer;font-family:'Courier New',monospace;">
            📤 Запросить вывод
          </button>
          <div id="withdrawResult" style="margin-top:8px;font-size:12px;text-align:center;"></div>
        </div>
      </div>
    </div>
  `;
  
  const div = document.createElement('div');
  div.innerHTML = html;
  document.getElementById('app').appendChild(div.firstElementChild);
}

function closeWalletModal(e) {
  if (e && e.target && !e.target.closest('.wallet-modal-content')) return;
  document.querySelectorAll('.wallet-modal').forEach(m => m.classList.add('hidden'));
}

// ── ОТПРАВКА ЗАПРОСА ──
function submitDeposit() {
  const amount = parseInt(document.getElementById('depositAmount').value);
  const result = document.getElementById('depositResult');
  
  if (!amount || amount < 1 || amount > 100) {
    result.innerHTML = '<span style="color:#e74c3c;">Сумма от 1 до 100 GRAM</span>';
    return;
  }
  
  result.innerHTML = '<span style="color:#f5c542;">Отправка...</span>';
  
  fetch(window.GameSync._API + '/api/wallet/deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData: window.GameSync._INIT,
      amount: amount
    })
  })
  .then(r => r.json())
  .then(r => {
    if (r.ok) {
      result.innerHTML = '<span style="color:#2ecc71;">✅ Заявка создана! Ожидайте подтверждения админом.</span>';
      document.getElementById('depositAmount').value = '1';
      loadTransactions();
      setTimeout(closeWalletModal, 3000);
    } else {
      result.innerHTML = '<span style="color:#e74c3c;">❌ ' + (r.error || 'Ошибка') + '</span>';
    }
  })
  .catch(() => {
    result.innerHTML = '<span style="color:#e74c3c;">❌ Ошибка соединения</span>';
  });
}

function submitWithdraw() {
  const amount = parseInt(document.getElementById('withdrawAmount').value);
  const wallet = document.getElementById('withdrawWallet').value.trim();
  const result = document.getElementById('withdrawResult');
  
  if (!amount || amount < 1 || amount > Math.floor(G.gram || 0)) {
    result.innerHTML = '<span style="color:#e74c3c;">Недостаточно средств или неверная сумма</span>';
    return;
  }
  
  if (!wallet || wallet.length < 10) {
    result.innerHTML = '<span style="color:#e74c3c;">Введите корректный адрес кошелька</span>';
    return;
  }
  
  result.innerHTML = '<span style="color:#f5c542;">Отправка...</span>';
  
  fetch(window.GameSync._API + '/api/wallet/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData: window.GameSync._INIT,
      amount: amount,
      wallet: wallet
    })
  })
  .then(r => r.json())
  .then(r => {
    if (r.ok) {
      result.innerHTML = '<span style="color:#2ecc71;">✅ Заявка создана! Ожидайте подтверждения админом.</span>';
      document.getElementById('withdrawAmount').value = '1';
      document.getElementById('withdrawWallet').value = '';
      loadTransactions();
      setTimeout(closeWalletModal, 3000);
    } else {
      result.innerHTML = '<span style="color:#e74c3c;">❌ ' + (r.error || 'Ошибка') + '</span>';
    }
  })
  .catch(() => {
    result.innerHTML = '<span style="color:#e74c3c;">❌ Ошибка соединения</span>';
  });
}

// ═══════════════════════════════
//  ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ═══════════════════════════════
function switchTab(tab) {
  activeTab = tab;
  ['game','inv','upgrades','floors','rating','wallet','friends'].forEach(t => {
    const btn = document.getElementById('nav' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === tab);
  });
  document.getElementById('panelInv').classList.toggle('visible',      tab === 'inv');
  document.getElementById('panelUpgrades').classList.toggle('visible', tab === 'upgrades');
  document.getElementById('panelFloors').classList.toggle('visible',   tab === 'floors');
  document.getElementById('panelRating').classList.toggle('visible',   tab === 'rating');
  document.getElementById('panelWallet').classList.toggle('visible',   tab === 'wallet');
  document.getElementById('panelFriends').classList.toggle('visible',  tab === 'friends');
  var bossPanel = document.getElementById('panelBoss');
  if (bossPanel) bossPanel.classList.toggle('visible', tab === 'boss');
  var hudEl = document.getElementById('skillsHud');
  if (hudEl) hudEl.classList.toggle('visible', tab === 'game' && !!G_CHAR);
  var isGame = tab === 'game' && !!G_CHAR;
  var bpBtn   = document.getElementById('bpHudBtn');
  var premBtn = document.querySelector('.prem-hud-btn');
  var taskBtn = document.getElementById('taskHudBtn');
  var bossBtn = document.getElementById('bossHudBtn');
  var shopBtn = document.getElementById('marketHudBtn');
  var pvpBtn  = document.getElementById('pvpHudBtn');
  if (bpBtn)   bpBtn.style.display   = isGame ? 'flex' : 'none';
  if (premBtn) premBtn.style.display = isGame ? 'flex' : 'none';
  if (taskBtn) taskBtn.style.display = isGame ? 'flex' : 'none';
  if (bossBtn) bossBtn.style.display = isGame ? 'flex' : 'none';
  if (shopBtn) shopBtn.style.display = isGame ? 'flex' : 'none';
  if (pvpBtn)  pvpBtn.style.display  = isGame ? 'flex' : 'none';

  if (tab === 'inv')      { _invSelectMode = false; _invSelected = {}; renderInventory(); }
  if (tab === 'upgrades') renderUpgrades();
  if (tab === 'floors')   renderFloors();
  if (tab === 'rating')   renderRating();
  if (tab === 'wallet')   renderWallet();
  if (tab === 'friends')  renderFriends();
  if (tab === 'boss')     renderBossTab();
}

// ═══════════════════════════════
//  ВКЛАДКА ДРУЗЕЙ
// ═══════════════════════════════
var _friendsLoading = false;

function renderFriends() {
  var body = document.getElementById('friendsBody');
  if (!body) return;

  if (!window.GameSync || !window.GameSync.state.online) {
    body.innerHTML = '<div style="text-align:center;padding:40px 16px;color:#556;font-size:12px;">' +
      '<div style="font-size:32px;margin-bottom:12px;">📱</div>' +
      'Реферальная программа<br>доступна только в Telegram</div>';
    return;
  }

  if (_friendsLoading) return;
  _friendsLoading = true;
  body.innerHTML = '<div style="text-align:center;padding:40px 0;color:#445;font-size:12px;">Загрузка...</div>';

  var _flTimeout = setTimeout(function () {
    if (_friendsLoading) {
      _friendsLoading = false;
      body.innerHTML = '<div style="color:#f44;text-align:center;padding:30px 0;font-size:12px;">Нет соединения</div>';
    }
  }, 10000);

  fetch(window.GameSync._API + '/api/ref/friends', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: window.GameSync._INIT }),
  })
  .then(function(r) { return r.json(); })
  .then(function(r) {
    clearTimeout(_flTimeout);
    _friendsLoading = false;
    if (!r.ok) { body.innerHTML = '<div style="color:#f44;text-align:center;padding:30px 0;font-size:12px;">Ошибка загрузки</div>'; return; }
    renderFriendsData(r, body);
  })
  .catch(function() {
    clearTimeout(_flTimeout);
    _friendsLoading = false;
    body.innerHTML = '<div style="color:#f44;text-align:center;padding:30px 0;font-size:12px;">Нет соединения</div>';
  });
}

function renderFriendsData(r, body) {
  var coinSvg = '<svg width="14" height="14" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated;vertical-align:middle"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>';
  var charColors = { fire: '#ff6030', light: '#ffd040', water: '#40d0ff' };
  var charNames  = { fire: 'Пирокан', light: 'Люмос', water: 'Аквас' };

  var linkHtml =
    '<div style="margin-bottom:14px;padding:12px;background:rgba(245,197,66,0.06);border:1.5px solid #3a3a1a;border-radius:10px;">' +
    '<div style="font-size:10px;color:#778;letter-spacing:1px;margin-bottom:8px;">ТВОЯ РЕФЕРАЛЬНАЯ ССЫЛКА</div>' +
    '<div style="font-size:11px;color:#f5c542;word-break:break-all;margin-bottom:10px;padding:6px 8px;background:#0d0d1a;border-radius:5px;border:1px solid #2a2a5a;">' +
      r.refLink +
    '</div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button onclick="friendsCopyLink(\'' + r.refLink + '\')" style="flex:1;padding:9px;font-size:11px;font-family:Courier New,monospace;border-radius:7px;border:1.5px solid #f5c542;background:rgba(245,197,66,0.1);color:#f5c542;cursor:pointer;">📋 Скопировать</button>' +
    '<button onclick="friendsShare(\'' + r.refLink + '\')" style="flex:1;padding:9px;font-size:11px;font-family:Courier New,monospace;border-radius:7px;border:1.5px solid #2ecc71;background:rgba(46,204,113,0.1);color:#2ecc71;cursor:pointer;">✈️ Поделиться</button>' +
    '</div></div>';

  var rewardHtml =
    '<div style="margin-bottom:14px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid #2a2a5a;border-radius:8px;font-size:10px;color:#667;">' +
    coinSvg + ' <span style="color:#f5c542;font-weight:bold">500 золота</span> за каждые 5 уровней друга · ' +
    '<span style="color:#aaa">Уровни 5, 10, 15, 20...</span></div>';

  var claimHtml = '';
  if (r.pendingGold > 0) {
    claimHtml =
      '<button onclick="friendsClaim(this)" style="width:100%;margin-bottom:14px;padding:13px;font-size:14px;font-weight:bold;' +
      'font-family:Courier New,monospace;border-radius:9px;border:1.5px solid #f5c542;' +
      'background:linear-gradient(180deg,rgba(245,197,66,0.2),rgba(245,197,66,0.05));' +
      'color:#f5c542;cursor:pointer;letter-spacing:1px;">' +
      coinSvg + ' Забрать ' + r.pendingGold + ' золота</button>';
  }

  var friendsHtml = '';
  if (!r.friends || r.friends.length === 0) {
    friendsHtml =
      '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">' +
      '<div style="font-size:28px;margin-bottom:10px;">👥</div>' +
      'Пока нет друзей<br><span style="font-size:10px;color:#334;">Поделись ссылкой — за каждого<br>получишь золото!</span></div>';
  } else {
    var totalEarned = 0;
    r.friends.forEach(function(f) { totalEarned += f.paid * (500 / 5); });
    friendsHtml = '<div style="font-size:10px;color:#778;letter-spacing:1px;margin-bottom:8px;">ДРУЗЬЯ (' + r.friends.length + ')</div>';
    r.friends.forEach(function(f) {
      var col = charColors[f.charId] || '#aaa';
      var cls = charNames[f.charId]  || 'Неизвестный';
      var nextLv = f.nextMilestone;
      var toNext = nextLv - f.level;
      var progressPct = toNext > 0 ? Math.min(100, ((5 - toNext) / 5 * 100)) : 100;
      friendsHtml +=
        '<div style="margin-bottom:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid #1a1a35;border-radius:9px;">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px;">' +
        '<div style="width:36px;height:36px;border-radius:6px;background:rgba(255,255,255,0.06);border:1.5px solid ' + col + '33;' +
        'display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">👤</div>' +
        '<div style="flex:1;">' +
        '<div style="font-size:13px;color:#ddd;font-weight:bold;">' + (f.name || 'Игрок') + '</div>' +
        '<div style="font-size:10px;color:' + col + ';margin-top:1px;">' + cls + '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
        '<div style="font-size:14px;font-weight:bold;color:#f5c542;">Lv.' + f.level + '</div>' +
        '<div style="font-size:9px;color:#556;margin-top:1px;">след. ' + coinSvg + ' на Lv.' + nextLv + '</div>' +
        '</div></div>' +
        '<div style="height:4px;background:#111;border-radius:2px;">' +
        '<div style="height:4px;background:' + col + ';border-radius:2px;width:' + progressPct + '%;transition:width .3s"></div>' +
        '</div>' +
        '<div style="font-size:9px;color:#445;margin-top:4px;text-align:right;">' +
        (toNext > 0 ? 'ещё ' + toNext + ' ур. до награды' : 'награда готова!') +
        '</div></div>';
    });
    if (totalEarned > 0) {
      friendsHtml += '<div style="text-align:center;font-size:10px;color:#556;padding:8px 0;">Всего заработано: ' + coinSvg + ' <span style="color:#f5c542">' + totalEarned + '</span></div>';
    }
  }

  body.innerHTML = linkHtml + rewardHtml + claimHtml + friendsHtml;
}

function friendsCopyLink(link) {
  var copied = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(function() {
      showFriendsToast('Ссылка скопирована!');
    }).catch(function() { friendsCopyFallback(link); });
  } else {
    friendsCopyFallback(link);
  }
}
function friendsCopyFallback(link) {
  try {
    var ta = document.createElement('textarea');
    ta.value = link; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showFriendsToast('Ссылка скопирована!');
  } catch(e) { showFriendsToast('Скопируй вручную'); }
}
function friendsShare(link) {
  var text = 'Играю в Pixel Runner RPG! Заходи по моей ссылке — получишь бонус!';
  var shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text);
  if (window.Telegram && window.Telegram.WebApp) {
    try { window.Telegram.WebApp.openTelegramLink(shareUrl); return; } catch(e) {}
  }
  window.open(shareUrl, '_blank');
}
function friendsClaim(btn) {
  if (!window.GameSync) return;
  btn.disabled = true;
  btn.textContent = 'Получение...';
  fetch(window.GameSync._API + '/api/ref/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: window.GameSync._INIT }),
  })
  .then(function(r) { return r.json(); })
  .then(function(r) {
    if (r.ok && r.goldEarned > 0) {
      G.gold += r.goldEarned;
      updateHUD();
      if (typeof window.GameSync.touch === 'function') window.GameSync.touch();
      showFriendsToast('+' + r.goldEarned + ' золота получено!');
      setTimeout(function() { renderFriends(); }, 800);
    } else {
      btn.disabled = false;
      btn.textContent = 'Забрать';
    }
  })
  .catch(function() {
    btn.disabled = false;
    btn.textContent = 'Забрать';
  });
}
function showFriendsToast(msg) {
  var el = document.getElementById('floorUnlock');
  var sub = document.getElementById('fuText');
  if (!el || !sub) return;
  sub.textContent = msg;
  el.querySelector('.fu-title').textContent = '🎉 ' + msg;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 2500);
}

// ═══════════════════════════════
//  ЭКРАН ВЫБОРА ПЕРСОНАЖА
// ═══════════════════════════════
let _csSelected      = null;
let _csParticleTimer = null;
let _csSpriteTimers  = {};
let _csIdleImgs      = {};
let G_CHAR           = null;

function selectChar(id) {
  _csSelected = id;
  ['fire','light','water'].forEach(function(c) {
    document.getElementById('card-' + c).classList.toggle('selected', c === id);
  });
  var btn = document.getElementById('csConfirm');
  btn.textContent = '▶  НАЧАТЬ ЗА ' + CHARS[id].name.toUpperCase();
  btn.classList.add('ready');
}

function confirmChar() {
  if (!_csSelected) return;
  Object.values(_csSpriteTimers).forEach(clearInterval);
  if (_csParticleTimer) cancelAnimationFrame(_csParticleTimer);
  G_CHAR = CHARS[_csSelected];
  applyCharacter(G_CHAR);
  document.getElementById('charSelect').classList.add('hidden');
  startGame();
  updateHudAvatar();
}

function applyCharacterSprites(ch) {
  spriteRun.src  = ch.runSrc;
  spriteAtk.src  = ch.atkSrc;
  spriteIdle.src = ch.idleSrc;
  window.RUN_FRAMES_CUR  = ch.runFrames;
  window.RUN_FW_CUR      = ch.runFW;
  window.ATK_FRAMES_CUR  = ch.atkFrames;
  window.ATK_FW_CUR      = ch.atkFW;
  window.IDLE_FRAMES_CUR = ch.idleFrames;
  window.IDLE_FW_CUR     = ch.idleFW;
}

function applyCharacter(ch) {
  applyCharacterSprites(ch);
  G.baseStats = Object.assign({}, ch.baseStats);
  Object.assign(G.stats, ch.baseStats);
  G.hp = G.stats.hp; G.maxHp = G.stats.hp;
  G.charId = ch.id;
}

function startGame() {
  resize(); 
  updateHUD(); 
  initSkillsHud(); 
  updatePotionHud();
  updateAvatarOnStart();
  switchTab('game');
  spawnMonster(player.worldX + W * 0.65);
  // ✅ startLoop защищает от двойного запуска loop
  requestAnimationFrame(typeof startLoop === 'function' ? startLoop : function(ts) { lastTime = ts; loop(ts); });
}

// ═══════════════════════════════
//  ОБНОВЛЕНИЕ АВАТАРКИ В HUD
// ═══════════════════════════════

function updateHudAvatar() {
  var avatarEl = document.getElementById('hudAvatar');
  var imgEl = document.getElementById('hudAvatarImg');
  if (!avatarEl || !imgEl) return;

  var tgId = window.GameSync ? window.GameSync.getTgId() : null;

  if (!tgId) {
    imgEl.style.display = 'none';
    var charEmoji = G_CHAR ? G_CHAR.avatar : '👤';
    var fb = avatarEl.querySelector('.avatar-fallback');
    if (!fb) {
      fb = document.createElement('div');
      fb.className = 'avatar-fallback';
      fb.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:20px;';
      avatarEl.appendChild(fb);
    }
    fb.textContent = charEmoji;
    return;
  }

  // 1. photo_url из initDataUnsafe (Telegram иногда передаёт напрямую)
  var photoUrl = null;
  try {
    var unsafe = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe;
    if (unsafe && unsafe.user && unsafe.user.photo_url) {
      photoUrl = unsafe.user.photo_url;
    }
  } catch (e) {}

  // 2. Серверный прокси через Bot API
  if (!photoUrl && window.GameSync && window.GameSync._API) {
    photoUrl = avatarUrl(tgId);
  }

  if (!photoUrl) return;

  var fb = avatarEl.querySelector('.avatar-fallback');
  if (fb) fb.remove();

  imgEl.style.display = 'block';
  imgEl.src = photoUrl;

  imgEl.onerror = function() {
    _avatarFailedCache[tgId] = true;
    this.style.display = 'none';
    var name = '';
    try {
      var unsafe = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe;
      if (unsafe && unsafe.user) name = unsafe.user.first_name || '';
    } catch(e) {}
    var fb2 = avatarEl.querySelector('.avatar-fallback');
    if (!fb2) {
      fb2 = document.createElement('div');
      fb2.className = 'avatar-fallback';
      fb2.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:' + (name ? '16px' : '20px') + ';font-weight:bold;color:#f5c542;border-radius:50%;background:rgba(245,197,66,0.15);';
      avatarEl.appendChild(fb2);
    }
    fb2.textContent = name ? name.charAt(0).toUpperCase() : (G_CHAR ? G_CHAR.avatar : '👤');
  };
}

// Ждём пока GameSync._API будет готов, потом загружаем аватарку
function updateAvatarOnStart() {
  var attempts = 0;
  var maxAttempts = 20; // до 10 секунд
  function tryLoad() {
    attempts++;
    var tgId = window.GameSync && window.GameSync.getTgId ? window.GameSync.getTgId() : null;
    var api  = window.GameSync && window.GameSync._API;
    // photo_url не требует _API — грузим сразу если есть tgId
    var hasPhotoUrl = false;
    try {
      var unsafe = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe;
      if (unsafe && unsafe.user && unsafe.user.photo_url) hasPhotoUrl = true;
    } catch(e) {}

    if (tgId && (api || hasPhotoUrl)) {
      updateHudAvatar();
    } else if (attempts < maxAttempts) {
      setTimeout(tryLoad, 500);
    }
  }
  tryLoad();
}

function initCharSelectSprites() {
  ['fire','light','water'].forEach(function(id) {
    var ch  = CHARS[id];
    var img = new Image();
    _csIdleImgs[id] = img;
    img.src = ch.idleSrc;
    var cv = document.getElementById('cs-canvas-' + id);
    cv.width = 90; cv.height = 100;
    var frame = 0;
    _csSpriteTimers[id] = setInterval(function() {
      var ctx2 = cv.getContext('2d');
      ctx2.clearRect(0, 0, 90, 100);
      ctx2.imageSmoothingEnabled = false;
      var fw = ch.idleFW, fh = ch.idleFH;
      var scale = Math.min(90/fw, 100/fh);
      var dw = fw*scale, dh = fh*scale;
      var dx = (90-dw)/2, dy = (100-dh);
      if (img.complete && img.naturalWidth > 0) ctx2.drawImage(img, frame*fw, 0, fw, fh, dx, dy, dw, dh);
      frame = (frame + 1) % ch.idleFrames;
    }, 130);
  });
}

function initCsParticles() {
  var cv = document.getElementById('csParticles');
  cv.width  = window.innerWidth;
  cv.height = window.innerHeight;
  var ctx2 = cv.getContext('2d');
  var pts  = [];
  for (var i = 0; i < 60; i++) {
    pts.push({
      x: Math.random() * cv.width, y: Math.random() * cv.height,
      r: 0.5 + Math.random() * 1.5,
      vx: (Math.random()-0.5)*0.3, vy: -0.2 - Math.random()*0.5,
      hue: 220 + Math.random()*120, a: 0.2 + Math.random()*0.5,
    });
  }
  function tick() {
    if (document.getElementById('charSelect').classList.contains('hidden')) return;
    ctx2.clearRect(0, 0, cv.width, cv.height);
    pts.forEach(function(p) {
      p.x += p.vx; p.y += p.vy;
      if (p.y < -5) { p.y = cv.height+5; p.x = Math.random()*cv.width; }
      ctx2.beginPath(); ctx2.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx2.fillStyle = 'hsla('+p.hue+',80%,75%,'+p.a+')'; ctx2.fill();
    });
    _csParticleTimer = requestAnimationFrame(tick);
  }
  tick();
}

window.addEventListener('load', function() {
  initCharSelectSprites();
  initCsParticles();
});

window.addEventListener('resize', resize);
// ═══════════════════════════════
//  ЗАДАНИЯ
// ═══════════════════════════════

var DAILY_MILESTONES = [
  { id: 0, minutes: 10, rewardType: 'potions', amount: 50,   icon: '<svg width="18" height="18" viewBox="0 0 12 14" fill="none" style="image-rendering:pixelated;vertical-align:middle"><rect x="4" y="0" width="4" height="2" fill="#aaa"/><rect x="3" y="1" width="6" height="2" fill="#ccc"/><rect x="2" y="3" width="8" height="1" fill="#e74c3c"/><rect x="1" y="4" width="10" height="7" fill="#e74c3c"/><rect x="2" y="11" width="8" height="2" fill="#c0392b"/><rect x="3" y="13" width="6" height="1" fill="#c0392b"/><rect x="2" y="5" width="4" height="4" fill="#ff8888"/><rect x="3" y="4" width="2" height="2" fill="#ffbbbb"/></svg>', label: '50 зелий' },
  { id: 1, minutes: 20, rewardType: 'gold',    amount: 1000, icon: '<svg width="18" height="18" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated;vertical-align:middle"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>', label: '1000 золота' },
  { id: 2, minutes: 30, rewardType: 'pixr',    amount: 5,    icon: '<img src="images/pixr.png" style="width:18px;height:18px;object-fit:contain;image-rendering:pixelated;vertical-align:middle">', label: '5 PIXR' },
  { id: 3, minutes: 60, rewardType: 'gold',    amount: 2000, icon: '<svg width="18" height="18" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated;vertical-align:middle"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>', label: '2000 золота' },
];

var _specialTaskTimers = {};

function openTaskModal() {
  document.getElementById('taskModal').classList.remove('hidden');
  renderTaskModal();
}
function closeTaskModal() {
  document.getElementById('taskModal').classList.add('hidden');
}

function renderTaskModal() {
  var body = document.getElementById('taskModalBody');
  if (!body) return;

  var today = new Date().toISOString().slice(0, 10);
  if (!G.dailyTasks || G.dailyTasks.date !== today) {
    G.dailyTasks = { date: today, seconds: 0, claimed: [] };
  }
  var mins    = Math.floor((G.dailyTasks.seconds || 0) / 60);
  var claimed = G.dailyTasks.claimed || [];

  var html = '<div style="font-size:10px;color:#778;letter-spacing:1px;margin-bottom:10px;">ЕЖЕДНЕВНЫЕ (сброс в полночь)</div>';

  DAILY_MILESTONES.forEach(function(m) {
    var done  = claimed.indexOf(m.id) !== -1;
    var avail = !done && mins >= m.minutes;
    var pct   = Math.min(100, Math.floor((mins / m.minutes) * 100));
    html +=
      '<div class="task-row' + (done ? ' task-done' : avail ? ' task-avail' : '') + '">' +
        '<div class="task-row-left">' +
          '<div class="task-title">⏱ ' + m.minutes + ' мин в игре</div>' +
          '<div class="task-progress-wrap">' +
            '<div class="task-progress-bar"><div class="task-progress-fill" style="width:' + pct + '%"></div></div>' +
            '<span class="task-progress-lbl">' + Math.min(mins, m.minutes) + '/' + m.minutes + 'м</span>' +
          '</div>' +
        '</div>' +
        '<div class="task-row-right">' +
          '<div class="task-reward-lbl">' + m.icon + ' ' + m.amount + '</div>' +
          (done ? '<span class="task-done-lbl">✓</span>' :
           avail ? '<button class="task-claim-btn" onclick="claimDailyTask(' + m.id + ')">Забрать</button>' :
           '<span class="task-locked-lbl">' + m.minutes + 'м</span>') +
        '</div>' +
      '</div>';
  });

  html += '<div id="specialTasksSection" style="margin-top:16px;">' +
    '<div style="font-size:10px;color:#778;letter-spacing:1px;margin-bottom:10px;">СПЕЦИАЛЬНЫЕ</div>' +
    '<div style="text-align:center;padding:16px;color:#445;font-size:11px;">Загрузка...</div></div>';

  body.innerHTML = html;

  if (!window.GameSync || !window.GameSync.state.online) {
    document.getElementById('specialTasksSection').innerHTML =
      '<div style="font-size:10px;color:#778;letter-spacing:1px;margin-bottom:10px;">СПЕЦИАЛЬНЫЕ</div>' +
      '<div style="text-align:center;padding:16px;color:#445;font-size:11px;">Доступно только онлайн</div>';
    return;
  }

  fetch(window.GameSync._API + '/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: window.GameSync._INIT }),
  })
  .then(function(r) { return r.json(); })
  .then(function(r) {
    if (!r.ok) return;
    var sec = document.getElementById('specialTasksSection');
    if (!sec) return;
    sec.innerHTML = _buildSpecialHtml(r.tasks, r.specialTasksClaimed || {});
  })
  .catch(function() {
    var sec = document.getElementById('specialTasksSection');
    if (sec) sec.innerHTML = '<div style="font-size:10px;color:#778;letter-spacing:1px;margin-bottom:10px;">СПЕЦИАЛЬНЫЕ</div>' +
      '<div style="color:#f44;text-align:center;padding:16px;font-size:11px;">Нет соединения</div>';
  });
}

function _buildSpecialHtml(tasks, claimed) {
  var head = '<div style="font-size:10px;color:#778;letter-spacing:1px;margin-bottom:10px;">СПЕЦИАЛЬНЫЕ</div>';
  if (!tasks || !tasks.length) {
    return head + '<div style="text-align:center;padding:16px;color:#445;font-size:11px;">Нет активных заданий</div>';
  }
  var _svgCoin  = '<svg width="16" height="16" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated;vertical-align:middle"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>';
  var _imgPixr  = '<img src="images/pixr.png" style="width:16px;height:16px;object-fit:contain;image-rendering:pixelated;vertical-align:middle">';
  var _imgGram  = '<img src="images/gram.png" style="width:16px;height:16px;object-fit:contain;image-rendering:pixelated;vertical-align:middle">';
  var _svgPotion= '<svg width="16" height="16" viewBox="0 0 12 14" fill="none" style="image-rendering:pixelated;vertical-align:middle"><rect x="4" y="0" width="4" height="2" fill="#aaa"/><rect x="3" y="1" width="6" height="2" fill="#ccc"/><rect x="2" y="3" width="8" height="1" fill="#e74c3c"/><rect x="1" y="4" width="10" height="7" fill="#e74c3c"/><rect x="2" y="11" width="8" height="2" fill="#c0392b"/><rect x="3" y="13" width="6" height="1" fill="#c0392b"/><rect x="2" y="5" width="4" height="4" fill="#ff8888"/><rect x="3" y="4" width="2" height="2" fill="#ffbbbb"/></svg>';
  var _svgGift  = '<svg width="16" height="16" viewBox="0 0 12 12" fill="none" style="image-rendering:pixelated;vertical-align:middle"><rect x="1" y="4" width="10" height="7" fill="#9b59b6"/><rect x="2" y="5" width="8" height="5" fill="#c080ff"/><rect x="0" y="3" width="12" height="3" fill="#7d3c98"/><rect x="5" y="0" width="2" height="4" fill="#f5c542"/><rect x="3" y="1" width="2" height="2" fill="#f5c542"/><rect x="7" y="1" width="2" height="2" fill="#f5c542"/><rect x="5" y="3" width="2" height="8" fill="#f5c542"/></svg>';
  var icons = { gold: _svgCoin, pixr: _imgPixr, potions: _svgPotion, gram: _imgGram };
  var html  = head;
  tasks.forEach(function(task) {
    var done  = !!(claimed[task.taskId]);
    var timer = _specialTaskTimers[task.taskId];
    var ic    = icons[task.rewardType] || _svgGift;
    var action;
    if (done) {
      action = '<span class="task-done-lbl">✓</span>';
    } else if (timer && timer.remaining > 0) {
      action = '<span class="task-timer-lbl" id="stTimer_' + task.taskId + '">⏱ ' + timer.remaining + 'с</span>';
    } else if (timer && timer.remaining <= 0) {
      action = '<button class="task-claim-btn" onclick="claimSpecialTask(\'' + task.taskId + '\')">Забрать</button>';
    } else if (task.link) {
      action = '<button class="task-go-btn" onclick="startSpecialTask(\'' + task.taskId + '\',\'' + task.link.replace(/'/g,"\\'") + '\')">' + (task.linkText || 'Перейти') + '</button>';
    } else {
      action = '<button class="task-claim-btn" onclick="claimSpecialTask(\'' + task.taskId + '\')">Забрать</button>';
    }
    html +=
      '<div class="task-row' + (done ? ' task-done' : '') + '">' +
        '<div class="task-row-left">' +
          '<div class="task-title">' + task.title + '</div>' +
          (task.description ? '<div class="task-desc">' + task.description + '</div>' : '') +
        '</div>' +
        '<div class="task-row-right">' +
          '<div class="task-reward-lbl">' + ic + ' ' + task.rewardAmount + '</div>' +
          action +
        '</div>' +
      '</div>';
  });
  return html;
}

function startSpecialTask(taskId, link) {
  if (link) {
    try {
      if (window.Telegram && window.Telegram.WebApp && link.startsWith('https://t.me/')) {
        window.Telegram.WebApp.openTelegramLink(link);
      } else { window.open(link, '_blank'); }
    } catch(e) { window.open(link, '_blank'); }
  }
  if (_specialTaskTimers[taskId] && _specialTaskTimers[taskId].remaining > 0) return;
  _specialTaskTimers[taskId] = { remaining: 20 };
  var iv = setInterval(function() {
    var t = _specialTaskTimers[taskId];
    if (!t) { clearInterval(iv); return; }
    t.remaining--;
    var el = document.getElementById('stTimer_' + taskId);
    if (t.remaining > 0) {
      if (el) el.textContent = '⏱ ' + t.remaining + 'с';
    } else {
      clearInterval(iv);
      if (el) {
        var btn = document.createElement('button');
        btn.className = 'task-claim-btn';
        btn.textContent = 'Забрать';
        btn.onclick = function() { claimSpecialTask(taskId); };
        el.parentNode.replaceChild(btn, el);
      }
    }
  }, 1000);
}

function claimDailyTask(milestoneId) {
  if (!window.GameSync || !window.GameSync.state.online) return;
  fetch(window.GameSync._API + '/api/tasks/daily/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: window.GameSync._INIT, milestoneId: milestoneId }),
  })
  .then(function(r) { return r.json(); })
  .then(function(r) {
    if (!r.ok) { _taskToast('Ошибка: ' + (r.error || '?')); return; }
    var rw = r.reward;
    if (rw.type === 'gold')    G.gold    = (G.gold    || 0) + rw.amount;
    if (rw.type === 'potions') G.potions = (G.potions || 0) + rw.amount;
    if (rw.type === 'pixr')    G.pixr    = (G.pixr    || 0) + rw.amount;
    if (rw.type === 'gram')    G.gram    = (G.gram    || 0) + rw.amount;
    if (!G.dailyTasks) G.dailyTasks = { date: new Date().toISOString().slice(0,10), seconds:0, claimed:[] };
    if (G.dailyTasks.claimed.indexOf(milestoneId) === -1) G.dailyTasks.claimed.push(milestoneId);
    updateHUD();
    _taskToast('+' + rw.amount + ' ' + (rw.type==='gold'?'золота':rw.type==='potions'?'зелий':'PIXR') + ' получено!');
    renderTaskModal();
  })
  .catch(function() { _taskToast('Нет соединения'); });
}

function claimSpecialTask(taskId) {
  if (!window.GameSync || !window.GameSync.state.online) return;
  fetch(window.GameSync._API + '/api/tasks/special/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: window.GameSync._INIT, taskId: taskId }),
  })
  .then(function(r) { return r.json(); })
  .then(function(r) {
    if (!r.ok) { _taskToast('Ошибка: ' + (r.error || '?')); return; }
    var rw = r.reward;
    if (rw.type === 'gold')    G.gold    = (G.gold    || 0) + rw.amount;
    if (rw.type === 'potions') G.potions = (G.potions || 0) + rw.amount;
    if (rw.type === 'pixr')    G.pixr    = (G.pixr    || 0) + rw.amount;
    if (rw.type === 'gram')    G.gram    = (G.gram    || 0) + rw.amount;
    if (!G.specialTasksClaimed) G.specialTasksClaimed = {};
    G.specialTasksClaimed[taskId] = Date.now();
    delete _specialTaskTimers[taskId];
    updateHUD();
    _taskToast('+' + rw.amount + ' ' + rw.type + ' получено!');
    renderTaskModal();
  })
  .catch(function() { _taskToast('Нет соединения'); });
}

function _taskToast(msg) {
  var fu = document.getElementById('floorUnlock');
  var sub = document.getElementById('fuText');
  if (!fu || !sub) return;
  fu.querySelector('.fu-title').textContent = '📋 ' + msg;
  sub.textContent = '';
  fu.classList.remove('show'); void fu.offsetWidth; fu.classList.add('show');
  setTimeout(function() { fu.classList.remove('show'); }, 2500);
}
// ═══════════════════════════════
//  ВКЛАДКА БОССОВ
// ═══════════════════════════════
function renderBossTab() {
  var body = document.getElementById('bossBody');
  if (!body) return;
  var cp       = calcCP();
  var boss     = G.boss || { floor: 1, lastFightTime: 0 };
  var canFight = typeof bossCanFight === 'function' ? bossCanFight() : true;
  var nextIn   = typeof bossNextFightIn === 'function' ? bossNextFightIn() : null;
  var html     = '';

  html += '<div style="font-size:11px;color:#778;margin-bottom:12px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid #2a2a5a;display:flex;justify-content:space-between;align-items:center;">';
  html += '<span>CP: <strong style="color:#fa0">' + cp + '</strong></span>';
  if (canFight) {
    html += '<span style="color:#2ecc71;font-size:10px;">✅ Можно вызвать</span>';
  } else {
    html += '<span style="color:#e74c3c;font-size:10px;">⏳ ' + nextIn + '</span>';
  }
  html += '</div>';

  BOSS_DEFS.forEach(function(b) {
    var isUnlocked = cp >= b.cpReq;
    var isCurrent  = boss.floor === b.id;
    var isPast     = boss.floor > b.id;
    var pixr  = Math.floor(Math.pow(2, b.id - 1));
    var gold  = Math.floor(1000 * Math.pow(2, b.id - 1));
    var rarNames = ['Обычный','Необычный','Редкий','Эпический','Легендарный'];
    var rarName  = rarNames[Math.min(b.id - 1, 4)];

    var borderColor = '#2a2a5a', extraStyle = '';
    if (isCurrent && isUnlocked) { borderColor = '#e74c3c'; extraStyle = 'box-shadow:0 0 12px rgba(231,76,60,0.2);'; }
    else if (isPast)             { borderColor = '#2a4a3a'; }
    else if (!isUnlocked)        { extraStyle = 'opacity:0.5;'; }

    html += '<div style="margin-bottom:12px;border-radius:10px;border:1.5px solid ' + borderColor + ';' + extraStyle + 'overflow:hidden;">';
    // Заголовок
    html += '<div style="padding:10px 12px;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border-bottom:1px solid #1a1a35;">';
    html += '<span style="font-size:26px;line-height:1;">' + b.emoji + '</span>';
    html += '<div style="flex:1;"><div style="font-size:13px;font-weight:bold;color:' + (isCurrent ? '#e74c3c' : '#ccc') + ';">Босс ' + b.id + ': ' + b.name;
    if (isCurrent) html += ' <span style="font-size:9px;color:#e74c3c;border:1px solid #e74c3c44;padding:1px 4px;border-radius:3px;margin-left:4px;">ТЕКУЩИЙ</span>';
    html += '</div><div style="font-size:10px;color:#778;margin-top:2px;">HP: ' + b.hp.toLocaleString() + ' · ATK: ' + b.atk + ' · CP: ' + b.cpReq.toLocaleString() + '</div></div>';
    if (!isUnlocked) html += '<div style="font-size:9px;color:#f88;text-align:right;min-width:44px;">🔒<br>+' + (b.cpReq - cp) + ' CP</div>';
    html += '</div>';
    // Награды
    html += '<div style="padding:8px 12px 10px;background:rgba(0,0,0,0.15);">';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:8px;">';
    html += '<div style="background:rgba(255,68,204,0.07);border:1px solid #4a2a5a;border-radius:5px;padding:5px;text-align:center;"><div style="font-size:8px;color:#778;">PIXR</div><div style="font-size:13px;font-weight:bold;color:#ff44cc;">' + pixr + '</div></div>';
    html += '<div style="background:rgba(245,197,66,0.07);border:1px solid #4a3a10;border-radius:5px;padding:5px;text-align:center;"><div style="font-size:8px;color:#778;">Золото</div><div style="font-size:11px;font-weight:bold;color:#f5c542;">' + (gold >= 1000 ? (gold/1000).toFixed(0)+'K' : gold) + '</div></div>';
    html += '<div style="background:rgba(167,139,250,0.07);border:1px solid #3a2a6a;border-radius:5px;padding:5px;text-align:center;"><div style="font-size:8px;color:#778;">Предмет</div><div style="font-size:9px;font-weight:bold;color:#a78bfa;">' + rarName + '</div></div>';
    html += '</div>';
    // Кнопка
    if (!isUnlocked) {
      html += '<div style="padding:9px;font-size:11px;border-radius:8px;border:1px solid #333;background:rgba(255,255,255,0.02);color:#446;text-align:center;">🔒 Нужно ' + b.cpReq.toLocaleString() + ' CP</div>';
    } else if (canFight) {
      html += '<button onclick="callBoss(' + b.id + ')" style="width:100%;padding:10px;font-size:13px;font-family:Courier New,monospace;border-radius:8px;border:1.5px solid #e74c3c;background:rgba(231,76,60,0.15);color:#e74c3c;cursor:pointer;font-weight:bold;">⚔️ Вызвать босса</button>';
    } else {
      html += '<div style="padding:9px;font-size:11px;border-radius:8px;border:1px solid #e74c3c44;background:rgba(231,76,60,0.05);color:#e74c3c;text-align:center;">⏳ Следующий бой через ' + nextIn + '</div>';
    }
    html += '</div></div>';
  });

  body.innerHTML = html;
}

function callBoss(bossId) {
  if (typeof spawnBoss === 'function') {
    switchTab('game');
    setTimeout(function() { spawnBoss(bossId); }, 100);
  }
}

// ═══════════════════════════════════════════════════════
//  МАРКЕТ
// ═══════════════════════════════════════════════════════

var _marketTab    = 'all';   // 'all' | 'my'
var _marketFilter = 'all';   // 'all' | rarity | 'book'
var _sellItemId   = null;

// ── Время до истечения лота ──
function marketTimeLeft(expiresAt) {
  var diff = expiresAt - Date.now();
  if (diff <= 0) return 'Истёк';
  var h = Math.floor(diff / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return h + 'ч ' + m + 'м';
  return m + 'м';
}

// ── Открыть маркет ──
function openMarket() {
  if (!G.marketUnlocked) {
    document.getElementById('marketUnlockModal').classList.remove('hidden');
    return;
  }
  document.getElementById('marketModal').classList.remove('hidden');
  _marketTab    = 'all';
  _marketFilter = 'all';
  _syncMarketTabs();
  _syncMarketFilters();
  loadMarketListings();
  updateMarketPixrBal();
}

function closeMarket() {
  document.getElementById('marketModal').classList.add('hidden');
}

function updateMarketPixrBal() {
  var el = document.getElementById('marketPixrBal');
  if (el) el.textContent = '💎 ' + (G.pixr || 0).toLocaleString();
}

// ── Переключение вкладок ──
function switchMarketTab(tab) {
  _marketTab = tab;
  _syncMarketTabs();
  var filters = document.getElementById('marketFilters');
  if (filters) filters.style.display = tab === 'all' ? '' : 'none';
  loadMarketListings();
}

function _syncMarketTabs() {
  document.getElementById('marketTabAll').classList.toggle('active', _marketTab === 'all');
  document.getElementById('marketTabMy').classList.toggle('active', _marketTab === 'my');
}

// ── Фильтры ──
function setMarketFilter(f) {
  _marketFilter = f;
  _syncMarketFilters();
  loadMarketListings();
}

function _syncMarketFilters() {
  var btns = document.querySelectorAll('.market-filter-btn');
  var filters = ['all','uncommon','rare','epic','legend','book'];
  btns.forEach(function(btn, i) {
    btn.classList.toggle('active', filters[i] === _marketFilter);
  });
}

// ── Загрузить лоты ──
function loadMarketListings() {
  var body = document.getElementById('marketBody');
  if (!body) return;
  body.innerHTML = '<div class="market-loading">⏳ Загрузка...</div>';

  var API  = window.GameSync._API;
  var init = window.GameSync._INIT;

  if (_marketTab === 'my') {
    fetch(API + '/api/market/my', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: init })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) { renderMarketListings(d.listings || [], true); })
    .catch(function() { body.innerHTML = '<div class="market-empty">Ошибка загрузки</div>'; });
  } else {
    fetch(API + '/api/market/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: init, rarity: _marketFilter })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) { renderMarketListings(d.listings || [], false); })
    .catch(function() { body.innerHTML = '<div class="market-empty">Ошибка загрузки</div>'; });
  }
}

// ── Отрисовка списка лотов ──
function renderMarketListings(listings, isMy) {
  var body = document.getElementById('marketBody');
  if (!body) return;

  if (listings.length === 0) {
    body.innerHTML = '<div class="market-empty">' +
      (isMy ? '📦 У тебя нет активных лотов.<br><span style="font-size:10px">Выставляй предметы из инвентаря!</span>'
             : '🏪 Пока нет лотов.<br><span style="font-size:10px">Заходи позже!</span>') +
      '</div>';
    return;
  }

  var html = '';
  listings.forEach(function(lst) {
    var item     = lst.item || {};
    var r        = RARITIES.find(function(x) { return x.id === item.rarity; }) || { color: '#888', name: '—' };
    var isBook   = item.isSkillBook;
    var iconHtml = isBook
      ? '<span style="font-size:22px;line-height:1;">📖</span>'
      : '<img src="' + (item.icon || '') + '" style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated;" onerror="this.style.display=\'none\'">';

    var subParts = [r.name];
    if (isBook && item.bookSkillName) subParts.push(item.bookSkillName);
    if (item.forClass && item.classLabel) subParts.push(item.classLabel);
    if (!isMy) subParts.push(lst.sellerName || 'Игрок');

    var actionBtn = '';
    if (isMy) {
      actionBtn = '<button class="market-cancel-btn" onclick="cancelListing(\'' + lst.listingId + '\')">Снять</button>';
    } else {
      var isSelf    = lst.sellerId === (window.GameSync && window.GameSync.getTgId ? window.GameSync.getTgId() : '');
      var canAfford = (G.pixr || 0) >= lst.price;
      actionBtn = '<button class="market-buy-btn" ' +
        (isSelf ? 'disabled title="Ваш лот"' : (!canAfford ? 'disabled title="Мало PIXR"' : '')) +
        ' onclick="buyListing(\'' + lst.listingId + '\', ' + lst.price + ')">' +
        (isSelf ? 'Ваш' : 'Купить') + '</button>';
    }

    html += '<div class="market-listing">' +
      '<div class="market-listing-icon" style="border-color:' + r.color + '44;">' + iconHtml + '</div>' +
      '<div class="market-listing-info">' +
        '<div class="market-listing-name" style="color:' + r.color + ';">' + (item.name || '—') + (item.refine ? ' <span style="color:#a78bfa">+' + item.refine + '</span>' : '') + '</div>' +
        '<div class="market-listing-sub">' + subParts.join(' · ') + '</div>' +
        '<div class="market-lot-timer">⏱ ' + marketTimeLeft(lst.expiresAt) + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">' +
        '<div class="market-listing-price">' + lst.price.toLocaleString() + ' 💎</div>' +
        actionBtn +
      '</div>' +
    '</div>';
  });

  body.innerHTML = html;
}

// ── Купить лот ──
function buyListing(listingId, price) {
  if (!confirm('Купить за ' + price + ' PIXR?')) return;
  var API  = window.GameSync._API;
  var init = window.GameSync._INIT;
  fetch(API + '/api/market/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: init, listingId: listingId })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      G.pixr = d.pixr;
      if (d.item) G.inventory.push(d.item);
      updateMarketPixrBal();
      loadMarketListings();
      _taskToast('✅ Куплено: ' + (d.item && d.item.name || 'предмет'));
      if (typeof renderInventory === 'function') renderInventory();
      window.GameSync.saveInstant();
    } else {
      var msgs = {
        already_sold:    '❌ Кто-то успел купить раньше!',
        not_enough_pixr: '❌ Недостаточно PIXR',
        listing_expired: '❌ Лот истёк',
        own_listing:     '❌ Нельзя купить свой лот',
        market_locked:   '❌ Маркет не открыт',
      };
      _taskToast(msgs[d.error] || '❌ Ошибка: ' + d.error);
      loadMarketListings();
    }
  })
  .catch(function() { _taskToast('❌ Ошибка сети'); });
}

// ── Снять лот ──
function cancelListing(listingId) {
  if (!confirm('Снять лот с продажи?')) return;
  var API  = window.GameSync._API;
  var init = window.GameSync._INIT;
  fetch(API + '/api/market/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: init, listingId: listingId })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      if (d.inventory) {
        G.inventory = d.inventory;
        if (typeof renderInventory === 'function') renderInventory();
      }
      loadMarketListings();
      _taskToast('✅ Лот снят, предмет возвращён');
      window.GameSync.saveInstant();
    } else {
      _taskToast('❌ Ошибка: ' + d.error);
    }
  })
  .catch(function() { _taskToast('❌ Ошибка сети'); });
}

// ── Разблокировка маркета ──
function confirmUnlockMarket() {
  var API  = window.GameSync._API;
  var init = window.GameSync._INIT;
  var btn  = document.querySelector('.market-unlock-btn');
  if (btn) btn.disabled = true;
  fetch(API + '/api/market/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: init })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (btn) btn.disabled = false;
    if (d.ok) {
      G.marketUnlocked = true;
      if (d.pixr !== undefined) G.pixr = d.pixr;
      document.getElementById('marketUnlockModal').classList.add('hidden');
      window.GameSync.saveInstant();
      _taskToast('🏪 Маркет открыт!');
      openMarket();
    } else {
      var msgs = { not_enough_pixr: '❌ Недостаточно PIXR (нужно 1000)' };
      _taskToast(msgs[d.error] || '❌ Ошибка: ' + d.error);
    }
  })
  .catch(function() {
    if (btn) btn.disabled = false;
    _taskToast('❌ Ошибка сети');
  });
}

// ── Открытие модалки продажи ──
function openSellModal(itemId) {
  var item = G.inventory.find(function(i) { return i.id === itemId; });
  if (!item) return;
  _sellItemId = itemId;

  var r = RARITIES.find(function(x) { return x.id === item.rarity; }) || { color: '#888', name: '—' };
  var iconHtml = item.isSkillBook
    ? '<span style="font-size:28px;">📖</span>'
    : '<img src="' + (item.icon || '') + '" style="width:36px;height:36px;object-fit:contain;image-rendering:pixelated;" onerror="this.style.display=\'none\'">';

  document.getElementById('sellItemPreview').innerHTML =
    '<div style="width:44px;height:44px;border-radius:8px;border:1.5px solid ' + r.color + '44;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">' + iconHtml + '</div>' +
    '<div>' +
      '<div style="font-size:12px;color:' + r.color + ';font-family:\'Courier New\',monospace;">' + item.name + (item.refine ? ' +' + item.refine : '') + '</div>' +
      '<div style="font-size:10px;color:#556;">' + r.name + (item.level ? ' · Lv.' + item.level : '') + '</div>' +
    '</div>';

  var input = document.getElementById('sellPriceInput');
  input.value = '';
  document.getElementById('sellCommissionNote').textContent = 'Вы получите: — PIXR (комиссия 10%)';

  input.oninput = function() {
    var val  = parseInt(input.value) || 0;
    var earn = val > 0 ? Math.floor(val * 0.9) : 0;
    document.getElementById('sellCommissionNote').textContent =
      'Вы получите: ' + (earn > 0 ? earn.toLocaleString() : '—') + ' PIXR (комиссия 10%)';
  };

  if (typeof closeItemModal === 'function') closeItemModal();
  document.getElementById('sellModal').classList.remove('hidden');
}

function closeSellModal() {
  document.getElementById('sellModal').classList.add('hidden');
  _sellItemId = null;
}

// ── Подтвердить выставление ──
function confirmSellItem() {
  if (!_sellItemId) return;
  var price = parseInt(document.getElementById('sellPriceInput').value);
  if (!price || price < 1) { _taskToast('❌ Укажи цену'); return; }

  var API  = window.GameSync._API;
  var init = window.GameSync._INIT;
  var btn  = document.querySelector('.sell-confirm-btn');
  if (btn) btn.disabled = true;

  fetch(API + '/api/market/sell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: init, itemId: _sellItemId, price: price })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (btn) btn.disabled = false;
    if (d.ok) {
      G.inventory = d.inventory;
      closeSellModal();
      if (typeof renderInventory === 'function') renderInventory();
      _taskToast('✅ Предмет выставлен на маркет!');
      window.GameSync.saveInstant();
    } else {
      var msgs = {
        max_lots:       '❌ Максимум 3 активных лота',
        rarity_too_low: '❌ Только Необычный и выше',
        item_equipped:  '❌ Сними предмет перед продажей',
        item_not_found: '❌ Предмет не найден',
        market_locked:  '❌ Маркет не открыт',
      };
      _taskToast(msgs[d.error] || '❌ Ошибка: ' + d.error);
    }
  })
  .catch(function() {
    if (btn) btn.disabled = false;
    _taskToast('❌ Ошибка сети');
  });
}

// ── Серверные уведомления ──
window._handleMarketNotif = function(event, data) {
  if (event === 'market_sold') {
    _taskToast('💰 Продано: "' + data.itemName + '" +' + data.earned + ' 💎');
    G.pixr = (G.pixr || 0) + data.earned;
    window.GameSync.saveInstant();
  } else if (event === 'market_expired') {
    _taskToast('⏰ Лот истёк, "' + (data.item && data.item.name) + '" возвращён');
    if (data.item) G.inventory.push(data.item);
    if (typeof renderInventory === 'function') renderInventory();
    window.GameSync.saveInstant();
  }
};



// ═══════════════════════════════════════════════════════
//  PvP — UI логика (REST, без Socket.IO)
// ═══════════════════════════════════════════════════════

var _pvpTab           = 'rating';
var _pvpRatingCache   = null;
var _pvpRatingCacheTime = 0;
var _pvpHistoryCache  = null;
var _pvpHistoryCacheTime = 0;
var _pvpOpponents     = null;   // текущие соперники
var _pvpDailyData     = null;   // { battlesLeft, refreshesLeft }
var _pvpFighting      = false;  // идёт запрос боя

// ── Открыть лобби ──
function openPvp() {
  recalcStats();
  var page = document.getElementById('pvpPage');
  if (page) page.classList.remove('hidden');
  var ratingEl = document.getElementById('pvpMyRating');
  if (ratingEl) ratingEl.textContent = '★ ' + (G.arenaRating || 1000);
  _pvpTab = 'rating';
  _pvpActivateTab('rating');
  _pvpLoadTabData('rating');
  // Загружаем соперников в фоне
  _pvpLoadOpponents(false);
}

function closePvpPage() {
  var page = document.getElementById('pvpPage');
  if (page) page.classList.add('hidden');
}

function switchPvpTab(tab) {
  _pvpTab = tab;
  _pvpActivateTab(tab);
  _pvpLoadTabData(tab);
}

function _pvpActivateTab(tab) {
  ['rating', 'history', 'fight'].forEach(function(t) {
    var id = 'pvpTab' + t.charAt(0).toUpperCase() + t.slice(1);
    var btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', t === tab);
  });
}

function _pvpLoadTabData(tab) {
  if (!window.GameSync || !window.GameSync.state.online) {
    var body = document.getElementById('pvpPageBody');
    if (body) body.innerHTML = '<div style="text-align:center;color:#445;padding:30px;font-size:12px;">📱 Доступно только в Telegram</div>';
    return;
  }
  if (tab === 'rating')  _pvpLoadRating();
  else if (tab === 'history') _pvpLoadHistory();
  else if (tab === 'fight')   _pvpRenderFightTab();
}

// ── Рейтинг ──
function _pvpLoadRating() {
  var body = document.getElementById('pvpPageBody');
  if (_pvpRatingCache && Date.now() - _pvpRatingCacheTime < 30000) {
    _pvpRenderRating(_pvpRatingCache.top, _pvpRatingCache.myRating, body);
    return;
  }
  body.innerHTML = '<div style="text-align:center;color:#445;padding:30px;font-size:12px;">⏳ Загрузка...</div>';
  var API = window.GameSync._API, INIT = window.GameSync._INIT;
  fetch(API + '/api/pvp/rating', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: INIT })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (!d.ok) { body.innerHTML = '<div style="text-align:center;color:#e74c3c;padding:30px;">❌ Ошибка</div>'; return; }
    _pvpRatingCache = d;
    _pvpRatingCacheTime = Date.now();
    if (d.myRating !== undefined) {
      G.arenaRating = d.myRating;
      var rEl = document.getElementById('pvpMyRating');
      if (rEl) rEl.textContent = '★ ' + d.myRating;
    }
    if (d.daily) { _pvpDailyData = d.daily; _pvpUpdateCounters(); }
    _pvpRenderRating(d.top, d.myRating, body);
  })
  .catch(function() { body.innerHTML = '<div style="text-align:center;color:#e74c3c;padding:30px;">❌ Нет соединения</div>'; });
}

function _pvpRenderRating(top, myRating, body) {
  var medals = ['🥇','🥈','🥉'];
  var tgId = window.GameSync ? window.GameSync.getTgId() : null;
  var html = '<div style="margin-bottom:10px;padding:10px;background:rgba(167,139,250,0.08);border:1px solid #4a3a8a;border-radius:8px;display:flex;align-items:center;justify-content:space-between;">' +
    '<span style="font-size:12px;color:#a78bfa;">★ Мой рейтинг</span>' +
    '<span style="font-size:18px;font-weight:bold;color:#f5c542;font-family:\'Courier New\',monospace;">' + (myRating||G.arenaRating||1000) + '</span>' +
    '</div>';
  if (!top||!top.length) { html += '<div style="text-align:center;color:#445;padding:20px;font-size:12px;">👥 Нет данных</div>'; body.innerHTML=html; return; }
  top.forEach(function(p,i) {
    var isMe = p.tgId && tgId && p.tgId===tgId;
    var medal = i<3 ? medals[i] : (i+1)+'.';
    html += '<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;margin-bottom:5px;border-radius:8px;' +
      'background:'+(isMe?'rgba(167,139,250,0.12)':'rgba(255,255,255,0.03)')+';border:1px solid '+(isMe?'#6a4aaa':'#1a1a35')+';\">' +
      '<span style="font-size:14px;min-width:26px;text-align:center;">' + medal + '</span>' +
      '<span style="flex:1;font-size:12px;color:'+(isMe?'#dda0ff':'#ccd')+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + p.name + '</span>' +
      '<span style="font-size:12px;color:#f5c542;font-family:\'Courier New\',monospace;">★ ' + p.rating + '</span>' +
      '</div>';
  });
  body.innerHTML = html;
}

// ── История ──
function _pvpLoadHistory() {
  var body = document.getElementById('pvpPageBody');
  if (_pvpHistoryCache && Date.now() - _pvpHistoryCacheTime < 30000) {
    _pvpRenderHistory(_pvpHistoryCache, body); return;
  }
  body.innerHTML = '<div style="text-align:center;color:#445;padding:30px;font-size:12px;">⏳ Загрузка...</div>';
  var API = window.GameSync._API, INIT = window.GameSync._INIT;
  fetch(API + '/api/pvp/history', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: INIT })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (!d.ok) { body.innerHTML = '<div style="text-align:center;color:#e74c3c;padding:30px;">❌ Ошибка</div>'; return; }
    _pvpHistoryCache = d.history;
    _pvpHistoryCacheTime = Date.now();
    _pvpRenderHistory(d.history, body);
  })
  .catch(function() { body.innerHTML = '<div style="text-align:center;color:#e74c3c;padding:30px;">❌ Нет соединения</div>'; });
}

function _pvpRenderHistory(history, body) {
  var charEmojis = { fire:'🔥', light:'✨', water:'💧' };
  if (!history||!history.length) {
    body.innerHTML = '<div style="text-align:center;color:#445;padding:40px;font-size:12px;">⚔️ Боёв ещё нет<br><span style="font-size:10px;color:#334;">Найди соперника на вкладке Бой!</span></div>';
    return;
  }
  var html = '';
  history.forEach(function(b) {
    var isWin = b.result==='win';
    var color = isWin?'#2ecc71':'#e74c3c';
    var icon  = isWin?'🏆':'💀';
    var ts    = b.createdAt ? new Date(b.createdAt).toLocaleDateString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    var rTxt  = (b.ratingChange>=0?'+':'')+b.ratingChange;
    html += '<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;margin-bottom:6px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid '+(isWin?'#1a4a2a':'#4a1a1a')+';\">' +
      '<span style="font-size:18px;">' + icon + '</span>' +
      '<span style="font-size:16px;">' + (charEmojis[b.opponentCharId]||'👤') + '</span>' +
      '<div style="flex:1;">' +
        '<div style="font-size:12px;color:#ccd;">' + (b.opponentName||'Игрок') + '</div>' +
        '<div style="font-size:10px;color:#445;">' + ts + '</div>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<div style="font-size:13px;font-weight:bold;color:'+color+';">' + rTxt + '</div>' +
        (isWin&&b.pixrReward ? '<div style="font-size:10px;color:#ff44cc;">+'+b.pixrReward+' 💎</div>' : '') +
      '</div>' +
    '</div>';
  });
  body.innerHTML = html;
}

// ── Вкладка Бой — список соперников ──
function _pvpRenderFightTab() {
  var body = document.getElementById('pvpPageBody');
  var daily = _pvpDailyData;
  var battlesLeft  = daily ? daily.battlesLeft  : '?';
  var refreshesLeft = daily ? daily.refreshesLeft : '?';

  var counters = '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
    '<div style="flex:1;background:rgba(255,255,255,0.03);border-radius:8px;padding:8px;text-align:center;">' +
      '<div style="font-size:18px;font-weight:bold;color:#a064ff;font-family:\'Courier New\',monospace;">' + battlesLeft + '</div>' +
      '<div style="font-size:10px;color:#556;">боёв сегодня</div>' +
    '</div>' +
    '<div style="flex:1;background:rgba(255,255,255,0.03);border-radius:8px;padding:8px;text-align:center;">' +
      '<div style="font-size:18px;font-weight:bold;color:#f5c542;font-family:\'Courier New\',monospace;">' + refreshesLeft + '</div>' +
      '<div style="font-size:10px;color:#556;">обновлений</div>' +
    '</div>' +
    '<button onclick="pvpRefreshOpponents()" style="padding:8px 14px;background:rgba(160,100,255,0.12);border:1px solid rgba(160,100,255,0.3);border-radius:8px;color:#a064ff;font-size:12px;cursor:pointer;">🔄</button>' +
  '</div>';

  if (!_pvpOpponents) {
    body.innerHTML = counters + '<div style="text-align:center;color:#445;padding:30px;font-size:12px;">⏳ Загрузка соперников...</div>';
    _pvpLoadOpponents(false);
    return;
  }

  if (!_pvpOpponents.length) {
    body.innerHTML = counters + '<div style="text-align:center;color:#445;padding:30px;font-size:12px;">😔 Нет соперников рядом с вашим рейтингом</div>';
    return;
  }

  var charEmojis = { fire:'🔥', light:'✨', water:'💧' };
  var html = counters;
  _pvpOpponents.forEach(function(opp) {
    html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:8px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid #1a1a35;">' +
      '<span style="font-size:22px;">' + (charEmojis[opp.charId]||'👤') + '</span>' +
      '<div style="flex:1;">' +
        '<div style="font-size:13px;color:#ddd;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (opp.name||'Игрок') + '</div>' +
        '<div style="font-size:10px;color:#445;">★ ' + (opp.arenaRating||1000) + ' · CP ' + (opp.cp||0) + '</div>' +
      '</div>' +
      '<button onclick="pvpFight(\'' + opp.tgId + '\')" style="padding:8px 14px;background:rgba(160,100,255,0.2);border:1px solid rgba(160,100,255,0.5);border-radius:8px;color:#c090ff;font-size:12px;font-weight:bold;cursor:pointer;">⚔️ Бой</button>' +
    '</div>';
  });

  body.innerHTML = html;
}

// ── Загрузить соперников ──
function _pvpLoadOpponents(forceRefresh) {
  var API = window.GameSync && window.GameSync._API;
  var INIT = window.GameSync && window.GameSync._INIT;
  if (!API || !INIT) return;

  fetch(API + '/api/pvp/opponents', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: INIT, refresh: forceRefresh || false })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      _pvpOpponents = d.opponents || [];
      _pvpDailyData = d.daily || _pvpDailyData;
      _pvpUpdateCounters();
      if (_pvpTab === 'fight') _pvpRenderFightTab();
    } else {
      if (d.error === 'no_refreshes') {
        _taskToast('❌ Обновления на сегодня исчерпаны');
      }
      if (_pvpTab === 'fight') _pvpRenderFightTab();
    }
  })
  .catch(function() {
    if (_pvpTab === 'fight') {
      var body = document.getElementById('pvpPageBody');
      if (body) body.innerHTML = '<div style="text-align:center;color:#e74c3c;padding:30px;">❌ Нет соединения</div>';
    }
  });
}

function pvpRefreshOpponents() {
  if (!_pvpDailyData) { _pvpLoadOpponents(true); return; }
  if (_pvpDailyData.refreshesLeft <= 0) {
    _taskToast('❌ Обновления исчерпаны (0/' + 5 + ')');
    return;
  }
  _pvpOpponents = null;
  _pvpRenderFightTab();
  _pvpLoadOpponents(true);
}

// ── Провести бой — мгновенно, без ожидания сервера ──
var _pvpFighting = false;
var _pvpBattleActive = false;

function pvpFight(opponentTgId) {
  if (_pvpFighting) return;
  if (_pvpDailyData && _pvpDailyData.battlesLeft <= 0) {
    _taskToast('❌ Боёв на сегодня нет (0/10)'); return;
  }
  var oppInfo = null;
  if (_pvpOpponents) {
    _pvpOpponents.forEach(function(o) { if (o.tgId === String(opponentTgId)) oppInfo = o; });
  }
  if (!oppInfo) { _taskToast('❌ Соперник не найден'); return; }

  _pvpFighting = true;
  closePvpPage();
  _pvpStartBattle(oppInfo);
}

function _pvpStartBattle(opp) {
  var bo = document.getElementById('pvpBattleOverlay');
  if (!bo) return;

  var myCharId  = G_CHAR ? G_CHAR.id : 'fire';
  var myName    = G.firstName || 'Ты';
  var myRating  = G.arenaRating || 1000;
  var oppCharId = opp.charId || 'fire';
  var oppName   = opp.name  || 'Игрок';
  var oppRating = opp.arenaRating || 1000;

  // Статы из уже загруженного oppInfo (пересчитаны сервером при /opponents)
  var myStats  = { atk: G.stats.atk, def: G.stats.def, crit: G.stats.crit, dodge: G.stats.dodge, critDmg: G.baseStats ? (G.baseStats.critDmg || 0) : 0 };
  var oppStats = opp.stats || { atk: 10, def: 5, crit: 5, dodge: 3, critDmg: 0 };
  var myMaxHp  = G.maxHp || 100;
  var oppMaxHp = opp.maxHp || 100;

  // Инициализируем состояние
  pvpRenderState.active  = true;
  pvpRenderState.battling = false;
  pvpRenderState.lastTs  = performance.now();
  pvpRenderState.floatingTexts = [];
  pvpProjectiles = [];

  pvpRenderState.fighters[0] = {
    charId: myCharId, name: myName, arenaRating: myRating,
    hp: myMaxHp, maxHp: myMaxHp, stats: myStats,
    animTime: 0, state: 'idle', hitFlash: 0, atkTimer: 0, _atkAnim: 0
  };
  pvpRenderState.fighters[1] = {
    charId: oppCharId, name: oppName, arenaRating: oppRating,
    hp: oppMaxHp, maxHp: oppMaxHp, stats: oppStats,
    animTime: 0, state: 'idle', hitFlash: 0,
    atkTimer: 0, _atkAnim: 0
  };

  pvpRenderState.onEnd = function(isWin) {
    _pvpBattleActive = false;
    pvpRenderState.battling = false;
    _pvpFinish(isWin, opp);
  };

  bo.classList.remove('hidden');
  _pvpBattleActive = true;
  _pvpSetHudVisible(false);

  // Короткий отсчёт "БОЙ!" потом старт
  pvpAddFloatText(0, 'БОЙ!', '#ffd700', true);
  pvpAddFloatText(1, 'БОЙ!', '#ffd700', true);
  setTimeout(function() {
    if (_pvpBattleActive) pvpRenderState.battling = true;
  }, 800);
}

function _pvpFinish(isWin, opp) {
  var PVP_WIN_RATING  =  5;
  var PVP_LOSE_RATING = -4;
  var PVP_WIN_PIXR    =  1;

  var ratingChange = isWin ? PVP_WIN_RATING : PVP_LOSE_RATING;
  var newRating    = Math.max(0, (G.arenaRating || 1000) + ratingChange);
  G.arenaRating = newRating;
  if (isWin) G.pixr = (G.pixr || 0) + PVP_WIN_PIXR;
  if (_pvpDailyData) _pvpDailyData.battlesLeft = Math.max(0, (_pvpDailyData.battlesLeft || 1) - 1);
  if (_pvpOpponents) _pvpOpponents = _pvpOpponents.filter(function(o) { return o.tgId !== opp.tgId; });
  _pvpHistoryCache = null; _pvpRatingCache = null;
  _pvpFighting = false;
  if (window.GameSync) window.GameSync.saveInstant({ arenaRating: G.arenaRating, pixr: G.pixr });
  updateHUD();

  // Показываем результат
  _pvpShowResult(isWin, ratingChange, newRating, isWin ? PVP_WIN_PIXR : 0, opp.name || 'Игрок');

  // Фоновый запрос — только для истории/рейтинга на сервере
  var API = window.GameSync && window.GameSync._API;
  var INIT = window.GameSync && window.GameSync._INIT;
  if (API && INIT) {
    fetch(API + '/api/pvp/fight', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: INIT, opponentTgId: opp.tgId, clientResult: isWin })
    }).catch(function() {});
  }
}

function _pvpShowResult(isWin, ratingChange, newRating, pixrReward, oppName) {
  var modal = document.getElementById('pvpResultModal');
  var box   = document.getElementById('pvpResultBox');
  if (!modal || !box) return;
  var rc      = ratingChange;
  var mono    = "font-family:'Courier New',monospace";
  var rcColor = rc >= 0 ? '#2ecc71' : '#e74c3c';
  var rcSign  = rc >= 0 ? '+' : '';
  var rewardRow = (isWin && pixrReward)
    ? ('<div style="display:flex;justify-content:space-between;font-size:12px;' + mono + ';"><span style="color:#778;">Награда</span><span style="color:#ff44cc;font-weight:bold;">+' + pixrReward + ' PIXR</span></div>')
    : '';
  box.innerHTML =
    '<div style="text-align:center;padding:18px 14px;">' +
    '<div style="font-size:48px;margin-bottom:6px;">' + (isWin ? '🏆' : '💀') + '</div>' +
    '<div style="font-size:20px;font-weight:bold;' + mono + ';color:' + (isWin ? '#ffd700' : '#e74c3c') + ';margin-bottom:4px;">' + (isWin ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ') + '</div>' +
    '<div style="font-size:11px;color:#778;margin-bottom:16px;">vs ' + oppName + '</div>' +
    '<div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:12px 14px;margin-bottom:14px;text-align:left;">' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;' + mono + ';margin-bottom:8px;">' +
        '<span style="color:#778;">Рейтинг</span>' +
        '<span style="color:' + rcColor + ';font-weight:bold;">' + rcSign + rc + '</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;' + mono + ';">' +
        '<span style="color:#778;">Новый рейтинг</span>' +
        '<span style="color:#a78bfa;font-weight:bold;">★ ' + newRating + '</span>' +
      '</div>' +
      rewardRow +
    '</div>' +
    '<div style="display:flex;gap:8px;">' +
      '<button onclick="pvpCloseResult();switchPvpTab(\'fight\')" style="flex:1;padding:10px 8px;background:rgba(160,100,255,0.2);border:1px solid rgba(160,100,255,0.5);border-radius:8px;color:#c090ff;font-size:12px;cursor:pointer;">⚔️ Ещё бой</button>' +
      '<button onclick="pvpCloseResult();switchPvpTab(\'history\')" style="flex:1;padding:10px 8px;background:rgba(255,255,255,0.04);border:1px solid #333;border-radius:8px;color:#778;font-size:12px;cursor:pointer;">История</button>' +
    '</div>' +
    '</div>';
  modal.classList.remove('hidden');
}
function _pvpStopBattleCanvas() {
  _pvpBattleActive = false;
  _pvpFighting = false;
  pvpRenderState.battling = false;
  pvpRenderState.active   = false;
  pvpRenderState.onEnd    = null;
  pvpProjectiles = [];
  var bo = document.getElementById('pvpBattleOverlay');
  if (bo) bo.classList.add('hidden');
  var overlay = document.getElementById('pvpResultModal');
  if (overlay) overlay.classList.add('hidden');
  _pvpSetHudVisible(true);
}

function pvpCloseResult() {
  _pvpStopBattleCanvas();
  openPvp();
}

function _pvpSetHudVisible(visible) {
  var ids = ['bpHudBtn', 'taskHudBtn', 'bossHudBtn', 'marketHudBtn', 'pvpHudBtn'];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = visible ? 'flex' : 'none';
  });
  var premBtn = document.querySelector('.prem-hud-btn');
  if (premBtn) premBtn.style.display = visible ? 'flex' : 'none';
}

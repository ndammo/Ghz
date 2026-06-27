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
  ['game','inv','upgrades','floors','rating','wallet','friends','pvp'].forEach(t => {
    const btn = document.getElementById('nav' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === tab);
  });
  document.getElementById('panelInv').classList.toggle('visible',      tab === 'inv');
  document.getElementById('panelUpgrades').classList.toggle('visible', tab === 'upgrades');
  document.getElementById('panelFloors').classList.toggle('visible',   tab === 'floors');
  document.getElementById('panelRating').classList.toggle('visible',   tab === 'rating');
  document.getElementById('panelWallet').classList.toggle('visible',   tab === 'wallet');
  document.getElementById('panelFriends').classList.toggle('visible',  tab === 'friends');
  document.getElementById('panelPvp').classList.toggle('visible',      tab === 'pvp');
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
  if (bpBtn)   bpBtn.style.display   = isGame ? 'flex' : 'none';
  if (premBtn) premBtn.style.display = isGame ? 'flex' : 'none';
  if (taskBtn) taskBtn.style.display = isGame ? 'flex' : 'none';
  if (bossBtn) bossBtn.style.display = isGame ? 'flex' : 'none';
  if (shopBtn) shopBtn.style.display = isGame ? 'flex' : 'none';

  if (tab === 'inv')      { _invSelectMode = false; _invSelected = {}; renderInventory(); }
  if (tab === 'upgrades') renderUpgrades();
  if (tab === 'floors')   renderFloors();
  if (tab === 'rating')   renderRating();
  if (tab === 'wallet')   renderWallet();
  if (tab === 'friends')  renderFriends();
  if (tab === 'boss')     renderBossTab();
  if (tab === 'pvp')      renderPvpLobby();
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
//  PVP АРЕНА
// ═══════════════════════════════════════════════════════

var _pvpTab        = 'battle';
var _pvpOpponents  = [];     // 3 противника
var _pvpSelected   = null;   // выбранный противник
var _pvpLoading    = false;
var _pvpRatingCache     = null;
var _pvpRatingCacheTime = 0;
var _pvpHistoryCache    = null;

// Сброс кешей рейтинга/истории после боя
function _pvpClearCache() {
  _pvpRatingCache  = null;
  _pvpHistoryCache = null;
}

function switchPvpTab(tab) {
  _pvpTab = tab;
  ['battle','rating','history'].forEach(function(t) {
    var btn = document.getElementById('pvpTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === tab);
  });
  renderPvpLobby();
}

// ── Получить попытки/обновления сегодня ──
function _pvpTodayStr() { return new Date().toISOString().slice(0, 10); }
function _pvpAttemptsLeft() {
  var today = _pvpTodayStr();
  if ((G.pvpAttemptsDate || '') !== today) return 10;
  return Math.max(0, 10 - (G.pvpAttempts || 0));
}
function _pvpRefreshesLeft() {
  var today = _pvpTodayStr();
  if ((G.pvpRefreshDate || '') !== today) return 5;
  return Math.max(0, 5 - (G.pvpRefreshes || 0));
}

// ── Рендер главного лобби (все 3 вкладки) ──
function renderPvpLobby() {
  if (_pvpTab === 'battle')  _pvpRenderBattle();
  if (_pvpTab === 'rating')  _pvpRenderRating();
  if (_pvpTab === 'history') _pvpRenderHistory();
}

// ── Вкладка БОЙ ──
function _pvpRenderBattle() {
  var body = document.getElementById('pvpBody');
  if (!body) return;
  var attLeft  = _pvpAttemptsLeft();
  var refLeft  = _pvpRefreshesLeft();
  var myRating = G.arenaRating || 1000;

  var html = '';

  // Счётчики
  html += '<div class="pvp-counters">' +
    '<div class="pvp-counter-box"><div class="pvp-counter-val">' + attLeft + '</div><div class="pvp-counter-label">Попыток сегодня</div></div>' +
    '<div class="pvp-counter-box"><div class="pvp-counter-val" style="color:#e74c3c">' + myRating + '</div><div class="pvp-counter-label">Ваш рейтинг</div></div>' +
    '<div class="pvp-counter-box"><div class="pvp-counter-val" style="color:#3498db">' + refLeft + '</div><div class="pvp-counter-label">Обновлений</div></div>' +
    '</div>';

  if (!window.GameSync || !window.GameSync.state.online) {
    html += '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">📱 Арена доступна только в Telegram</div>';
    body.innerHTML = html;
    return;
  }

  if (_pvpLoading) {
    html += '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">⏳ Загрузка...</div>';
    body.innerHTML = html;
    return;
  }

  // Если ещё не загружали — загружаем
  if (_pvpOpponents.length === 0) {
    body.innerHTML = html + '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">⏳ Загрузка противников...</div>';
    _pvpLoadOpponents();
    return;
  }

  // Список противников
  html += '<div style="font-size:10px;color:#556;margin-bottom:8px;letter-spacing:1px;">ВЫБЕРИТЕ ПРОТИВНИКА</div>';

  var charEmojis  = { fire: '🔥', light: '✨', water: '💧' };
  var charColors  = { fire: '#ff6600', light: '#ffd060', water: '#44aaff' };

  _pvpOpponents.forEach(function(opp, i) {
    var isSelected = (_pvpSelected && _pvpSelected.tgId === opp.tgId);
    var charEmoji  = charEmojis[opp.charId] || '👤';
    var charColor  = charColors[opp.charId] || '#aaa';
    var ratingDiff = (opp.rating || 1000) - myRating;
    var diffStr    = ratingDiff > 0 ? '+' + ratingDiff : String(ratingDiff);
    var diffColor  = ratingDiff > 0 ? '#e74c3c' : '#2ecc71';
    var pts        = (opp.rating || 1000) >= myRating ? '→ +10 очков' : '→ +5 очков';
    var aUrl = (window.GameSync && window.GameSync._API) ? (window.GameSync._API + '/api/avatar/' + opp.tgId) : '';

    html += '<div class="pvp-opp-card' + (isSelected ? ' selected' : '') + '" onclick="pvpSelectOpponent(' + i + ')">' +
      '<div class="pvp-opp-avatar">' +
        (aUrl ? '<img src="' + aUrl + '" onerror="this.style.display=\'none\';this.parentElement.textContent=\'' + charEmoji + '\'">' : charEmoji) +
      '</div>' +
      '<div class="pvp-opp-info">' +
        '<div class="pvp-opp-name">' + (opp.name || 'Игрок') + ' <span style="font-size:10px;color:' + charColor + '">' + charEmoji + '</span></div>' +
        '<div class="pvp-opp-sub">Lv.' + (opp.level || 1) + ' · <span style="color:' + diffColor + '">' + diffStr + '</span> · <span style="color:#8a8a;">' + pts + '</span></div>' +
      '</div>' +
      '<div class="pvp-opp-rating">⚔️ ' + (opp.rating || 1000) + '</div>' +
    '</div>';
  });

  // Кнопки
  html += '<button class="pvp-fight-btn" ' + (attLeft <= 0 || !_pvpSelected ? 'disabled' : '') + ' onclick="pvpStartFight()">' +
    (attLeft <= 0 ? '⛔ Попыток не осталось' : '⚔️ СРАЖАТЬСЯ') + '</button>';
  html += '<button class="pvp-refresh-btn" ' + (refLeft <= 0 ? 'disabled' : '') + ' onclick="pvpRefreshOpponents()">' +
    '🔄 Обновить список (' + refLeft + ' осталось)</button>';

  body.innerHTML = html;
}

// ── Загрузить противников ──
function _pvpLoadOpponents() {
  if (_pvpLoading) return;
  _pvpLoading = true;
  _pvpSelected = null;

  var API  = window.GameSync._API;
  var init = window.GameSync._INIT;

  fetch(API + '/api/pvp/opponents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: init }),
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    _pvpLoading = false;
    if (d.ok) {
      _pvpOpponents = d.opponents || [];
      if (d.myRating !== undefined) G.arenaRating = d.myRating;
    } else {
      _pvpOpponents = [];
    }
    if (_pvpTab === 'battle') _pvpRenderBattle();
  })
  .catch(function() {
    _pvpLoading = false;
    _pvpOpponents = [];
    if (_pvpTab === 'battle') _pvpRenderBattle();
  });
}

// ── Выбрать противника ──
function pvpSelectOpponent(i) {
  _pvpSelected = _pvpOpponents[i] || null;
  if (_pvpTab === 'battle') _pvpRenderBattle();
}

// ── Обновить список противников ──
function pvpRefreshOpponents() {
  var refLeft = _pvpRefreshesLeft();
  if (refLeft <= 0) return;

  // Тратим обновление
  var today = _pvpTodayStr();
  if ((G.pvpRefreshDate || '') !== today) {
    G.pvpRefreshes = 0;
    G.pvpRefreshDate = today;
  }
  G.pvpRefreshes = (G.pvpRefreshes || 0) + 1;
  if (window.GameSync) window.GameSync.saveInstant({ pvpRefreshes: G.pvpRefreshes, pvpRefreshDate: G.pvpRefreshDate });

  _pvpOpponents = [];
  _pvpSelected  = null;
  _pvpRenderBattle();
  _pvpLoadOpponents();
}

// ═══════════════════════════════
//  PVP БОЙ НА CANVAS
// ═══════════════════════════════

var _pvpBattle = null;   // текущее состояние боя

function pvpStartFight() {
  if (!_pvpSelected) return;
  if (_pvpAttemptsLeft() <= 0) return;
  if (!G_CHAR) { _taskToast('❌ Персонаж не выбран'); return; }

  // Пересчитываем статы перед боем
  if (typeof recalcStats === 'function') recalcStats();

  var opp = _pvpSelected;

  // Инициализируем состояние боя
  _pvpBattle = {
    myHpMax:   G.maxHp,
    myHp:      G.maxHp,
    oppHpMax:  opp.maxHp || opp.stats.hp || 100,
    oppHp:     opp.maxHp || opp.stats.hp || 100,
    myAtk:     G.stats.atk,
    myDef:     G.stats.def,
    myCrit:    G.stats.crit,
    myDodge:   G.stats.dodge,
    myAtkSpd:  G.stats.atkSpd || 1.0,
    oppAtk:    opp.stats.atk   || 10,
    oppDef:    opp.stats.def   || 5,
    oppCrit:   opp.stats.crit  || 5,
    oppDodge:  opp.stats.dodge || 3,
    oppAtkSpd: opp.stats.atkSpd || 1.0,
    myAtkTimer:  0,
    oppAtkTimer: 0,
    mySkillCds:  [0, 0, 0],
    oppSkillCds: [0, 0, 0],
    myDmgDealt:  0,
    oppDmgDealt: 0,
    timeLeft:    60,
    over:        false,
    opp:         opp,
    myAnimState:  'idle',  // 'idle' | 'atk'
    oppAnimState: 'idle',
    myAnimTimer:  0,
    oppAnimTimer: 0,
    myFrame:      0,
    oppFrame:     0,
    frameTimer:   0,
    dmgPops:      [],  // { x, y, text, color, life, maxLife }
  };

  // Показываем оверлей
  var overlay = document.getElementById('pvpBattleOverlay');
  overlay.classList.remove('hidden');

  // Инициализируем canvas
  var cv = document.getElementById('pvpCanvas');
  cv.width  = window.innerWidth;
  cv.height = window.innerHeight;

  // HUD
  document.getElementById('pvpMyName').textContent  = _pvpGetMyName();
  document.getElementById('pvpOppName').textContent = opp.name || 'Противник';

  // Инициализируем HUD скиллов
  _pvpInitSkillsHud();
  _pvpUpdateHpBars();

  // Запускаем цикл
  _pvpBattleLoop();
}

function _pvpGetMyName() {
  try {
    var unsafe = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe;
    if (unsafe && unsafe.user) return unsafe.user.first_name || 'Вы';
  } catch(e) {}
  return 'Вы';
}

// ── Базовый урон за удар ──
function _pvpCalcDmg(atk, def, crit) {
  var raw  = Math.max(1, atk - Math.floor(def * 0.5));
  var dmg  = Math.floor(raw * (0.85 + Math.random() * 0.3));
  var isCrit = Math.random() * 100 < crit;
  if (isCrit) dmg = Math.floor(dmg * 1.8);
  return { dmg: Math.max(1, dmg), crit: isCrit };
}

// ── Инициализация HUD скиллов PvP ──
function _pvpInitSkillsHud() {
  if (!G_CHAR) return;
  var skills = SKILLS_DEF[G_CHAR.id] || [];
  _pvpBattle.mySkillCds = [0, 0, 0];
  for (var i = 0; i < 3; i++) {
    var sk    = skills[i];
    var iconEl = document.getElementById('pvpSk' + i + 'icon');
    var lockEl = document.getElementById('pvpSk' + i + 'lock');
    if (!sk) { if (iconEl) iconEl.innerHTML = ''; if (lockEl) lockEl.style.display = 'none'; continue; }
    var st = getSkillState(sk.id);
    if (iconEl) iconEl.innerHTML = '<img src="' + sk.icon + '" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;" onerror="this.remove()">';
    if (lockEl) lockEl.style.display = st.unlocked ? 'none' : 'flex';
  }
  _pvpUpdateSkillsHud();
}

function _pvpUpdateSkillsHud() {
  if (!G_CHAR || !_pvpBattle) return;
  var skills = SKILLS_DEF[G_CHAR.id] || [];
  var charCols = { fire: '#ff6600', light: '#ffd060', water: '#44aaff' };
  var col = charCols[G_CHAR.id] || '#aaa';
  for (var i = 0; i < 3; i++) {
    var sk   = skills[i];
    var btn  = document.getElementById('pvpSk' + i + 'btn');
    var fill = document.getElementById('pvpSk' + i + 'fill');
    var cdN  = document.getElementById('pvpSk' + i + 'cd');
    if (!sk || !btn) continue;
    var st = getSkillState(sk.id);
    var cd = _pvpBattle.mySkillCds[i] || 0;
    if (!st.unlocked) {
      btn.classList.remove('ready', 'oncd');
      if (fill) fill.style.display = 'none';
      if (cdN)  cdN.textContent = '';
      continue;
    }
    if (cd > 0) {
      var pct = Math.min(100, (cd / sk.cd) * 100);
      if (fill) { fill.style.display='block'; fill.style.height=pct+'%'; fill.style.width='100%'; fill.style.bottom='0'; fill.style.top='auto'; fill.style.left='0'; fill.style.position='absolute'; fill.style.background='rgba(0,0,0,0.65)'; }
      if (cdN) cdN.textContent = Math.ceil(cd) + 's';
      btn.classList.add('oncd'); btn.classList.remove('ready');
      btn.style.removeProperty('--sk-col');
    } else {
      if (fill) fill.style.display = 'none';
      if (cdN)  cdN.textContent = st.level > 0 ? 'Lv' + st.level : '';
      btn.classList.remove('oncd'); btn.classList.add('ready');
      btn.style.setProperty('--sk-col', col);
    }
  }
}

// ── Каст скилла игроком в PvP ──
function pvpCastSkill(i) {
  if (!_pvpBattle || _pvpBattle.over) return;
  var skills = SKILLS_DEF[G_CHAR.id] || [];
  var sk = skills[i];
  if (!sk) return;
  var st = getSkillState(sk.id);
  if (!st.unlocked) return;
  if ((_pvpBattle.mySkillCds[i] || 0) > 0) return;

  // Упрощённый каст в PvP: считаем урон напрямую
  var lv = st.level || 0;
  var dmgMult = 1.0;
  var healPct = 0;
  var defBuffPct = 0;

  // Урон скилла зависит от типа
  if (sk.id === 'fire_fireball') {
    dmgMult = 2.0 * (1 + lv * 0.10);
  } else if (sk.id === 'fire_curse') {
    // Дебафф: снижаем def противника на время
    _pvpBattle._oppDefDebuff = 0.30 + lv * 0.03;
    _pvpBattle._oppDefDebuffTimer = 30;
    _pvpAddDmgPop('CURSE!', window.innerWidth * 0.65, window.innerHeight * 0.5, '#cc44ff');
    _pvpBattle.mySkillCds[i] = sk.cd;
    _pvpUpdateSkillsHud();
    return;
  } else if (sk.id === 'fire_haste') {
    // Баф скорости атаки
    _pvpBattle._myAtkSpdBuff = 1.5;
    _pvpBattle._myAtkSpdBuffTimer = 8 + lv * 0.5;
    _pvpAddDmgPop('HASTE!', window.innerWidth * 0.22, window.innerHeight * 0.5, '#ffaa00');
    _pvpBattle.mySkillCds[i] = sk.cd;
    _pvpUpdateSkillsHud();
    return;
  } else if (sk.id === 'light_smite') {
    dmgMult = 2.0 * (1 + lv * 0.10);
  } else if (sk.id === 'light_shield') {
    defBuffPct = 0.30 + lv * 0.03;
    _pvpBattle._myDefBuff = defBuffPct;
    _pvpBattle._myDefBuffTimer = 15;
    _pvpAddDmgPop('SHIELD!', window.innerWidth * 0.22, window.innerHeight * 0.5, '#44aaff');
    _pvpBattle.mySkillCds[i] = sk.cd;
    _pvpUpdateSkillsHud();
    return;
  } else if (sk.id === 'light_reflect') {
    _pvpBattle._myReflect = 0.20 + lv * 0.01;
    _pvpBattle._myReflectTimer = 10;
    _pvpAddDmgPop('REFLECT!', window.innerWidth * 0.22, window.innerHeight * 0.5, '#ffd060');
    _pvpBattle.mySkillCds[i] = sk.cd;
    _pvpUpdateSkillsHud();
    return;
  } else if (sk.id === 'water_burst') {
    dmgMult = 1.5 + Math.floor(lv / 2) * 0.5;
  } else if (sk.id === 'water_critup') {
    _pvpBattle._myCritBuff = 3 * lv;
    _pvpBattle._myCritBuffTimer = 10;
    _pvpAddDmgPop('CRIT UP!', window.innerWidth * 0.22, window.innerHeight * 0.5, '#44d4ff');
    _pvpBattle.mySkillCds[i] = sk.cd;
    _pvpUpdateSkillsHud();
    return;
  } else if (sk.id === 'water_freeze') {
    _pvpBattle._oppFrozen = true;
    _pvpBattle._oppFrozenTimer = 2.0 + lv * 0.4;
    _pvpAddDmgPop('FREEZE!', window.innerWidth * 0.65, window.innerHeight * 0.5, '#88ccff');
    _pvpBattle.mySkillCds[i] = sk.cd;
    _pvpUpdateSkillsHud();
    return;
  }

  // Наносим урон
  var myEffCrit = (_pvpBattle.myCrit || 5) + (_pvpBattle._myCritBuff || 0);
  var oppEffDef = Math.floor((_pvpBattle.oppDef || 5) * (1 - (_pvpBattle._oppDefDebuff || 0)));
  var raw  = Math.max(1, _pvpBattle.myAtk - Math.floor(oppEffDef * 0.5));
  var dmg  = Math.floor(raw * dmgMult * (0.9 + Math.random() * 0.2));
  var isCrit = Math.random() * 100 < myEffCrit;
  if (isCrit) dmg = Math.floor(dmg * 1.8);
  dmg = Math.max(1, dmg);

  _pvpBattle.oppHp = Math.max(0, _pvpBattle.oppHp - dmg);
  _pvpBattle.myDmgDealt += dmg;
  _pvpBattle.myAnimState = 'atk'; _pvpBattle.myAnimTimer = 0.4;
  _pvpBattle.mySkillCds[i] = sk.cd;
  _pvpUpdateSkillsHud();

  _pvpAddDmgPop((isCrit ? '💥 ' : '') + dmg, window.innerWidth * 0.65, window.innerHeight * 0.45, isCrit ? '#f5c542' : '#ff6060');
  _pvpLogDmg('Вы [скилл]: -' + dmg + (isCrit ? ' КРИТ' : ''), true);
  _pvpUpdateHpBars();
}

// ── HP бары ──
function _pvpUpdateHpBars() {
  if (!_pvpBattle) return;
  var myPct  = Math.max(0, _pvpBattle.myHp / _pvpBattle.myHpMax * 100);
  var oppPct = Math.max(0, _pvpBattle.oppHp / _pvpBattle.oppHpMax * 100);
  var myBar  = document.getElementById('pvpMyHp');
  var oppBar = document.getElementById('pvpOppHp');
  var myText = document.getElementById('pvpMyHpText');
  var oppText= document.getElementById('pvpOppHpText');
  if (myBar)  myBar.style.width  = myPct + '%';
  if (oppBar) oppBar.style.width = oppPct + '%';
  if (myText) myText.textContent = Math.max(0, Math.ceil(_pvpBattle.myHp)) + '/' + _pvpBattle.myHpMax;
  if (oppText)oppText.textContent= Math.max(0, Math.ceil(_pvpBattle.oppHp)) + '/' + _pvpBattle.oppHpMax;
  var timerEl = document.getElementById('pvpTimer');
  if (timerEl) timerEl.textContent = Math.max(0, Math.ceil(_pvpBattle.timeLeft));
}

// ── Всплывающий урон на canvas ──
function _pvpAddDmgPop(text, x, y, color) {
  if (!_pvpBattle) return;
  _pvpBattle.dmgPops.push({ x: x, y: y, vy: -60, text: text, color: color || '#fff', life: 1.2, maxLife: 1.2 });
}

// ── Лог урона ──
function _pvpLogDmg(text, isMe) {
  var log = document.getElementById('pvpDmgLog');
  if (!log) return;
  var el = document.createElement('div');
  el.className = 'pvp-dmg-entry';
  el.style.color = isMe ? '#ff8888' : '#88aaff';
  el.textContent = text;
  log.insertBefore(el, log.firstChild);
  // Максимум 5 записей
  while (log.children.length > 5) log.removeChild(log.lastChild);
}

// ── Главный цикл боя ──
var _pvpLastTime = 0;
var _pvpRafId    = null;

function _pvpBattleLoop() {
  _pvpLastTime = performance.now();
  function tick(ts) {
    var dt = Math.min((ts - _pvpLastTime) / 1000, 0.1);
    _pvpLastTime = ts;
    _pvpUpdate(dt);
    _pvpRender();
    if (!_pvpBattle || !_pvpBattle.over) {
      _pvpRafId = requestAnimationFrame(tick);
    }
  }
  _pvpRafId = requestAnimationFrame(tick);
}

function _pvpUpdate(dt) {
  if (!_pvpBattle || _pvpBattle.over) return;
  var b = _pvpBattle;

  // Таймер боя
  b.timeLeft -= dt;
  if (b.timeLeft <= 0) { b.timeLeft = 0; _pvpEndBattle(); return; }

  // Анимационные таймеры
  b.frameTimer += dt;
  if (b.frameTimer > 0.12) { b.myFrame++; b.oppFrame++; b.frameTimer = 0; }
  if (b.myAnimState === 'atk')  { b.myAnimTimer  -= dt; if (b.myAnimTimer  <= 0) { b.myAnimState  = 'idle'; } }
  if (b.oppAnimState === 'atk') { b.oppAnimTimer -= dt; if (b.oppAnimTimer <= 0) { b.oppAnimState = 'idle'; } }

  // Дебаффы/баффы
  if (b._oppDefDebuffTimer > 0) { b._oppDefDebuffTimer -= dt; if (b._oppDefDebuffTimer <= 0) { b._oppDefDebuff = 0; } }
  if (b._myDefBuffTimer    > 0) { b._myDefBuffTimer     -= dt; if (b._myDefBuffTimer    <= 0) { b._myDefBuff = 0;    } }
  if (b._myReflectTimer   > 0) { b._myReflectTimer     -= dt; if (b._myReflectTimer    <= 0) { b._myReflect = 0;   } }
  if (b._myCritBuffTimer  > 0) { b._myCritBuffTimer    -= dt; if (b._myCritBuffTimer   <= 0) { b._myCritBuff = 0;  } }
  if (b._myAtkSpdBuffTimer > 0){ b._myAtkSpdBuffTimer  -= dt; if (b._myAtkSpdBuffTimer <= 0) { b._myAtkSpdBuff = 1;} }
  if (b._oppFrozenTimer   > 0) { b._oppFrozenTimer     -= dt; if (b._oppFrozenTimer    <= 0) { b._oppFrozen = false; } }

  // Кулдауны скиллов
  var skills = G_CHAR ? (SKILLS_DEF[G_CHAR.id] || []) : [];
  for (var i = 0; i < 3; i++) {
    if (b.mySkillCds[i]  > 0) b.mySkillCds[i]  = Math.max(0, b.mySkillCds[i]  - dt);
    if (b.oppSkillCds[i] > 0) b.oppSkillCds[i] = Math.max(0, b.oppSkillCds[i] - dt);
  }
  _pvpUpdateSkillsHud();

  // ── Атака игрока ──
  var myAtkSpd = (b.myAtkSpd || 1.0) * (b._myAtkSpdBuff || 1.0);
  var myAtkInterval = Math.max(0.4, 2.5 / myAtkSpd);
  b.myAtkTimer += dt;
  if (b.myAtkTimer >= myAtkInterval) {
    b.myAtkTimer = 0;
    // Проверка dodge противника
    if (Math.random() * 100 < (b.oppDodge || 5)) {
      _pvpAddDmgPop('DODGE', window.innerWidth * 0.65, window.innerHeight * 0.45, '#88aaff');
      _pvpLogDmg('Противник: DODGE', false);
    } else {
      var myEffCrit = (b.myCrit || 5) + (b._myCritBuff || 0);
      var oppEffDef = Math.floor((b.oppDef || 5) * (1 - (b._oppDefDebuff || 0)));
      var res = _pvpCalcDmg(b.myAtk, oppEffDef, myEffCrit);
      b.oppHp = Math.max(0, b.oppHp - res.dmg);
      b.myDmgDealt += res.dmg;
      b.myAnimState = 'atk'; b.myAnimTimer = 0.4;
      _pvpAddDmgPop((res.crit ? '💥 ' : '') + res.dmg, window.innerWidth * 0.65, window.innerHeight * 0.45, res.crit ? '#f5c542' : '#ff6060');
      _pvpLogDmg('Вы: -' + res.dmg + (res.crit ? ' КРИТ' : ''), true);
    }
  }

  // ── Атака противника (не атакует если заморожен) ──
  if (!b._oppFrozen) {
    var oppAtkInterval = Math.max(0.4, 2.5 / (b.oppAtkSpd || 1.0));
    b.oppAtkTimer += dt;
    if (b.oppAtkTimer >= oppAtkInterval) {
      b.oppAtkTimer = 0;

      // Авто-скиллы противника
      _pvpOppAutoSkill(dt);

      // Проверка dodge игрока
      if (Math.random() * 100 < (b.myDodge || 3)) {
        _pvpAddDmgPop('DODGE', window.innerWidth * 0.22, window.innerHeight * 0.45, '#88aaff');
        _pvpLogDmg('Вы: DODGE', true);
      } else {
        var myEffDef = Math.floor((b.myDef || 5) * (1 + (b._myDefBuff || 0)));
        var oppRes = _pvpCalcDmg(b.oppAtk, myEffDef, b.oppCrit || 5);
        var actualDmg = oppRes.dmg;
        // Reflect
        if (b._myReflect) {
          var reflected = Math.floor(actualDmg * b._myReflect);
          b.oppHp = Math.max(0, b.oppHp - reflected);
          b.myDmgDealt += reflected;
        }
        b.myHp = Math.max(0, b.myHp - actualDmg);
        b.oppDmgDealt += actualDmg;
        b.oppAnimState = 'atk'; b.oppAnimTimer = 0.4;
        _pvpAddDmgPop((oppRes.crit ? '💥 ' : '-') + actualDmg, window.innerWidth * 0.22, window.innerHeight * 0.45, oppRes.crit ? '#ff8800' : '#8888ff');
        _pvpLogDmg('Противник: -' + actualDmg + (oppRes.crit ? ' КРИТ' : ''), false);
      }
    }
  }

  // Обновляем HP бары
  _pvpUpdateHpBars();

  // Обновляем всплывающие попапы
  b.dmgPops = b.dmgPops.filter(function(p) {
    p.life -= dt;
    p.y += p.vy * dt;
    return p.life > 0;
  });

  // Проверяем конец боя по HP
  if (b.myHp <= 0 || b.oppHp <= 0) { _pvpEndBattle(); }
}

// ── Авто-скиллы противника ──
function _pvpOppAutoSkill(dt) {
  var b = _pvpBattle;
  if (!b) return;
  var opp = b.opp;
  if (!opp || !opp.charId) return;
  var oppSkills = SKILLS_DEF[opp.charId] || [];
  if (!opp.skills) return;

  oppSkills.forEach(function(sk, i) {
    var st = opp.skills[sk.id];
    if (!st || !st.unlocked) return;
    if ((b.oppSkillCds[i] || 0) > 0) return;

    // Простой авто-каст: наносим урон или дебафф
    var lv = st.level || 0;
    var dmgMult = 1.0;
    if (sk.id.indexOf('fireball') !== -1 || sk.id.indexOf('smite') !== -1 || sk.id.indexOf('burst') !== -1) {
      dmgMult = 2.0 * (1 + lv * 0.10);
      var myEffDef2 = Math.floor((b.myDef || 5) * (1 + (b._myDefBuff || 0)));
      var raw2 = Math.max(1, b.oppAtk - Math.floor(myEffDef2 * 0.5));
      var dmg2 = Math.max(1, Math.floor(raw2 * dmgMult * (0.9 + Math.random() * 0.2)));
      var isCrit2 = Math.random() * 100 < (b.oppCrit || 5);
      if (isCrit2) dmg2 = Math.floor(dmg2 * 1.8);
      // Reflect
      if (b._myReflect) b.oppHp = Math.max(0, b.oppHp - Math.floor(dmg2 * b._myReflect));
      b.myHp = Math.max(0, b.myHp - dmg2);
      b.oppDmgDealt += dmg2;
      b.oppAnimState = 'atk'; b.oppAnimTimer = 0.4;
      b.oppSkillCds[i] = sk.cd;
      _pvpAddDmgPop('💥 ' + dmg2, window.innerWidth * 0.22, window.innerHeight * 0.38, '#ff8800');
      _pvpLogDmg('Противник [скилл]: -' + dmg2, false);
    } else if (sk.id.indexOf('shield') !== -1 || sk.id.indexOf('haste') !== -1 || sk.id.indexOf('critup') !== -1) {
      // Баф противника — просто усиливаем его
      b.oppAtk = Math.floor(b.oppAtk * 1.15);
      b.oppSkillCds[i] = sk.cd;
    } else {
      // Остальные — небольшой урон
      var dmg3 = Math.max(1, Math.floor(b.oppAtk * 1.2));
      b.myHp = Math.max(0, b.myHp - dmg3);
      b.oppDmgDealt += dmg3;
      b.oppSkillCds[i] = sk.cd;
    }
  });
}

// ── Рендер боя на canvas ──
function _pvpRender() {
  var cv = document.getElementById('pvpCanvas');
  if (!cv || !_pvpBattle) return;
  var ctx2 = cv.getContext('2d');
  var W2 = cv.width, H2 = cv.height;
  var b = _pvpBattle;

  // Фон арены
  ctx2.fillStyle = '#0d0d1a';
  ctx2.fillRect(0, 0, W2, H2);

  // Арена — градиент пола
  var ground = H2 * 0.72;
  var skyGrad = ctx2.createLinearGradient(0, 0, 0, ground);
  skyGrad.addColorStop(0, '#0a0a20');
  skyGrad.addColorStop(1, '#1a0a30');
  ctx2.fillStyle = skyGrad;
  ctx2.fillRect(0, 0, W2, ground);

  // Пол
  var floorGrad = ctx2.createLinearGradient(0, ground, 0, H2);
  floorGrad.addColorStop(0, '#2a1a4a');
  floorGrad.addColorStop(1, '#1a0a30');
  ctx2.fillStyle = floorGrad;
  ctx2.fillRect(0, ground, W2, H2 - ground);

  // Линия пола
  ctx2.fillStyle = '#4a2a8a';
  ctx2.fillRect(0, ground, W2, 2);

  // Фоновые огни арены
  var t = performance.now() * 0.001;
  for (var lamp = 0; lamp < 4; lamp++) {
    var lx = W2 * (0.15 + lamp * 0.23);
    var ly = H2 * 0.12;
    var la = 0.15 + Math.sin(t + lamp) * 0.05;
    var lg = ctx2.createRadialGradient(lx, ly, 0, lx, ly, 60);
    lg.addColorStop(0, 'rgba(150,80,255,' + la + ')');
    lg.addColorStop(1, 'rgba(80,20,120,0)');
    ctx2.fillStyle = lg;
    ctx2.beginPath(); ctx2.arc(lx, ly, 60, 0, Math.PI * 2); ctx2.fill();
  }

  // Позиции бойцов
  var SPRITE_W = 128, SPRITE_H = 128;
  var myX  = Math.floor(W2 * 0.22);
  var oppX = Math.floor(W2 * 0.68);
  var sprY = Math.floor(ground - SPRITE_H);

  ctx2.imageSmoothingEnabled = false;

  // ── Рисуем ИГРОКА ──
  if (G_CHAR && typeof spriteRun !== 'undefined') {
    var mySpr, myFr, myFW, myFH;
    if (b.myAnimState === 'atk') {
      mySpr = spriteAtk;
      var _AF = window.ATK_FRAMES_CUR || 8;
      var _AFW = window.ATK_FW_CUR || 128;
      myFr  = Math.min(_AF - 1, Math.floor((1 - b.myAnimTimer / 0.4) * _AF));
      myFW = _AFW; myFH = 128;
    } else {
      mySpr = spriteIdle;
      var _IF = window.IDLE_FRAMES_CUR || 7;
      var _IFW = window.IDLE_FW_CUR || 128;
      myFr  = b.myFrame % _IF;
      myFW = _IFW; myFH = 128;
    }
    if (mySpr && mySpr.complete && mySpr.naturalWidth > 0) {
      ctx2.drawImage(mySpr, myFr * myFW, 0, myFW, myFH, myX - SPRITE_W / 2, sprY, SPRITE_W, SPRITE_H);
    }
  }

  // ── Рисуем ПРОТИВНИКА (отзеркаленный) ──
  var opp = b.opp;
  if (opp && opp.charId) {
    var oppChar = CHARS[opp.charId];
    if (oppChar) {
      // Используем спрайты противника
      var oppIdleSrc = oppChar.idleSrc;
      var oppAtkSrc  = oppChar.atkSrc;
      if (!_pvpOppImgs) _pvpOppImgs = {};
      if (!_pvpOppImgs[opp.charId + '_idle']) {
        _pvpOppImgs[opp.charId + '_idle'] = new Image();
        _pvpOppImgs[opp.charId + '_idle'].src = oppIdleSrc;
        _pvpOppImgs[opp.charId + '_atk']  = new Image();
        _pvpOppImgs[opp.charId + '_atk'].src  = oppAtkSrc;
      }
      var oppSprKey = b.oppAnimState === 'atk' ? '_atk' : '_idle';
      var oppSpr = _pvpOppImgs[opp.charId + oppSprKey];
      var oppFrCount = b.oppAnimState === 'atk' ? (oppChar.atkFrames || 8) : (oppChar.idleFrames || 7);
      var oppFW = b.oppAnimState === 'atk' ? (oppChar.atkFW || 128) : (oppChar.idleFW || 128);
      var oppFr = b.oppFrame % oppFrCount;

      ctx2.save();
      ctx2.translate(oppX + SPRITE_W / 2, 0);
      ctx2.scale(-1, 1);
      if (oppSpr && oppSpr.complete && oppSpr.naturalWidth > 0) {
        ctx2.drawImage(oppSpr, oppFr * oppFW, 0, oppFW, 128, 0, sprY, SPRITE_W, SPRITE_H);
      }
      ctx2.restore();
    }
  }

  // HP текст над бойцами
  ctx2.font = 'bold 11px Courier New';
  ctx2.textAlign = 'center';
  ctx2.fillStyle = '#e74c3c';
  ctx2.fillText(Math.max(0, Math.ceil(b.myHp)) + ' HP', myX, sprY - 8);
  ctx2.fillStyle = '#3498db';
  ctx2.fillText(Math.max(0, Math.ceil(b.oppHp)) + ' HP', oppX, sprY - 8);

  // Замороженный эффект
  if (b._oppFrozen) {
    ctx2.save();
    ctx2.globalAlpha = 0.35;
    ctx2.fillStyle = '#88ccff';
    ctx2.fillRect(oppX - SPRITE_W / 2, sprY, SPRITE_W, SPRITE_H);
    ctx2.restore();
    ctx2.font = '12px Courier New'; ctx2.fillStyle = '#88ccff'; ctx2.textAlign = 'center';
    ctx2.fillText('❄️', oppX, sprY - 22);
  }

  // Всплывающий урон
  ctx2.font = 'bold 16px Courier New';
  ctx2.textAlign = 'center';
  b.dmgPops.forEach(function(p) {
    ctx2.globalAlpha = p.life / p.maxLife;
    ctx2.fillStyle = p.color;
    ctx2.fillText(p.text, p.x, p.y);
  });
  ctx2.globalAlpha = 1;
}

var _pvpOppImgs = {};

// ── Конец боя ──
function _pvpEndBattle() {
  if (!_pvpBattle || _pvpBattle.over) return;
  _pvpBattle.over = true;
  if (_pvpRafId) { cancelAnimationFrame(_pvpRafId); _pvpRafId = null; }

  var b = _pvpBattle;
  // Победитель — кто больше нанёс урона (или у кого HP > 0)
  var won;
  if (b.myHp <= 0 && b.oppHp > 0) {
    won = false;
  } else if (b.oppHp <= 0 && b.myHp > 0) {
    won = true;
  } else {
    // По нанесённому урону
    won = b.myDmgDealt >= b.oppDmgDealt;
  }

  // Тратим попытку локально
  var today = _pvpTodayStr();
  if ((G.pvpAttemptsDate || '') !== today) { G.pvpAttempts = 0; G.pvpAttemptsDate = today; }
  G.pvpAttempts = (G.pvpAttempts || 0) + 1;

  // Отправляем результат на сервер
  var API  = window.GameSync._API;
  var init = window.GameSync._INIT;
  fetch(API + '/api/pvp/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData:   init,
      opponentId: b.opp.tgId,
      won:        won,
      myDmg:      Math.floor(b.myDmgDealt),
      oppDmg:     Math.floor(b.oppDmgDealt),
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      G.arenaRating    = d.newRating;
      G.pvpAttempts    = 10 - (d.attemptsLeft || 0);
      G.pvpAttemptsDate = today;
      if (window.GameSync) window.GameSync.saveInstant({
        arenaRating: G.arenaRating,
        pvpAttempts: G.pvpAttempts,
        pvpAttemptsDate: G.pvpAttemptsDate,
      });
      _pvpShowResult(won, d.ratingChange, d.newRating, b.opp.name);
      _pvpClearCache();
    } else {
      // Даже при ошибке сервера — показываем результат локально
      if (window.GameSync) window.GameSync.saveInstant({
        pvpAttempts: G.pvpAttempts,
        pvpAttemptsDate: G.pvpAttemptsDate,
      });
      _pvpShowResult(won, won ? 5 : -5, G.arenaRating, b.opp.name);
    }
  })
  .catch(function() {
    _pvpShowResult(won, won ? 5 : -5, G.arenaRating, b.opp.name);
  });
}

// ── Показ результата ──
function _pvpShowResult(won, ratingChange, newRating, oppName) {
  var overlay = document.getElementById('pvpBattleOverlay');
  var result  = document.getElementById('pvpResultOverlay');
  if (overlay) overlay.classList.add('hidden');
  if (!result) return;
  result.classList.remove('hidden');

  var iconEl  = document.getElementById('pvpResultIcon');
  var titleEl = document.getElementById('pvpResultTitle');
  var subEl   = document.getElementById('pvpResultSub');
  var ratingEl= document.getElementById('pvpResultRating');

  if (won) {
    if (iconEl)  iconEl.textContent  = '🏆';
    if (titleEl) { titleEl.textContent = 'ПОБЕДА!'; titleEl.style.color = '#f5c542'; }
  } else {
    if (iconEl)  iconEl.textContent  = '💀';
    if (titleEl) { titleEl.textContent = 'ПОРАЖЕНИЕ'; titleEl.style.color = '#e74c3c'; }
  }
  if (subEl)    subEl.textContent    = 'vs ' + (oppName || 'Противник');
  if (ratingEl) {
    var sign = ratingChange >= 0 ? '+' : '';
    ratingEl.textContent = sign + ratingChange + ' очков арены · Рейтинг: ' + (newRating || G.arenaRating);
    ratingEl.style.color = ratingChange >= 0 ? '#2ecc71' : '#e74c3c';
  }
}

// ── Закрыть результат и вернуться в лобби ──
function pvpCloseResult() {
  var result = document.getElementById('pvpResultOverlay');
  if (result) result.classList.add('hidden');
  _pvpBattle = null;
  _pvpSelected = null;
  _pvpOpponents = []; // принудительно перезагружаем список
  if (_pvpTab !== 'battle') { _pvpTab = 'battle'; _pvpSyncTabs(); }
  renderPvpLobby();
}

function _pvpSyncTabs() {
  ['battle','rating','history'].forEach(function(t) {
    var btn = document.getElementById('pvpTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === _pvpTab);
  });
}

// ── Рейтинг арены ──
function _pvpRenderRating() {
  var body = document.getElementById('pvpBody');
  if (!body) return;

  if (!window.GameSync || !window.GameSync.state.online) {
    body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">📱 Доступно только в Telegram</div>';
    return;
  }

  // Кеш 30 секунд
  if (_pvpRatingCache && Date.now() - _pvpRatingCacheTime < 30000) {
    _pvpRenderRatingData(_pvpRatingCache, body);
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">⏳ Загрузка рейтинга...</div>';

  fetch(window.GameSync._API + '/api/pvp/rating', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: window.GameSync._INIT }),
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      _pvpRatingCache = d;
      _pvpRatingCacheTime = Date.now();
      if (_pvpTab === 'rating') _pvpRenderRatingData(d, body);
    } else {
      body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">Ошибка загрузки</div>';
    }
  })
  .catch(function() {
    body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">Ошибка сети</div>';
  });
}

function _pvpRenderRatingData(d, body) {
  var players = d.players || [];
  var myId    = d.tgId;
  var charEmojis = { fire: '🔥', light: '✨', water: '💧' };
  var medals = ['🥇', '🥈', '🥉'];
  var html = '<div style="font-size:10px;color:#556;margin-bottom:8px;letter-spacing:1px;">ТОП-50 АРЕНЫ</div>';
  html += '<div style="font-size:11px;color:#778;margin-bottom:12px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid #2a2a5a;">' +
    'Ваш рейтинг: <span style="color:#e74c3c;font-weight:bold">' + (G.arenaRating || 1000) + '</span> очков арены</div>';

  players.forEach(function(p, i) {
    var isMe  = p.tgId === myId;
    var medal = i < 3 ? medals[i] : (i + 1);
    var emoji = charEmojis[p.charId] || '👤';
    html += '<div class="pvp-rating-row" style="' + (isMe ? 'border-color:#f5c542;background:rgba(245,197,66,0.06);' : '') + '">' +
      '<div class="pvp-rating-rank">' + medal + '</div>' +
      '<div class="pvp-rating-name">' + (p.name || 'Игрок') + ' <span style="font-size:10px;color:#556">' + emoji + ' Lv.' + (p.level || 1) + '</span>' +
        (isMe ? ' <span style="font-size:9px;color:#f5c542;">(Вы)</span>' : '') + '</div>' +
      '<div class="pvp-rating-val">⚔️ ' + (p.rating || 1000) + '</div>' +
    '</div>';
  });

  if (players.length === 0) {
    html += '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">Пока нет игроков</div>';
  }

  body.innerHTML = html;
}

// ── История боёв ──
function _pvpRenderHistory() {
  var body = document.getElementById('pvpBody');
  if (!body) return;

  if (!window.GameSync || !window.GameSync.state.online) {
    body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">📱 Доступно только в Telegram</div>';
    return;
  }

  if (_pvpHistoryCache) {
    _pvpRenderHistoryData(_pvpHistoryCache, body);
    return;
  }

  body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">⏳ Загрузка...</div>';

  fetch(window.GameSync._API + '/api/pvp/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: window.GameSync._INIT }),
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      _pvpHistoryCache = d;
      if (_pvpTab === 'history') _pvpRenderHistoryData(d, body);
    } else {
      body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">Ошибка загрузки</div>';
    }
  })
  .catch(function() {
    body.innerHTML = '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">Ошибка сети</div>';
  });
}

function _pvpRenderHistoryData(d, body) {
  var battles = d.battles || [];
  var myId    = d.tgId;
  var html = '<div style="font-size:10px;color:#556;margin-bottom:8px;letter-spacing:1px;">ПОСЛЕДНИЕ 20 БОЁВ</div>';

  if (battles.length === 0) {
    html += '<div style="text-align:center;padding:30px 0;color:#445;font-size:12px;">Боёв ещё не было</div>';
    body.innerHTML = html;
    return;
  }

  battles.forEach(function(bt) {
    var isAttacker = bt.attackerId === myId;
    var won = bt.winnerId === myId;
    var oppName = isAttacker ? bt.defenderName : bt.attackerName;
    var ratingBefore = isAttacker ? bt.attackerRatingBefore : bt.defenderRatingBefore;
    var change = won ? bt.ratingChange : (bt.ratingChange > 0 ? -5 : 0);
    if (!isAttacker && bt.winnerId !== myId) change = 0;
    // Для защищающегося — рейтинг не менялся
    var pts  = isAttacker ? (won ? '+' + bt.ratingChange : '-5') : '—';
    var ptsColor = (isAttacker && won) ? '#2ecc71' : (isAttacker ? '#e74c3c' : '#778');
    var date = new Date(bt.createdAt);
    var dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' +
      date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    html += '<div class="pvp-history-row">' +
      '<div class="pvp-hist-result">' + (won ? '🏆' : '💀') + '</div>' +
      '<div class="pvp-hist-info">' +
        '<div class="pvp-hist-opp">' + (won ? 'Победа над ' : 'Поражение от ') + (oppName || 'Игрок') + '</div>' +
        '<div class="pvp-hist-time">' + dateStr + '</div>' +
      '</div>' +
      '<div class="pvp-hist-pts" style="color:' + ptsColor + '">' + pts + '</div>' +
    '</div>';
  });

  body.innerHTML = html;
}




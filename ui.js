/*
  ══════════════════════════════════════════════════════
  ui.js — Интерфейс панелей и вкладок
  Содержит: renderUpgrades, buyUpgrade, renderFloors,
  openFloorLoot, goToFloor, renderRating, renderWallet,
  switchTab, экран выбора персонажа (selectChar,
  confirmChar, applyCharacter, startGame, анимации)
  ══════════════════════════════════════════════════════
*/

// ═══════════════════════════════
//  ВКЛАДКА УЛУЧШЕНИЙ
// ═══════════════════════════════
var _upgTab = 'stats'; // 'stats' | 'skills'
function setUpgTab(t) { _upgTab = t; renderUpgrades(); }

function upgCost(u) {
  const lv = Math.min(G.upg[u.id], 10);
  return Math.floor(u.baseCost * Math.pow(1.6, lv));
}

function buyUpgrade(u) {
  if (G.upg[u.id] >= u.maxLv) return;
  const cost = upgCost(u);
  if (G.gold < cost) { flashRed(); return; }
  G.gold -= cost;
  G.upg[u.id]++;
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
  </div>`;

  // ── Характеристики ──
  if (_upgTab === 'stats') {
    body.innerHTML = header + tabBar + UPG_DEFS.map(u => {
      const lv = G.upg[u.id], maxLv = u.maxLv;
      const cost    = lv < maxLv ? upgCost(u) : '-';
      const pct     = (lv / maxLv * 100) + '%';
      const statVal = u.id === 'atkSpd'
        ? G.stats.atkSpd.toFixed(2) + 'x (' + getAtkCooldown().toFixed(1) + 's)'
        : G.stats[u.stat];
      const btnContent = lv >= maxLv
        ? 'MAX'
        : `<span style="display:flex;align-items:center;gap:3px;justify-content:center;">${coinSvg}<span>${cost}</span></span>`;
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
    '<span style="color:#445;font-size:9px;margin-left:auto">Шанс: ~1%</span></div>';

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
  var html = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">' +
    '<span style="font-size:28px">' + f.emoji + '</span>' +
    '<div><div style="font-size:15px;font-weight:bold;color:#f5c542;">Этаж ' + f.n + ': ' + f.name + '</div>' +
    '<div style="font-size:10px;color:#778;margin-top:2px;">Таблица дропа предметов</div></div></div>' +
    '<div style="font-size:9px;color:#556;letter-spacing:1px;margin-bottom:8px;">ПРЕДМЕТЫ</div>';
  if (f.loot && f.loot.length) {
    f.loot.forEach(function(item) {
      var col = rarityColors[item.rarity] || '#888';
      var rname = rarityNames[item.rarity] || item.rarity;
      var iconSrc = itemIcon(item.slot, item.rarity, item.forClass || null);
      html += '<div class="loot-row"><img src="' + iconSrc + '" style="width:24px;height:24px;object-fit:contain;image-rendering:pixelated;margin-right:8px;vertical-align:middle;" onerror="this.style.opacity=0">';
      html += '<span style="flex:1;color:#ddd;">' + item.name;
      if (item.forClass) html += ' <span style="font-size:9px;color:' + (classColors[item.forClass]||'#aaa') + ';border:1px solid ' + (classColors[item.forClass]||'#aaa') + ';padding:1px 5px;border-radius:3px;">' + (classLabels[item.forClass]||item.forClass) + '</span>';
      html += '</span><span class="loot-rarity-badge" style="color:' + col + ';border-color:' + col + ';margin-right:8px;">' + rname + '</span>';
      html += '<span style="color:#f5c542;font-weight:bold;min-width:34px;text-align:right;">' + item.chance + '%</span></div>';
    });
    var pixrChance = (0.3 * Math.pow(1.5, f.n - 1)).toFixed(2);
    html += '<div class="loot-row"><img src="images/pixr.png" style="width:24px;height:24px;object-fit:contain;image-rendering:pixelated;margin-right:8px;vertical-align:middle;" onerror="this.style.opacity=0">';
    html += '<span style="flex:1;color:#ff44cc;">PIXR</span>';
    html += '<span class="loot-rarity-badge" style="color:#ff44cc;border-color:#ff44cc;margin-right:8px;">Монетка</span>';
    html += '<span style="color:#f5c542;font-weight:bold;min-width:34px;text-align:right;">' + pixrChance + '%</span></div>';
  } else {
    html += '<div style="color:#445;font-size:11px;text-align:center;padding:20px 0;">Нет данных о дропе</div>';
  }
  html += '<div style="margin-top:14px;font-size:9px;color:#445;text-align:center;">Шанс выпадения — вероятность относительно других предметов этажа</div>';
  html += '<button onclick="closeFloorLootModal()" style="width:100%;margin-top:14px;padding:10px;font-size:12px;font-family:Courier New,monospace;border-radius:8px;border:1.5px solid #2a2a5a;background:rgba(255,255,255,0.04);color:#778;cursor:pointer;">Закрыть</button>';
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
    var avgXp   = Math.round(f.baseXp.reduce(function(a,b){return a+b;},0) / f.baseXp.length * f.xpMult);
    var maxXp   = Math.round(Math.max.apply(null, f.baseXp) * f.xpMult);
    var avgGold = Math.round(f.baseGold.reduce(function(a,b){return a+b;},0) / f.baseGold.length * f.goldMult);
    var maxGold = Math.round(Math.max.apply(null, f.baseGold) * f.goldMult);
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
//  ВКЛАДКА РЕЙТИНГА
// ═══════════════════════════════
function renderRating() {
  const cp      = calcCP();
  const myEntry = { name: '👤 Ты', cp, isMe: true };
  const all     = [...FAKE_PLAYERS, myEntry].sort((a, b) => b.cp - a.cp);
  const medals  = ['🥇', '🥈', '🥉'];
  document.getElementById('ratingBody').innerHTML =
    '<div style="font-size:10px;color:#778;margin-bottom:12px;">Топ игроков по Боевой мощи</div>' +
    all.map((p, i) =>
      `<div class="rating-row" style="${p.isMe ? 'border-color:#fa0;background:rgba(245,197,66,0.06)' : ''}">
        <div class="rating-rank">${medals[i] || (i + 1)}</div>
        <div class="rating-name">${p.name}</div>
        <div class="rating-cp"><svg width="12" height="12" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated;vertical-align:middle"><rect x="4" y="0" width="2" height="7" fill="#ffaa00"/><rect x="2" y="3" width="6" height="2" fill="#ffaa00"/><rect x="4" y="7" width="2" height="1" fill="#c8850a"/><rect x="3" y="8" width="4" height="1" fill="#c8850a"/><rect x="4" y="9" width="2" height="1" fill="#c8850a"/></svg> ${p.cp}</div>
      </div>`
    ).join('');
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
//  ВКЛАДКА КОШЕЛЬКА
// ═══════════════════════════════
function renderWallet() {
  const cp = calcCP();
  const pixr = G.pixr || 0;
  const gram = (G.gram || 0).toFixed(3);
  const canExchange = pixr >= 1000;
  const coinSvg = `<svg width="16" height="16" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated;vertical-align:middle"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>`;
  document.getElementById('walletBody').innerHTML = `
    <div class="wallet-card">
      <div class="wallet-label">PIXR</div>
      <div class="wallet-val" style="display:flex;align-items:center;gap:6px;">
        <img src="images/pixr.png" style="width:24px;height:24px;object-fit:contain;image-rendering:pixelated;">
        <span style="color:#ff44cc;font-size:22px;font-weight:bold;">${pixr}</span>
      </div>
      <div class="wallet-sub">Падает с монстров. Шанс ×1.5 каждый этаж</div>
    </div>
    <div class="wallet-card">
      <div class="wallet-label">GRAM</div>
      <div class="wallet-val" style="display:flex;align-items:center;gap:6px;">
        <img src="images/gram.png" style="width:24px;height:24px;object-fit:contain;image-rendering:pixelated;">
        <span style="color:#40d0ff;font-size:22px;font-weight:bold;">${gram}</span>
      </div>
      <div class="wallet-sub">Получается обменом PIXR → GRAM (1000:1)</div>
      <div class="wallet-actions" style="margin-top:10px;">
        <div class="wallet-btn dep" style="opacity:${canExchange?1:0.4};pointer-events:${canExchange?'auto':'none'};display:flex;align-items:center;justify-content:center;gap:6px;"
          onclick="exchangePixr()">
          <svg width="14" height="14" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="0" y="3" width="6" height="2" fill="currentColor"/><rect x="4" y="1" width="2" height="2" fill="currentColor"/><rect x="4" y="5" width="2" height="2" fill="currentColor"/><rect x="4" y="5" width="6" height="2" fill="currentColor"/><rect x="4" y="3" width="2" height="2" fill="currentColor"/><rect x="4" y="7" width="2" height="2" fill="currentColor"/></svg>
          Обменять 1000 PIXR → 1 GRAM
        </div>
      </div>
      ${!canExchange ? `<div style="font-size:10px;color:#556;margin-top:6px;text-align:center;">Нужно минимум 1000 PIXR (у тебя ${pixr})</div>` : ''}
    </div>
    <div class="wallet-card">
      <div class="wallet-label">Статистика</div>
      <div class="stats-grid">
        <div class="stat-cell"><div class="stat-icon">${swordStatSvg('#ffaa00')}</div><div class="stat-label">Боевая мощь</div><div class="stat-val">${cp}</div></div>
        <div class="stat-cell"><div class="stat-icon">${skullSvg()}</div><div class="stat-label">Убийств</div><div class="stat-val">${G.killCount}</div></div>
        <div class="stat-cell"><div class="stat-icon">${cupSvg()}</div><div class="stat-label">Уровень</div><div class="stat-val">${G.level}</div></div>
        <div class="stat-cell"><div class="stat-icon">${towerSvg()}</div><div class="stat-label">Этаж</div><div class="stat-val">${G.floor} / ${FLOORS.length}</div></div>
        <div class="stat-cell"><div class="stat-icon">${swordStatSvg('#ff6060')}</div><div class="stat-label">Атака</div><div class="stat-val">${G.stats.atk}</div></div>
        <div class="stat-cell"><div class="stat-icon">${shieldSvg()}</div><div class="stat-label">Защита</div><div class="stat-val">${G.stats.def}</div></div>
        <div class="stat-cell"><div class="stat-icon">${windSvg()}</div><div class="stat-label">Скорость</div><div class="stat-val">${G.stats.spd}</div></div>
        <div class="stat-cell"><div class="stat-icon">${critSvg()}</div><div class="stat-label">Крит %</div><div class="stat-val">${G.stats.crit}%</div></div>
        <div class="stat-cell"><div class="stat-icon">${dodgeSvg()}</div><div class="stat-label">Уклон %</div><div class="stat-val">${G.stats.dodge}%</div></div>
        <div class="stat-cell"><div class="stat-icon">${heartSvg()}</div><div class="stat-label">Макс. HP</div><div class="stat-val">${G.maxHp}</div></div>
        <div class="stat-cell"><div class="stat-icon">${atkSpdSvg()}</div><div class="stat-label">Ск. атаки</div><div class="stat-val">${(G.stats.atkSpd||1).toFixed(2)}x</div></div>
      </div>
    </div>`;
}

function exchangePixr() {
  if ((G.pixr || 0) < 1000) return;
  G.pixr -= 1000;
  G.gram = parseFloat(((G.gram || 0) + 1).toFixed(3));
  updateHUD();
  renderWallet();
}

// ═══════════════════════════════
//  ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ═══════════════════════════════
function switchTab(tab) {
  activeTab = tab;
  ['game','inv','upgrades','floors','rating','wallet'].forEach(t => {
    const btn = document.getElementById('nav' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === tab);
  });
  document.getElementById('panelInv').classList.toggle('visible',      tab === 'inv');
  document.getElementById('panelUpgrades').classList.toggle('visible', tab === 'upgrades');
  document.getElementById('panelFloors').classList.toggle('visible',   tab === 'floors');
  document.getElementById('panelRating').classList.toggle('visible',   tab === 'rating');
  document.getElementById('panelWallet').classList.toggle('visible',   tab === 'wallet');
  var hudEl = document.getElementById('skillsHud');
  if (hudEl) hudEl.classList.toggle('visible', tab === 'game' && !!G_CHAR);
  var isGame = tab === 'game' && !!G_CHAR;
  var bpBtn = document.getElementById('bpHudBtn');
  var premBtn = document.querySelector('.prem-hud-btn');
  if (bpBtn)   bpBtn.style.display   = isGame ? 'flex' : 'none';
  if (premBtn) premBtn.style.display = isGame ? 'flex' : 'none';

  if (tab === 'inv')      { _invSelectMode = false; _invSelected = {}; renderInventory(); }
  if (tab === 'upgrades') renderUpgrades();
  if (tab === 'floors')   renderFloors();
  if (tab === 'rating')   renderRating();
  if (tab === 'wallet')   renderWallet();
}

// ═══════════════════════════════
//  ЭКРАН ВЫБОРА ПЕРСОНАЖА
// ═══════════════════════════════
let _csSelected      = null;
let _csParticleTimer = null;
let _csSpriteTimers  = {};
let _csIdleImgs      = {};
let G_CHAR           = null;  // задаётся после выбора

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
}

// Установка спрайтов/анимаций персонажа (без сброса статов).
// Вынесено отдельно, чтобы загрузка с сервера не затирала прокачку.
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
  // аватар теперь SVG, не трогаем
}

function startGame() {
  resize(); updateHUD(); initSkillsHud(); updatePotionHud();
  spawnMonster(player.worldX + W * 0.65);
  requestAnimationFrame(function(ts) { lastTime = ts; loop(ts); });
}

// ── Анимация спрайтов на экране выбора персонажа ──
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

// ── Фоновые частицы на экране выбора ──
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

// ── Инициализация экрана выбора при загрузке страницы ──
window.addEventListener('load', function() {
  initCharSelectSprites();
  initCsParticles();
});

// ── resize и Telegram SDK ──
window.addEventListener('resize', resize);
if (window.Telegram && window.Telegram.WebApp) {
  Telegram.WebApp.ready();
  Telegram.WebApp.expand();
}

/*
  ══════════════════════════════════════════════════════
  game.js — Игровая логика (update loop)
  Содержит: объект player, спавн монстров, шаблоны врагов,
  боевую систему, снаряды, частицы, XP/лвл-ап,
  проверку открытия этажей, game over, HUD update,
  touch-управление, главный игровой цикл (loop)
  ══════════════════════════════════════════════════════
*/

// ── Объект игрока ──
const player = {
  worldX: 120, y: 0,
  w: 128, h: 128,
  frame: 0, frameTimer: 0,
  state: 'run', stateTimer: 0,
  invincible: 0, attackCooldown: 0,
};

// ── Игровые переменные ──
let monsters       = [];
// ── Зелья ──
if (!G.potions)          G.potions = 0;
if (!G.potionThreshold)  G.potionThreshold = 30;
let potionCooldown = 0;
let nextMonsterSpawn = 600;
let particles      = [];
let activeTab      = 'game';
let lastTime       = 0;
let gameActive     = true;
let gInBattle      = false;

// ── Константы боя ──
const FIGHT_DIST       = 110;
const BASE_ATK_COOLDOWN = 2.5;
const ATK_ANIM_DUR     = 0.4;

let atkCooldownTimer = 0;
let atkAnimTimer     = -1;
let atkFired         = false;
let atkTarget        = null;
let atkDmg           = 0, atkCrit = false;

// ── Боевые скорости ──
function playerSpeed()         { return 120 + G.stats.spd * 12; }
function monsterAtkInterval()  { return Math.max(1.0, 2.5 - G.stats.def * 0.015); }
function getAtkCooldown()      { return Math.max(0.5, BASE_ATK_COOLDOWN / effectiveAtkSpd()); }

// ═══════════════════════════════
//  ШАБЛОНЫ МОНСТРОВ
// ═══════════════════════════════
function monsterTemplate() {
  const f = G.floor;
  const floor1 = [
    { name: 'Гоблин',       emoji: '👺', hp: 30  + f*15, atk: 5  + f*2, xp: 15,  gold: 8,   color: '#3a3', sk: 'goblin'    },
    { name: 'Гриб',         emoji: '🍄', hp: 25  + f*10, atk: 3  + f*1, xp: 10,  gold: 5,   color: '#a63', sk: 'mushroom'  },
    { name: 'Скелет',       emoji: '💀', hp: 45  + f*20, atk: 8  + f*3, xp: 25,  gold: 12,  color: '#aab', sk: 'skeleton'  },
  ];
  const floor2 = [
    { name: 'Ледяной голем', emoji: '🧊', hp: 130 + f*30, atk: 20 + f*5, xp: 40,  gold: 20,  color: '#4af', sk: 'icegolem'   },
    { name: 'Голем земли',   emoji: '🪨', hp: 150 + f*35, atk: 22 + f*5, xp: 45,  gold: 22,  color: '#963', sk: 'earthgolem' },
  ];
  const floor3 = [
    { name: 'Демон',   emoji: '😈', hp: 220 + f*40, atk: 36 + f*8, xp: 70,  gold: 40,  color: '#f44', sk: null },
    { name: 'Феникс',  emoji: '🦅', hp: 180 + f*35, atk: 30 + f*7, xp: 60,  gold: 35,  color: '#fa4', sk: null },
  ];
  const floor4 = [
    { name: 'Зомби воин',  emoji: '🧟', hp: 380 + f*55, atk: 50 + f*11, xp: 110, gold: 60,  color: '#5a3', sk: 'zwarrior' },
    { name: 'Зомби палач', emoji: '🧟', hp: 420 + f*60, atk: 55 + f*12, xp: 120, gold: 65,  color: '#383', sk: 'zexec'    },
    { name: 'Зомби',       emoji: '🧟', hp: 350 + f*50, atk: 45 + f*10, xp: 100, gold: 55,  color: '#4a2', sk: 'zombie'   },
  ];
  const floor5 = [
    { name: 'Тень', emoji: '👻', hp: 600 + f*70, atk: 72 + f*14, xp: 180, gold: 100, color: '#a4f', sk: null },
  ];
  if (f >= 5) {
    const all = [floor1, floor2, floor3, floor4].flat().concat(floor5);
    return { ...all[Math.floor(Math.random() * all.length)] };
  }
  const pools = [floor1, floor2, floor3, floor4, floor5];
  const pool = pools[f - 1];
  return { ...pool[Math.floor(Math.random() * pool.length)] };
}

// ── Спавн монстра ──
function spawnMonster(wx) {
  const t = monsterTemplate();
  monsters.push({
    worldX: wx, y: GROUND - 96, w: 96, h: 96,
    hp: t.hp, maxHp: t.hp, atk: t.atk,
    xp: t.xp, gold: t.gold,
    name: t.name, emoji: t.emoji, color: t.color,
    sk: t.sk || null,
    frame: 0, state: 'idle',
    attackTimer: 0, hitFlash: 0,
    isAttacking: false, attackAnimTimer: 0,
    _attackTimeout: null,
  });
}

// ═══════════════════════════════
//  ЧАСТИЦЫ (визуальные эффекты)
// ═══════════════════════════════
function spawnParticles(wx, wy, color, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      worldX: wx, y: wy,
      vx: (Math.random() - 0.5) * 120,
      vy: -(Math.random() * 80 + 30),
      size: 2 + (Math.random() * 3 | 0),
      color, life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
    });
  }
}

// ── Всплывающий текст урона ──
function showDmgPop(text, screenX, screenY, color) {
  const el = document.createElement('div');
  el.className = 'dmg-pop';
  el.textContent = text;
  el.style.cssText = 'left:' + (screenX - 20) + 'px;top:' + screenY + 'px;color:' + color + ';';
  document.getElementById('app').appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// ═══════════════════════════════
//  UPDATE — главный игровой тик
// ═══════════════════════════════
function update(dt) {
  if (!gameActive) return;

  // ── Авто-зелье ──
  if (potionCooldown > 0) potionCooldown -= dt;
  if (G.potions > 0 && potionCooldown <= 0 && G.hp > 0 &&
      (G.hp / G.maxHp * 100) <= G.potionThreshold) {
    G.potions--;
    var _heal = Math.ceil(G.maxHp * potionHealPct() / 100);
    G.hp = Math.min(G.maxHp, G.hp + _heal);
    potionCooldown = 3;
    updatePotionHud();
    updateHUD();
    showDmgPop('+' + _heal + ' HP', PLAYER_SCREEN_X, player.y - 10, '#2ecc71');
  }
  // Визуал кулдауна зелья
  (function() {
    var fill = document.getElementById('potionFill');
    var cdNum = document.getElementById('potionCd');
    if (!fill || !cdNum) return;
    if (potionCooldown > 0) {
      fill.style.display = 'block';
      fill.style.height = (potionCooldown / 3 * 100) + '%';
      fill.style.top = 'auto'; fill.style.bottom = '0';
      cdNum.textContent = Math.ceil(potionCooldown);
    } else {
      fill.style.display = 'none';
      cdNum.textContent = '';
    }
  })();

  updateSkills(dt);

  const target = monsters.reduce(function(best, m) {
    const d = m.worldX - player.worldX;
    if (d > 0 && d < FIGHT_DIST * 2) return (!best || d < best.d) ? { m: m, d: d } : best;
    return best;
  }, null);
  gInBattle = !!target;

  if (player.state !== 'dead') {
    if (!gInBattle) {
      player.worldX += playerSpeed() * dt;
      atkCooldownTimer = 0;
    }
    spriteRunTime += dt;
    worldX = player.worldX - PLAYER_SCREEN_X;

    if (player.invincible > 0) player.invincible -= dt;
    if (player.state === 'hurt' && player.invincible <= 0) player.state = 'run';
    if (atkCooldownTimer > 0) atkCooldownTimer -= dt;

    if (gInBattle) {
      if (atkAnimTimer >= 0) {
        atkAnimTimer += dt;
        if (atkAnimTimer >= ATK_ANIM_DUR) atkAnimTimer = -1;
      }
      if (atkAnimTimer >= 0 && !atkFired &&
          atkAnimTimer >= ATK_ANIM_DUR * (ATK_FRAMES - 1) / ATK_FRAMES) {
        atkFired = true;
        const _ptype = G_CHAR ? G_CHAR.id : 'fire';
        if (_ptype === 'light') {
          // Молния — мгновенный урон, объект только для анимации вспышки
          var _m = atkTarget;
          var _dmg = atkDmg;
          if (_m && _m.hp > 0) {
            if (_m._cursed && _m._defDebuff) _dmg = Math.floor(_dmg * (1 + _m._defDebuff));
            _m.hp -= _dmg;
            _m.hitFlash = 0.15;
            spawnParticles(_m.worldX, _m.y + 10, '#ffe066', 10);
            showDmgPop(atkCrit ? _dmg + '!' : _dmg, _m.worldX - worldX, _m.y - 5, atkCrit ? '#fff566' : '#ffe066');
          }
          fireballs.push({
            worldX: player.worldX + 40, y: player.y + 120,
            targetM: atkTarget, speed: 9999, dmg: 0, crit: atkCrit, angle: 0,
            ptype: 'light', life: 0.15, maxLife: 0.15
          });
        } else {
          fireballs.push({
            worldX: player.worldX + 40, y: player.y + 60,
            targetM: atkTarget, speed: 600, dmg: atkDmg, crit: atkCrit, angle: 0,
            ptype: _ptype
          });
        }
      }
      if (atkCooldownTimer <= 0 && atkAnimTimer < 0) {
        atkCooldownTimer = getAtkCooldown();
        atkAnimTimer = 0; atkFired = false;
        atkTarget = target.m;
        atkCrit = Math.random() * 100 < effectiveCrit();
        atkDmg = Math.floor(G.stats.atk * (0.85 + Math.random() * 0.3));
        if (atkCrit) atkDmg = Math.floor(atkDmg * 1.8);
      }
    } else {
      atkAnimTimer = -1; atkFired = false;
    }
  }

  if (player.worldX + W * 0.78 > nextMonsterSpawn) {
    spawnMonster(nextMonsterSpawn + W * 0.5);
    nextMonsterSpawn += 300 + Math.random() * 250;
  }

  // ── ИИ монстров ──
  monsters.forEach(m => {
    const distToPlayer = m.worldX - player.worldX;

    if (m.isAttacking) {
      m.attackAnimTimer += dt;
      if (m.attackAnimTimer >= 0.4) { m.isAttacking = false; m.attackAnimTimer = 0; }
    }

    if (distToPlayer > 105 && player.state !== 'dead' && !m.isAttacking && !m._frozen) {
      m.state = 'run';
      const speed = (30 + G.floor * 5) * 1.5;
      m.worldX -= speed * dt;
    } else if (!m.isAttacking) {
      m.state = 'idle';
    }

    m.frame++;
    if (m.frame > 1000) m.frame = 0;
    if (m.hitFlash > 0) m.hitFlash -= dt;
    if (m._frozen) m.hitFlash = 0.08;

    const dist = m.worldX - player.worldX;
    if (dist > 0 && dist < 105 && player.state !== 'dead' && !m.isAttacking && !m._frozen) {
      m.attackTimer -= dt;
      if (m.attackTimer <= 0) {
        m.isAttacking = true; m.attackAnimTimer = 0;
        m.attackTimer = monsterAtkInterval();
        m._attackTimeout = setTimeout(() => {
          if (player.invincible <= 0 && m.hp > 0) {
            const dodge = Math.random() * 100 < G.stats.dodge;
            if (!dodge) {
              const dmg = Math.max(1, Math.floor(m.atk - effectiveDef() * 0.4 + Math.random() * 3));
              G.hp = Math.max(0, G.hp - dmg);
              player.state = 'hurt'; player.invincible = 0.6;
              spawnParticles(player.worldX, player.y + 18, '#f44', 5);
              showDmgPop(dmg, PLAYER_SCREEN_X, player.y, '#f44');
              // Отражение урона (скилл Люмос)
              if (skillBuffs.reflect && skillBuffs.reflect.timer > 0 && m.hp > 0) {
                var refDmg = Math.max(1, Math.floor(dmg * skillBuffs.reflect.pct));
                m.hp = Math.max(0, m.hp - refDmg);
                m.hitFlash = 0.1;
                showDmgPop('↩' + refDmg, m.worldX - worldX, m.y - 5, '#aaffff');
              }
              updateHUD();
              if (G.hp <= 0) { player.state = 'dead'; gameOverSequence(); }
            } else {
              showDmgPop('DODGE', PLAYER_SCREEN_X, player.y - 10, '#2ef');
            }
          }
          m._attackTimeout = null;
        }, 200);
      }
    }
  });

  // ── Движение снарядов ──
  fireballs = fireballs.filter(function(fb) {
    // Молния — только анимация, урон уже нанесён
    if (fb.ptype === 'light') {
      fb.life -= dt;
      return fb.life > 0;
    }
    var tx = fb.targetM.worldX, ty = fb.targetM.y + fb.targetM.h * 0.4;
    var dx = tx - fb.worldX, dy = ty - fb.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    fb.angle += dt * 8;
    if (dist < 20) {
      var dmg = fb.dmg;
      if (fb.targetM._cursed && fb.targetM._defDebuff) dmg = Math.floor(dmg * (1 + fb.targetM._defDebuff));
      fb.targetM.hp -= dmg;
      fb.targetM.hitFlash = 0.12;
      spawnParticles(fb.targetM.worldX, fb.targetM.y + 10, fb.skillColor || '#f80', 8);
      var mx2 = fb.targetM.worldX - worldX;
      showDmgPop(fb.crit ? dmg + '!' : dmg, mx2, fb.targetM.y - 5, fb.crit ? '#fa0' : '#fff');
      if (fb.onHit) fb.onHit(dmg);
      // Вампиризм Люмоса (1% лечение)
      if (G_CHAR && G_CHAR.perk === 'life_drain') {
        var heal = Math.max(1, Math.floor(dmg * 0.01));
        G.hp = Math.min(G.maxHp, G.hp + heal);
        updateHUD();
      }
      return false;
    }
    fb.worldX += (dx / dist) * fb.speed * dt;
    fb.y      += (dy / dist) * fb.speed * dt;
    return true;
  });

  // ── Обновление частиц ──
  particles = particles.filter(p => {
    p.worldX += p.vx * dt; p.y += p.vy * dt;
    p.vy += 300 * dt; p.life -= dt;
    return p.life > 0;
  });

  // ── Смерть монстров — награда ──
  monsters = monsters.filter(m => {
    if (m.hp <= 0) {
      if (m._attackTimeout) clearTimeout(m._attackTimeout);
      spawnParticles(m.worldX, m.y, m.color, 12);
      gainXP(Math.floor(m.xp * premMult('xp')));
      G.gold += Math.floor(m.gold * premMult('gold'));
      G.killCount++;
      tryDropItem(G.floor);
      var pixrChance = 0.3 * Math.pow(1.5, G.floor - 1) * premMult('pixr');
      if (Math.random() * 100 < pixrChance) {
        G.pixr = (G.pixr || 0) + 1;
        showDmgPop('+1 PIXR', m.worldX - player.worldX + W * 0.5, GROUND * 0.4, '#ff44cc');
      }
      updateHUD();
      checkFloorUnlock();
      return false;
    }
    return true;
  });

  // Удаляем монстров далеко позади
  monsters = monsters.filter(m => m.worldX > player.worldX - W * 0.6);
}

// ── Получение опыта и повышение уровня ──
function gainXP(amount) {
  G.xp += amount;
  while (G.xp >= G.xpNeeded) {
    G.xp -= G.xpNeeded;
    G.level++;
    G.xpNeeded = Math.floor(G.xpNeeded * 1.4);
    G.baseStats.atk += 2;
    G.baseStats.def += 1;
    G.baseStats.hp  += 10;
    G.baseStats.atkSpd = parseFloat(((G.baseStats.atkSpd || 1.0) + 0.02).toFixed(4));
    recalcStats();
    G.hp = G.maxHp;
    showDmgPop('LV UP!', W * 0.4, GROUND * 0.5, '#fa0');
    updateHUD();
  }
}

// ── Проверка открытия следующего этажа ──
var _shownUnlocks = {};
function checkFloorUnlock() {
  const cp   = calcCP();
  const next = nextFloorCfg();
  if (G.floor < FLOORS.length && cp >= next.cpReq && G.floor === next.n - 1 && !_shownUnlocks[next.n]) {
    _shownUnlocks[next.n] = true;
    G.maxFloor = Math.max(G.maxFloor, next.n);
    const fu = document.getElementById('floorUnlock');
    document.getElementById('fuText').textContent = 'Этаж ' + next.n + ': ' + next.name + ' · Зайди через Этажи';
    fu.classList.remove('show'); void fu.offsetWidth; fu.classList.add('show');
    setTimeout(function() { fu.classList.remove('show'); }, 3500);
  }
}

// ── Game Over (воскрешение с 30% HP через 2 сек) ──
function gameOverSequence() {
  var penalty = Math.floor(G.gold * 0.05);
  G.gold = Math.max(0, G.gold - penalty);
  var modal = document.getElementById('deathModal');
  var txt   = document.getElementById('deathPenaltyText');
  if (txt) {
    txt.textContent = penalty > 0
      ? 'Вы потеряли ' + penalty + ' золота (5%)'
      : 'Вы погибли в бою';
  }
  if (modal) modal.classList.remove('hidden');
}

function revivePlayer() {
  var modal = document.getElementById('deathModal');
  if (modal) modal.classList.add('hidden');
  G.hp = Math.floor(G.maxHp * 0.3);
  player.state = 'run';
  player.invincible = 2.0;
  updateHUD();
}

// ═══════════════════════════════
//  HUD UPDATE — обновление полосок HP/XP и цифр
// ═══════════════════════════════
function updateHUD() {
  const hpPct = Math.max(0, (G.hp / G.maxHp) * 100);
  const xpPct = Math.min(100, (G.xp / G.xpNeeded) * 100);
  document.getElementById('barHp').style.width = hpPct + '%';
  document.getElementById('barXp').style.width = xpPct + '%';
  document.getElementById('valHp').textContent = G.hp + '/' + G.maxHp;
  document.getElementById('valXp').textContent = 'Lv.' + G.level;
  document.getElementById('hudGold').textContent = G.gold;
  document.getElementById('hudPixr').textContent = (G.pixr || 0);
  document.getElementById('hudFloor').textContent = G.floor;
  document.getElementById('hudCp').textContent = calcCP();
}

// ═══════════════════════════════
//  TOUCH / TAP — атака при тапе на монстра
// ═══════════════════════════════
canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  if (activeTab !== 'game') return;
  if (player.attackCooldown <= 0) {
    const nearest = monsters.reduce(function(best, m) {
      const d = Math.abs(m.worldX - player.worldX);
      return (!best || d < best.d) ? { m, d } : best;
    }, null);
    if (nearest && nearest.d < 200) attackMonster(nearest.m);
  }
}, { passive: false });

function attackMonster(m) {}

// ═══════════════════════════════
//  ВСПЫШКА (красная при нехватке золота/CP)
// ═══════════════════════════════
function flashRed() {
  const hud = document.getElementById('hud');
  hud.style.background = 'rgba(200,0,0,0.5)';
  setTimeout(() => hud.style.background = '', 300);
}

// ═══════════════════════════════
//  ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ
// ═══════════════════════════════
function loop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

// ═══════════════════════════════
//  ЗЕЛЬЯ
// ═══════════════════════════════
function updatePotionHud() {
  var el = document.getElementById('potionCount');
  if (el) el.textContent = G.potions;
}
function potionUpgCost() {
  return Math.floor(1000 * Math.pow(2, G.potionLv));
}
function potionHealPct() {
  return (1 + (G.potionLv || 0));
}
function openPotionModal() {
  document.getElementById('pmCount').textContent = G.potions;
  document.getElementById('pmGold').textContent = G.gold;
  document.getElementById('pmThreshold').value = G.potionThreshold;
  var lv = G.potionLv || 0;
  document.getElementById('pmPotionLv').textContent = potionHealPct() + '%';
  document.getElementById('pmPotionLvNum').textContent = lv + '/10';
  var costEl = document.getElementById('pmUpgCost');
  if (costEl) costEl.textContent = lv >= 10 ? 'МАКС' : potionUpgCost();
  document.getElementById('potionModal').classList.remove('hidden');
}
function upgPotion() {
  var lv = G.potionLv || 0;
  if (lv >= 10) return;
  var cost = potionUpgCost();
  if (G.gold < cost) { showDmgPop('Мало монет', PLAYER_SCREEN_X, player.y - 20, '#f44'); return; }
  G.gold -= cost;
  G.potionLv = lv + 1;
  updateHUD();
  openPotionModal();
}
function closePotionModal() {
  document.getElementById('potionModal').classList.add('hidden');
}
function buyPotions(n) {
  var cost = n * 5;
  if (G.gold < cost) { return; }
  G.gold -= cost;
  G.potions += n;
  updateHUD();
  updatePotionHud();
  document.getElementById('pmCount').textContent = G.potions;
  document.getElementById('pmGold').textContent = G.gold;
}
function savePotionThreshold(val) {
  var v = parseInt(val);
  if (v >= 1 && v <= 99) G.potionThreshold = v;
}

// ═══════════════════════════════
//  BATTLE PASS
// ═══════════════════════════════
const BP_REWARDS = [
  { lv: 5,  icon: '💰', desc: '5 000 золота',
    apply: function() { G.gold += 5000; updateHUD(); } },
  { lv: 10, iconFn: function() { var cls = G_CHAR ? G_CHAR.id : 'fire'; var p={fire:'wf',light:'wl',water:'ww'}[cls]||'wf'; return '<img src="images/'+p+'e.png" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;">'; }, desc: 'Оружие Lv.10 Epic (свой класс)',
    apply: function() {
      if (!G_CHAR) return;
      var st = STAFF_TYPES.find(function(s) { return s.forClass === G_CHAR.id; }) || STAFF_TYPES[0];
      var base = 10 * 2.5, mult = 1 + 3 * 0.55;
      var stats = {};
      st.stats.forEach(function(s) {
        var val = Math.floor(base * mult * (s === st.primary ? 1.0 : 0.45) * 1.0);
        if (val > 0) stats[s] = val;
      });
      var item = { id: ++_invIdCounter, slot: 'weapon', name: st.name,
        icon: itemIcon('weapon', 'epic', st.forClass),
        rarity: 'epic', level: 10, stats: stats,
        forClass: st.forClass, classLabel: st.classLabel, classColor: st.classColor };
      G.inventory.push(item);
      if (typeof renderInventory === 'function') renderInventory();
    }},
  { lv: 15, iconFn: function() { return '<img src="images/ringe.png" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;">'; }, desc: 'Кольцо Lv.10 Epic',
    apply: function() {
      var base = 10 * 2.5, mult = 1 + 3 * 0.55;
      var stats = { def: Math.floor(base * mult * 1.0), dodge: Math.floor(base * mult * 0.45) };
      var item = { id: ++_invIdCounter, slot: 'ring', name: 'Кольцо битвы',
        icon: itemIcon('ring', 'epic', null), rarity: 'epic', level: 10, stats: stats };
      G.inventory.push(item);
      if (typeof renderInventory === 'function') renderInventory();
    }},
  { lv: 20, icon: '💰', desc: '20 000 золота',
    apply: function() { G.gold += 20000; updateHUD(); } },
  { lv: 25, iconFn: function() { return '<img src="images/pixr.png" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;">'; }, desc: '100 PIXR',
    apply: function() { G.pixr = (G.pixr||0) + 100; updateHUD(); } },
  { lv: 30, iconFn: function() { var cls = G_CHAR ? G_CHAR.id : 'fire'; var p={fire:'wf',light:'wl',water:'ww'}[cls]||'wf'; return '<img src="images/'+p+'l.png" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;">'; }, desc: 'Оружие Lv.20 Legendary (свой класс)',
    apply: function() {
      if (!G_CHAR) return;
      var st = STAFF_TYPES.find(function(s) { return s.forClass === G_CHAR.id; }) || STAFF_TYPES[0];
      var base = 20 * 2.5, mult = 1 + 4 * 0.55;
      var stats = {};
      st.stats.forEach(function(s) {
        var val = Math.floor(base * mult * (s === st.primary ? 1.0 : 0.45));
        if (val > 0) stats[s] = val;
      });
      var bonus = ['atk','def','hp','crit','dodge','spd'].filter(function(s) { return !stats[s]; });
      if (bonus.length) stats[bonus[0]] = Math.floor(base * 0.5);
      var item = { id: ++_invIdCounter, slot: 'weapon', name: st.name,
        icon: itemIcon('weapon', 'legend', st.forClass),
        rarity: 'legend', level: 20, stats: stats,
        forClass: st.forClass, classLabel: st.classLabel, classColor: st.classColor };
      G.inventory.push(item);
      if (typeof renderInventory === 'function') renderInventory();
    }},
  { lv: 35, icon: '💰', desc: '100 000 золота',
    apply: function() { G.gold += 100000; updateHUD(); } },
  { lv: 40, iconFn: function() { return '<img src="images/pixr.png" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;">'; }, desc: '200 PIXR',
    apply: function() { G.pixr = (G.pixr||0) + 200; updateHUD(); } },
  { lv: 50, icon: '💰', desc: '500 000 золота',
    apply: function() { G.gold += 500000; updateHUD(); } },
  { lv: 60, iconFn: function() { return '<img src="images/pixr.png" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;">'; }, desc: '1000 PIXR',
    apply: function() { G.pixr = (G.pixr||0) + 1000; updateHUD(); } },
];

function openBattlePass() {
  if (!G.bp) G.bp = { active: false, claimed: [] };
  renderBattlePass();
  document.getElementById('bpModal').classList.remove('hidden');
}
function closeBattlePass() {
  document.getElementById('bpModal').classList.add('hidden');
}
function buyBattlePass() {
  if (!G.bp) G.bp = { active: false, claimed: [] };
  if (G.bp.active) return;
  if ((G.gram || 0) < 10) {
    showDmgPop('Мало GRAM', PLAYER_SCREEN_X, player.y - 20, '#f44');
    return;
  }
  G.gram = parseFloat(((G.gram || 0) - 10).toFixed(3));
  G.bp.active = true;
  renderBattlePass();
}
function claimBpReward(idx) {
  if (!G.bp || !G.bp.active) return;
  if (!G.bp.claimed) G.bp.claimed = [];
  if (G.bp.claimed.indexOf(idx) !== -1) return;
  var r = BP_REWARDS[idx];
  if (G.level < r.lv) return;
  r.apply();
  G.bp.claimed.push(idx);
  renderBattlePass();
}
function renderBattlePass() {
  if (!G.bp) G.bp = { active: false, claimed: [] };
  var active = G.bp.active;
  var claimed = G.bp.claimed || [];

  // Статус
  var statusEl = document.getElementById('bpStatus');
  if (active) {
    statusEl.innerHTML = '✅ Battle Pass активен · Уровень <b>' + G.level + '</b>';
    statusEl.style.color = '#ffd700';
  } else {
    statusEl.innerHTML = '🔒 Battle Pass не активен · Ваш GRAM: <b>' + (G.gram||0).toFixed(3) + '</b>';
    statusEl.style.color = '#aaa';
  }

  // Кнопка покупки
  var buyRow = document.getElementById('bpBuyRow');
  buyRow.classList.toggle('hidden', active);

  // Список наград
  var list = document.getElementById('bpRewardsList');
  list.innerHTML = '';
  BP_REWARDS.forEach(function(r, idx) {
    var isClaimed  = claimed.indexOf(idx) !== -1;
    var isAvail    = active && !isClaimed && G.level >= r.lv;
    var isLocked   = !active || G.level < r.lv;
    var row = document.createElement('div');
    row.className = 'bp-reward-row' + (isClaimed ? ' bp-claimed' : isAvail ? ' bp-available' : '');
    var lvClass  = isLocked && !isClaimed ? 'bp-reward-lv-locked' : '';
    var descClass = isLocked && !isClaimed ? 'bp-reward-desc-locked' : '';
    var actionHtml = '';
    if (isClaimed) {
      actionHtml = '<span class="bp-claimed-label">✓ Получено</span>';
    } else if (isAvail) {
      actionHtml = '<button class="bp-claim-btn" onclick="claimBpReward(' + idx + ')">Забрать</button>';
    } else {
      actionHtml = '<span class="bp-lock-label">' + (active ? 'Lv ' + r.lv : '🔒') + '</span>';
    }
    row.innerHTML =
      '<div class="bp-reward-lv ' + lvClass + '">Lv ' + r.lv + '</div>' +
      '<div class="bp-reward-icon">' + (typeof r.iconFn === 'function' ? r.iconFn() : r.icon) + '</div>' +
      '<div class="bp-reward-desc ' + descClass + '">' + r.desc + '</div>' +
      actionHtml;
    list.appendChild(row);
  });
}

// ═══════════════════════════════
//  PREMIUM
// ═══════════════════════════════
const PREM_TIERS = {
  gold:  { name: 'GOLD',     days: 7,  cost: 10,  xp: 1.5, gold: 1.5, drop: 1.5, pixr: 1,  refine: 0 },
  plat:  { name: 'PLATINUM', days: 7,  cost: 50,  xp: 2,   gold: 2,   drop: 2,   pixr: 2,  refine: 0 },
  ultra: { name: 'ULTRA',    days: 30, cost: 300, xp: 3,   gold: 3,   drop: 3,   pixr: 4,  refine: 20 },
};

function premMult(type) {
  if (!G.prem || !G.prem.tier || Date.now() > G.prem.expiresAt) return 1;
  return PREM_TIERS[G.prem.tier][type] || 1;
}
function premRefineBonus() {
  if (!G.prem || !G.prem.tier || Date.now() > G.prem.expiresAt) return 0;
  return PREM_TIERS[G.prem.tier].refine || 0;
}

function openPremModal() {
  updatePremStatus();
  document.getElementById('premModal').classList.remove('hidden');
}
function closePremModal() {
  document.getElementById('premModal').classList.add('hidden');
}
function updatePremStatus() {
  var el = document.getElementById('premStatus');
  if (!el) return;
  if (!G.prem || !G.prem.tier || Date.now() > G.prem.expiresAt) {
    el.textContent = 'Нет активного Premium';
    el.style.color = '#aaa';
  } else {
    var t = PREM_TIERS[G.prem.tier];
    var left = Math.ceil((G.prem.expiresAt - Date.now()) / 86400000);
    el.innerHTML = '✅ <b>' + t.name + '</b> · Осталось: <b>' + left + ' дн.</b>';
    el.style.color = '#c080ff';
  }
}
function buyPrem(tier) {
  var t = PREM_TIERS[tier];
  if (!t) return;
  if ((G.gram || 0) < t.cost) {
    showDmgPop('Мало GRAM', PLAYER_SCREEN_X, player.y - 20, '#f44');
    return;
  }
  G.gram = parseFloat(((G.gram || 0) - t.cost).toFixed(3));
  // Если уже активен — продлеваем
  var base = (G.prem && G.prem.expiresAt > Date.now()) ? G.prem.expiresAt : Date.now();
  G.prem = { tier: tier, expiresAt: base + t.days * 86400000 };
  updatePremStatus();
  closePremModal();
  showDmgPop('👑 ' + t.name + ' активен!', PLAYER_SCREEN_X, player.y - 30, '#c080ff');
}

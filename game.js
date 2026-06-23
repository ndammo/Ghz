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
if (!G.potions)             G.potions = 0;
if (!G.potionThreshold)     G.potionThreshold = 30;
if (!G.dailyTasks)          G.dailyTasks = { date: '', seconds: 0, claimed: [] };
if (!G.specialTasksClaimed) G.specialTasksClaimed = {};
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
    { name: 'Орк-демон', emoji: '😈', hp: 220 + f*40, atk: 36 + f*8, xp: 70,  gold: 40,  color: '#f44', sk: 'orcdemon' },
    { name: 'Орк-демон', emoji: '🦅', hp: 180 + f*35, atk: 30 + f*7, xp: 60,  gold: 35,  color: '#fa4', sk: 'orcdemon' },
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
    G.xpNeeded = Math.floor(G.xpNeeded * (G.level <= 7 ? 2.5 : 1.1));
    G.baseStats.atk += 2;
    G.baseStats.def += 1;
    G.baseStats.hp  += 10;
    G.baseStats.atkSpd = parseFloat(((G.baseStats.atkSpd || 1.0) + 0.02).toFixed(4));
    recalcStats();
    G.hp = G.maxHp;
    showDmgPop('LV UP!', W * 0.4, GROUND * 0.5, '#fa0');
    updateHUD();
  }
  if (typeof window.onLevelUp === 'function') window.onLevelUp();
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
    if (typeof window.onFloorChange === 'function') window.onFloorChange(G.maxFloor);
  }
}

// ── Game Over (воскрешение с 30% HP через 2 сек) ──
function gameOverSequence() {
  var penalty = Math.floor(G.gold * 0.05);
  G.gold = Math.max(0, G.gold - penalty);
  updateHUD();

  // Если умер во время боя с боссом — откат на предыдущий этаж босса
  if (window._bossActive) {
    window._bossActive = false;
    if (G.boss.floor > 1) {
      G.boss.floor--;
      if (window.GameSync) window.GameSync.saveInstant({ boss: G.boss });
    }
    var modal = document.getElementById('deathModal');
    var txt   = document.getElementById('deathPenaltyText');
    if (txt) txt.textContent = 'Босс победил! Откат на этаж ' + G.boss.floor;
    if (modal) modal.classList.remove('hidden');
    return;
  }

  var modal = document.getElementById('deathModal');
  var txt   = document.getElementById('deathPenaltyText');
  if (txt) {
    txt.textContent = penalty > 0
      ? 'Вы потеряли ' + penalty + ' золота (5%)'
      : 'Вы погибли в бою';
  }
  if (modal) modal.classList.remove('hidden');
}

// ═══════════════════════════════
//  СИСТЕМА БОССОВ
// ═══════════════════════════════
const BOSS_DEFS = [
  { id: 1,  name: 'Король гоблинов',  emoji: '👺', cpReq: 0,    color: '#3a3' },
  { id: 2,  name: 'Ледяной титан',    emoji: '🧊', cpReq: 500,  color: '#4af' },
  { id: 3,  name: 'Демон огня',       emoji: '😈', cpReq: 1200, color: '#f44' },
  { id: 4,  name: 'Повелитель теней', emoji: '👻', cpReq: 2500, color: '#a4f' },
  { id: 5,  name: 'Дракон хаоса',     emoji: '🐉', cpReq: 4500, color: '#f80' },
  { id: 6,  name: 'Архилич',          emoji: '☠️', cpReq: 8000, color: '#88f' },
  { id: 7,  name: 'Зомби-лорд',       emoji: '🧟', cpReq: 14000,color: '#5a3' },
  { id: 8,  name: 'Адский страж',     emoji: '😈', cpReq: 25000,color: '#f22' },
  { id: 9,  name: 'Бог разрушения',   emoji: '👹', cpReq: 45000,color: '#ff4' },
  { id: 10, name: 'Тёмный властелин', emoji: '👑', cpReq: 80000,color: '#ffd700' },
];

// Статы босса: каждый следующий в 2 раза сильнее
function getBossStats(bossId) {
  var base = { hp: 1000, atk: 30 };
  var mult = Math.pow(2, bossId - 1);
  return {
    hp:  Math.floor(base.hp  * mult),
    atk: Math.floor(base.atk * mult),
  };
}

// Награды с босса
function getBossReward(bossId) {
  var pixr  = Math.min(5, 1 + Math.floor((bossId - 1) / 2)); // 1→1, 3→2, 5→3, 7→4, 9→5
  pixr = Math.max(1, pixr) * Math.pow(2, bossId - 1);        // каждый босс х2
  pixr = Math.min(Math.floor(pixr), 160);                     // cap
  var gold  = 1000 * Math.pow(2, bossId - 1);
  var xp    = 500  * Math.pow(2, bossId - 1);
  // Случайный предмет (оружие или броня) на уровне boss*2
  var slots = ['weapon','body','helmet','ring','boots'];
  var slot  = slots[Math.floor(Math.random() * slots.length)];
  var rarities = ['common','uncommon','rare','epic','legend'];
  var rarIdx = Math.min(bossId - 1, rarities.length - 1);
  var rarity = rarities[rarIdx];
  var itemLv = bossId * 2;
  var mult   = 1 + rarIdx * 0.55;
  var base   = itemLv * 2.5;
  var stats  = {};
  if (slot === 'weapon') {
    stats.atk  = Math.floor(base * mult * 1.0);
    stats.crit = Math.floor(base * mult * 0.45);
  } else if (slot === 'body' || slot === 'helmet') {
    stats.def = Math.floor(base * mult * 1.0);
    stats.hp  = Math.floor(base * mult * 0.45);
  } else if (slot === 'ring') {
    stats.crit = Math.floor(base * mult * 1.0);
    stats.atk  = Math.floor(base * mult * 0.45);
  } else {
    stats.spd   = Math.floor(base * mult * 1.0);
    stats.dodge = Math.floor(base * mult * 0.45);
  }
  var item = {
    id: ++_invIdCounter, slot: slot,
    name: 'Трофей босса ' + bossId,
    icon: itemIcon(slot, rarity, null),
    rarity: rarity, level: itemLv, stats: stats,
    forClass: null, classLabel: null, classColor: null,
  };
  return { pixr: Math.floor(pixr), gold: Math.floor(gold), xp: Math.floor(xp), item: item };
}

// Состояние симуляции боя с боссом
var _bossActive  = false;
var _bossCurrent = null; // { ...BOSS_DEF, hp, maxHp, atk }
var _bossFightTimer = 0;
var _bossFightInterval = null;

function startBossFight(bossId) {
  var def = BOSS_DEFS[bossId - 1];
  var st  = getBossStats(bossId);
  _bossCurrent = Object.assign({}, def, { hp: st.hp, maxHp: st.hp, atk: st.atk });
  _bossActive  = true;
  _bossFightTimer = 0;

  // Обновляем UI
  _bossUpdateFightUI();

  // Тик боя каждые 1 сек
  if (_bossFightInterval) clearInterval(_bossFightInterval);
  _bossFightInterval = setInterval(_bossFightTick, 1000);
}

function _bossFightTick() {
  if (!_bossActive || !_bossCurrent) { clearInterval(_bossFightInterval); return; }

  var playerAtk = Math.max(1, Math.floor(G.stats.atk * (0.9 + Math.random() * 0.2)));
  var bossAtk   = Math.max(1, Math.floor(_bossCurrent.atk * (0.8 + Math.random() * 0.4)));
  var dodge     = Math.random() * 100 < G.stats.dodge;

  // Игрок атакует босса
  _bossCurrent.hp = Math.max(0, _bossCurrent.hp - playerAtk);

  // Босс атакует игрока (если не уклонился)
  if (!dodge) {
    var def = Math.floor(G.stats.def * 0.4);
    var dmg = Math.max(1, bossAtk - def);
    G.hp = Math.max(0, G.hp - dmg);
    updateHUD();
  }

  _bossUpdateFightUI();

  // Победа
  if (_bossCurrent.hp <= 0) {
    clearInterval(_bossFightInterval);
    _bossActive = false;
    _bossFightEnd(true);
    return;
  }

  // Поражение
  if (G.hp <= 0) {
    clearInterval(_bossFightInterval);
    _bossActive = true; // флаг для gameOverSequence
    player.state = 'dead';
    gameOverSequence();
    return;
  }
}

function _bossUpdateFightUI() {
  var hpPct = _bossCurrent ? Math.max(0, _bossCurrent.hp / _bossCurrent.maxHp * 100) : 0;
  var el = document.getElementById('bossHpBar');
  if (el) el.style.width = hpPct + '%';
  var el2 = document.getElementById('bossHpText');
  if (el2) el2.textContent = (_bossCurrent ? _bossCurrent.hp : 0) + ' / ' + (_bossCurrent ? _bossCurrent.maxHp : 0);
  var el3 = document.getElementById('bossPlayerHp');
  if (el3) el3.textContent = G.hp + ' / ' + G.maxHp;
}

function _bossFightEnd(win) {
  if (win) {
    var reward = getBossReward(_bossCurrent.id);
    // Начисляем награды
    G.pixr  = (G.pixr  || 0) + reward.pixr;
    G.gold  = (G.gold  || 0) + reward.gold;
    gainXP(reward.xp);
    if (G.inventory.length < 40) G.inventory.push(reward.item);

    // Повышаем этаж босса
    if (G.boss.floor < 10) G.boss.floor++;
    G.boss.lastDate = new Date().toISOString().slice(0, 10);
    if (window.GameSync) window.GameSync.saveInstant({ boss: G.boss, pixr: G.pixr, gold: G.gold });
    updateHUD();

    // Показываем модалку победы
    _bossShowVictory(reward);
  }
}

function _bossShowVictory(reward) {
  var modal = document.getElementById('bossVictoryModal');
  if (!modal) return;
  var r = RARITIES.find(function(x) { return x.id === reward.item.rarity; }) || { color: '#aaa', name: 'Обычный' };
  document.getElementById('bossVictoryContent').innerHTML =
    '<div style="font-size:36px;margin-bottom:8px;">🏆</div>' +
    '<div style="font-size:20px;font-weight:bold;color:#ffd700;margin-bottom:4px;">ПОБЕДА!</div>' +
    '<div style="font-size:13px;color:#aaa;margin-bottom:16px;">Босс ' + _bossCurrent.id + ': ' + _bossCurrent.name + '</div>' +
    '<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:14px;margin-bottom:14px;">' +
      '<div style="font-size:11px;color:#778;letter-spacing:1px;margin-bottom:10px;">НАГРАДЫ</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<img src="images/pixr.png" style="width:20px;height:20px;image-rendering:pixelated"> ' +
        '<span style="color:#ff44cc;font-size:15px;font-weight:bold;">+' + reward.pixr + ' PIXR</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<svg width="18" height="18" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>' +
        '<span style="color:#f5c542;font-size:15px;font-weight:bold;">+' + reward.gold.toLocaleString() + ' золота</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<svg width="18" height="18" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="4" y="0" width="2" height="3" fill="#9b59b6"/><rect x="0" y="3" width="10" height="2" fill="#9b59b6"/><rect x="1" y="2" width="2" height="2" fill="#9b59b6"/><rect x="7" y="2" width="2" height="2" fill="#9b59b6"/><rect x="2" y="5" width="2" height="4" fill="#9b59b6"/><rect x="6" y="5" width="2" height="4" fill="#9b59b6"/><rect x="4" y="6" width="2" height="2" fill="#9b59b6"/></svg>' +
        '<span style="color:#a78bfa;font-size:15px;font-weight:bold;">+' + reward.xp.toLocaleString() + ' XP</span>' +
      '</div>' +
      '<div style="margin-top:10px;border-top:1px solid #2a2a5a;padding-top:10px;display:flex;align-items:center;gap:10px;">' +
        '<img src="' + reward.item.icon + '" style="width:36px;height:36px;object-fit:contain;image-rendering:pixelated;" onerror="this.style.opacity=0.3">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:bold;color:' + r.color + ';">' + reward.item.name + '</div>' +
          '<div style="font-size:10px;color:#778;">Lv.' + reward.item.level + ' · ' + r.name + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<button onclick="closeBossVictoryModal()" style="width:100%;padding:12px;background:linear-gradient(90deg,#1a3a6a,#2a5aaa);border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:bold;cursor:pointer;font-family:\'Courier New\',monospace;">Забрать</button>';
  modal.classList.remove('hidden');
}

function closeBossVictoryModal() {
  var modal = document.getElementById('bossVictoryModal');
  if (modal) modal.classList.add('hidden');
}

function openBossModal() {
  renderBossModal();
  document.getElementById('bossModal').classList.remove('hidden');
}

function closeBossModal() {
  document.getElementById('bossModal').classList.add('hidden');
}

function renderBossModal() {
  var cp      = calcCP();
  var today   = new Date().toISOString().slice(0, 10);
  var boss    = G.boss || { floor: 1, lastDate: '' };
  var canFight = boss.lastDate !== today;
  var bossId  = Math.max(1, Math.min(boss.floor, 10));
  var def     = BOSS_DEFS[bossId - 1];
  var st      = getBossStats(bossId);
  var reward  = getBossReward(bossId);
  var hasCP   = cp >= def.cpReq;

  // Следующий босс для прогресса
  var nextDef = bossId < 10 ? BOSS_DEFS[bossId] : null;

  var html =
    '<div style="text-align:center;padding:8px 0 16px;">' +
      '<div style="font-size:48px;line-height:1;margin-bottom:6px;">' + def.emoji + '</div>' +
      '<div style="font-size:18px;font-weight:bold;color:' + def.color + ';">' + def.name + '</div>' +
      '<div style="font-size:11px;color:#778;margin-top:2px;">Босс ' + bossId + ' / 10</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">' +
      '<div style="padding:10px;background:rgba(255,255,255,0.04);border:1px solid #2a2a5a;border-radius:8px;text-align:center;">' +
        '<div style="font-size:9px;color:#778;margin-bottom:4px;">HP БОССА</div>' +
        '<div style="font-size:16px;font-weight:bold;color:#e74c3c;">' + st.hp.toLocaleString() + '</div>' +
      '</div>' +
      '<div style="padding:10px;background:rgba(255,255,255,0.04);border:1px solid #2a2a5a;border-radius:8px;text-align:center;">' +
        '<div style="font-size:9px;color:#778;margin-bottom:4px;">УРОН</div>' +
        '<div style="font-size:16px;font-weight:bold;color:#e74c3c;">' + st.atk + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="background:rgba(255,68,204,0.06);border:1px solid #4a2a5a;border-radius:8px;padding:10px;margin-bottom:12px;">' +
      '<div style="font-size:9px;color:#778;letter-spacing:1px;margin-bottom:6px;">НАГРАДЫ ЗА ПОБЕДУ</div>' +
      '<div style="font-size:12px;color:#ff44cc;">📦 ' + reward.pixr + ' PIXR · ' +
        '<span style="color:#f5c542;">' + reward.gold.toLocaleString() + ' золота</span> · ' +
        '<span style="color:#a78bfa;">' + reward.xp.toLocaleString() + ' XP</span></div>' +
      '<div style="font-size:10px;color:#778;margin-top:4px;">+ случайный предмет (' + ['Обычный','Необычный','Редкий','Эпический','Легендарный'][Math.min(bossId-1,4)] + ')</div>' +
    '</div>';

  if (!hasCP) {
    html += '<div style="padding:10px;background:rgba(231,76,60,0.08);border:1px solid #e74c3c44;border-radius:8px;margin-bottom:12px;font-size:11px;color:#e74c3c;text-align:center;">' +
      '⚠️ Нужно CP: ' + def.cpReq.toLocaleString() + ' (у тебя ' + cp + ')' +
      '</div>';
  }

  if (!canFight) {
    html += '<div style="padding:10px;background:rgba(255,255,255,0.04);border:1px solid #2a2a5a;border-radius:8px;margin-bottom:12px;font-size:11px;color:#778;text-align:center;">' +
      '⏳ Следующий вызов — завтра' +
      '</div>';
  }

  html += '<button onclick="' + (hasCP && canFight ? 'startBossFightUI()' : '') + '" ' +
    (!hasCP || !canFight ? 'disabled' : '') +
    ' style="width:100%;padding:14px;background:' +
    (hasCP && canFight ? 'linear-gradient(90deg,#6a1a1a,#aa2a2a)' : 'rgba(255,255,255,0.05)') +
    ';border:none;border-radius:10px;color:' +
    (hasCP && canFight ? '#fff' : '#445') +
    ';font-size:15px;font-weight:bold;cursor:' +
    (hasCP && canFight ? 'pointer' : 'not-allowed') +
    ';font-family:\'Courier New\',monospace;">' +
    (canFight ? (hasCP ? '⚔️ Вызвать босса' : '🔒 Нужно больше CP') : '⏳ Уже сражался сегодня') +
    '</button>';

  if (nextDef) {
    html += '<div style="margin-top:12px;font-size:10px;color:#556;text-align:center;">Следующий: ' + nextDef.emoji + ' ' + nextDef.name + ' · CP ' + nextDef.cpReq.toLocaleString() + '</div>';
  }

  document.getElementById('bossModalBody').innerHTML = html;
}

function startBossFightUI() {
  // Запускаем бой — показываем экран боя
  var bossId = Math.max(1, Math.min(G.boss.floor, 10));
  G.boss.lastDate = new Date().toISOString().slice(0, 10);
  if (window.GameSync) window.GameSync.saveInstant({ boss: G.boss });

  var def = BOSS_DEFS[bossId - 1];
  var fightHtml =
    '<div style="text-align:center;padding:8px 0 14px;">' +
      '<div style="font-size:42px;">' + def.emoji + '</div>' +
      '<div style="font-size:16px;font-weight:bold;color:' + def.color + ';">' + def.name + '</div>' +
    '</div>' +
    '<div style="margin-bottom:10px;">' +
      '<div style="font-size:10px;color:#e74c3c;margin-bottom:4px;">HP Босса</div>' +
      '<div style="background:#1a0a0a;border-radius:6px;height:14px;overflow:hidden;">' +
        '<div id="bossHpBar" style="height:100%;background:linear-gradient(90deg,#e74c3c,#ff6060);border-radius:6px;width:100%;transition:width 0.5s;"></div>' +
      '</div>' +
      '<div id="bossHpText" style="font-size:10px;color:#e74c3c;text-align:right;margin-top:2px;"></div>' +
    '</div>' +
    '<div style="margin-bottom:16px;">' +
      '<div style="font-size:10px;color:#2ecc71;margin-bottom:4px;">Ваш HP</div>' +
      '<div id="bossPlayerHp" style="font-size:13px;font-weight:bold;color:#2ecc71;"></div>' +
    '</div>' +
    '<div style="text-align:center;font-size:12px;color:#556;padding:20px 0;">⚔️ Бой идёт...</div>';

  document.getElementById('bossModalBody').innerHTML = fightHtml;
  startBossFight(bossId);
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
  if (v >= 1 && v <= 99) {
    G.potionThreshold = v;
    if (window.GameSync) window.GameSync.saveInstant({ potionThreshold: G.potionThreshold });
  }
}

// ═══════════════════════════════
//  BATTLE PASS
// ═══════════════════════════════
const BP_REWARDS = [
  { lv: 5,  iconFn: function() { return '<svg width="28" height="28" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>'; }, desc: '5 000 золота',
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
  { lv: 20, iconFn: function() { return '<svg width="28" height="28" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>'; }, desc: '20 000 золота',
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
  { lv: 35, iconFn: function() { return '<svg width="28" height="28" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>'; }, desc: '100 000 золота',
    apply: function() { G.gold += 100000; updateHUD(); } },
  { lv: 40, iconFn: function() { return '<img src="images/pixr.png" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;">'; }, desc: '200 PIXR',
    apply: function() { G.pixr = (G.pixr||0) + 200; updateHUD(); } },
  { lv: 50, iconFn: function() { return '<svg width="28" height="28" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>'; }, desc: '500 000 золота',
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

// ═══════════════════════════════
//  ТАЙМЕР ЕЖЕДНЕВНЫХ ЗАДАНИЙ
// ═══════════════════════════════
setInterval(function() {
  if (!gameActive || !G_CHAR || player.state === 'dead') return;
  var today = new Date().toISOString().slice(0, 10);
  if (!G.dailyTasks || G.dailyTasks.date !== today) {
    G.dailyTasks = { date: today, seconds: 0, claimed: [] };
  }
  G.dailyTasks.seconds = (G.dailyTasks.seconds || 0) + 1;
}, 1000);

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
  const templates = [
    [
      { name: 'Гоблин',  emoji: '👺', hp: 30  + f*15, atk: 5  + f*2, xp: 15,  gold: 8,   color: '#3a3' },
      { name: 'Скелет',  emoji: '💀', hp: 45  + f*20, atk: 8  + f*3, xp: 25,  gold: 12,  color: '#aab' },
      { name: 'Слизень', emoji: '🐌', hp: 25  + f*10, atk: 3  + f*1, xp: 10,  gold: 5,   color: '#3a3' },
    ],
    [
      { name: 'Ледяной', emoji: '🧊', hp: 80  + f*25, atk: 14 + f*4, xp: 40,  gold: 20,  color: '#4af' },
      { name: 'Волк',    emoji: '🐺', hp: 60  + f*20, atk: 18 + f*5, xp: 35,  gold: 18,  color: '#99b' },
    ],
    [
      { name: 'Демон',   emoji: '😈', hp: 150 + f*30, atk: 25 + f*6, xp: 70,  gold: 40,  color: '#f44' },
      { name: 'Феникс',  emoji: '🦅', hp: 120 + f*25, atk: 20 + f*5, xp: 60,  gold: 35,  color: '#fa4' },
    ],
    [
      { name: 'Ангел',   emoji: '👼', hp: 250 + f*40, atk: 35 + f*8, xp: 110, gold: 60,  color: '#fff' },
    ],
    [
      { name: 'Тень',    emoji: '👻', hp: 400 + f*50, atk: 50 + f*10, xp: 180, gold: 100, color: '#a4f' },
    ],
  ];
  const pool = templates[Math.min(f - 1, templates.length - 1)];
  const t = pool[Math.floor(Math.random() * pool.length)];
  return { ...t };
}

// ── Спавн монстра ──
function spawnMonster(wx) {
  const t = monsterTemplate();
  monsters.push({
    worldX: wx, y: GROUND - 96, w: 96, h: 96,
    hp: t.hp, maxHp: t.hp, atk: t.atk,
    xp: t.xp, gold: t.gold,
    name: t.name, emoji: t.emoji, color: t.color,
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
  if (!gameActive || activeTab !== 'game') return;

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
        fireballs.push({
          worldX: player.worldX + 70, y: player.y + 50,
          targetM: atkTarget, speed: 500, dmg: atkDmg, crit: atkCrit, angle: 0
        });
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

    if (distToPlayer > 70 && player.state !== 'dead' && !m.isAttacking && !m._frozen) {
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
    if (dist > 0 && dist < 70 && player.state !== 'dead' && !m.isAttacking && !m._frozen) {
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
    var tx = fb.targetM.worldX + 20, ty = fb.targetM.y + 20;
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
      gainXP(m.xp);
      G.gold += m.gold;
      G.killCount++;
      tryDropItem(G.floor);
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
    G.hp = Math.min(G.hp + 20, G.maxHp);
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
  setTimeout(() => {
    G.hp = Math.floor(G.maxHp * 0.3);
    player.state = 'run';
    player.invincible = 2.0;
    updateHUD();
  }, 2000);
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

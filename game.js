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
  
  // ── МНОЖИТЕЛЬ СИЛЫ ──
  // 1-й этаж: ×1.0 (без изменений)
  // 2-й и выше: ×2.0
  const powerMult = f === 1 ? 1.0 : 2.0;
  
  // Функция для применения множителя к HP и ATK
  function scaleMonster(hp, atk) {
    return {
      hp: Math.floor(hp * powerMult),
      atk: Math.floor(atk * powerMult),
    };
  }
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 1 — Тёмный лес (×1.0 — без изменений)
  // ═══════════════════════════════════════════════════════
  const floor1 = [
    { name: 'Гоблин',       emoji: '👺', hp: 30  + f*15, atk: 5  + f*2,  xp: 15,  gold: 8,   color: '#3a3', sk: 'goblin'    },
    { name: 'Гриб',         emoji: '🍄', hp: 25  + f*10, atk: 3  + f*1,  xp: 10,  gold: 5,   color: '#a63', sk: 'mushroom'  },
    { name: 'Скелет',       emoji: '💀', hp: 45  + f*20, atk: 8  + f*3,  xp: 25,  gold: 12,  color: '#aab', sk: 'skeleton'  },
    { name: 'Гоблин',       emoji: '🐺', hp: 35  + f*12, atk: 6  + f*2,  xp: 18,  gold: 10,  color: '#888', sk: 'goblin'    },
  ];
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 2 — Ледяные пещеры (×2.0)
  // ═══════════════════════════════════════════════════════
  const floor2 = [
    { name: 'Ледяной голем',  emoji: '🧊', ...scaleMonster(130 + f*30, 20 + f*5),  xp: 40,  gold: 20,  color: '#4af', sk: 'icegolem'   },
    { name: 'Голем земли',    emoji: '🪨', ...scaleMonster(150 + f*35, 22 + f*5),  xp: 45,  gold: 22,  color: '#963', sk: 'earthgolem' },
    { name: 'Голем льда',     emoji: '🐉', ...scaleMonster(120 + f*28, 18 + f*4),  xp: 35,  gold: 18,  color: '#8cf', sk: 'icegolem'   },
    { name: 'Снежный голем',  emoji: '🧝', ...scaleMonster(100 + f*25, 15 + f*4),  xp: 30,  gold: 15,  color: '#aaf', sk: 'skeleton'  },
  ];
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 3 — Марс (×2.0)
  // ═══════════════════════════════════════════════════════
  const floor3 = [
    { name: 'Орк-демон',      emoji: '😈', ...scaleMonster(220 + f*40, 36 + f*8),  xp: 70,  gold: 40,  color: '#f44', sk: 'orcdemon'  },
    { name: 'Марсианин',      emoji: '👾', ...scaleMonster(200 + f*38, 32 + f*7),  xp: 65,  gold: 38,  color: '#a84', sk: 'orcdemon'  },
    { name: 'Голем марса',    emoji: '🐛', ...scaleMonster(250 + f*45, 40 + f*9),  xp: 80,  gold: 45,  color: '#ca8', sk: 'earthgolem' },
    { name: 'Сильный голем',  emoji: '🪨', ...scaleMonster(180 + f*35, 28 + f*6),  xp: 55,  gold: 32,  color: '#c44', sk: 'earthgolem' },
  ];
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 4 — Земля мёртвых (×2.0)
  // ═══════════════════════════════════════════════════════
  const floor4 = [
    { name: 'Зомби воин',     emoji: '🧟', ...scaleMonster(380 + f*55, 50 + f*11), xp: 110, gold: 60,  color: '#5a3', sk: 'zwarrior' },
    { name: 'Зомби палач',    emoji: '🧟', ...scaleMonster(420 + f*60, 55 + f*12), xp: 120, gold: 65,  color: '#383', sk: 'zexec'    },
    { name: 'Зомби',          emoji: '🧟', ...scaleMonster(350 + f*50, 45 + f*10), xp: 100, gold: 55,  color: '#4a2', sk: 'zombie'   },
    { name: 'Зомби скаут',    emoji: '👼', ...scaleMonster(450 + f*65, 60 + f*13), xp: 130, gold: 70,  color: '#66a', sk: 'zexec'    },
  ];
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 5 — Бездна (×2.0)
  // ═══════════════════════════════════════════════════════
  const floor5 = [
    { name: 'Демон-воин',     emoji: '👹', ...scaleMonster(500 + f*60, 60 + f*12), xp: 150, gold: 80,  color: '#c44', sk: 'orcdemon'  },
    { name: 'Ледяной великан', emoji: '🧊', ...scaleMonster(600 + f*70, 55 + f*10), xp: 160, gold: 85,  color: '#6af', sk: 'icegolem'  },
    { name: 'Костяной рыцарь', emoji: '⚔️', ...scaleMonster(550 + f*65, 70 + f*14), xp: 170, gold: 90,  color: '#bbc', sk: 'skeleton'  },
    { name: 'Зомбиноид',     emoji: '🧙', ...scaleMonster(480 + f*58, 65 + f*13), xp: 155, gold: 82,  color: '#a4f', sk: 'zombie'    },
  ];
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 6 — Призрачный замок (×2.0)
  // ═══════════════════════════════════════════════════════
  const floor6 = [
    { name: 'Кость',          emoji: '👻', ...scaleMonster(500 + f*50, 70 + f*12), xp: 180, gold: 95,  color: '#88d', sk: 'skeleton'  },
    { name: 'Банши',          emoji: '🧝', ...scaleMonster(550 + f*55, 75 + f*13), xp: 190, gold: 100, color: '#a8d', sk: 'zombie'    },
    { name: 'Рыцарь-мертвец', emoji: '⚔️', ...scaleMonster(600 + f*60, 80 + f*14), xp: 200, gold: 105, color: '#88a', sk: 'zexec'     },
    { name: 'Призрачный зомби', emoji: '🧙', ...scaleMonster(520 + f*52, 85 + f*15), xp: 210, gold: 110, color: '#99e', sk: 'zombie'    },
  ];
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 7 — Кристальные шахты (×2.0)
  // ═══════════════════════════════════════════════════════
  const floor7 = [
    { name: 'Голем',          emoji: '🪨', ...scaleMonster(700 + f*70, 90 + f*15), xp: 250, gold: 130, color: '#a85', sk: 'earthgolem' },
    { name: 'Гоблин',         emoji: '🐞', ...scaleMonster(650 + f*65, 85 + f*14), xp: 240, gold: 125, color: '#5af', sk: 'goblin'    },
    { name: 'Горный дух',     emoji: '👻', ...scaleMonster(750 + f*75, 95 + f*16), xp: 260, gold: 135, color: '#8af', sk: 'icegolem'  },
    { name: 'Кристальный голем', emoji: '🐉', ...scaleMonster(800 + f*80, 100 + f*17), xp: 270, gold: 140, color: '#4cf', sk: 'icegolem' },
  ];
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 8 — Пустыня Забытых (×2.0)
  // ═══════════════════════════════════════════════════════
  const floor8 = [
    { name: 'Мумия',          emoji: '🧟', ...scaleMonster(850 + f*85, 110 + f*18), xp: 300, gold: 160, color: '#ca8', sk: 'zombie'    },
    { name: 'Трольь',         emoji: '🦂', ...scaleMonster(800 + f*80, 105 + f*17), xp: 290, gold: 155, color: '#a84', sk: 'goblin'    },
    { name: 'Хранитель пустыни', emoji: '🪨', ...scaleMonster(900 + f*90, 120 + f*19), xp: 320, gold: 170, color: '#ca8', sk: 'earthgolem' },
    { name: 'Фараон',         emoji: '👑', ...scaleMonster(950 + f*95, 125 + f*20), xp: 330, gold: 175, color: '#f5c542', sk: 'zexec' },
  ];
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 9 — Морские глубины (×2.0)
  // ═══════════════════════════════════════════════════════
  const floor9 = [
    { name: 'Камень',         emoji: '🐙', ...scaleMonster(1000 + f*100, 140 + f*22), xp: 380, gold: 200, color: '#a8c', sk: 'icegolem'  },
    { name: 'Мертвец',        emoji: '🦑', ...scaleMonster(1200 + f*110, 160 + f*24), xp: 420, gold: 220, color: '#68a', sk: 'zexec'     },
    { name: 'Морской дьявол', emoji: '👹', ...scaleMonster(1100 + f*105, 150 + f*23), xp: 400, gold: 210, color: '#c44', sk: 'orcdemon'  },
    { name: 'Водяной голем',  emoji: '💧', ...scaleMonster(1050 + f*102, 145 + f*22), xp: 390, gold: 205, color: '#4af', sk: 'icegolem'  },
  ];
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 10 — Небесная Цитадель (×2.0)
  // ═══════════════════════════════════════════════════════
  const floor10 = [
    { name: 'Небесный страж', emoji: '⚔️', ...scaleMonster(1500 + f*120, 200 + f*25), xp: 600, gold: 350, color: '#ffd700', sk: 'zexec'  },
    { name: 'Архангел',       emoji: '👼', ...scaleMonster(1800 + f*130, 220 + f*28), xp: 700, gold: 400, color: '#ffd700', sk: 'zwarrior' },
    { name: 'Потусторонний',  emoji: '🧙', ...scaleMonster(1600 + f*125, 210 + f*26), xp: 650, gold: 380, color: '#ffd700', sk: 'zombie'   },
    { name: 'Голем неба',     emoji: '🐉', ...scaleMonster(2000 + f*140, 250 + f*30), xp: 800, gold: 450, color: '#ffd700', sk: 'icegolem' },
  ];
  
  // ═══════════════════════════════════════════════════════
  //  ВЫБОР ПУЛА ПО ЭТАЖУ
  // ═══════════════════════════════════════════════════════
  let pool;
  
  if (f === 1) {
    pool = floor1;
  } else if (f === 2) {
    pool = floor2;
  } else if (f === 3) {
    pool = floor3;
  } else if (f === 4) {
    pool = floor4;
  } else if (f === 5) {
    pool = floor5;
  } else if (f === 6) {
    pool = floor6;
  } else if (f === 7) {
    pool = floor7;
  } else if (f === 8) {
    pool = floor8;
  } else if (f === 9) {
    pool = floor9;
  } else {
    pool = floor10;
  }
  
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
        if (atkCrit) atkDmg = Math.floor(atkDmg * effectiveCritDmg());
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
    if (m.isBoss) {
      _onBossKilled(m);
    } else {
      // ✅ Получаем множители ТЕКУЩЕГО этажа
      const floorCfg = FLOORS[Math.min(G.floor - 1, FLOORS.length - 1)];
      const xpMult = floorCfg.xpMult || 1.0;
      const goldMult = floorCfg.goldMult || 1.0;
      
      // ✅ Применяем множители к награде
      const finalXp = Math.floor(m.xp * premMult('xp') * xpMult);
      const finalGold = Math.floor(m.gold * premMult('gold') * goldMult);
      
      gainXP(finalXp);
      G.gold += finalGold;
      G.killCount++;
      tryDropItem(G.floor);
      
      // PIXR шанс зависит от этажа
      var pixrChance = 0.02 * Math.pow(1.5, G.floor - 1) * premMult('pixr');
      if (Math.random() * 100 < pixrChance) {
        G.pixr = (G.pixr || 0) + 1;
        showDmgPop('+1 PIXR', m.worldX - player.worldX + W * 0.5, GROUND * 0.4, '#ff44cc');
      }
      updateHUD();
      checkFloorUnlock();
    }
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
  var levelled = false;
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
    levelled = true;
  }
  // ✅ onLevelUp только при реальном повышении уровня
  if (levelled && typeof window.onLevelUp === 'function') window.onLevelUp();
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

// ═══════════════════════════════
//  СИСТЕМА БОССОВ
// ═══════════════════════════════
const BOSS_DEFS = [
  { id: 1,  name: 'Король гоблинов',   emoji: '👺', cpReq: 0,      hp: 500,    atk: 20,    color: '#3a3', sk: 'goblin'    },
  { id: 2,  name: 'Ледяной титан',     emoji: '🧊', cpReq: 1000,   hp: 1000,   atk: 40,    color: '#4af', sk: 'icegolem'  },
  { id: 3,  name: 'Орк-демон',         emoji: '😈', cpReq: 2400,   hp: 2000,   atk: 80,    color: '#f44', sk: 'orcdemon'  },
  { id: 4,  name: 'Зомби-лорд',        emoji: '🧟', cpReq: 5000,   hp: 4000,   atk: 160,   color: '#5a3', sk: 'zwarrior'  },
  { id: 5,  name: 'Страж теней',       emoji: '💀', cpReq: 9000,   hp: 8000,   atk: 320,   color: '#a4f', sk: 'skeleton'  },
  { id: 6,  name: 'Голем хаоса',       emoji: '🪨', cpReq: 16000,  hp: 16000,  atk: 640,   color: '#963', sk: 'earthgolem'},
  { id: 7,  name: 'Мёртвый палач',     emoji: '🧟', cpReq: 28000,  hp: 32000,  atk: 1280,  color: '#383', sk: 'zexec'     },
  { id: 8,  name: 'Грибной повелитель',emoji: '🍄', cpReq: 50000,  hp: 64000,  atk: 2560,  color: '#a63', sk: 'mushroom'  },
  { id: 9,  name: 'Тёмный голем',      emoji: '🧊', cpReq: 90000,  hp: 128000, atk: 5120,  color: '#88f', sk: 'icegolem'  },
  { id: 10, name: 'Тёмный властелин',  emoji: '🧟', cpReq: 160000, hp: 256000, atk: 10240, color: '#ffd700', sk: 'zombie' },
];

const BOSS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 часа

function bossCanFight() {
  var t = (G.boss && G.boss.lastFightTime) || 0;
  return Date.now() - t >= BOSS_COOLDOWN_MS;
}

function bossNextFightIn() {
  var t   = (G.boss && G.boss.lastFightTime) || 0;
  var ms  = BOSS_COOLDOWN_MS - (Date.now() - t);
  if (ms <= 0) return null;
  var h   = Math.floor(ms / 3600000);
  var m   = Math.floor((ms % 3600000) / 60000);
  return h + 'ч ' + m + 'мин';
}

var _bossActive = false;

function spawnBoss(bossId) {
  var def = BOSS_DEFS[bossId - 1];
  if (!def) return;
  monsters.forEach(function(m) { if (m._attackTimeout) clearTimeout(m._attackTimeout); });
  monsters = [];
  monsters.push({
    worldX: player.worldX + W * 0.55,
    y: GROUND - 192, w: 192, h: 192,
    hp: def.hp, maxHp: def.hp, atk: def.atk,
    xp: 0, gold: 0,
    name: def.name, emoji: def.emoji, color: def.color,
    sk: def.sk || null,
    frame: 0, state: 'idle',
    attackTimer: 0, hitFlash: 0,
    isAttacking: false, attackAnimTimer: 0,
    _attackTimeout: null,
    isBoss: true, bossId: bossId,
  });
  _bossActive = true;
  nextMonsterSpawn = player.worldX + 9999999;
}

function _onBossKilled(m) {
  _bossActive = false;
  nextMonsterSpawn = player.worldX + 400;

  var bossId = m.bossId;
  var pixr = Math.floor(Math.pow(2, bossId - 1));
  var gold = Math.floor(1000 * Math.pow(2, bossId - 1));
  var xp   = Math.floor(500  * Math.pow(2, bossId - 1));

  G.pixr  = (G.pixr  || 0) + pixr;
  G.gold  = (G.gold  || 0) + gold;
  gainXP(xp);

  var item = _bossDrop(bossId);
  if (G.inventory.length < 40 && item) {
    G.inventory.push(item);
    showDropNotif(item);
  }

  // Кулдаун — запоминаем время победы
  if (!G.boss) G.boss = { floor: 1, lastFightTime: 0 };
  G.boss.lastFightTime = Date.now();
  // Прогрессируем на следующего босса (если не последний)
  if (G.boss.floor < 10) G.boss.floor = bossId + 1;
  if (window.GameSync) window.GameSync.saveInstant({ boss: G.boss, pixr: G.pixr });
  updateHUD();

  _showBossVictory(m.name, bossId, pixr, gold, xp, item);
}

function _bossDrop(bossId) {
  var slots  = ['weapon','body','helmet','ring','boots'];
  var slot   = slots[Math.floor(Math.random() * slots.length)];
  var rarIdx = Math.min(bossId - 1, 4);
  var rars   = ['common','uncommon','rare','epic','legend'];
  var rarity = rars[rarIdx];
  var itemLv = bossId * 2;
  var mult   = 1 + rarIdx * 0.55;
  var base   = itemLv * 2.5;
  var stats  = {};
  if (slot === 'weapon')                   { stats.atk  = Math.floor(base*mult); stats.crit  = Math.floor(base*mult*0.45); }
  else if (slot==='body'||slot==='helmet') { stats.def  = Math.floor(base*mult); stats.hp    = Math.floor(base*mult*0.45); }
  else if (slot === 'ring')                { stats.crit = Math.floor(base*mult); stats.atk   = Math.floor(base*mult*0.45); }
  else                                     { stats.spd  = Math.floor(base*mult); stats.dodge = Math.floor(base*mult*0.45); }
  return {
    id: ++_invIdCounter, slot: slot,
    name: 'Трофей: ' + BOSS_DEFS[bossId-1].name,
    icon: itemIcon(slot, rarity, null),
    rarity: rarity, level: itemLv, stats: stats,
    forClass: null, classLabel: null, classColor: null,
  };
}

function _showBossVictory(name, bossId, pixr, gold, xp, item) {
  var modal = document.getElementById('bossVictoryModal');
  if (!modal) return;
  var r = RARITIES.find(function(x){ return x.id === (item ? item.rarity : 'common'); }) || { color:'#aaa', name:'Обычный' };
  var nextIn = bossNextFightIn();
  document.getElementById('bossVictoryContent').innerHTML =
    '<div style="font-size:42px;text-align:center;margin-bottom:6px;">🏆</div>' +
    '<div style="font-size:20px;font-weight:bold;color:#ffd700;text-align:center;margin-bottom:4px;">ПОБЕДА!</div>' +
    '<div style="font-size:12px;color:#aaa;text-align:center;margin-bottom:4px;">' + name + ' повержен</div>' +
    (nextIn ? '<div style="font-size:11px;color:#e74c3c;text-align:center;margin-bottom:12px;">⏳ Следующий бой через ' + nextIn + '</div>' : '') +
    '<div style="background:rgba(255,255,255,0.04);border:1px solid #2a2a5a;border-radius:10px;padding:14px;margin-bottom:14px;">' +
      '<div style="font-size:10px;color:#778;letter-spacing:1px;margin-bottom:10px;">НАГРАДЫ</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><img src="images/pixr.png" style="width:18px;height:18px;image-rendering:pixelated"><span style="color:#ff44cc;font-size:14px;font-weight:bold;">+' + pixr + ' PIXR</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><svg width="16" height="16" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg><span style="color:#f5c542;font-size:14px;font-weight:bold;">+' + gold.toLocaleString() + ' золота</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:' + (item ? '10px' : '0') + ';"><svg width="16" height="16" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated"><rect x="4" y="0" width="2" height="3" fill="#9b59b6"/><rect x="0" y="3" width="10" height="2" fill="#9b59b6"/><rect x="2" y="5" width="2" height="4" fill="#9b59b6"/><rect x="6" y="5" width="2" height="4" fill="#9b59b6"/><rect x="4" y="6" width="2" height="2" fill="#9b59b6"/></svg><span style="color:#a78bfa;font-size:14px;font-weight:bold;">+' + xp.toLocaleString() + ' XP</span></div>' +
      (item ? '<div style="border-top:1px solid #2a2a5a;padding-top:10px;display:flex;align-items:center;gap:10px;"><img src="' + item.icon + '" style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated;"><div><div style="font-size:12px;font-weight:bold;color:' + r.color + ';">' + item.name + '</div><div style="font-size:10px;color:#778;">Lv.' + item.level + ' · ' + r.name + '</div></div></div>' : '') +
    '</div>' +
    '<button onclick="document.getElementById(\'bossVictoryModal\').classList.add(\'hidden\')" style="width:100%;padding:12px;background:linear-gradient(90deg,#1a3a1a,#2a6a2a);border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:bold;cursor:pointer;font-family:\'Courier New\',monospace;">Забрать</button>';
  modal.classList.remove('hidden');
}

// ── Game Over ──
function gameOverSequence() {
  var penalty = Math.floor(G.gold * 0.05);
  G.gold = Math.max(0, G.gold - penalty);
  updateHUD();

  if (_bossActive) {
    // Убиваем босса, возвращаем спавн обычных монстров
    _bossActive = false;
    monsters.forEach(function(m) { if (m._attackTimeout) clearTimeout(m._attackTimeout); });
    monsters = [];
    nextMonsterSpawn = player.worldX + 400;
    // Возвращаемся на обычный этаж игрока (G.floor не трогаем — он свой)
    var txt = document.getElementById('deathPenaltyText');
    if (txt) txt.textContent = 'Босс победил! Босс исчезает в темноте...';
    var modal = document.getElementById('deathModal');
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
var _loopRunning = false;

function loop(ts) {
  // PvP сцена — перехватываем loop
  if (typeof pvpRenderState !== 'undefined' && pvpRenderState.active) {
    renderPvp(ts);
    requestAnimationFrame(loop);
    return;
  }
  const dt = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

// ✅ Безопасный старт loop — защита от двойного запуска
function startLoop(ts) {
  if (_loopRunning) return;
  _loopRunning = true;
  lastTime = ts;
  loop(ts);
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

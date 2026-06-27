/*
  ══════════════════════════════════════════════════════
  render.js — Движок отрисовки (Canvas 2D)
  10 уникальных фонов этажей, параллакс, спрайты
  ══════════════════════════════════════════════════════
*/

// ── Canvas и контекст ──
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ── Спрайты игрока ──
const spriteRun  = new Image(); spriteRun.src  = '2.png';
const spriteAtk  = new Image(); spriteAtk.src  = '1.png';
const spriteIdle = new Image(); spriteIdle.src = 'IDLE.png';

// ── Спрайты монстра (legacy fallback) ──
const spriteMonster     = new Image(); spriteMonster.src     = 'mrun.png';
const spriteMonsterAtk  = new Image(); spriteMonsterAtk.src  = 'matk.png';
const spriteMonsterIdle = new Image(); spriteMonsterIdle.src = 'midle.png';

// ── Константы анимации игрока ──
const RUN_FRAMES  = 8,  RUN_FW  = 128, RUN_FH  = 128;
const ATK_FRAMES  = 8,  ATK_FW  = 128, ATK_FH  = 128;
const IDLE_FRAMES = 7,  IDLE_FW = 128, IDLE_FH = 128;
const MONSTER_FRAMES      = 6, MONSTER_FW      = 96, MONSTER_FH      = 96;
const MONSTER_ATK_FRAMES  = 4, MONSTER_ATK_FW  = 96, MONSTER_ATK_FH  = 96;
const MONSTER_IDLE_FRAMES = 5, MONSTER_IDLE_FW = 96, MONSTER_IDLE_FH = 96;
const SPRITE_FPS = 16, IDLE_FPS = 8, ATK_FPS = 20;

// ── Таблица спрайтов монстров по ключу sk ──
// Формат: { run:{src,frames,fw,fh}, atk:{src,frames,fw,fh}, idle:{src,frames,fw,fh} }
function _mimg(src) { const i = new Image(); i.src = src; return i; }
const MONSTER_SPRITES = {
  // Этаж 1: кадр 150x150. oy = пустых px сверху (объект смещается вниз на oy)
  goblin:    {
    run:  { img: _mimg('images/monster/mrun2.png'),  frames: 8,  fw: 150, fh: 150 },
    atk:  { img: _mimg('images/monster/matk2.png'),  frames: 8,  fw: 150, fh: 150 },
    idle: { img: _mimg('images/monster/midle2.png'), frames: 4,  fw: 150, fh: 150 },
    oy: 50, oh: 85,
  },
  mushroom:  {
    run:  { img: _mimg('images/monster/mrun3.png'),  frames: 8,  fw: 150, fh: 150 },
    atk:  { img: _mimg('images/monster/matk3.png'),  frames: 8,  fw: 150, fh: 150 },
    idle: { img: _mimg('images/monster/midle3.png'), frames: 4,  fw: 150, fh: 150 },
    oy: 50, oh: 85,
  },
  skeleton:  {
    run:  { img: _mimg('images/monster/mrun4.png'),  frames: 4,  fw: 150, fh: 150 },
    atk:  { img: _mimg('images/monster/matk4.png'),  frames: 8,  fw: 150, fh: 150 },
    idle: { img: _mimg('images/monster/midle4.png'), frames: 4,  fw: 150, fh: 150 },
    oy: 50, oh: 90,
  },
  // Этаж 2: кадр 90x64
  icegolem:  {
    run:  { img: _mimg('images/monster/mrun5.png'),  frames: 10, fw: 90, fh: 64 },
    atk:  { img: _mimg('images/monster/matk5.png'),  frames: 11, fw: 90, fh: 64 },
    idle: { img: _mimg('images/monster/midle5.png'), frames: 8,  fw: 90, fh: 64 },
    oy: 0, oh: 60,
  },
  earthgolem:{
    run:  { img: _mimg('images/monster/mrun6.png'),  frames: 10, fw: 90, fh: 64 },
    atk:  { img: _mimg('images/monster/matk6.png'),  frames: 11, fw: 90, fh: 64 },
    idle: { img: _mimg('images/monster/midle6.png'), frames: 8,  fw: 90, fh: 64 },
    oy: 0, oh: 60,
  },
  // Этаж 4: кадр 128x128
  zwarrior:  {
    run:  { img: _mimg('images/monster/mrun7.png'),  frames: 10, fw: 128, fh: 128 },
    atk:  { img: _mimg('images/monster/matk7.png'),  frames: 5,  fw: 128, fh: 128 },
    idle: { img: _mimg('images/monster/midle7.png'), frames: 6,  fw: 128, fh: 128 },
    oy: 0, oh: 110,
  },
  zexec:     {
    run:  { img: _mimg('images/monster/mrun8.png'),  frames: 10, fw: 128, fh: 128 },
    atk:  { img: _mimg('images/monster/matk8.png'),  frames: 5,  fw: 128, fh: 128 },
    idle: { img: _mimg('images/monster/midle8.png'), frames: 6,  fw: 128, fh: 128 },
    oy: 0, oh: 110,
  },
  zombie:    {
    run:  { img: _mimg('images/monster/mrun9.png'),  frames: 10, fw: 128, fh: 128 },
    atk:  { img: _mimg('images/monster/matk9.png'),  frames: 4,  fw: 128, fh: 128 },
    idle: { img: _mimg('images/monster/midle9.png'), frames: 6,  fw: 128, fh: 128 },
    oy: 0, oh: 100,
  },
  orcdemon:  {
    run:  { img: spriteMonster,     frames: 6, fw: 96, fh: 96 },
    atk:  { img: spriteMonsterAtk,  frames: 4, fw: 96, fh: 96 },
    idle: { img: spriteMonsterIdle, frames: 5, fw: 96, fh: 96 },
    oy: 0, oh: 90,
  },
  orcdemon:  {
    run:  { img: spriteMonster,     frames: 6,  fw: 96, fh: 96 },
    atk:  { img: spriteMonsterAtk,  frames: 4,  fw: 96, fh: 96 },
    idle: { img: spriteMonsterIdle, frames: 5,  fw: 96, fh: 96 },
    oy: 0, oh: 90,
  },
};

// ── Глобальные переменные рендера ──
let spriteRunTime = 0;
let fireballs = [];
let W, H, GROUND, HUD_H, NAV_H;
let worldX = 0;
let PLAYER_SCREEN_X = 120;

// ── Плавное переключение фонов ──
let bgFloor   = 1;
let bgAlpha   = 1;
let bgPrev    = 1;
const BG_FADE = 0.045;

// ── RESIZE ──
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  HUD_H  = document.getElementById('hud').offsetHeight;
  NAV_H  = document.getElementById('nav').offsetHeight;
  GROUND = H - NAV_H - 12;
  PLAYER_SCREEN_X = Math.floor(W * 0.16);
  player.y = GROUND - 128;
  worldX   = player.worldX - PLAYER_SCREEN_X;
  positionSkillsHud();
}

// ═══════════════════════════════════════════════════════
//  УТИЛИТЫ
// ═══════════════════════════════════════════════════════

function pixelRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
}

// LCG — стабильный псевдослучайный генератор по сиду
function lcg(seed) {
  let s = seed | 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 0x100000000; };
}

// ════════════════════════════════════════════════════════
//  ПАРАЛЛАКС — ВСЕ ПОЗИЦИИ НЕЗАВИСИМЫ ОТ W
//  Используем TILE_W = 1200 как единицу мира.
//  W используется ТОЛЬКО для вывода на экран (draw).
// ════════════════════════════════════════════════════════

const TILE_W = 1200; // фиксированная ширина мирового тайла

// Тайловые горы/рифы/дюны — стабильны при любом W
function drawMountainTile(seed, yBase, peakH, color, count) {
  const rng  = lcg(seed);
  const segW = TILE_W / count;
  const pts  = [];
  for (let i = -1; i <= count + 1; i++) {
    pts.push({ x: i * segW + rng() * segW * 0.35, y: yBase - peakH * (0.3 + rng() * 0.7) });
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-10, yBase);
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i-1].x + pts[i].x) * 0.5;
    ctx.bezierCurveTo(mx, pts[i-1].y, mx, pts[i].y, pts[i].x, pts[i].y);
  }
  ctx.lineTo(TILE_W + 10, yBase);
  ctx.closePath();
  ctx.fill();
}

function tileRange(seed, yBase, peakH, color, count, scrollFactor) {
  const rawOffset = -(worldX * scrollFactor);
  const offset    = ((rawOffset % TILE_W) + TILE_W) % TILE_W;
  const startX    = offset - TILE_W;
  const needed    = Math.ceil((W - startX) / TILE_W) + 1;
  for (let i = 0; i < needed; i++) {
    ctx.save();
    ctx.translate((startX + i * TILE_W) | 0, 0);
    drawMountainTile(seed, yBase, peakH, color, count);
    ctx.restore();
  }
}

// Снежные шапки — точно совпадают с вершинами гор (идентичный seed и offset)
function snowCaps(seed, yBase, peakH, count, scrollFactor) {
  const segW      = TILE_W / count;
  const rawOffset = -(worldX * scrollFactor);
  const offset    = ((rawOffset % TILE_W) + TILE_W) % TILE_W;
  const startX    = offset - TILE_W;
  const needed    = Math.ceil((W - startX) / TILE_W) + 1;
  for (let tile = 0; tile < needed; tile++) {
    ctx.save();
    ctx.translate((startX + tile * TILE_W) | 0, 0);
    // Воспроизводим ТЕ ЖЕ вершины что в drawMountainTile
    const rng = lcg(seed);
    const pts = [];
    for (let i = -1; i <= count + 1; i++) {
      pts.push({ x: i * segW + rng() * segW * 0.35, y: yBase - peakH * (0.3 + rng() * 0.7) });
    }
    // Рисуем снег на каждой вершине
    for (let i = 1; i < pts.length - 1; i++) {
      const px = pts[i].x, py = pts[i].y;
      const r  = segW * 0.12;
      const g2 = ctx.createRadialGradient(px, py, 0, px, py, r);
      g2.addColorStop(0,   'rgba(230,240,255,0.90)');
      g2.addColorStop(0.5, 'rgba(195,220,255,0.50)');
      g2.addColorStop(1,   'rgba(160,200,250,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.ellipse(px, py + r * 0.15, r, r * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Тайловые силуэты деревьев — стабильны при любом W
function drawTreeSilhouettes(seed, count, hMin, hMax, wMin, wMax, color, scrollFactor, yGround) {
  const rng   = lcg(seed);
  const segW  = TILE_W / count;
  const trees = [];
  for (let i = 0; i < count; i++) {
    trees.push({
      x: i * segW + rng() * segW * 0.8,
      h: yGround * (hMin + rng() * Math.abs(hMax - hMin)), // abs защита от отриц. диапазона
      w: wMin + rng() * (wMax - wMin),
    });
  }
  const rawOffset = -(worldX * scrollFactor);
  const offset    = ((rawOffset % TILE_W) + TILE_W) % TILE_W;
  const startX    = offset - TILE_W;
  const needed    = Math.ceil((W - startX) / TILE_W) + 1;
  for (let tile = 0; tile < needed; tile++) {
    ctx.save();
    ctx.translate((startX + tile * TILE_W) | 0, 0);
    ctx.fillStyle = color;
    for (const tr of trees) {
      const ty = yGround - tr.h;
      ctx.fillRect(tr.x + tr.w * 0.42, ty + tr.h * 0.52, tr.w * 0.16, tr.h * 0.50);
      ctx.beginPath(); ctx.moveTo(tr.x + tr.w * 0.5, ty);
      ctx.lineTo(tr.x - tr.w * 0.08, ty + tr.h * 0.58); ctx.lineTo(tr.x + tr.w * 1.08, ty + tr.h * 0.58);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tr.x + tr.w * 0.5, ty + tr.h * 0.14);
      ctx.lineTo(tr.x + tr.w * 0.04, ty + tr.h * 0.70); ctx.lineTo(tr.x + tr.w * 0.96, ty + tr.h * 0.70);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}

// ── prlx(): универсальная формула параллакса без W ──
// Возвращает экранный X объекта с индексом idx,
// spacing — интервал между объектами в мировых единицах (не пикселях)
// rangeW — ширина мирового диапазона (фиксированная, не зависит от W)
// yieldW — ширина экранного диапазона вывода (по умолч. W+rangeW*0.1*2)
function prlx(idx, spacing, scrollFactor, rangeW) {
  const raw = ((idx * spacing - worldX * scrollFactor) % rangeW + rangeW) % rangeW;
  // Маппим [0, rangeW] → [-rangeW*0.15, W + rangeW*0.15] для перекрытия краёв
  return (raw / rangeW) * (W + rangeW * 0.3) - rangeW * 0.15;
}

// ── moonPos(): позиция луны/солнца по мировым координатам ──
// worldOff — мировое смещение (чисто число, БЕЗ W)
// period   — период цикла в мировых единицах
function moonPos(worldOff, period, yFrac) {
  const raw = ((worldOff - worldX * 0.008) % period + period) % period;
  return { x: (raw / period) * W * 1.4 - W * 0.2, y: GROUND * yFrac };
}

// ── Утилиты заливок ──
function fillSky(stops) {
  const g = ctx.createLinearGradient(0, HUD_H, 0, GROUND);
  stops.forEach(([p, c]) => g.addColorStop(p, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, HUD_H, W, GROUND - HUD_H);
}

function fillGround(stops) {
  const g = ctx.createLinearGradient(0, GROUND, 0, H - NAV_H);
  stops.forEach(([p, c]) => g.addColorStop(p, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND, W, H - NAV_H - GROUND);
}

function groundFog(r, g2, b, opacity) {
  const fog = ctx.createLinearGradient(0, GROUND * 0.72, 0, GROUND);
  fog.addColorStop(0, `rgba(${r},${g2},${b},0)`);
  fog.addColorStop(1, `rgba(${r},${g2},${b},${opacity})`);
  ctx.fillStyle = fog;
  ctx.fillRect(0, GROUND * 0.72, W, GROUND * 0.28);
}

// ── Звёзды — позиция через TILE_W, без W в диапазоне ──
function drawStars(seed, count, t, colorFn) {
  const rng = lcg(seed);
  const range = TILE_W * 4; // фиксированный мировой диапазон
  for (let i = 0; i < count; i++) {
    const rx = rng(), ry = rng(), rb = rng();
    const starWorld = rx * range;
    const raw = ((starWorld - worldX * 0.004) % range + range) % range;
    const sx  = (raw / range) * (W * 1.2) - W * 0.1;
    const sy  = HUD_H + ry * (GROUND - HUD_H) * 0.78;
    const br  = (0.2 + rb * 0.7) * (0.7 + Math.sin(t * 0.002 + i * 1.3) * 0.3);
    const sz  = i % 20 === 0 ? 2.5 : i % 6 === 0 ? 1.5 : 1;
    ctx.fillStyle = colorFn(i, br);
    ctx.fillRect(sx | 0, sy | 0, sz, sz);
  }
}

// ═══════════════════════════════════════════════════════
//  РЕНДЕР ФОНОВ 10 ЭТАЖЕЙ
// ═══════════════════════════════════════════════════════

// ── Этаж 1: Тёмный лес ──
function bg_forest(t) {
  fillSky([[0,'#010a04'],[0.35,'#020e06'],[0.72,'#041508'],[1,'#071d0a']]);

  drawStars(77, 120, t, (i, br) => `rgba(${150+i%50},${200+i%40},${130+i%60},${br})`);

  // Луна — зеленовато-белая, стартует на 20% экрана от левого края
  const { x: mx, y: my } = moonPos(1600, 8000, 0.13);
  const hal = ctx.createRadialGradient(mx, my, 0, mx, my, 72);
  hal.addColorStop(0,'rgba(80,200,60,0.13)'); hal.addColorStop(0.5,'rgba(40,120,20,0.06)'); hal.addColorStop(1,'rgba(10,50,5,0)');
  ctx.fillStyle = hal; ctx.beginPath(); ctx.arc(mx, my, 72, 0, Math.PI*2); ctx.fill();
  const moon = ctx.createRadialGradient(mx-4, my-5, 2, mx, my, 20);
  moon.addColorStop(0,'rgba(220,255,195,1)'); moon.addColorStop(0.55,'rgba(165,225,130,0.92)'); moon.addColorStop(1,'rgba(80,160,55,0.45)');
  ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(mx, my, 20, 0, Math.PI*2); ctx.fill();

  // Горы — 3 слоя (последний yBase=GROUND — нет зазора)
  
  tileRange(33, GROUND,      GROUND*0.16, 'rgba(3,10,4,0.85)', 11, 0.130);

  // Деревья дальние
  drawTreeSilhouettes(555, 18, 0.12, 0.14, 8,  14, 'rgba(2,8,2,0.88)',  0.18, GROUND);
  // Деревья ближние
  drawTreeSilhouettes(666, 10, 0.20, 0.26, 20, 28, 'rgba(1,6,1,0.96)',  0.35, GROUND);

  tileRange(44, GROUND, GROUND*0.06, 'rgba(1,5,2,0.98)', 14, 0.280);


  // Светлячки — prlx(i, 300, 0.25, 3600) — диапазон 3600, spacing 300
  for (let i = 0; i < 12; i++) {
    const br = 0.25 + Math.sin(t*0.003 + i*1.9) * 0.25;
    const fx = prlx(i, 300, 0.25, 3600);
    const fy = GROUND * (0.58 + Math.sin(t*0.0018 + i) * 0.09 + i * 0.025);
    const gl = ctx.createRadialGradient(fx, fy, 0, fx, fy, 9);
    gl.addColorStop(0,`rgba(120,255,60,${br})`); gl.addColorStop(0.5,`rgba(50,180,20,${br*0.4})`); gl.addColorStop(1,'rgba(20,80,5,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(fx, fy, 9, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgba(190,255,130,${br})`; ctx.fillRect(fx-1, fy-1, 2, 2);
  }

  fillGround([[0,'#0c1e08'],[0.4,'#081408'],[1,'#050e05']]);
  ctx.fillStyle = '#1a3812'; ctx.fillRect(0, GROUND, W, 5);
  ctx.fillStyle = '#264e1a'; ctx.fillRect(0, GROUND, W, 2);

  // Трава — spacing 153, scrollFactor 1.0, range 6885 (45*153)
  for (let i = 0; i < 45; i++) {
    const gx = prlx(i, 153, 1.0, 6885);
    const gh = 3 + i%6;
    ctx.fillStyle = i%3===0 ? '#2a5018' : i%3===1 ? '#224010' : '#346824';
    ctx.fillRect(gx|0, GROUND-gh, 2, gh);
    ctx.fillRect((gx+10)|0, GROUND-(gh-1), 1, gh-1);
    if (i%5===0) ctx.fillRect((gx+5)|0, GROUND-(gh+2), 1, gh+2);
  }
}

// ── Этаж 2: Ледяные пещеры ──
function bg_ice(t) {
  fillSky([[0,'#000206'],[0.3,'#00040e'],[0.65,'#010a1e'],[1,'#03122e']]);

  drawStars(44, 180, t, (i, br) => `rgba(${160+i%60},${200+i%40},255,${br})`);

  // Аврора — ширина зависит от t и worldX, но позиция через prlx
  ctx.save();
  ctx.beginPath(); ctx.rect(0, HUD_H, W, GROUND - HUD_H); ctx.clip();
  for (let a = 0; a < 5; a++) {
    const ax  = prlx(a, 520, 0.010, 2600) + Math.sin(t*0.0003 + a) * 15;
    const aw  = 60 + a*20;
    const ah  = (GROUND - HUD_H) * (0.30 + a*0.06 + Math.sin(t*0.0007+a)*0.04);
    const ay  = HUD_H + (GROUND - HUD_H) * 0.04;
    const hue = a%2===0 ? [0,220,180] : [80,255,200];
    const ag  = ctx.createLinearGradient(ax, ay, ax, ay+ah);
    ag.addColorStop(0,  `rgba(${hue[0]},${hue[1]},${hue[2]},0)`);
    ag.addColorStop(0.25,`rgba(${hue[0]},${hue[1]},${hue[2]},${0.09+a%2*0.04})`);
    ag.addColorStop(0.65,`rgba(${hue[0]},${hue[1]},${hue[2]},${0.05+a%2*0.03})`);
    ag.addColorStop(1,  `rgba(${hue[0]},${hue[1]},${hue[2]},0)`);
    ctx.fillStyle = ag; ctx.fillRect(ax, ay, aw, ah);
  }
  ctx.restore();

  // Луна — большая, холодная, стартует на 70% экрана
  const { x: mx2, y: my2 } = moonPos(5600, 10000, 0.14);
  const hal2 = ctx.createRadialGradient(mx2, my2, 0, mx2, my2, 55);
  hal2.addColorStop(0,'rgba(160,210,255,0.18)'); hal2.addColorStop(0.5,'rgba(80,150,240,0.07)'); hal2.addColorStop(1,'rgba(40,100,200,0)');
  ctx.fillStyle = hal2; ctx.beginPath(); ctx.arc(mx2, my2, 55, 0, Math.PI*2); ctx.fill();
  const moon2 = ctx.createRadialGradient(mx2-5, my2-6, 3, mx2, my2, 22);
  moon2.addColorStop(0,'rgba(230,245,255,1)'); moon2.addColorStop(0.5,'rgba(185,220,255,0.95)'); moon2.addColorStop(1,'rgba(100,165,240,0.6)');
  ctx.fillStyle = moon2; ctx.beginPath(); ctx.arc(mx2, my2, 22, 0, Math.PI*2); ctx.fill();

  // Горы со снегом
  
  tileRange(37, GROUND,      GROUND*0.15, 'rgba(3,10,28,0.85)', 10, 0.140);

  // ЗЕМЛЯ сразу после гор
  fillGround([[0,'#081828'],[0.5,'#050f1c'],[1,'#030810']]);
  const iceLine = ctx.createLinearGradient(0, GROUND-2, 0, GROUND+6);
  iceLine.addColorStop(0,'rgba(100,180,255,0.6)'); iceLine.addColorStop(0.4,'rgba(60,130,220,0.4)'); iceLine.addColorStop(1,'rgba(20,70,160,0)');
  ctx.fillStyle = iceLine; ctx.fillRect(0, GROUND-2, W, 8);

  // Туман поверх стыка
  const ifog = ctx.createLinearGradient(0, GROUND*0.82, 0, GROUND+6);
  ifog.addColorStop(0,'rgba(10,40,100,0)'); ifog.addColorStop(0.7,'rgba(5,25,70,0.18)'); ifog.addColorStop(1,'rgba(2,15,50,0.40)');
  ctx.fillStyle = ifog; ctx.fillRect(0, GROUND*0.82, W, GROUND*0.18+6);

  // Снежинки
  const rngSn = lcg(321);
  for (let i = 0; i < 35; i++) {
    const speed  = 0.008 + rngSn()*0.012;
    const worldBase = rngSn() * TILE_W * 2;
    const sy0    = rngSn() * 0.55 + 0.40;
    const sa     = 0.3 + rngSn()*0.5;
    const raw    = ((worldBase - worldX*speed + t*speed*0.8) % (TILE_W*2) + TILE_W*2) % (TILE_W*2);
    const sx     = (raw / (TILE_W*2)) * (W * 1.1) - W * 0.05;
    const sy     = GROUND * sy0;
    ctx.fillStyle = `rgba(210,230,255,${sa})`;
    ctx.beginPath(); ctx.arc(sx, sy, 1 + rngSn()*0.8, 0, Math.PI*2); ctx.fill();
  }

  // Трещины льда
  for (let i = 0; i < 22; i++) {
    const ix = prlx(i, 183, 0.5, 4026);
    const ia = 0.15 + i%4*0.07;
    ctx.fillStyle = `rgba(${140+i%50},${190+i%40},255,${ia})`;
    ctx.fillRect(ix|0, GROUND+2, 8+i%10, 1);
    ctx.fillStyle = `rgba(80,140,255,${ia*0.4})`;
    ctx.fillRect(ix|0, GROUND+4, (8+i%10)*0.6|0, 1);
  }

  // Сталагмиты
  for (let i = 0; i < 8; i++) {
    const kx = prlx(i, 270, 0.4, 2160);
    const kh = 8 + i%7;
    const kg = ctx.createLinearGradient(kx, GROUND-kh, kx, GROUND);
    kg.addColorStop(0,'rgba(120,200,255,0.6)'); kg.addColorStop(1,'rgba(60,120,220,0.1)');
    ctx.fillStyle = kg;
    ctx.beginPath(); ctx.moveTo(kx-4, GROUND); ctx.lineTo(kx, GROUND-kh); ctx.lineTo(kx+4, GROUND); ctx.closePath(); ctx.fill();
  }
}

// ── Этаж 3: Планета Марс ──
function bg_mars(t) {
  fillSky([[0,'#0e0400'],[0.2,'#1e0800'],[0.5,'#331200'],[0.75,'#4a1e06'],[1,'#5c2a0a']]);

  drawStars(33, 40, t, (i, br) => `rgba(255,${200+i%40},${160+i%50},${br*0.35})`);

  // Марсианское солнце — стартует примерно на 75% экрана
  const { x: sunX, y: sunY } = moonPos(6000, 15000, 0.12);
  const sunHal = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 50);
  sunHal.addColorStop(0,'rgba(255,220,180,0.15)'); sunHal.addColorStop(0.5,'rgba(220,160,100,0.06)'); sunHal.addColorStop(1,'rgba(180,100,50,0)');
  ctx.fillStyle = sunHal; ctx.beginPath(); ctx.arc(sunX, sunY, 50, 0, Math.PI*2); ctx.fill();
  const sunDisc = ctx.createRadialGradient(sunX-2, sunY-2, 1, sunX, sunY, 13);
  sunDisc.addColorStop(0,'rgba(255,240,210,0.9)'); sunDisc.addColorStop(0.6,'rgba(240,200,150,0.75)'); sunDisc.addColorStop(1,'rgba(200,150,90,0.4)');
  ctx.fillStyle = sunDisc; ctx.beginPath(); ctx.arc(sunX, sunY, 13, 0, Math.PI*2); ctx.fill();

  // Фобос — медленно плывёт, с суточным вращением
  const { x: phx, y: phy } = moonPos(2000, 12000, 0.22);
  ctx.save(); ctx.translate(phx, phy); ctx.rotate(t * 0.0004);
  const phg = ctx.createRadialGradient(-2, -2, 0, 0, 0, 8);
  phg.addColorStop(0,'rgba(180,140,110,0.9)'); phg.addColorStop(0.6,'rgba(140,100,75,0.75)'); phg.addColorStop(1,'rgba(100,65,45,0.3)');
  ctx.fillStyle = phg; ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Пылевая дымка по небу
  const dustHaze = ctx.createLinearGradient(0, HUD_H, 0, GROUND);
  dustHaze.addColorStop(0,'rgba(120,55,15,0)'); dustHaze.addColorStop(0.4,'rgba(100,45,10,0.08)'); dustHaze.addColorStop(1,'rgba(80,35,5,0.22)');
  ctx.fillStyle = dustHaze; ctx.fillRect(0, HUD_H, W, GROUND - HUD_H);

  // Марсианские горы
  tileRange(75, GROUND,      GROUND*0.13, 'rgba(30,8,1,0.88)',  10, 0.130);

  // Пылевые частицы — TILE_W*2 диапазон
  const rngD = lcg(424);
  for (let i = 0; i < 30; i++) {
    const drWorld = rngD() * TILE_W * 2;
    const drs  = rngD();
    const dry  = rngD();
    const raw  = ((drWorld - worldX*0.12 + t*(0.008+drs*0.01)) % (TILE_W*2) + TILE_W*2) % (TILE_W*2);
    const dx   = (raw / (TILE_W*2)) * (W * 1.1) - W * 0.05;
    const dy   = GROUND * (0.25 + dry*0.55);
    const da   = 0.06 + drs*0.10;
    ctx.fillStyle = `rgba(${160+i%40},${75+i%30},${20+i%20},${da})`;
    ctx.fillRect(dx|0, dy|0, 2+i%4, 1);
  }

  // ЗЕМЛЯ сразу после гор
  fillGround([[0,'#3a1004'],[0.3,'#2c0c02'],[1,'#1a0801']]);
  const groundLine = ctx.createLinearGradient(0, GROUND-3, 0, GROUND+8);
  groundLine.addColorStop(0,'rgba(180,80,25,0.7)'); groundLine.addColorStop(0.4,'rgba(140,55,15,0.4)'); groundLine.addColorStop(1,'rgba(80,25,5,0)');
  ctx.fillStyle = groundLine; ctx.fillRect(0, GROUND-3, W, 11);

  // Туман поверх стыка
  const marsFog = ctx.createLinearGradient(0, GROUND*0.80, 0, GROUND+6);
  marsFog.addColorStop(0,'rgba(90,38,8,0)'); marsFog.addColorStop(0.6,'rgba(75,30,5,0.22)'); marsFog.addColorStop(1,'rgba(60,22,3,0.48)');
  ctx.fillStyle = marsFog; ctx.fillRect(0, GROUND*0.80, W, GROUND*0.20+6);

  // Камни
  const rngR = lcg(737);
  const rockSizes = Array.from({length:16}, () => ({ rw: 6+rngR()*18, rh: 4+rngR()*8 }));
  for (let i = 0; i < 16; i++) {
    const rx = prlx(i, 230, 0.55, 3680);
    const { rw, rh } = rockSizes[i];
    const rc = ctx.createLinearGradient(rx, GROUND-rh, rx, GROUND);
    rc.addColorStop(0,`rgba(${140+i%30},${55+i%20},${15+i%12},0.85)`);
    rc.addColorStop(1,`rgba(${90+i%20},${30+i%15},${8+i%8},0.5)`);
    ctx.fillStyle = rc; ctx.beginPath(); ctx.ellipse(rx, GROUND-rh*0.4, rw*0.5, rh*0.5, 0, 0, Math.PI*2); ctx.fill();
  }
}

// ── Этаж 4: Небеса ──
function bg_heavens(t) {
  fillSky([[0,'#010108'],[0.3,'#040318'],[0.7,'#0a082a'],[1,'#12103a']]);

  drawStars(22, 200, t, (i, br) => `rgba(${180+i%55},${170+i%50},255,${br})`);

  // Туманные облака-платформы — spacing 350, range TILE_W*2=2400 (без W)
  for (let c = 0; c < 6; c++) {
    const cx = prlx(c, 350, 0.018, 2100);
    const cy = GROUND * (0.42 + c*0.06);
    const cr = 130 + c*18;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    cg.addColorStop(0,'rgba(80,70,200,0.18)'); cg.addColorStop(0.5,'rgba(60,50,180,0.08)'); cg.addColorStop(1,'rgba(40,30,140,0)');
    ctx.fillStyle = cg; ctx.fillRect(cx-cr, cy-cr*0.5, cr*2, cr);
  }
  
  tileRange(82, GROUND,      GROUND*0.18, 'rgba(6,5,22,0.75)',  8, 0.070);

  // ЗЕМЛЯ сразу после гор
  fillGround([[0,'#0e0c28'],[0.4,'#080820'],[1,'#050518']]);
  const eg = ctx.createLinearGradient(0, GROUND-3, 0, GROUND+4);
  eg.addColorStop(0,'rgba(160,140,255,0.4)'); eg.addColorStop(1,'rgba(80,60,200,0)');
  ctx.fillStyle = eg; ctx.fillRect(0, GROUND-3, W, 7);

  // Туман поверх стыка
  const hfog = ctx.createLinearGradient(0, GROUND*0.83, 0, GROUND+6);
  hfog.addColorStop(0,'rgba(70,60,200,0)'); hfog.addColorStop(1,'rgba(40,30,150,0.28)');
  ctx.fillStyle = hfog; ctx.fillRect(0, GROUND*0.83, W, GROUND*0.17+6);

  // Блики на полу
  for (let i = 0; i < 22; i++) {
    const dx = prlx(i, 210, 1.0, 4620);
    ctx.fillStyle = `rgba(180,160,255,${0.15+i%3*0.1})`; ctx.fillRect(dx|0, GROUND, 2, 2);
  }
}

// ── Этаж 5: Бездна ──
function bg_abyss(t) {
  fillSky([[0,'#000000'],[0.4,'#02000c'],[1,'#05001a']]);

  // Фиолетовые звёзды — диапазон TILE_W*3 (без W)
  const rng5 = lcg(11);
  const range5 = TILE_W * 3;
  for (let i = 0; i < 260; i++) {
    const rx = rng5(), ry = rng5(), rb = rng5();
    const raw = ((rx * range5 - worldX * 0.004) % range5 + range5) % range5;
    const sx  = (raw / range5) * (W * 1.1) - W * 0.05;
    const sy  = HUD_H + ry * (GROUND - HUD_H) * 0.82;
    const br  = (0.1 + rb*0.45) * (0.6 + Math.sin(t*0.0014+i*0.7)*0.4);
    const cc  = ['rgba(160,80,255,','rgba(220,140,255,','rgba(80,20,200,'][i%3];
    ctx.fillStyle = cc + br + ')';
    ctx.fillRect(sx|0, sy|0, i%20===0?2.5:i%7===0?1.5:1, i%20===0?2.5:1);
  }

  // Пространственные разломы — spacing 340, range 1360
  for (let r = 0; r < 4; r++) {
    const rx  = prlx(r, 340, 0.016, 1360);
    const ry  = GROUND*(0.25+r*0.13);
    const rw  = 80 + r*20;
    const rg  = ctx.createLinearGradient(rx, ry, rx+rw, ry+25);
    rg.addColorStop(0,'rgba(100,0,220,0)'); rg.addColorStop(0.4,`rgba(140,0,255,0.18)`); rg.addColorStop(1,'rgba(80,0,180,0)');
    ctx.fillStyle = rg; ctx.fillRect(rx|0, ry|0, rw, 25);
    ctx.strokeStyle = 'rgba(180,80,255,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rx, ry+12); ctx.lineTo(rx+rw, ry+12); ctx.stroke();
  }

  tileRange(99, GROUND,      GROUND*0.14, 'rgba(2,0,8,0.88)',   9, 0.080);

  // ЗЕМЛЯ сразу после гор
  fillGround([[0,'#060012'],[0.4,'#04000e'],[1,'#02000a']]);
  ctx.fillStyle = 'rgba(110,0,200,0.55)'; ctx.fillRect(0, GROUND, W, 2);
  ctx.fillStyle = 'rgba(70,0,150,0.3)';  ctx.fillRect(0, GROUND+2, W, 3);

  // Туман поверх стыка
  const abFog = ctx.createLinearGradient(0, GROUND*0.83, 0, GROUND+6);
  abFog.addColorStop(0,'rgba(90,0,190,0)'); abFog.addColorStop(1,'rgba(60,0,140,0.35)');
  ctx.fillStyle = abFog; ctx.fillRect(0, GROUND*0.83, W, GROUND*0.17+6);

  // Фиолетовые трещины
  for (let i = 0; i < 8; i++) {
    const vx  = prlx(i, 205, 0.28, 1640);
    const vp  = 0.4 + Math.sin(t*0.002+i)*0.3;
    const vg2 = ctx.createLinearGradient(0, GROUND, 0, GROUND+10);
    vg2.addColorStop(0,`rgba(120,0,220,${vp})`); vg2.addColorStop(1,'rgba(40,0,80,0)');
    ctx.fillStyle = vg2; ctx.fillRect(vx|0, GROUND, 12+i%8, 10);
  }
}

// ── Этаж 6: Призрачный замок ──
function bg_ghost(t) {
  fillSky([[0,'#07080f'],[0.35,'#0a0c18'],[0.7,'#0f1022'],[1,'#141430']]);

  drawStars(55, 100, t, (i, br) => `rgba(${140+i%50},${160+i%40},${200+i%30},${br*0.7})`);

  // Призрачное зелёное свечение
  const gl2 = ctx.createLinearGradient(0, GROUND*0.5, 0, GROUND);
  gl2.addColorStop(0,'rgba(20,80,40,0)'); gl2.addColorStop(0.7,'rgba(10,60,25,0.08)'); gl2.addColorStop(1,'rgba(5,40,15,0.18)');
  ctx.fillStyle = gl2; ctx.fillRect(0, GROUND*0.5, W, GROUND*0.5);

  // Башни замка — spacing 280, range 1680
  for (let b = 0; b < 6; b++) {
    const bx  = prlx(b, 280, 0.06, 1680);
    const bh  = GROUND*(0.28+b%3*0.08);
    const bw  = 22 + b%3*8;
    ctx.fillStyle = 'rgba(6,5,16,0.92)';
    ctx.fillRect(bx|0, GROUND-bh, bw, bh);
    for (let m = 0; m < 3; m++) ctx.fillRect((bx + m*(bw/3))|0, GROUND-bh-8, (bw/3)-2, 8);
    const wbr = 0.15 + Math.sin(t*0.002+b*2)*0.10;
    ctx.fillStyle = `rgba(80,200,80,${wbr})`;
    ctx.fillRect((bx + bw/2-2)|0, (GROUND-bh+bh*0.3)|0, 4, 6);
  }

  tileRange(72, GROUND,      GROUND*0.13, 'rgba(5,4,14,0.82)',  9, 0.090);

  // ЗЕМЛЯ сразу после гор
  fillGround([[0,'#0c0d1c'],[0.4,'#080914'],[1,'#05060c']]);
  ctx.fillStyle = '#18182e'; ctx.fillRect(0, GROUND, W, 5);
  ctx.fillStyle = '#222240'; ctx.fillRect(0, GROUND, W, 2);

  // Туман поверх стыка
  const ghFog = ctx.createLinearGradient(0, GROUND*0.84, 0, GROUND+6);
  ghFog.addColorStop(0,'rgba(15,40,25,0)'); ghFog.addColorStop(1,'rgba(8,25,15,0.38)');
  ctx.fillStyle = ghFog; ctx.fillRect(0, GROUND*0.84, W, GROUND*0.16+6);

  // Брусчатка
  for (let i = 0; i < 20; i++) {
    const cx  = prlx(i, 185, 0.7, 3700);
    ctx.fillStyle = i%2===0?'rgba(20,20,40,0.5)':'rgba(14,14,28,0.4)';
    ctx.fillRect(cx|0, GROUND+3, 30, 8);
  }
}

// ── Этаж 7: Кристальные шахты ──
function bg_crystal(t) {
  fillSky([[0,'#030810'],[0.4,'#050e1c'],[0.8,'#071428'],[1,'#091a34']]);

  drawStars(88, 80, t, (i, br) => `rgba(${80+i%60},${140+i%60},255,${br*0.8})`);

  // Кристальные пятна свечения — spacing 280, range 1400
  for (let c = 0; c < 5; c++) {
    const cx = prlx(c, 280, 0.02, 1400);
    const cr = 90 + c*15;
    const cg = ctx.createRadialGradient(cx, GROUND*0.55, 0, cx, GROUND*0.55, cr);
    cg.addColorStop(0,'rgba(40,120,255,0.12)'); cg.addColorStop(1,'rgba(20,60,200,0)');
    ctx.fillStyle = cg; ctx.fillRect(cx-cr, GROUND*0.55-cr, cr*2, cr*2);
  }

  // Сталактиты — spacing 220, range 3080
  const rngS = lcg(777);
  const stalW = Array.from({length:14}, () => 6+rngS()*12);
  const stalH = Array.from({length:14}, () => (GROUND-HUD_H)*(0.06+rngS()*0.10));
  for (let i = 0; i < 14; i++) {
    const sx2 = prlx(i, 220, 0.09, 3080);
    const sh  = stalH[i], sw2 = stalW[i];
    const sg2 = ctx.createLinearGradient(sx2, HUD_H, sx2, HUD_H+sh);
    sg2.addColorStop(0,'rgba(60,140,255,0.7)'); sg2.addColorStop(0.6,'rgba(30,80,220,0.5)'); sg2.addColorStop(1,'rgba(20,60,180,0)');
    ctx.fillStyle = sg2;
    ctx.beginPath(); ctx.moveTo(sx2, HUD_H); ctx.lineTo(sx2+sw2, HUD_H); ctx.lineTo(sx2+sw2/2, HUD_H+sh); ctx.closePath(); ctx.fill();
  }

  tileRange(94, GROUND,      GROUND*0.15, 'rgba(4,10,28,0.80)',  8, 0.090);

  // ЗЕМЛЯ сразу после гор
  fillGround([[0,'#080e20'],[0.4,'#050a18'],[1,'#030710']]);
  ctx.fillStyle = '#0e2050'; ctx.fillRect(0, GROUND, W, 5);
  ctx.fillStyle = '#103070'; ctx.fillRect(0, GROUND, W, 2);

  // Туман поверх стыка
  const crFog = ctx.createLinearGradient(0, GROUND*0.84, 0, GROUND+6);
  crFog.addColorStop(0,'rgba(20,60,180,0)'); crFog.addColorStop(1,'rgba(10,35,120,0.35)');
  ctx.fillStyle = crFog; ctx.fillRect(0, GROUND*0.84, W, GROUND*0.16+6);

  // Кристаллы на полу
  for (let i = 0; i < 15; i++) {
    const kx = prlx(i, 240, 0.5, 3600);
    const kh = 6 + i%5;
    const kg = ctx.createLinearGradient(kx, GROUND-kh, kx, GROUND);
    kg.addColorStop(0,'rgba(80,180,255,0.7)'); kg.addColorStop(1,'rgba(40,100,220,0)');
    ctx.fillStyle = kg;
    ctx.beginPath(); ctx.moveTo(kx, GROUND); ctx.lineTo(kx+4, GROUND-kh); ctx.lineTo(kx+8, GROUND); ctx.closePath(); ctx.fill();
  }
}

// ── Этаж 8: Пустыня Забытых ──
function bg_desert(t) {
  fillSky([[0,'#080400'],[0.25,'#140900'],[0.6,'#221000'],[1,'#351900']]);

  drawStars(101, 50, t, (i, br) => `rgba(255,${160+i%60},${60+i%60},${br*0.4})`);

  // Янтарная луна — стартует чуть правее центра
  const { x: mx8, y: my8 } = moonPos(4500, 9000, 0.18);
  const hal8 = ctx.createRadialGradient(mx8,my8,0,mx8,my8,60);
  hal8.addColorStop(0,'rgba(255,180,30,0.12)'); hal8.addColorStop(1,'rgba(180,80,0,0)');
  ctx.fillStyle=hal8; ctx.beginPath(); ctx.arc(mx8,my8,60,0,Math.PI*2); ctx.fill();
  const m8 = ctx.createRadialGradient(mx8-3,my8-4,2,mx8,my8,22);
  m8.addColorStop(0,'rgba(255,230,120,0.95)'); m8.addColorStop(0.6,'rgba(240,170,60,0.85)'); m8.addColorStop(1,'rgba(180,90,10,0.4)');
  ctx.fillStyle=m8; ctx.beginPath(); ctx.arc(mx8,my8,22,0,Math.PI*2); ctx.fill();

  // Дюны — 3 слоя
  tileRange(133, GROUND,      GROUND*0.09, 'rgba(22,8,0,0.90)',  10, 0.140);

  // ЗЕМЛЯ сразу после гор
  fillGround([[0,'#2c1200'],[0.3,'#1e0e00'],[1,'#120900']]);
  ctx.fillStyle = '#3a1800'; ctx.fillRect(0, GROUND, W, 5);
  ctx.fillStyle = '#4a2000'; ctx.fillRect(0, GROUND, W, 2);

  // Туман + пыль поверх стыка
  const dsFog = ctx.createLinearGradient(0, GROUND*0.82, 0, GROUND+6);
  dsFog.addColorStop(0,'rgba(180,90,10,0)'); dsFog.addColorStop(1,'rgba(140,70,5,0.38)');
  ctx.fillStyle = dsFog; ctx.fillRect(0, GROUND*0.82, W, GROUND*0.18+6);

  // Пылевые вихри
  for (let d = 0; d < 3; d++) {
    const dx  = prlx(d, 400, 0.15, 1200) + Math.sin(t*0.0008+d)*8;
    const dy  = GROUND*(0.70+d*0.06);
    const dr  = 20 + d*8;
    const dg  = ctx.createRadialGradient(dx,dy,0,dx,dy,dr);
    dg.addColorStop(0,'rgba(200,130,30,0.10)'); dg.addColorStop(1,'rgba(150,80,10,0)');
    ctx.fillStyle=dg; ctx.beginPath(); ctx.arc(dx,dy,dr,0,Math.PI*2); ctx.fill();
  }

  // Рябь песка
  for (let i = 0; i < 25; i++) {
    const sx = prlx(i, 160, 0.55, 4000);
    ctx.fillStyle = `rgba(80,40,0,${0.3+i%3*0.1})`; ctx.fillRect(sx|0, GROUND+3, 20, 2);
  }
}

// ── Этаж 9: Морские глубины ──
function bg_ocean(t) {
  fillSky([[0,'#000508'],[0.4,'#000c14'],[0.8,'#001422'],[1,'#001830']]);

  // Фосфоресцирующие частицы — TILE_W*2 диапазон (без W)
  const rngO = lcg(999);
  const rangeO = TILE_W * 2;
  for (let i = 0; i < 80; i++) {
    const rx=rngO(), ry=rngO(), rb=rngO();
    const raw = ((rx*rangeO - worldX*0.005) % rangeO + rangeO) % rangeO;
    const ox  = (raw / rangeO) * (W * 1.1) - W * 0.05;
    const oy  = HUD_H + ry * (GROUND - HUD_H);
    const obr = (0.1+rb*0.5)*(0.5+Math.sin(t*0.0018+i*1.5)*0.5);
    ctx.fillStyle = `rgba(0,${180+i%60},${220+i%30},${obr*0.6})`;
    ctx.fillRect(ox|0, oy|0, 1.5, 1.5);
  }

  // Медузы — spacing 320, range 1280
  for (let j = 0; j < 4; j++) {
    const jx  = prlx(j, 320, 0.08, 1280);
    const jy  = GROUND*(0.25 + j*0.12 + Math.sin(t*0.0012+j)*0.05);
    const jg  = ctx.createRadialGradient(jx, jy, 0, jx, jy, 30+j*8);
    jg.addColorStop(0,`rgba(0,220,${180+j*20},0.15)`); jg.addColorStop(1,'rgba(0,100,180,0)');
    ctx.fillStyle = jg; ctx.beginPath(); ctx.arc(jx, jy, 30+j*8, 0, Math.PI*2); ctx.fill();
  }

  tileRange(152, GROUND,      GROUND*0.15, 'rgba(0,8,22,0.82)',   8, 0.080);

  // Лучи света — spacing 350, range 1050
  for (let l = 0; l < 3; l++) {
    const lx  = prlx(l, 350, 0.04, 1050);
    const la  = 0.04 + Math.sin(t*0.001+l)*0.02;
    const lg2 = ctx.createLinearGradient(lx, HUD_H, lx+40, GROUND);
    lg2.addColorStop(0,`rgba(0,160,220,${la})`); lg2.addColorStop(1,'rgba(0,60,130,0)');
    ctx.fillStyle = lg2;
    ctx.beginPath(); ctx.moveTo(lx, HUD_H); ctx.lineTo(lx+40, GROUND); ctx.lineTo(lx+55, GROUND); ctx.lineTo(lx+15, HUD_H); ctx.closePath(); ctx.fill();
  }

  // ЗЕМЛЯ сразу после рифов
  fillGround([[0,'#000a18'],[0.4,'#000814'],[1,'#00060e']]);
  ctx.fillStyle = '#001430'; ctx.fillRect(0, GROUND, W, 5);
  ctx.fillStyle = '#001c40'; ctx.fillRect(0, GROUND, W, 2);

  // Туман поверх стыка (вода)
  const ocFog = ctx.createLinearGradient(0, GROUND*0.83, 0, GROUND+6);
  ocFog.addColorStop(0,'rgba(0,40,90,0)'); ocFog.addColorStop(1,'rgba(0,25,70,0.42)');
  ctx.fillStyle = ocFog; ctx.fillRect(0, GROUND*0.83, W, GROUND*0.17+6);

  // Пузыри
  for (let b = 0; b < 12; b++) {
    const raw = ((b * 190 - worldX*0.2 + t*0.008) % 2280 + 2280) % 2280;
    const bx  = (raw / 2280) * (W * 1.1) - W * 0.05;
    ctx.strokeStyle = 'rgba(0,180,255,0.2)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(bx|0, GROUND+3+b%4, 2+b%3, 0, Math.PI*2); ctx.stroke();
  }
}

// ── Этаж 10: Небесная Цитадель ──
function bg_citadel(t) {
  fillSky([[0,'#040308'],[0.3,'#070514'],[0.65,'#0c0a24'],[1,'#121036']]);

  drawStars(210, 220, t, (i, br) => `rgba(${200+i%40},${190+i%35},255,${br})`);

  // Золотые облака — spacing 300, range 2100
  for (let c = 0; c < 7; c++) {
    const cx  = prlx(c, 300, 0.015, 2100);
    const cy  = GROUND*(0.38 + c*0.05);
    const cr  = 100 + c*15;
    const al  = 0.06 + c%2*0.04;
    const cg  = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    cg.addColorStop(0,`rgba(220,185,80,${al})`); cg.addColorStop(0.5,`rgba(160,130,60,${al*0.5})`); cg.addColorStop(1,'rgba(100,80,40,0)');
    ctx.fillStyle = cg; ctx.fillRect(cx-cr, cy-cr*0.6, cr*2, cr*1.2);
  }

  // Башни цитадели — spacing 340, range 1700
  for (let b = 0; b < 5; b++) {
    const bx  = prlx(b, 340, 0.05, 1700);
    const bh  = GROUND*(0.35+b%2*0.10);
    const bw2 = 18 + b%3*10;
    const bg2 = ctx.createLinearGradient(bx, GROUND-bh, bx, GROUND);
    bg2.addColorStop(0,'rgba(14,12,40,0.95)'); bg2.addColorStop(1,'rgba(8,7,25,0.98)');
    ctx.fillStyle = bg2; ctx.fillRect(bx|0, GROUND-bh, bw2, bh);
    const wbr = 0.2 + Math.sin(t*0.0018+b*1.5)*0.12;
    ctx.fillStyle = `rgba(255,210,80,${wbr})`;
    ctx.fillRect((bx+bw2/2-2)|0, (GROUND-bh*0.35)|0, 4, 5);
  }

  tileRange(212, GROUND,      GROUND*0.15, 'rgba(7,5,20,0.75)',   8, 0.080);

  // ЗЕМЛЯ сразу после гор
  fillGround([[0,'#0e0c28'],[0.4,'#080820'],[1,'#050518']]);
  const edge = ctx.createLinearGradient(0, GROUND-4, 0, GROUND+4);
  edge.addColorStop(0,'rgba(200,170,60,0.35)'); edge.addColorStop(1,'rgba(100,80,20,0)');
  ctx.fillStyle = edge; ctx.fillRect(0, GROUND-4, W, 8);

  // Золотой туман поверх стыка
  const gfog = ctx.createLinearGradient(0, GROUND*0.83, 0, GROUND+6);
  gfog.addColorStop(0,'rgba(120,90,20,0)'); gfog.addColorStop(1,'rgba(80,60,15,0.32)');
  ctx.fillStyle = gfog; ctx.fillRect(0, GROUND*0.83, W, GROUND*0.17+6);

  // Мозаика
  for (let i = 0; i < 22; i++) {
    const mx2 = prlx(i, 195, 1.0, 4290);
    ctx.fillStyle = i%2===0?'rgba(18,15,45,0.6)':'rgba(12,10,32,0.5)';
    ctx.fillRect(mx2|0, GROUND+3, 28, 8);
    ctx.fillStyle = 'rgba(60,50,120,0.15)'; ctx.fillRect(mx2|0, GROUND+3, 28, 1);
  }
}

// ═══════════════════════════════
//  ДИСПЕТЧЕР ФОНОВ с кроссфейдом
// ═══════════════════════════════
const BG_RENDERERS = [
  bg_forest,   // 1
  bg_ice,      // 2
  bg_mars,     // 3
  bg_heavens,  // 4
  bg_abyss,    // 5
  bg_ghost,    // 6
  bg_crystal,  // 7
  bg_desert,   // 8
  bg_ocean,    // 9
  bg_citadel,  // 10
];

function drawBackground(t) {
  const target = Math.min(G.floor, BG_RENDERERS.length);
  if (bgFloor !== target) {
    bgPrev  = bgFloor;
    bgFloor = target;
    bgAlpha = 0;
  }
  if (bgAlpha < 1) {
    BG_RENDERERS[bgPrev - 1](t);
    ctx.save();
    ctx.globalAlpha = bgAlpha;
    BG_RENDERERS[bgFloor - 1](t);
    ctx.restore();
    bgAlpha = Math.min(1, bgAlpha + BG_FADE);
  } else {
    BG_RENDERERS[bgFloor - 1](t);
  }
}

// ═══════════════════════════════
//  ИГРОК
// ═══════════════════════════════
function drawPlayer() {
  if (player.invincible > 0 && Math.floor(player.invincible * 10) % 2 === 0) return;
  const px = PLAYER_SCREEN_X, py = player.y;
  ctx.globalAlpha = player.state === 'dead' ? 0.4 : 1;
  ctx.imageSmoothingEnabled = false;
  const _AF  = window.ATK_FRAMES_CUR  || ATK_FRAMES;
  const _AFW = window.ATK_FW_CUR      || ATK_FW;
  const _RF  = window.RUN_FRAMES_CUR  || RUN_FRAMES;
  const _RFW = window.RUN_FW_CUR      || RUN_FW;
  const _IF  = window.IDLE_FRAMES_CUR || IDLE_FRAMES;
  const _IFW = window.IDLE_FW_CUR     || IDLE_FW;
  if (gInBattle && atkAnimTimer >= 0) {
    const fr = Math.min(_AF-1, Math.floor((atkAnimTimer/ATK_ANIM_DUR)*_AF));
    ctx.drawImage(spriteAtk, fr*_AFW, 0, _AFW, ATK_FH, px|0, py|0, 128, 128);
  } else if (gInBattle && atkAnimTimer < 0) {
    const fr = Math.floor(spriteRunTime * IDLE_FPS) % _IF;
    ctx.drawImage(spriteIdle, fr*_IFW, 0, _IFW, IDLE_FH, px|0, py|0, 128, 128);
  } else {
    const fr = Math.floor(spriteRunTime * SPRITE_FPS) % _RF;
    ctx.drawImage(spriteRun, fr*_RFW, 0, _RFW, RUN_FH, px|0, py|0, 128, 128);
  }
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════
//  МОНСТР
// ═══════════════════════════════
function drawMonster(m) {
  const mx = m.worldX - worldX;
  if (mx > W + 100 || mx < -100) return;
  ctx.globalAlpha = m.hitFlash > 0 ? 0.5 : 1;
  ctx.imageSmoothingEnabled = false;

  let sprite, frame, fw, fh, oy = 0;

  if (m.sk && MONSTER_SPRITES[m.sk]) {
    const sp = MONSTER_SPRITES[m.sk];
    let anim;
    if (m.isAttacking) {
      anim = sp.atk;
      frame = Math.floor(Math.min(m.attackAnimTimer / 0.4, 1) * anim.frames);
      if (frame >= anim.frames) frame = anim.frames - 1;
    } else if (m.state === 'run') {
      anim = sp.run;
      frame = Math.floor(m.frame / 5) % anim.frames;
    } else {
      anim = sp.idle;
      frame = Math.floor(m.frame / 8) % anim.frames;
    }
    fw = anim.fw; fh = anim.fh; sprite = anim.img;
    oy = sp.oy || 0;
  } else {
    if (m.isAttacking) {
      sprite = spriteMonsterAtk;
      frame  = Math.floor(Math.min(m.attackAnimTimer / 0.4, 1) * MONSTER_ATK_FRAMES);
      if (frame >= MONSTER_ATK_FRAMES) frame = MONSTER_ATK_FRAMES - 1;
      fw = MONSTER_ATK_FW; fh = MONSTER_ATK_FH;
    } else if (m.state === 'run') {
      sprite = spriteMonster; frame = Math.floor(m.frame / 8) % MONSTER_FRAMES;
      fw = MONSTER_FW; fh = MONSTER_FH;
    } else {
      sprite = spriteMonsterIdle; frame = Math.floor(m.frame / 10) % MONSTER_IDLE_FRAMES;
      fw = MONSTER_IDLE_FW; fh = MONSTER_IDLE_FH;
    }
  }

  const scale = m.isBoss ? 2.0 : 1.0;
  const drawW = Math.floor(fw * scale);
  const drawH = Math.floor(fh * scale);
  const drawY = (GROUND - drawH + Math.floor(oy * scale)) | 0;

  ctx.save();
  ctx.translate(mx | 0, 0);
  ctx.scale(-1, 1);
  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(sprite, frame * fw, 0, fw, fh, (-drawW / 2) | 0, drawY, drawW, drawH);
  }
  ctx.restore();

  const ohVal = (m.sk && MONSTER_SPRITES[m.sk]) ? (MONSTER_SPRITES[m.sk].oh || fh) : fh;
  if (m.isBoss) {
    const barW = 130, bx = mx - 65;
    const by   = (GROUND - ohVal * 2) - 24;
    ctx.font = 'bold 13px Courier New'; ctx.fillStyle = '#ffd700'; ctx.textAlign = 'center';
    ctx.fillText('⚔ ' + m.name, mx, by - 4);
    pixelRect(bx - 1, by - 1, barW + 2, 11, '#500');
    pixelRect(bx, by, barW, 9, '#300');
    pixelRect(bx, by, Math.floor(barW * m.hp / m.maxHp), 9, '#e74c3c');
    ctx.font = '9px Courier New'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(m.hp.toLocaleString() + ' / ' + m.maxHp.toLocaleString(), mx, by + 8);
  } else {
    const barW = 50, bx = mx - 25;
    const by   = (GROUND - ohVal) - 5;
    pixelRect(bx, by, barW, 5, '#400');
    pixelRect(bx, by, Math.floor(barW * m.hp / m.maxHp), 5, '#f44');
    if (m.sk && MONSTER_SPRITES[m.sk]) {
      ctx.font = '11px Courier New'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(m.name, mx, by - 3);
    }
  }
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════
//  СНАРЯДЫ
// ═══════════════════════════════
function drawFireballs() {
  fireballs.forEach(fb => {
    const sx = fb.worldX - worldX, sy = fb.y;
    const pt = fb.ptype || 'fire';

    if (pt === 'fire') {
      // Огненный шар — оранжево-красный
      ctx.save(); ctx.translate(sx+12, sy+12); ctx.rotate(fb.angle);
      const c0 = fb.skillColor ? '#fff' : '#fff8b0';
      const c1 = fb.skillColor || '#ff8800';
      const gr = ctx.createRadialGradient(0,0,2,0,0,12);
      gr.addColorStop(0,c0); gr.addColorStop(0.4,c1); gr.addColorStop(1,'rgba(255,40,0,0)');
      ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fill();
      ctx.restore();

    } else if (pt === 'light') {
      // Молния — от игрока до монстра, мгновенная с затуханием
      const alpha = fb.life / fb.maxLife;
      const fromX = PLAYER_SCREEN_X + 50;
      const fromY = player.y + 60;
      const toX   = fb.targetM.worldX - worldX;
      const toY   = fb.targetM.y + fb.targetM.h * 0.4;
      const dx2 = toX - fromX, dy2 = toY - fromY;
      const len2 = Math.sqrt(dx2*dx2 + dy2*dy2) || 1;
      const nx2 = -dy2/len2, ny2 = dx2/len2;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 14;
      // Внешняя молния
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(fromX, fromY);
      const segs = 7;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const j = (i === segs) ? 0 : (Math.random() - 0.5) * 20;
        ctx.lineTo(fromX + dx2*t + nx2*j, fromY + dy2*t + ny2*j);
      }
      ctx.stroke();
      // Ядро
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(fromX, fromY);
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const j = (i === segs) ? 0 : (Math.random() - 0.5) * 10;
        ctx.lineTo(fromX + dx2*t + nx2*j, fromY + dy2*t + ny2*j);
      }
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      ctx.restore();

    } else if (pt === 'water') {
      // Водяной шар — синий с волной
      ctx.save(); ctx.translate(sx+10, sy+10);
      const gr = ctx.createRadialGradient(0,0,2,0,0,10);
      gr.addColorStop(0,'#ffffff');
      gr.addColorStop(0.3,'#44d4ff');
      gr.addColorStop(0.7,'#0088cc');
      gr.addColorStop(1,'rgba(0,100,200,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
      // Блик
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.ellipse(-3,-3,4,2.5,Math.PI/4,0,Math.PI*2); ctx.fill();
      ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 8;
      ctx.strokeStyle = '#00ccff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  });
}

// ═══════════════════════════════
//  ЧАСТИЦЫ
// ═══════════════════════════════
function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life / p.maxLife;
    pixelRect(p.worldX-worldX, p.y, p.size, p.size, p.color);
  });
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════
//  ГЛАВНЫЙ РЕНДЕР
// ═══════════════════════════════
function render() {
  const t = performance.now();
  ctx.clearRect(0, 0, W, H);
  drawBackground(t);
  monsters.forEach(drawMonster);
  drawFireballs();
  drawPlayer();
  drawParticles();
}

// ═══════════════════════════════════════════════════════
//  PvP — Спрайты персонажей
// ═══════════════════════════════════════════════════════
var _pvpCharSprites = {};
function pvpGetCharSprites(charId) {
  if (_pvpCharSprites[charId]) return _pvpCharSprites[charId];
  var def = CHARS[charId];
  if (!def) return null;
  var run  = new Image(); run.src  = def.runSrc;
  var atk  = new Image(); atk.src  = def.atkSrc;
  var idle = new Image(); idle.src = def.idleSrc;
  _pvpCharSprites[charId] = { run, atk, idle, def };
  return _pvpCharSprites[charId];
}

// ── PvP состояние отрисовки ──
var pvpRenderState = {
  active:     false,
  yourIdx:    0,
  fighters:   [
    { charId: 'fire',  hp: 100, maxHp: 100, animTime: 0, state: 'idle', hitFlash: 0, buffs: {}, debuffs: {} },
    { charId: 'water', hp: 100, maxHp: 100, animTime: 0, state: 'idle', hitFlash: 0, buffs: {}, debuffs: {} },
  ],
  floatingTexts: [],
  lastTs: 0,
};

// Вызывается из game loop
// Снаряды PvP: { x, y, tx, ty, color, speed, timer }
var pvpProjectiles = [];

function pvpSpawnProjectile(fromIdx, color) {
  var SIZE = Math.min(W * 0.38, 160);
  var gnd  = H * 0.72;
  var x0 = fromIdx === 0 ? W * 0.12 + SIZE * 0.85 : W - W * 0.12 - SIZE * 0.85;
  var y0 = gnd - SIZE * 0.45;
  var x1 = fromIdx === 0 ? W - W * 0.12 - SIZE * 0.5 : W * 0.12 + SIZE * 0.5;
  var y1 = gnd - SIZE * 0.45;
  pvpProjectiles.push({ x: x0, y: y0, tx: x1, ty: y1, color: color || '#ffcc00', timer: 0.6 });
}

function renderPvp(ts) {
  if (!pvpRenderState.active) return;

  var dt  = Math.min((ts - pvpRenderState.lastTs) / 1000, 0.1);
  pvpRenderState.lastTs = ts;

  pvpRenderState.fighters.forEach(function(f) {
    f.animTime += dt;
    if (f.hitFlash > 0) f.hitFlash -= dt;
  });

  ctx.clearRect(0, 0, W, H);
  _pvpDrawBackground();
  _pvpDrawFighter(0, ts, dt);
  _pvpDrawFighter(1, ts, dt);
  _pvpDrawProjectiles(dt);
  _pvpDrawHpBars();
  _pvpDrawFloatingTexts(dt);
}

function _pvpDrawProjectiles(dt) {
  pvpProjectiles = pvpProjectiles.filter(function(p) {
    p.timer -= dt;
    if (p.timer <= 0) return false;
    var progress = 1 - (p.timer / 0.6);
    var cx = p.x + (p.tx - p.x) * progress;
    var cy = p.y + (p.ty - p.y) * progress - Math.sin(progress * Math.PI) * 30;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.timer * 3);
    ctx.shadowColor = p.color; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    // Хвост
    ctx.beginPath();
    var tailX = p.x + (p.tx - p.x) * Math.max(0, progress - 0.15);
    var tailY = p.y + (p.ty - p.y) * Math.max(0, progress - 0.15) - Math.sin(Math.max(0, progress - 0.15) * Math.PI) * 30;
    ctx.moveTo(tailX, tailY); ctx.lineTo(cx, cy);
    ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.globalAlpha *= 0.4;
    ctx.stroke();
    ctx.restore();
    return true;
  });
}

function _pvpDrawBackground() {
  // Простой тёмный фон с линией земли
  var grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#050510');
  grad.addColorStop(1, '#0a0a20');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Земля
  var gnd = H * 0.72;
  ctx.fillStyle = '#111128';
  ctx.fillRect(0, gnd, W, H - gnd);
  ctx.fillStyle = '#1a1a40';
  ctx.fillRect(0, gnd, W, 3);

  // Разделитель посередине (декоративный)
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(W / 2, H * 0.1);
  ctx.lineTo(W / 2, gnd);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function _pvpDrawFighter(idx, ts, dt) {
  var f   = pvpRenderState.fighters[idx];
  var spr = pvpGetCharSprites(f.charId);
  if (!spr) return;

  var gnd = H * 0.72;
  var SIZE = Math.min(W * 0.38, 160);
  var py  = gnd - SIZE;

  // Позиция: idx=0 слева, idx=1 справа (зеркально)
  var px;
  if (idx === 0) { px = W * 0.12; }
  else           { px = W - W * 0.12 - SIZE; }

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Зеркалим правого бойца
  if (idx === 1) {
    ctx.translate(px + SIZE, py);
    ctx.scale(-1, 1);
    px = 0; py = 0;
  }

  // Мигание при попадании
  if (f.hitFlash > 0) {
    ctx.globalAlpha = 0.4 + Math.abs(Math.sin(f.hitFlash * 30)) * 0.6;
  }

  // Выбираем анимацию
  var img, frames, fw, fh;
  if (f.state === 'atk') {
    img = spr.atk; frames = spr.def.atkFrames; fw = spr.def.atkFW; fh = spr.def.atkFH;
  } else if (f.state === 'idle' || f.state === 'fight') {
    img = spr.idle; frames = spr.def.idleFrames; fw = spr.def.idleFW; fh = spr.def.idleFH;
  } else {
    img = spr.run; frames = spr.def.runFrames; fw = spr.def.runFW; fh = spr.def.runFH;
  }
  var frame = Math.floor(f.animTime * 16) % frames;
  ctx.drawImage(img, frame * fw, 0, fw, fh, px|0, py|0, SIZE, SIZE);

  ctx.restore();

  // Иконки баффов под бойцом
  _pvpDrawBuffIcons(idx, f);
}

function _pvpDrawBuffIcons(idx, f) {
  var gnd = H * 0.72;
  var SIZE = Math.min(W * 0.38, 160);
  var cx = idx === 0 ? W * 0.12 + SIZE / 2 : W - W * 0.12 - SIZE / 2;
  var y  = gnd + 6;

  var icons = [];
  if (f.buffs)   { if (f.buffs.haste)    icons.push('⚡'); if (f.buffs.shield)   icons.push('🛡'); if (f.buffs.reflect)  icons.push('↩'); if (f.buffs.critBoost) icons.push('🎯'); }
  if (f.debuffs) { if (f.debuffs.frozen) icons.push('❄'); if (f.debuffs.cursed) icons.push('💀'); }

  ctx.font = '14px serif';
  ctx.textAlign = 'center';
  icons.forEach(function(ic, i) {
    ctx.fillText(ic, cx + (i - (icons.length - 1) / 2) * 18, y + 14);
  });
}

function _pvpDrawHpBars() {
  var f0 = pvpRenderState.fighters[0];
  var f1 = pvpRenderState.fighters[1];
  var barW = W * 0.40, barH = 12;
  var marginX = W * 0.04;
  var topY = (HUD_H || 60) + 14;
  _pvpDrawOneHpBar(marginX, topY, barW, barH, f0, false);
  _pvpDrawOneHpBar(W - marginX - barW, topY, barW, barH, f1, true);
}

function _pvpDrawOneHpBar(x, y, w, h, f, isRight) {
  var pct   = Math.max(0, f.hp / f.maxHp);
  var color = pct > 0.5 ? '#2ecc71' : pct > 0.25 ? '#f5c542' : '#e74c3c';

  // Фон
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); _pvpRRect(x - 2, y - 2, w + 4, h + 4, 4); ctx.fill();

  // Полоска
  ctx.fillStyle = '#1a1a2a';
  ctx.beginPath(); _pvpRRect(x, y, w, h, 3); ctx.fill();
  ctx.fillStyle = color;
  if (isRight) {
    ctx.fillRect(x + w * (1 - pct), y, w * pct, h);
  } else {
    ctx.fillRect(x, y, w * pct, h);
  }

  // Имя + HP
  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.fillStyle = '#ccc';
  ctx.textAlign = isRight ? 'right' : 'left';
  var label = f.name + '  ' + f.hp + '/' + f.maxHp;
  ctx.fillText(label, isRight ? x + w : x, y - 4);

  // Рейтинг
  ctx.font = '9px "Courier New", monospace';
  ctx.fillStyle = '#a78bfa';
  var ratingLabel = '★ ' + (f.arenaRating || 1000);
  ctx.fillText(ratingLabel, isRight ? x + w : x, y + h + 12);
}

function _pvpRRect(x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _pvpDrawFloatingTexts(dt) {
  pvpRenderState.floatingTexts = pvpRenderState.floatingTexts.filter(function(ft) {
    ft.timer -= dt;
    ft.y -= dt * 40;
    if (ft.timer <= 0) return false;
    ctx.save();
    ctx.globalAlpha = Math.min(1, ft.timer / 0.4);
    ctx.font = 'bold ' + (ft.big ? '20' : '15') + 'px "Courier New", monospace';
    ctx.fillStyle = ft.color || '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
    return true;
  });
}

// Добавить плавающий текст урона
function pvpAddFloatText(idx, text, color, big) {
  var SIZE = Math.min(W * 0.38, 160);
  var cx = idx === 0 ? W * 0.12 + SIZE * 0.5 : W - W * 0.12 - SIZE * 0.5;
  var gnd = H * 0.72;
  pvpRenderState.floatingTexts.push({ x: cx + (Math.random() - 0.5) * 40, y: gnd - SIZE * 0.5, text: text, color: color, timer: 1.0, big: big || false });
}

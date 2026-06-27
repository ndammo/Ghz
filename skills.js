/*
  ══════════════════════════════════════════════════════
  skills.js — Система навыков персонажей
  Содержит: хранение кулдаунов и баффов, получение
  активных скиллов, ручной каст, HUD скиллов (иконки
  над кнопкой ИГРА), обновление скиллов за тик,
  функции эффективных характеристик с учётом баффов
  ══════════════════════════════════════════════════════
*/

// ── Текущие кулдауны [0,1,2] и активные баффы ──
var skillCooldowns = [0, 0, 0];
var skillBuffs = {};

// ── Вспомогательные функции ──
function getActiveSkills() {
  if (!G_CHAR) return [];
  return SKILLS_DEF[G_CHAR.id] || [];
}

function getSkillState(id) {
  if (!G.skills) G.skills = {};
  if (!G.skills[id]) G.skills[id] = { unlocked: false, level: 0 };
  return G.skills[id];
}

// ── Ручной каст навыка (по нажатию кнопки) ──
function castSkillManual(i) {
  var skills = getActiveSkills();
  var sk = skills[i];
  if (!sk) return;
  var st = getSkillState(sk.id);
  if (!st.unlocked) {
    showDmgPop('📖 Нужна книга!', PLAYER_SCREEN_X, player.y - 30, '#aa88ff');
    return;
  }
  if (skillCooldowns[i] > 0) return;
  if (activeTab !== 'game') return;
  var target = monsters.reduce(function(best, m) {
    var d = m.worldX - player.worldX;
    if (d > 0 && d < FIGHT_DIST * 2) return (!best || d < best.d) ? m : best;
    return best;
  }, null);
  var ok = sk.cast(target, st.level);
  if (ok) {
    var cdReduction = 1 - Math.min(st.level, 5) * 0.05;
    skillCooldowns[i] = Math.max(5, sk.cd * cdReduction);
  }
  updateSkillsHud();
}

// ── Инициализация HUD скиллов при старте игры ──
function initSkillsHud() {
  if (!G_CHAR) return;
  if (!G.skills) G.skills = {};
  var hud = document.getElementById('skillsHud');
  hud.classList.add('visible');
  skillCooldowns = [0, 0, 0];
  var skills = getActiveSkills();
  skills.forEach(function(sk, i) {
    document.getElementById('sk' + i + 'icon').innerHTML = '<img src="' + sk.icon + '" style="width:28px;height:28px;object-fit:contain;image-rendering:pixelated;" onerror="this.remove()">';
  });
  positionSkillsHud();
  updateSkillsHud();
}

// ── Позиционирование панели скиллов над кнопкой ИГРА ──
function positionSkillsHud() {
  var hud = document.getElementById('skillsHud');
  if (!hud) return;
  var navH = document.getElementById('nav').offsetHeight;
  var btnW = Math.floor(window.innerWidth / 6);
  hud.style.bottom = navH + 'px';
  hud.style.left   = Math.floor((btnW - 44) / 2) + 'px';
  hud.style.width  = '44px';
}

// ── Обновление иконок скиллов (кулдаун, готовность, замок) ──
function updateSkillsHud() {
  if (!G_CHAR) return;
  var skills  = getActiveSkills();
  var charCols = { fire: '#ff6600', light: '#ffd060', water: '#44aaff' };
  var col = charCols[G_CHAR.id] || '#aaa';
  skills.forEach(function(sk, i) {
    var cd   = skillCooldowns[i];
    var btn  = document.getElementById('sk' + i + 'btn');
    var fill = document.getElementById('sk' + i + 'fill');
    var cdN  = document.getElementById('sk' + i + 'cd');
    var lock = document.getElementById('sk' + i + 'lock');
    var st   = getSkillState(sk.id);
    if (!btn) return;
    if (!st.unlocked) {
      if (lock) lock.style.display = 'flex';
      if (fill) fill.style.display = 'none';
      if (cdN)  cdN.textContent = '';
      btn.classList.remove('ready', 'oncd');
      btn.style.removeProperty('--sk-col');
      return;
    }
    if (lock) lock.style.display = 'none';
    if (cd > 0) {
      var pct = Math.min(100, (cd / sk.cd) * 100);
      if (fill) {
        fill.style.display   = 'block';
        fill.style.height    = pct + '%';
        fill.style.width     = '100%';
        fill.style.bottom    = '0'; fill.style.top  = 'auto';
        fill.style.left      = '0'; fill.style.position = 'absolute';
        fill.style.background = 'rgba(0,0,0,0.65)';
      }
      if (cdN) cdN.textContent = Math.ceil(cd) + 's';
      btn.classList.add('oncd'); btn.classList.remove('ready');
      btn.style.removeProperty('--sk-col');
    } else {
      if (fill) fill.style.display = 'none';
      if (cdN)  cdN.textContent = st.level > 0 ? 'Lv' + st.level : '';
      btn.classList.remove('oncd'); btn.classList.add('ready');
      btn.style.setProperty('--sk-col', col);
    }
  });
}

// ── Вспышка экрана при применении скилла ──
function showSkillFlash(color) {
  var el = document.createElement('div');
  el.className  = 'skill-flash';
  el.style.background = color;
  document.getElementById('app').appendChild(el);
  setTimeout(function() { if (el.parentNode) el.remove(); }, 500);
}

// ── Тик навыков: кулдауны, баффы, дебаффы монстров ──
function updateSkills(dt) {
  if (!G_CHAR || player.state === 'dead') return;
  var skills = getActiveSkills();
  skills.forEach(function(sk, i) {
    if (skillCooldowns[i] > 0) skillCooldowns[i] = Math.max(0, skillCooldowns[i] - dt);
  });
  // Тик баффов игрока
  if (skillBuffs.atkSpdBoost) { skillBuffs.atkSpdBoost.timer -= dt; if (skillBuffs.atkSpdBoost.timer <= 0) delete skillBuffs.atkSpdBoost; }
  if (skillBuffs.defBoost)    { skillBuffs.defBoost.timer    -= dt; if (skillBuffs.defBoost.timer    <= 0) delete skillBuffs.defBoost;    }
  if (skillBuffs.reflect)     { skillBuffs.reflect.timer     -= dt; if (skillBuffs.reflect.timer     <= 0) delete skillBuffs.reflect;     }
  if (skillBuffs.critBoost)   { skillBuffs.critBoost.timer   -= dt; if (skillBuffs.critBoost.timer   <= 0) delete skillBuffs.critBoost;   }
  // Тик дебаффов монстров
  monsters.forEach(function(m) {
    if (m._frozenTimer > 0) { m._frozenTimer -= dt; if (m._frozenTimer <= 0) { m._frozen = false; m._frozenTimer = 0; } }
    if (m._cursedTimer > 0) { m._cursedTimer -= dt; if (m._cursedTimer <= 0) { m._cursed = false; m._cursedTimer = 0; m._defDebuff = 0; } }
  });
  updateSkillsHud();
}

// ═══════════════════════════════
//  ЭФФЕКТИВНЫЕ ХАРАКТЕРИСТИКИ (с учётом баффов)
// ═══════════════════════════════
function effectiveDef() {
  var def = G.stats.def;
  if (skillBuffs.defBoost) def = Math.floor(def * (1 + skillBuffs.defBoost.pct));
  return def;
}

function effectiveAtkSpd() {
  var base = G.stats.atkSpd || 1.0;
  if (skillBuffs.atkSpdBoost) base *= skillBuffs.atkSpdBoost.mult;
  return base;
}

function effectiveCrit() {
  var c = G.stats.crit;
  if (skillBuffs.critBoost) c += skillBuffs.critBoost.flat;
  return c;
}

function effectiveCritDmg() {
  return 1.8 + (G.baseStats.critDmg || 0);
}

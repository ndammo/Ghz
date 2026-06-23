
// ═══════════════════════════════
//  ЗАДАНИЯ
// ═══════════════════════════════

var DAILY_MILESTONES = [
  { id: 0, minutes: 10, rewardType: 'potions', amount: 50,   icon: '🧪', label: '50 зелий' },
  { id: 1, minutes: 20, rewardType: 'gold',    amount: 1000, icon: '💰', label: '1000 золота' },
  { id: 2, minutes: 30, rewardType: 'pixr',    amount: 5,    icon: '💎', label: '5 PIXR' },
  { id: 3, minutes: 60, rewardType: 'gold',    amount: 2000, icon: '💰', label: '2000 золота' },
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
    Object.keys(_specialTaskTimers).forEach(function(tid) {
      var t = _specialTaskTimers[tid];
      if (t && t.remaining > 0) {
        var el = document.getElementById('stTimer_' + tid);
        if (el) el.textContent = '⏱ ' + t.remaining + 'с';
      }
    });
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
  var icons = { gold: '💰', pixr: '💎', potions: '🧪', gram: '⭐' };
  var html  = head;
  tasks.forEach(function(task) {
    var done  = !!(claimed[task.taskId]);
    var timer = _specialTaskTimers[task.taskId];
    var ic    = icons[task.rewardType] || '🎁';
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

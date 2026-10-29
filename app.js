'use strict';

// ---------- Хранилище ----------
const KEY = 'dela-v1';
const state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.tasks) && Array.isArray(s.habits)) return s;
  } catch (e) {}
  return { tasks: [], habits: [] };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  updateBadge();
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Даты ----------
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toInput = d => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const fmtTime = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' });
const fmtHeader = new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtWd = new Intl.DateTimeFormat('ru', { weekday: 'short' });

function humanDue(due) {
  const d = new Date(due);
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d) - today) / 864e5);
  const t = fmtTime.format(d);
  if (diff === 0) return `Сегодня, ${t}`;
  if (diff === 1) return `Завтра, ${t}`;
  if (diff === -1) return `Вчера, ${t}`;
  return `${fmtDay.format(d)}, ${t}`;
}

function nextRepeat(due, repeat) {
  const d = new Date(due);
  const now = new Date();
  do {
    if (repeat === 'day') d.setDate(d.getDate() + 1);
    else if (repeat === 'week') d.setDate(d.getDate() + 7);
    else if (repeat === 'month') d.setMonth(d.getMonth() + 1);
  } while (d <= now);
  return toInput(d);
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);

// ---------- Общий UI ----------
let tab = 'tasks';
let filter = 'today';

$('#today').textContent = fmtHeader.format(new Date());

document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  document.querySelectorAll('.tabbar button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  $('#title').textContent = tab === 'tasks' ? 'Задачи' : 'Привычки';
  render();
}));

$('#fab').addEventListener('click', () => tab === 'tasks' ? openTask() : openHabit());

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
const buzz = () => navigator.vibrate && navigator.vibrate(10);

// ---------- Задачи ----------
document.querySelectorAll('#filters button').forEach(b => b.addEventListener('click', () => {
  filter = b.dataset.f;
  document.querySelectorAll('#filters button').forEach(x => x.classList.toggle('on', x === b));
  renderTasks();
}));

function visibleTasks() {
  const endToday = addDays(startOfDay(new Date()), 1);
  let list = state.tasks.filter(t => filter === 'done' ? t.done : !t.done);
  if (filter === 'today') list = list.filter(t => !t.due || new Date(t.due) < endToday);
  if (filter === 'done') return list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  return list.sort((a, b) => {
    if (!!a.due !== !!b.due) return a.due ? -1 : 1;
    if (a.due !== b.due) return a.due < b.due ? -1 : 1;
    return b.prio - a.prio;
  });
}

function renderTasks() {
  const list = visibleTasks();
  const now = new Date();
  $('#task-list').innerHTML = list.map(t => {
    let meta = '';
    if (t.due) {
      const d = new Date(t.due);
      const cls = !t.done && d < now ? 'late' : (d - now < 3600e3 ? 'soon' : '');
      meta += `<span class="${cls}">⏰ ${humanDue(t.due)}</span>`;
    }
    if (t.repeat) meta += `<span>🔁 ${{ day: 'ежедневно', week: 'еженедельно', month: 'ежемесячно' }[t.repeat]}</span>`;
    if (t.note) meta += `<span>📝 ${esc(t.note.slice(0, 40))}</span>`;
    const bell = t.due && !t.done ? `<button class="icon-btn" data-ics="${t.id}" aria-label="Добавить в Календарь">🔔</button>` : '';
    return `<li class="${t.done ? 'done' : ''}" data-id="${t.id}">
      <button class="check p${t.prio}" data-check="${t.id}" aria-label="Готово"></button>
      <div class="t-body" data-edit="${t.id}">
        <div class="t-title">${esc(t.title)}</div>
        ${meta ? `<div class="t-meta">${meta}</div>` : ''}
      </div>${bell}</li>`;
  }).join('');
  const msg = filter === 'done' ? 'Здесь появятся выполненные дела' :
    state.tasks.some(t => !t.done) && filter === 'today' ? 'На сегодня всё! 🎉' : 'Пусто. Нажми «+», чтобы добавить дело ✨';
  $('#task-empty').textContent = msg;
  $('#task-empty').hidden = list.length > 0;
}

$('#task-list').addEventListener('click', e => {
  const c = e.target.closest('[data-check]');
  const ed = e.target.closest('[data-edit]');
  const ic = e.target.closest('[data-ics]');
  if (c) toggleTask(c.dataset.check);
  else if (ic) exportIcs(state.tasks.find(t => t.id === ic.dataset.ics));
  else if (ed) openTask(state.tasks.find(t => t.id === ed.dataset.edit));
});

function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  buzz();
  if (!t.done && t.repeat && t.due) {
    t.due = nextRepeat(t.due, t.repeat);
    t.notified = false;
    toast(`Готово! Следующий раз: ${humanDue(t.due)}`);
  } else {
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    if (t.done) toast(['Отлично! 💪', 'Так держать! 🚀', 'Минус одно дело ✅', 'Красава! 🔥'][Math.floor(Math.random() * 4)]);
  }
  save();
  const li = document.querySelector(`li[data-id="${id}"]`);
  if (li && t.done) { li.classList.add('done'); setTimeout(renderTasks, 350); } else renderTasks();
}

const taskDlg = $('#task-dlg');
const taskForm = $('#task-form');
let editingTask = null;

function openTask(t) {
  editingTask = t || null;
  taskForm.reset();
  $('#task-dlg-title').textContent = t ? 'Изменить задачу' : 'Новая задача';
  $('#task-del').hidden = !t;
  if (t) {
    taskForm.title.value = t.title;
    taskForm.note.value = t.note || '';
    taskForm.due.value = t.due || '';
    taskForm.prio.value = t.prio;
    taskForm.repeat.value = t.repeat || '';
  }
  taskDlg.showModal();
  if (!t) setTimeout(() => taskForm.title.focus(), 50);
}

$('#quick-dates').addEventListener('click', e => {
  const q = e.target.dataset.q;
  if (!q) return;
  const now = new Date();
  let d = null;
  if (q === '1h') { d = new Date(now.getTime() + 3600e3); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5); }
  if (q === 'tonight') { d = new Date(now); d.setHours(19, 0, 0, 0); if (d <= now) d = addDays(d, 1); }
  if (q === 'tomorrow') { d = addDays(startOfDay(now), 1); d.setHours(9, 0); }
  taskForm.due.value = d ? toInput(d) : '';
});

taskForm.addEventListener('submit', e => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  const f = taskForm;
  const data = {
    title: f.title.value.trim(),
    note: f.note.value.trim(),
    due: f.due.value,
    prio: +f.prio.value,
    repeat: f.repeat.value,
  };
  if (!data.title) return;
  if (editingTask) {
    if (data.due !== editingTask.due) editingTask.notified = false;
    Object.assign(editingTask, data);
  } else {
    state.tasks.push({ id: uid(), done: false, notified: false, created: Date.now(), ...data });
  }
  save();
  renderTasks();
  if (data.due) askNotify();
});

$('#task-del').addEventListener('click', () => {
  state.tasks = state.tasks.filter(t => t !== editingTask);
  save();
  taskDlg.close();
  renderTasks();
  toast('Удалено');
});

// ---------- Экспорт в Календарь iPhone (.ics с будильником) ----------
function icsDate(s) {
  const d = new Date(s);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}
const icsText = s => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);

function exportIcs(t) {
  if (!t || !t.due) return;
  const end = toInput(new Date(new Date(t.due).getTime() + 30 * 60e3));
  const rrule = t.repeat ? `RRULE:FREQ=${{ day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY' }[t.repeat]}\r\n` : '';
  const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Dela//RU\r\nBEGIN:VEVENT\r\n' +
    `UID:${t.id}@dela\r\nDTSTAMP:${icsDate(toInput(new Date()))}\r\n` +
    `DTSTART:${icsDate(t.due)}\r\nDTEND:${icsDate(end)}\r\n${rrule}` +
    `SUMMARY:${icsText(t.title)}\r\n` + (t.note ? `DESCRIPTION:${icsText(t.note)}\r\n` : '') +
    'BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT0M\r\nDESCRIPTION:Напоминание\r\nEND:VALARM\r\n' +
    'END:VEVENT\r\nEND:VCALENDAR\r\n';
  const a = document.createElement('a');
  a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  a.download = 'napominanie.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- Уведомления и значок на иконке ----------
async function askNotify() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  try { await Notification.requestPermission(); } catch (e) {}
}

async function notify(t) {
  const opts = { body: t.note || humanDue(t.due), tag: t.id, icon: 'icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification('⏰ ' + t.title, opts);
    else new Notification('⏰ ' + t.title, opts);
  } catch (e) {}
}

function checkDue() {
  const now = new Date();
  let changed = false;
  for (const t of state.tasks) {
    if (!t.done && t.due && !t.notified && new Date(t.due) <= now) {
      t.notified = true;
      changed = true;
      if ('Notification' in window && Notification.permission === 'granted') notify(t);
      else toast('⏰ ' + t.title);
    }
  }
  if (changed) save();
  if (tab === 'tasks') renderTasks();
}

function updateBadge() {
  if (!navigator.setAppBadge) return;
  const endToday = addDays(startOfDay(new Date()), 1);
  const n = state.tasks.filter(t => !t.done && t.due && new Date(t.due) < endToday).length;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

// ---------- Привычки ----------
const EMOJI = ['💧', '🏃', '📚', '🧘', '💪', '🥗', '😴', '🦷', '💊', '🚭', '✍️', '🎸', '🧹', '🌿', '💰', '⭐'];
const habitDlg = $('#habit-dlg');
const habitForm = $('#habit-form');
let editingHabit = null;
let pickedEmoji = EMOJI[0];

function last7() {
  const today = startOfDay(new Date());
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
}

function streak(h) {
  let d = startOfDay(new Date());
  if (!h.days[dayKey(d)]) d = addDays(d, -1);
  let n = 0;
  while (h.days[dayKey(d)]) { n++; d = addDays(d, -1); }
  return n;
}

function renderHabits() {
  const days = last7();
  const todayKey = dayKey(new Date());
  $('#week-head').innerHTML = days.map(d =>
    `<span class="${dayKey(d) === todayKey ? 'today' : ''}">${fmtWd.format(d)}</span>`).join('');
  $('#week-head').hidden = !state.habits.length;
  $('#habit-list').innerHTML = state.habits.map(h => {
    const s = streak(h);
    return `<li>
      <div class="h-top" data-hedit="${h.id}">
        <span class="h-emoji">${h.emoji}</span>
        <span class="h-name">${esc(h.name)}</span>
        ${s ? `<span class="h-streak">🔥 ${s}</span>` : ''}
      </div>
      <div class="h-days">${days.map(d => {
        const k = dayKey(d);
        return `<button class="h-day ${h.days[k] ? 'on' : ''} ${k === todayKey ? 'today' : ''}" data-h="${h.id}" data-d="${k}">${d.getDate()}</button>`;
      }).join('')}</div></li>`;
  }).join('');
  $('#habit-empty').hidden = state.habits.length > 0;
}

$('#habit-list').addEventListener('click', e => {
  const b = e.target.closest('[data-h]');
  const ed = e.target.closest('[data-hedit]');
  if (b) {
    const h = state.habits.find(x => x.id === b.dataset.h);
    const k = b.dataset.d;
    if (h.days[k]) delete h.days[k]; else h.days[k] = true;
    buzz();
    save();
    renderHabits();
    const s = streak(h);
    if (h.days[k] && s > 0 && s % 7 === 0) toast(`${s} дней подряд! Ты машина 🏆`);
  } else if (ed) openHabit(state.habits.find(x => x.id === ed.dataset.hedit));
});

$('#emoji-pick').innerHTML = EMOJI.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('');
$('#emoji-pick').addEventListener('click', e => {
  if (!e.target.dataset.e) return;
  pickedEmoji = e.target.dataset.e;
  markEmoji();
});
const markEmoji = () => document.querySelectorAll('#emoji-pick button')
  .forEach(b => b.classList.toggle('on', b.dataset.e === pickedEmoji));

function openHabit(h) {
  editingHabit = h || null;
  habitForm.reset();
  pickedEmoji = h ? h.emoji : EMOJI[0];
  markEmoji();
  habitForm.name.value = h ? h.name : '';
  $('#habit-dlg-title').textContent = h ? 'Изменить привычку' : 'Новая привычка';
  $('#habit-del').hidden = !h;
  habitDlg.showModal();
}

habitForm.addEventListener('submit', e => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  const name = habitForm.name.value.trim();
  if (!name) return;
  if (editingHabit) Object.assign(editingHabit, { name, emoji: pickedEmoji });
  else state.habits.push({ id: uid(), name, emoji: pickedEmoji, days: {} });
  save();
  renderHabits();
});

$('#habit-del').addEventListener('click', () => {
  state.habits = state.habits.filter(h => h !== editingHabit);
  save();
  habitDlg.close();
  renderHabits();
  toast('Удалено');
});

// Закрытие листа тапом по затемнённому фону
[taskDlg, habitDlg].forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

// ---------- Старт ----------
function render() { tab === 'tasks' ? renderTasks() : renderHabits(); }

render();
updateBadge();
checkDue();
setInterval(checkDue, 20e3);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { $('#today').textContent = fmtHeader.format(new Date()); checkDue(); render(); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

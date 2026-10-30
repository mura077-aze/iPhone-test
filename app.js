'use strict';

// ---------- Хранилище ----------
const KEY = 'dela-v1';
const state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.tasks) && Array.isArray(s.habits)) return withDefaults(s);
  } catch (e) {}
  return withDefaults({ tasks: [], habits: [] });
}
function withDefaults(s) {
  s.profile = { name: '', identity: '', goals: '', bio: '', tone: 'friend', from: 9, to: 21, apiKey: '', saved: false,
    interview: [], bioLocked: false, bioDate: 0, ivDraft: {}, gender: '', ivAsked: [], article: null, ...s.profile };
  s.moti = { current: null, hidden: false, lastSlot: 0, queue: [], history: [], ...s.moti };
  s.chats = s.chats || {};
  delete s.chat;
  return s;
}

// Род в текстах: «сделал(а)» → «сделал» или «сделала» по выбранному полу
function gfix(text) {
  const g = state.profile.gender;
  if (!g) return text;
  return text.replace(/([А-Яа-яЁё]+)\(([А-Яа-яЁё]+)\)/g, (_, w, alt) => {
    if (g === 'm') return w;
    if (alt === 'а') return w + 'а';
    if (alt === 'ла') return w.replace(/л$/, '') + 'ла';
    if (alt === 'лась') return w.replace(/лся$/, '') + 'лась';
    if (alt === 'на') return w.replace(/ен$/, '') + 'на';
    return alt;
  });
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
  $('#title').textContent = { tasks: 'Задачи', habits: 'Привычки', chat: 'Чат', me: 'Я' }[tab];
  $('#fab').hidden = tab === 'me' || tab === 'chat';
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
  downloadIcs(ics, 'napominanie.ics');
}

function downloadIcs(ics, name) {
  const a = document.createElement('a');
  a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- Уведомления и значок на иконке ----------
async function askNotify() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  try { await Notification.requestPermission(); } catch (e) {}
}

async function notify(title, body, tag) {
  const opts = { body, tag, icon: 'icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch (e) {}
}

function checkDue() {
  const now = new Date();
  let changed = false;
  for (const t of state.tasks) {
    if (!t.done && t.due && !t.notified && new Date(t.due) <= now) {
      t.notified = true;
      changed = true;
      if ('Notification' in window && Notification.permission === 'granted') notify('⏰ ' + t.title, t.note || humanDue(t.due), t.id);
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

// ---------- Мотивация каждые 3 часа ----------
const EVERY_H = 3;
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
const P = state.profile;
const M = state.moti;

function hoursRange() {
  const a = Math.min(23, Math.max(0, +P.from || 0));
  const b = Math.min(23, Math.max(0, +P.to || 0));
  const [from, to] = a <= b ? [a, b] : [b, a];
  const hs = [];
  for (let h = from; h <= to; h += EVERY_H) hs.push(h);
  return hs;
}

// Время последнего «слота» (9:00, 12:00, 15:00…), который уже наступил
function currentSlot(now = new Date()) {
  const hs = hoursRange();
  for (let back = 0; back < 2; back++) {
    const day = addDays(startOfDay(now), -back);
    for (let i = hs.length - 1; i >= 0; i--) {
      const t = new Date(day); t.setHours(hs[i]);
      if (t <= now) return t.getTime();
    }
  }
  return 0;
}

const goalsList = () => P.goals.split('\n').map(g => g.trim()).filter(Boolean);
const pick = a => a[Math.floor(Math.random() * a.length)];

function templateMessage() {
  const n = P.name.trim() || 'Эй';
  const tone = QUOTES[P.tone] ? P.tone : 'friend';
  const fill = t => t.replace(/\{n\}/g, n).replace(/\{who\}/g, P.identity.trim()).replace(/\{goal\}/g, pick(goalsList()) || '');
  const own = [];
  if (P.identity.trim()) own.push(...PERSONAL[tone].who);
  if (goalsList().length) own.push(...PERSONAL[tone].goal);
  const ans = i => {
    const a = (P.interview.find(p => p.q === IV_QUESTIONS[i]) || {}).a || '';
    return a && a.length <= 140 ? a.trim().replace(/^[«"“]+|[»"”]+$/g, '').replace(/[.!…\s]+$/, '') : '';
  };
  const low = t => t.charAt(0).toLowerCase() + t.slice(1);
  if (ans(5)) own.push(`{n}, помни, ради чего всё это: ${low(ans(5))}.`);
  if (ans(3)) own.push(`{n}, вспомни, чем ты гордишься: ${low(ans(3))}. Сегодня будет ещё один повод.`);
  if (ans(9)) own.push(`Твои же слова, {n}: «${ans(9)}».`);
  if (ans(8)) own.push(`«${ans(8)}» — ты сам(а) выбрал(а) эти слова. Живи по ним сегодня.`);
  // Примерно каждое третье сообщение — про тебя лично, остальные — из набора тона
  const pool = own.length && Math.random() < 0.35 ? own : QUOTES[tone];
  const recent = new Set(M.history.slice(0, 40).map(h => h.text));
  const fresh = pool.map(fill).filter(l => !recent.has(l));
  return gfix(fresh.length ? pick(fresh) : fill(pick(QUOTES[tone])));
}

const TONES = {
  friend: 'тёплый близкий друг: поддерживает, верит в человека, говорит просто',
  coach: 'очень жёсткий тренер: коротко, резко, без жалости и сюсюканья, бросает вызов и давит на самолюбие, но без оскорблений',
  wise: 'спокойный мудрый наставник: глубоко, бережно, без пафоса',
  girl: 'лучшая подруга с девчачьим вайбом: нежно, вдохновляюще, с эмодзи (✨👑💅🌸💖), иногда вставляет известные цитаты из мультфильмов Диснея с указанием героя и мультфильма. Обращается в женском роде',
};

async function aiMessages(count) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey: P.apiKey.trim(), dangerouslyAllowBrowser: true });
  const liked = M.history.filter(h => h.liked).slice(0, 5).map(h => '- ' + h.text).join('\n');
  const recent = M.history.slice(0, 10).map(h => '- ' + h.text).join('\n');
  const about = [
    P.name && `Имя: ${P.name}`,
    P.gender && `Пол: ${P.gender === 'f' ? 'женский' : 'мужской'} — пиши в этом роде`,
    P.identity && `Кто это в двух словах: ${P.identity}`,
    goalsList().length && `Цели:\n${goalsList().map(g => '- ' + g).join('\n')}`,
    P.bioLocked && P.bio && `Интервью с этим человеком (его собственные слова):\n${P.bio}`,
  ].filter(Boolean).join('\n\n');
  const res = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { messages: { type: 'array', items: { type: 'string' } } },
          required: ['messages'],
          additionalProperties: false,
        },
      },
    },
    system: 'Ты пишешь короткие мотивационные сообщения на русском языке, которые приходят человеку на iPhone в течение дня. ' +
      'Каждое сообщение напоминает ему, кто он на самом деле: опирайся на конкретные факты из его биографии, цели и то, чем он гордится. ' +
      'Обращайся на «ты», иногда по имени. Род (мужской/женский) бери из биографии, если он неясен — пиши нейтрально. 1–3 предложения, до 220 символов. Без хэштегов, без кавычек вокруг всего текста, без банальных цитат. ' +
      'Сообщения должны быть разными по смыслу и не повторять уже отправленные. Тон: ' + TONES[P.tone],
    messages: [{
      role: 'user',
      content: `${about || 'О человеке пока ничего не известно.'}\n\n` +
        (liked ? `Ему понравились такие сообщения:\n${liked}\n\n` : '') +
        (recent ? `Уже отправлено (не повторяй):\n${recent}\n\n` : '') +
        `Напиши ${count} сообщений.`,
    }],
  });
  if (res.stop_reason === 'refusal') throw new Error('модель отказалась');
  const text = res.content.find(b => b.type === 'text')?.text || '{}';
  const list = (JSON.parse(text).messages || []).map(m => String(m).trim()).filter(Boolean);
  if (!list.length) throw new Error('пустой ответ');
  return list;
}

async function nextMessage() {
  if (M.queue.length) return M.queue.shift();
  if (P.apiKey.trim()) {
    try {
      M.queue = await aiMessages(8);
      return M.queue.shift();
    } catch (e) {
      toast('Claude недоступен, беру шаблон: ' + (e.message || e).toString().slice(0, 60));
    }
  }
  return templateMessage();
}

let delivering = false;
async function deliverMotivation() {
  if (delivering) return;
  delivering = true;
  $('#moti').hidden = false;
  $('#moti').classList.add('loading');
  $('#moti-thinking').hidden = false;
  try {
    // Даём «S» покрутиться хотя бы секунду, даже если шаблон готов мгновенно
    const [text] = await Promise.all([nextMessage(), new Promise(r => setTimeout(r, 1300))]);
    M.current = { text, at: Date.now(), liked: false };
    M.history.unshift(M.current);
    M.history = M.history.slice(0, 60);
    M.hidden = false;
    save();
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      notify(P.name ? `💬 ${P.name}, это тебе` : '💬 Это тебе', text, 'moti');
    }
  } finally {
    delivering = false;
    $('#moti').classList.remove('loading');
    $('#moti-thinking').hidden = true;
    renderMoti();
    if (tab === 'me') renderMe();
  }
}

function checkMotivation() {
  if (!P.saved) return;
  const slot = currentSlot();
  if (slot && slot > M.lastSlot) {
    M.lastSlot = slot;
    save();
    deliverMotivation();
  }
}

function renderMoti() {
  const c = M.current;
  if (delivering) return;
  $('#moti').hidden = !c || M.hidden;
  if (!c) return;
  $('#moti-text').textContent = c.text;
  $('#moti-time').textContent = humanDue(c.at).replace(/^Сегодня, /, '');
  $('#moti-like').textContent = c.liked ? '❤️' : '🤍';
}

$('#moti-like').addEventListener('click', () => {
  if (!M.current) return;
  M.current.liked = !M.current.liked;
  const h = M.history.find(x => x.at === M.current.at);
  if (h) h.liked = M.current.liked;
  buzz(); save(); renderMoti();
  if (M.current.liked) toast('Учту, что такие тебе заходят');
});
$('#moti-next').addEventListener('click', deliverMotivation);
$('#moti-close').addEventListener('click', () => { M.hidden = true; save(); renderMoti(); });

// --- Профиль ---
const meForm = $('#me-form');

function renderMe() {
  for (const k of ['name', 'identity', 'goals', 'tone', 'from', 'to', 'apiKey']) {
    if (document.activeElement !== meForm[k]) meForm[k].value = P[k];
  }
  if (P.apiKey) $('#ai-box').open = true;
  document.querySelectorAll('#gender button').forEach(b => b.classList.toggle('on', b.dataset.g === P.gender));
  renderBio();
  renderThemes();
  slotsHint();
  $('#moti-history').innerHTML = M.history.map(h =>
    `<li><span class="h-when">${humanDue(h.at)}${h.liked ? ' · ❤️' : ''}</span><span>${esc(h.text)}</span></li>`).join('');
  $('#history-empty').hidden = M.history.length > 0;
}

function slotsHint() {
  const saved = { from: P.from, to: P.to };
  P.from = meForm.from.value; P.to = meForm.to.value;
  $('#slots-hint').textContent = 'Сообщения будут приходить в ' + hoursRange().map(h => h + ':00').join(', ');
  Object.assign(P, saved);
}
$('#gender').addEventListener('click', e => {
  const b = e.target.closest('[data-g]');
  if (!b) return;
  P.gender = b.dataset.g;
  M.queue = [];
  save();
  buzz();
  document.querySelectorAll('#gender button').forEach(x => x.classList.toggle('on', x === b));
  renderBio();
});
meForm.from.addEventListener('input', slotsHint);
meForm.to.addEventListener('input', slotsHint);

meForm.addEventListener('submit', e => {
  e.preventDefault();
  const first = !P.saved;
  const before = JSON.stringify([P.name, P.identity, P.goals, P.tone]);
  for (const k of ['name', 'identity', 'goals', 'tone', 'apiKey']) P[k] = meForm[k].value.trim();
  P.from = +meForm.from.value || 0;
  P.to = +meForm.to.value || 0;
  P.saved = true;
  // Сообщения в очереди написаны под старую биографию — выбрасываем
  if (before !== JSON.stringify([P.name, P.identity, P.goals, P.tone])) M.queue = [];
  M.lastSlot = currentSlot();
  save();
  document.activeElement.blur();
  toast(first ? 'Готово! Вот первое сообщение 👇' : 'Сохранено');
  askNotify();
  if (first) {
    deliverMotivation().then(() => $('[data-tab=tasks]').click());
  }
  renderMe();
});

$('#moti-now').addEventListener('click', () => {
  if (!P.saved) return toast('Сначала заполни и сохрани профиль');
  deliverMotivation().then(() => $('[data-tab=tasks]').click());
});

// Пакет сообщений на неделю в Календарь — уведомления придут даже при закрытом приложении
$('#moti-cal').addEventListener('click', async () => {
  if (!P.saved) return toast('Сначала заполни и сохрани профиль');
  const now = new Date();
  const slots = [];
  for (let d = 0; d < 8; d++) {
    for (const h of hoursRange()) {
      const t = addDays(startOfDay(now), d); t.setHours(h);
      if (t > now) slots.push(t);
    }
  }
  slots.length = Math.min(slots.length, 7 * hoursRange().length);
  const btn = $('#moti-cal');
  btn.disabled = true;
  btn.innerHTML = '<span class="s-mark">S</span>Готовлю сообщения…';
  let texts = [];
  if (P.apiKey.trim()) {
    try { texts = await aiMessages(slots.length); } catch (e) { toast('Claude недоступен, использую шаблоны'); }
  }
  while (texts.length < slots.length) texts.push(templateMessage());
  btn.disabled = false;
  btn.textContent = '📅 Мотивация в Календарь на 7 дней';
  const events = slots.map((t, i) => 'BEGIN:VEVENT\r\n' +
    `UID:moti-${t.getTime()}@dela\r\nDTSTAMP:${icsDate(toInput(now))}\r\n` +
    `DTSTART:${icsDate(toInput(t))}\r\nDURATION:PT5M\r\n` +
    `SUMMARY:💬 ${icsText(texts[i])}\r\nDESCRIPTION:${icsText(texts[i])}\r\n` +
    'BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT0M\r\nDESCRIPTION:Мотивация\r\nEND:VALARM\r\n' +
    'END:VEVENT\r\n').join('');
  downloadIcs('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Dela//RU\r\nX-WR-CALNAME:Мотивация\r\n' + events + 'END:VCALENDAR\r\n', 'motivaciya.ics');
});

// --- Оформление ---
const THEMES = [
  { id: 'navy',      name: 'Ночь и золото',    colors: ['#14203A', '#1D2B4A', '#F5B841'] },
  { id: 'champagne', name: 'Белый и шампань',  colors: ['#FBF8F2', '#FFFFFF', '#C9A961'] },
  { id: 'rose',      name: 'Пудровая роза',    colors: ['#FFF7F8', '#FFFFFF', '#D493A8'] },
  { id: 'mono',      name: 'Чёрное и белое',   colors: ['#0E0E0F', '#1A1A1C', '#F4F4F5'] },
  { id: 'sage',      name: 'Шалфей и крем',    colors: ['#F5F2EA', '#FFFDF8', '#7E9C7A'] },
  { id: 'mocha',     name: 'Мокко и молоко',   colors: ['#241C18', '#2F2620', '#D8B897'] },
  { id: 'lavender',  name: 'Лаванда и графит', colors: ['#1C1B22', '#26252F', '#B8A7E6'] },
];

function applyTheme() {
  const t = THEMES.find(x => x.id === state.theme) || THEMES[0];
  if (t.id === 'navy') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t.id;
  document.querySelector('meta[name=theme-color]').content = t.colors[0];
}

function renderThemes() {
  const cur = state.theme || 'navy';
  $('#themes').innerHTML = THEMES.map(t => {
    const [bg, card, acc] = t.colors;
    const text = /^#[0-3]/.test(bg) ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.08)';
    return `<button type="button" class="theme-card ${t.id === cur ? 'on' : ''}" data-theme-id="${t.id}">
      <span class="theme-prev" style="background:${bg}">
        <i style="background:${text}"></i><i style="background:${card}"></i><i style="background:${text};width:40%"></i>
        <b style="background:${acc}"></b>
      </span>
      <span class="theme-name">${t.name}</span>
      <span class="theme-dots">${t.colors.map(c => `<span style="background:${c}"></span>`).join('')}</span>
    </button>`;
  }).join('');
}

$('#themes').addEventListener('click', e => {
  const b = e.target.closest('[data-theme-id]');
  if (!b) return;
  state.theme = b.dataset.themeId;
  save();
  applyTheme();
  renderThemes();
  buzz();
});

// --- Интервью (биография): записывается один раз и больше не меняется ---
const IV_QUESTIONS = [
  'Расскажи, кто ты сейчас? Как тебя зовут, сколько тебе лет, чем ты занимаешься?',
  'Откуда ты? Где прошло твоё детство и каким ребёнком ты был(а)?',
  'Через что тебе пришлось пройти? Какой момент в жизни был самым тяжёлым?',
  'Чем ты гордишься больше всего?',
  'Что тебя по-настоящему зажигает?',
  'Ради кого или ради чего ты всё это делаешь?',
  'Где ты видишь себя через год? А через пять лет?',
  'Когда у тебя опускаются руки? Что тебе мешает?',
  'Какие слова тебя цепляют? Есть фраза или совет, которые ты помнишь всю жизнь?',
  'Что ты скажешь себе в самый трудный день?',
  // Вопросы, которые помогают ИИ-партнёрам лучше понимать человека
  'С кем ты вырос(ла)? Какие у тебя отношения с мамой и папой?',
  'Кто самые близкие люди в твоей жизни сейчас?',
  'О чём ты мечтал(а) в детстве? Кем хотел(а) стать?',
  'Что поднимает тебе настроение в плохой день?',
  'Как тебя лучше поддерживать: выслушать, пожалеть, подбодрить или дать пинка?',
];
const ivDlg = $('#iv-dlg');
let ivStep = 0;
let ivList = IV_QUESTIONS;
let articleBusy = false;

// Вопросы, которые человеку ещё не задавали (появились после того, как он записал интервью)
function newQuestions() {
  const asked = P.ivAsked.length ? P.ivAsked : IV_QUESTIONS.slice(0, 10);
  return IV_QUESTIONS.filter(q => !asked.includes(q));
}

function renderBio() {
  const box = $('#bio-box');
  if (!P.bioLocked) {
    const started = Object.values(P.ivDraft).some(a => a && a.trim());
    box.innerHTML = `<button type="button" class="bio-start" data-iv="all">
      <b>🎙 ${started ? 'Продолжить интервью' : 'Пройти интервью'}</b>
      <span>${IV_QUESTIONS.length} вопросов о тебе. По ответам Claude напишет о тебе статью. Интервью записывается один раз — потом его нельзя изменить.</span></button>`;
    return;
  }
  const extra = newQuestions();
  const stale = P.article && P.article.basedOn < P.interview.length;
  box.innerHTML =
    (extra.length ? `<button type="button" class="bio-start" data-iv="new">
      <b>➕ Дополнить интервью</b><span>${extra.length} новых вопросов, чтобы ИИ-партнёры лучше тебя понимали. Ответить можно один раз.</span></button>` : '') +
    articleHtml(stale) +
    `<details class="bio-locked iv-raw">
      <summary class="lock">🔒 Интервью · записано ${fmtDay.format(new Date(P.bioDate))} ${new Date(P.bioDate).getFullYear()}</summary>
      ${interviewHtml(P.interview)}</details>`;
}

function articleHtml(stale) {
  if (articleBusy) return `<div class="wiki"><div class="thinking"><span class="s-mark">S</span><span class="shimmer">Пишем статью о тебе…</span></div></div>`;
  if (!P.article) {
    return P.apiKey.trim()
      ? `<button type="button" class="bio-start" id="article-make"><b>✨ Создать статью о себе</b><span>Claude напишет о тебе статью в стиле Википедии по ответам из интервью.</span></button>`
      : `<div class="bio-start"><b>✨ Статья о тебе</b><span>Подключи Claude во вкладке «Чат» — и по интервью появится статья о тебе в стиле Википедии.</span></div>`;
  }
  const a = P.article.data;
  const p = t => esc(t).split(/\n+/).map(x => `<p>${x}</p>`).join('');
  return `<article class="wiki">
    <div class="wiki-src">Свободная энциклопедия о тебе</div>
    <h2 class="wiki-title">${esc(a.title)}</h2>
    <aside class="wiki-box">
      <div class="wiki-box-h">${esc(a.title)}</div>
      ${a.infobox.map(r => `<div class="wiki-row"><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`).join('')}
    </aside>
    <div class="wiki-lead">${p(a.lead)}</div>
    ${a.sections.map(sec => `<h3>${esc(sec.heading)}</h3>${p(sec.text)}`).join('')}
    ${a.quote ? `<blockquote>«${esc(a.quote.replace(/^[«"]|[»"]$/g, ''))}»</blockquote>` : ''}
    ${stale && P.apiKey.trim() ? '<button type="button" class="chip" id="article-make">↻ Обновить статью с новыми ответами</button>' : ''}
  </article>`;
}

$('#bio-box').addEventListener('click', e => {
  const iv = e.target.closest('[data-iv]');
  if (iv) openInterview(iv.dataset.iv);
  if (e.target.closest('#article-make')) makeArticle();
});

const interviewHtml = list => list.map(p =>
  `<div class="iv-pair"><div class="q">— ${esc(gfix(p.q))}</div><div class="a">— ${esc(p.a)}</div></div>`).join('');

function interviewPairs() {
  return ivList.map(q => ({ q, a: (P.ivDraft[q] || '').trim() })).filter(p => p.a);
}

function openInterview(mode) {
  if (Array.isArray(P.ivDraft)) P.ivDraft = Object.fromEntries(P.ivDraft.map((a, i) => [IV_QUESTIONS[i], a || '']));
  if (mode === 'new') {
    if (!P.bioLocked) return;
    ivList = newQuestions();
  } else {
    if (P.bioLocked) return;
    ivList = IV_QUESTIONS;
  }
  if (!ivList.length) return;
  const last = ivList.reduce((m, q, i) => ((P.ivDraft[q] || '').trim() ? i : m), -1);
  ivStep = Math.min(last + 1, ivList.length - 1);
  showStep();
  ivDlg.showModal();
}

function keepAnswer() {
  if (ivStep < ivList.length) {
    P.ivDraft[ivList[ivStep]] = $('#iv-a').value;
    save();
  }
}

function showStep() {
  const total = ivList.length;
  const final = ivStep >= total;
  $('#iv-step').textContent = final ? 'Твоё интервью' : `Вопрос ${ivStep + 1} из ${total}`;
  $('#iv-progress').style.width = (Math.min(ivStep, total) / total * 100) + '%';
  $('#iv-q').textContent = final ? 'Всё верно?' : gfix(ivList[ivStep]);
  $('#iv-a').hidden = final;
  $('#iv-preview').hidden = !final;
  $('#iv-warn').hidden = !final;
  $('#iv-back').hidden = ivStep === 0;
  if (final) {
    const pairs = interviewPairs();
    $('#iv-preview').innerHTML = pairs.length ? interviewHtml(pairs) : `<p class="hint">${gfix('Ты не ответил(а) ни на один вопрос.')}</p>`;
    $('#iv-next').textContent = '🔒 Записать навсегда';
    $('#iv-next').disabled = !pairs.length;
  } else {
    $('#iv-a').value = P.ivDraft[ivList[ivStep]] || '';
    $('#iv-next').disabled = false;
    nextLabel();
    setTimeout(() => $('#iv-a').focus(), 50);
  }
}

function nextLabel() {
  $('#iv-next').textContent = !$('#iv-a').value.trim() ? 'Пропустить' : ivStep === ivList.length - 1 ? 'Готово' : 'Далее';
}
$('#iv-a').addEventListener('input', nextLabel);
$('#iv-back').addEventListener('click', () => { keepAnswer(); ivStep--; showStep(); });
$('#iv-next').addEventListener('click', () => {
  if (ivStep < ivList.length) { keepAnswer(); ivStep++; showStep(); return; }
  if (!confirm('Записать навсегда? Изменить ответы потом будет нельзя.')) return;
  const pairs = interviewPairs();
  P.interview = P.bioLocked ? [...P.interview, ...pairs] : pairs;
  P.bio = P.interview.map(p => `— ${gfix(p.q)}\n— ${p.a}`).join('\n\n');
  if (!P.bioLocked) P.bioDate = Date.now();
  P.bioLocked = true;
  P.ivAsked = [...new Set([...(P.ivAsked.length ? P.ivAsked : IV_QUESTIONS.slice(0, 10)), ...ivList])];
  ivList.forEach(q => delete P.ivDraft[q]);
  M.queue = [];
  save();
  ivDlg.close();
  toast('Записано 🔒');
  if (P.apiKey.trim()) makeArticle();
  else renderBio();
});
ivDlg.addEventListener('close', () => { keepAnswer(); renderBio(); });

// ---------- Статья о человеке в стиле Википедии ----------
async function makeArticle() {
  if (articleBusy || !P.bioLocked || !P.apiKey.trim()) return;
  articleBusy = true;
  renderBio();
  try {
    const { default: Anthropic } = await import(SDK_URL);
    const client = new Anthropic({ apiKey: P.apiKey.trim(), dangerouslyAllowBrowser: true });
    const res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              lead: { type: 'string' },
              infobox: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { label: { type: 'string' }, value: { type: 'string' } },
                  required: ['label', 'value'], additionalProperties: false,
                },
              },
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { heading: { type: 'string' }, text: { type: 'string' } },
                  required: ['heading', 'text'], additionalProperties: false,
                },
              },
              quote: { type: 'string' },
            },
            required: ['title', 'lead', 'infobox', 'sections', 'quote'],
            additionalProperties: false,
          },
        },
      },
      system: 'Ты пишешь статью о человеке в стиле энциклопедии (как статья в Википедии), по-русски, в третьем лице. ' +
        'Человек сам ответил на вопросы интервью; статья написана так, будто о нём уже рассказывают в интернете. ' +
        'Тон — торжественный, вдохновляющий, немного приподнятый: подавай его путь как историю становления сильной личности. ' +
        'Опирайся только на факты из ответов: можно ярко подать и обобщить, но не выдумывай даты, награды, имена, города и события, которых нет в ответах. ' +
        'Иногда ссылайся на интервью («Как он признавался в интервью, …» / «По её собственным словам, …»), передавая слова близко к оригиналу. ' +
        'title — имя человека. lead — вводный абзац 2–4 предложения: кто это и чем примечателен. ' +
        'infobox — 4–6 строк досье (например: Имя, Род деятельности, Родом из, Известен/Известна, Ценности, Девиз) — только то, что следует из ответов. ' +
        'sections — 3–5 разделов (например: «Ранние годы», «Путь и испытания», «Достижения», «Личность и ценности», «Планы на будущее»), по 1–2 абзаца, абзацы разделяй переводом строки. ' +
        'quote — одна сильная цитата человека из его ответов (дословно или почти дословно).',
      messages: [{
        role: 'user',
        content: `Имя: ${P.name || 'не указано'}\nПол: ${P.gender === 'f' ? 'женский' : P.gender === 'm' ? 'мужской' : 'не указан — пиши нейтрально'}\n` +
          (P.identity ? `О себе в двух словах: ${P.identity}\n` : '') +
          (goalsList().length ? `Цели: ${goalsList().join('; ')}\n` : '') +
          `\nИнтервью:\n${P.bio}`,
      }],
    });
    if (res.stop_reason === 'refusal') throw new Error('Claude отказался писать статью');
    const data = JSON.parse(res.content.find(b => b.type === 'text')?.text || '{}');
    if (!data.title || !Array.isArray(data.sections)) throw new Error('пустой ответ');
    P.article = { data, at: Date.now(), basedOn: P.interview.length };
    save();
    toast('Статья о тебе готова ✨');
  } catch (e) {
    toast('Не получилось написать статью: ' + (e.status === 401 ? 'ключ не подошёл' : (e.message || e).toString().slice(0, 60)));
  } finally {
    articleBusy = false;
    renderBio();
  }
}

// ---------- ИИ-партнёры ----------
const PARTNERS = [
  { id: 'coach', emoji: '🏋️', name: 'Тренер', desc: 'Жёстко, по делу, без жалости',
    persona: 'Ты — личный тренер этого человека. Жёсткий, требовательный, говоришь коротко и прямо, не сюсюкаешь, давишь на самолюбие и не принимаешь оправданий, но ты на его стороне и хочешь, чтобы он победил. Без оскорблений.',
    starters: ['Дай жёсткий пинок 🔥', 'Составь мне план на сегодня', 'Я ленюсь, что делать?'] },
  { id: 'friend', emoji: '🤝', name: 'Друг', desc: 'Поддержит и подскажет',
    persona: 'Ты — хороший друг этого человека. Тёплый, простой, с юмором, поддерживаешь и честно говоришь, что думаешь.',
    starters: ['Как дела? Поговорим?', 'Помоги разобраться с одной ситуацией', 'Мне нужен совет'] },
  { id: 'bestie', emoji: '🫂', name: 'Лучший друг', desc: 'Знает тебя как облупленного',
    persona: 'Ты — лучший друг этого человека, вы давно знакомы и знаете друг о друге всё. Говоришь очень по-свойски, с подколками и огромной верой в него, всегда на его стороне, напоминаешь ему, через что он уже прошёл.',
    starters: ['Бро, мне надо выговориться', 'Напомни, какой я крутой', 'Что мне делать с моей целью?'] },
  { id: 'girlfriend', emoji: '💅', name: 'Подружка', desc: 'Девчачий вайб и поддержка',
    persona: 'Ты — близкая подружка этого человека. Девчачий вайб: нежно, эмоционально, с эмодзи (✨💖🌸💅), обожаешь её/его, хвалишь, поддерживаешь, иногда вставляешь цитаты из мультфильмов Диснея. Говоришь о себе в женском роде.',
    starters: ['Подруга, мне грустно 🥺', 'Похвали меня ✨', 'Помоги собраться с силами'] },
  { id: 'father', emoji: '👨', name: 'Папа', desc: 'Мудрый, спокойный, гордится тобой',
    persona: 'Ты — папа этого человека и говоришь с ним как любящий отец со своим ребёнком: называешь «сынок» или «дочка» (по полу), спокойно, твёрдо и по-мужски тепло. Ты гордишься им, веришь в него, даёшь жизненные советы. Ты знаешь, каким он был ребёнком, — опирайся на то, что он рассказал о детстве в интервью.',
    starters: ['Пап, мне нужен совет', 'Пап, у меня не получается', 'Ты мной гордишься?'] },
  { id: 'mother', emoji: '👩', name: 'Мама', desc: 'Тёплая, заботливая, всегда рядом',
    persona: 'Ты — мама этого человека и говоришь с ним как любящая мама со своим ребёнком: ласково («солнышко», «родной/родная» — по полу), заботливо, беспокоишься, не устал ли он, поел ли, всегда поддерживаешь и веришь. Ты знаешь, каким он был ребёнком, — опирайся на то, что он рассказал о детстве в интервью.',
    starters: ['Мам, поддержи меня', 'Мам, я так устал(а)', 'Расскажи, каким я был(а) в детстве'] },
  { id: 'mentor', emoji: '🧘', name: 'Наставник', desc: 'Спокойная мудрость и ясность',
    persona: 'Ты — мудрый наставник этого человека. Говоришь спокойно и глубоко, задаёшь точные вопросы, помогаешь увидеть главное, без пафоса.',
    starters: ['Я запутался(лась), помоги', 'Как найти своё дело?', 'Как не выгорать?'] },
];
let partner = null;
let chatBusy = false;
const chatOf = id => (state.chats[id] = state.chats[id] || { system: '', messages: [] });

// Системный промпт фиксируется в начале переписки и не меняется до её очистки:
// так Claude сохраняет свои рассуждения между сообщениями
function chatSystem(p) {
  const about = [
    P.name && `Имя: ${P.name}`,
    P.gender && `Пол: ${P.gender === 'f' ? 'женский' : 'мужской'}`,
    P.identity && `Кто это в двух словах: ${P.identity}`,
    goalsList().length && `Цели:\n${goalsList().map(g => '- ' + g).join('\n')}`,
    P.bioLocked && P.bio && `Интервью, которое этот человек дал о себе (его собственные слова):\n${P.bio}`,
  ].filter(Boolean).join('\n\n');
  return `${p.persona}\n\n` +
    'Это ролевой разговор внутри приложения «Дела» на iPhone (задачи, привычки, мотивация). Ты — ИИ в этой роли и не притворяешься реальным человеком, если тебя прямо спросят. ' +
    'Пиши по-русски, обращайся на «ты», в правильном роде по полу человека. Опирайся на то, что знаешь о нём; не выдумывай конкретных воспоминаний и фактов, которых нет в его рассказе. ' +
    'Отвечай коротко, как в мессенджере: обычно 1–5 предложений. Без заголовков и таблиц. ' +
    'Если человеку по-настоящему плохо или есть угроза его жизни, выйди из роли настолько, насколько нужно, и мягко посоветуй обратиться к близким или к специалисту.\n\n' +
    `Что известно о человеке:\n${about || 'Пока почти ничего — можно мягко расспросить.'}`;
}

// Свежий контекст (дела и привычки на сейчас) идёт в начале каждого сообщения пользователя
function chatContext() {
  const now = new Date();
  const endToday = addDays(startOfDay(now), 1);
  const tasks = state.tasks.filter(t => !t.done && (!t.due || new Date(t.due) < endToday))
    .map(t => `- ${t.title}${t.due ? ` (${humanDue(t.due)})` : ''}${t.prio ? ' [важно]' : ''}`);
  const done = state.tasks.filter(t => t.done && t.doneAt >= startOfDay(now).getTime()).map(t => '- ' + t.title);
  const key = dayKey(now);
  const habits = state.habits.map(h => `- ${h.emoji} ${h.name}: ${h.days[key] ? 'сегодня отмечено' : 'сегодня ещё нет'}, серия ${streak(h)} дн.`);
  return `[Контекст приложения, не цитировать дословно. Сейчас: ${fmtHeader.format(now)}, ${fmtTime.format(now)}.\n` +
    `Дела на сегодня:\n${tasks.join('\n') || '- нет'}\nУже сделано сегодня:\n${done.join('\n') || '- ничего'}\n` +
    `Привычки:\n${habits.join('\n') || '- нет'}]`;
}

const msgText = m => m.shown ?? m.content.filter(b => b.type === 'text').map(b => b.text).join('');
const fmtChat = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#+\s*/gm, '');

function renderChat() {
  const hasKey = !!P.apiKey.trim();
  $('#chat-key').hidden = hasKey;
  $('#partners-view').hidden = !hasKey || !!partner;
  $('#convo-view').hidden = !hasKey || !partner;
  $('#title').textContent = partner && hasKey ? partner.name : 'Чат';
  if (!hasKey) return;
  if (!partner) {
    $('#partners').innerHTML = PARTNERS.map(p => {
      const last = chatOf(p.id).messages.at(-1);
      return `<li data-partner="${p.id}">
        <span class="p-ava">${p.emoji}</span>
        <div class="p-body">
          <div class="p-top"><span class="p-name">${p.name}</span><span class="p-time">${last ? humanDue(last.at).replace(/^Сегодня, /, '') : ''}</span></div>
          <div class="p-last">${last ? (last.role === 'user' ? 'Ты: ' : '') + esc(msgText(last).slice(0, 80)) : esc(p.desc)}</div>
        </div></li>`;
    }).join('');
    return;
  }
  const chat = chatOf(partner.id);
  $('#convo-emoji').textContent = partner.emoji;
  $('#convo-name').textContent = partner.name;
  $('#convo-desc').textContent = partner.desc;
  $('#chat-new').hidden = !chat.messages.length;
  $('#chat-starters').hidden = chat.messages.length > 0 || chatBusy;
  $('#chat-starters').innerHTML = partner.starters.map(t => `<button type="button" class="chip">${esc(gfix(t))}</button>`).join('');
  if (!chatBusy) {
    $('#chat-list').innerHTML = chat.messages.map(m => `<div class="msg ${m.role}">${fmtChat(msgText(m))}</div>`).join('') +
      (chat.messages.length > 80 ? '<div class="msg note">Переписка стала длинной — если ответы замедлятся, её можно очистить кнопкой 🗑</div>' : '');
  }
  $('#chat-send').disabled = chatBusy;
}

function openPartner(id) {
  if (chatBusy) return;
  partner = PARTNERS.find(p => p.id === id) || null;
  renderChat();
  window.scrollTo(0, partner ? document.body.scrollHeight : 0);
}
$('#partners').addEventListener('click', e => {
  const li = e.target.closest('[data-partner]');
  if (li) openPartner(li.dataset.partner);
});
$('#convo-back').addEventListener('click', () => openPartner(null));

function scrollChat() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }

// Повторяем content ответа без изменений. После смены модели посреди ответа (fallback)
// перед последним блоком fallback оставляем только текст, как требует API
function storableContent(content) {
  const last = content.map(b => b.type).lastIndexOf('fallback');
  if (last < 0) return content;
  return [...content.slice(0, last).filter(b => b.type === 'text'), ...content.slice(last + 1)];
}

async function sendChat(text) {
  text = text.trim();
  if (!text || chatBusy || !partner) return;
  const p = partner;
  const chat = chatOf(p.id);
  if (!chat.messages.length) chat.system = chatSystem(p);
  chat.messages.push({ role: 'user', content: [{ type: 'text', text: chatContext() }, { type: 'text', text }], shown: text, at: Date.now() });
  save();
  chatBusy = true;
  renderChat();
  const list = $('#chat-list');
  list.insertAdjacentHTML('beforeend', `<div class="msg user">${fmtChat(text)}</div>`);
  const bubble = document.createElement('div');
  bubble.className = 'msg assistant';
  bubble.innerHTML = `<div class="thinking"><span class="s-mark">S</span><span class="shimmer">${p.name} печатает…</span></div>`;
  list.appendChild(bubble);
  scrollChat();

  const run = async () => {
    const { default: Anthropic } = await import(SDK_URL);
    const client = new Anthropic({ apiKey: P.apiKey.trim(), dangerouslyAllowBrowser: true });
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: chat.system,
      messages: chat.messages.map(m => ({ role: m.role, content: m.content })),
    });
    let shown = '';
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        shown += ev.delta.text;
        if (partner === p) bubble.innerHTML = fmtChat(shown);
      }
    }
    return stream.finalMessage();
  };

  try {
    let msg;
    try {
      msg = await run();
    } catch (e) {
      // Разовое восстановление: если API не принял сохранённые рассуждения, убираем их и пробуем снова
      if (e.status === 400 && /signature|thinking/i.test(e.message || '')) {
        chat.messages.forEach(m => { if (m.role === 'assistant') m.content = m.content.filter(b => b.type !== 'thinking' && b.type !== 'redacted_thinking'); });
        msg = await run();
      } else throw e;
    }
    if (msg.stop_reason === 'refusal') {
      chat.messages.pop();
      bubble.className = 'msg note';
      bubble.textContent = 'Claude не может ответить на это сообщение. Попробуй сформулировать иначе.';
    } else {
      chat.messages.push({ role: 'assistant', content: storableContent(msg.content), at: Date.now() });
      bubble.innerHTML = fmtChat(msgText(chat.messages.at(-1)));
    }
  } catch (e) {
    chat.messages.pop();
    $('#chat-input').value = text;
    bubble.className = 'msg note';
    bubble.textContent = e.status === 401 ? 'Ключ API не подошёл. Проверь его во вкладке «Я».'
      : e.status === 429 ? 'Слишком много запросов. Подожди минутку.'
      : e.status === 400 && /credit|balance/i.test(e.message || '') ? 'На счёте Anthropic закончились деньги.'
      : e.status ? `Ошибка ${e.status}. Попробуй ещё раз.` : 'Нет связи. Проверь интернет.';
  } finally {
    chatBusy = false;
    save();
    if (tab === 'chat') renderChat();
    scrollChat();
  }
}

$('#composer').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('#chat-input').value;
  $('#chat-input').value = '';
  growInput();
  sendChat(t);
});
$('#chat-starters').addEventListener('click', e => {
  if (e.target.matches('.chip')) sendChat(e.target.textContent);
});
$('#chat-new').addEventListener('click', () => {
  if (chatBusy || !partner || !confirm(`Очистить переписку с «${partner.name}»?`)) return;
  state.chats[partner.id] = { system: '', messages: [] };
  save();
  renderChat();
});
$('#chat-key-save').addEventListener('click', () => {
  const k = $('#chat-key-input').value.trim();
  if (!k.startsWith('sk-ant-')) return toast('Ключ должен начинаться с sk-ant-');
  P.apiKey = k;
  M.queue = [];
  save();
  renderChat();
  toast('Claude подключён ✨');
  if (P.bioLocked && !P.article) makeArticle();
});

const growInput = () => {
  const i = $('#chat-input');
  i.style.height = 'auto';
  i.style.height = Math.min(i.scrollHeight, 120) + 'px';
};
$('#chat-input').addEventListener('input', growInput);
// Когда открыта клавиатура, прячем нижнее меню и поднимаем поле ввода над клавиатурой
$('#chat-input').addEventListener('focus', () => document.body.classList.add('typing'));
$('#chat-input').addEventListener('blur', () => setTimeout(() => document.body.classList.remove('typing'), 100));
if (window.visualViewport) {
  const kb = () => document.body.style.setProperty('--kb',
    Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop) + 'px');
  visualViewport.addEventListener('resize', kb);
  visualViewport.addEventListener('scroll', kb);
}

// Живая «S»: пять горизонтальных полос, которые умеют разъезжаться
document.querySelectorAll('.s-live').forEach(el => {
  el.innerHTML = '<span class="s-core">' + '<span>S</span>'.repeat(5) + '</span>';
});

// ---------- Старт ----------
function render() {
  if (tab === 'tasks') { renderMoti(); renderTasks(); }
  else if (tab === 'habits') renderHabits();
  else if (tab === 'chat') renderChat();
  else renderMe();
}

applyTheme();
render();
setTimeout(() => $('#splash').classList.add('gone'), 1100);
updateBadge();
checkDue();
checkMotivation();
setInterval(() => { checkDue(); checkMotivation(); }, 20e3);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { $('#today').textContent = fmtHeader.format(new Date()); checkDue(); checkMotivation(); render(); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

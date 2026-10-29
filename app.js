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
    interview: [], bioLocked: false, bioDate: 0, ivDraft: [], ...s.profile };
  s.moti = { current: null, hidden: false, lastSlot: 0, queue: [], history: [], ...s.moti };
  return s;
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
  $('#title').textContent = { tasks: 'Задачи', habits: 'Привычки', me: 'Я' }[tab];
  $('#fab').hidden = tab === 'me';
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
  const who = P.identity.trim();
  const g = goalsList();
  const goal = g.length ? pick(g) : '';
  const lines = [
    `${n}, маленький шаг сегодня — это большой шаг через год. Сделай один прямо сейчас.`,
    `${n}, за твоими плечами уже многое. Это — ещё один день, который ты выиграешь.`,
    `Дисциплина — это помнить, чего ты хочешь на самом деле. ${n}, ты помнишь.`,
    `${n}, не жди мотивации. Начни — и она догонит.`,
    `Сравнивай себя только с собой вчерашним, ${n}. И сегодня ты на шаг впереди.`,
    `${n}, усталость пройдёт, а гордость за сделанное останется.`,
  ];
  if (who) lines.push(
    `${n}, не забывай: ты — ${who}. Веди себя сегодня как этот человек.`,
    `Ты — ${who}. Такие люди не ищут оправданий, они ищут способ.`,
    `${n}, мир уже видел, что ты ${who}. Покажи это ещё раз.`,
  );
  if (goal) lines.push(
    `${n}, помни, зачем всё это: «${goal}». Что ты можешь сделать для этого за 15 минут?`,
    `«${goal}» — сама собой цель не случится. Но ты, ${n}, случишься с ней.`,
    `Каждый раз, когда хочется сдаться, вспомни: «${goal}». Ты к этому ближе, чем кажется.`,
  );
  const ans = i => {
    const a = (P.interview.find(p => p.q === IV_QUESTIONS[i]) || {}).a || '';
    return a && a.length <= 140 ? a.trim().replace(/^[«"“]+|[»"”]+$/g, '').replace(/[.!…\s]+$/, '') : '';
  };
  const low = t => t.charAt(0).toLowerCase() + t.slice(1);
  if (ans(5)) lines.push(`${n}, помни, ради чего всё это: ${low(ans(5))}.`);
  if (ans(3)) lines.push(`${n}, вспомни, чем ты гордишься: ${low(ans(3))}. Сегодня будет ещё один повод.`);
  if (ans(9)) lines.push(`Твои же слова, ${n}: «${ans(9)}».`);
  if (ans(8)) lines.push(`«${ans(8)}» — ты сам(а) выбрал(а) эти слова. Живи по ним сегодня.`);
  if (P.tone === 'coach') lines.push(
    `${n}, хватит думать. Вставай и делай. Вечером отчитаешься себе.`,
    `Никто не придёт и не сделает это за тебя, ${n}. Вперёд.`,
  );
  if (P.tone === 'wise') lines.push(
    `${n}, сделай паузу, вдохни. Ты идёшь в своём темпе — и это правильно.`,
    `Река точит камень не силой, а постоянством. ${n}, просто продолжай.`,
  );
  const recent = M.history.slice(0, 5).map(h => h.text);
  const fresh = lines.filter(l => !recent.includes(l));
  return pick(fresh.length ? fresh : lines);
}

const TONES = {
  friend: 'тёплый близкий друг: поддерживает, верит в человека, говорит просто',
  coach: 'жёсткий тренер: коротко, прямо, без нытья, с вызовом',
  wise: 'спокойный мудрый наставник: глубоко, бережно, без пафоса',
};

async function aiMessages(count) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey: P.apiKey.trim(), dangerouslyAllowBrowser: true });
  const liked = M.history.filter(h => h.liked).slice(0, 5).map(h => '- ' + h.text).join('\n');
  const recent = M.history.slice(0, 10).map(h => '- ' + h.text).join('\n');
  const about = [
    P.name && `Имя: ${P.name}`,
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
  renderBio();
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
];
const ivDlg = $('#iv-dlg');
let ivStep = 0;

function renderBio() {
  const box = $('#bio-box');
  if (P.bioLocked) {
    box.innerHTML = `<div class="bio-locked">
      <div class="lock">🔒 Записано ${fmtDay.format(new Date(P.bioDate))} ${new Date(P.bioDate).getFullYear()} — навсегда</div>
      ${interviewHtml(P.interview)}</div>`;
  } else {
    const started = P.ivDraft.some(Boolean);
    box.innerHTML = `<button type="button" class="bio-start" id="bio-start">
      <b>🎙 ${started ? 'Продолжить интервью' : 'Пройти интервью'}</b>
      <span>${IV_QUESTIONS.length} вопросов о тебе. Интервью записывается один раз — потом его нельзя изменить.</span></button>`;
    $('#bio-start').addEventListener('click', () => openInterview());
  }
}

const interviewHtml = list => list.map(p =>
  `<div class="iv-pair"><div class="q">— ${esc(p.q)}</div><div class="a">— ${esc(p.a)}</div></div>`).join('');

function interviewPairs() {
  return IV_QUESTIONS.map((q, i) => ({ q, a: (P.ivDraft[i] || '').trim() })).filter(p => p.a);
}

function openInterview() {
  if (P.bioLocked) return;
  const last = P.ivDraft.reduce((m, a, i) => (a && a.trim() ? i : m), -1);
  ivStep = Math.min(last + 1, IV_QUESTIONS.length - 1);
  showStep();
  ivDlg.showModal();
}

function keepAnswer() {
  if (ivStep < IV_QUESTIONS.length) {
    P.ivDraft[ivStep] = $('#iv-a').value;
    save();
  }
}

function showStep() {
  const total = IV_QUESTIONS.length;
  const final = ivStep >= total;
  $('#iv-step').textContent = final ? 'Твоё интервью' : `Вопрос ${ivStep + 1} из ${total}`;
  $('#iv-progress').style.width = (Math.min(ivStep, total) / total * 100) + '%';
  $('#iv-q').textContent = final ? 'Всё верно?' : IV_QUESTIONS[ivStep];
  $('#iv-a').hidden = final;
  $('#iv-preview').hidden = !final;
  $('#iv-warn').hidden = !final;
  $('#iv-back').hidden = ivStep === 0;
  if (final) {
    const pairs = interviewPairs();
    $('#iv-preview').innerHTML = pairs.length ? interviewHtml(pairs) : '<p class="hint">Ты не ответил(а) ни на один вопрос.</p>';
    $('#iv-next').textContent = '🔒 Записать навсегда';
    $('#iv-next').disabled = !pairs.length;
  } else {
    $('#iv-a').value = P.ivDraft[ivStep] || '';
    $('#iv-next').disabled = false;
    nextLabel();
    setTimeout(() => $('#iv-a').focus(), 50);
  }
}

function nextLabel() {
  $('#iv-next').textContent = !$('#iv-a').value.trim() ? 'Пропустить' : ivStep === IV_QUESTIONS.length - 1 ? 'Готово' : 'Далее';
}
$('#iv-a').addEventListener('input', nextLabel);
$('#iv-back').addEventListener('click', () => { keepAnswer(); ivStep--; showStep(); });
$('#iv-next').addEventListener('click', () => {
  if (ivStep < IV_QUESTIONS.length) { keepAnswer(); ivStep++; showStep(); return; }
  if (!confirm('Записать интервью навсегда? Изменить его потом будет нельзя.')) return;
  P.interview = interviewPairs();
  P.bio = P.interview.map(p => `— ${p.q}\n— ${p.a}`).join('\n\n');
  P.bioLocked = true;
  P.bioDate = Date.now();
  P.ivDraft = [];
  M.queue = [];
  save();
  ivDlg.close();
  renderBio();
  toast('Интервью записано 🔒');
});
ivDlg.addEventListener('close', () => { keepAnswer(); renderBio(); });

// ---------- Старт ----------
function render() {
  if (tab === 'tasks') { renderMoti(); renderTasks(); }
  else if (tab === 'habits') renderHabits();
  else renderMe();
}

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

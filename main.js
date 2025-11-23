const STORAGE_KEY = 'dayflow-data';
const today = new Date();

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const state = {
  tasks: [],
  events: [],
  selectedDate: toISO(today),
  selectedCalendarDate: toISO(today),
  weekStart: startOfWeek(today),
  calendarMonth: new Date(today.getFullYear(), today.getMonth(), 1),
  taskModalTargetDate: null,
  eventModalDate: toISO(today),
  showCalendarInline: false
};

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function toISO(date) {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date(date));
}

function formatLongDate(date) {
  const dt = new Date(date);
  const base = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(dt);
  const weekday = new Intl.DateTimeFormat('ja-JP', {
    weekday: 'short'
  }).format(dt);
  return `${base}(${weekday})`;
}

function relativeBadge(date) {
  if (!date) return '未設定';
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((target - now) / (1000 * 60 * 60 * 24));
  if (diff === 0) return '今日';
  if (diff === 1) return '明日';
  const start = startOfWeek(now);
  const endThisWeek = addDays(start, 6);
  const startNextWeek = addDays(start, 7);
  const endNextWeek = addDays(start, 13);
  if (target >= start && target <= endThisWeek) return '今週';
  if (target >= startNextWeek && target <= endNextWeek) return '来週';
  return formatDateLabel(target);
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const data = JSON.parse(stored);
      state.tasks = data.tasks || [];
      state.events = data.events || [];
      return;
    } catch (e) {
      console.warn('failed to parse storage', e);
    }
  }
  seedData();
}

function seedData() {
  const isoToday = toISO(today);
  const isoTomorrow = toISO(addDays(today, 1));
  state.tasks = [
    { id: uid(), title: 'レポートの下書き', note: 'あと図を入れれば終わり', date: isoToday, due: 'today', done: false },
    { id: uid(), title: '買い物（牛乳）', note: '帰り道でOK', date: isoToday, due: 'today', done: false },
    { id: uid(), title: '上司への返信', note: '資料添付', date: isoTomorrow, due: 'tomorrow', done: false }
  ];
  state.events = [
    { id: uid(), title: 'チームMTG（Zoom）', date: isoToday, time: '09:00', memo: 'リンクはお気に入りにあり' },
    { id: uid(), title: '客先レビュー', date: isoToday, time: '13:00', memo: '' },
    { id: uid(), title: 'ジム', date: isoToday, time: '18:00', memo: '背中の日' }
  ];
  persistState();
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    tasks: state.tasks,
    events: state.events
  }));
}

function render() {
  renderToday();
  renderWeekStrips();
  renderCalendar();
}

function renderToday() {
  const todayLabel = document.getElementById('todayLabel');
  const selectedIso = state.selectedDate || toISO(today);
  const todayIso = toISO(today);
  const labelText = selectedIso === todayIso ? '今日' : formatLongDate(selectedIso);
  todayLabel.textContent = labelText;
  document.getElementById('eventsTitle').textContent = '予定';
  document.getElementById('tasksTitle').textContent = 'タスク';

  const dayEvents = state.events.filter(ev => ev.date === selectedIso);
  const dayTasks = state.tasks.filter(task => (task.date ? task.date === selectedIso : true));

  renderEventsList(document.getElementById('todayEvents'), dayEvents);

  const taskList = document.getElementById('todayTasks');
  renderTasksList(taskList, dayTasks);
  const progress = document.getElementById('taskProgress');
  const doneCount = dayTasks.filter(t => t.done).length;
  progress.textContent = `${doneCount}/${dayTasks.length} 完了`;

  const weekBlock = document.querySelector('.inline-week');
  const calendarBlock = document.getElementById('calendarInline');
  const goCalBtn = document.getElementById('goCalendar');
  if (state.showCalendarInline) {
    weekBlock.classList.add('hidden');
    calendarBlock.classList.remove('hidden');
    goCalBtn.textContent = '📅 ON';
    goCalBtn.classList.add('active-toggle');
  } else {
    weekBlock.classList.remove('hidden');
    calendarBlock.classList.add('hidden');
    goCalBtn.textContent = '📅';
    goCalBtn.classList.remove('active-toggle');
  }
}

function renderEventsList(container, events) {
  container.innerHTML = '';
  if (!events.length) {
    container.innerHTML = '<li class="muted">予定はありません</li>';
    return;
  }
  events.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  events.forEach(ev => {
    const li = document.createElement('li');
    li.className = 'item';
    const time = ev.time ? ev.time : '終日';
    li.innerHTML = `
      <div class="status">${time}</div>
      <div>
        <p class="title">${ev.title}</p>
        ${ev.memo ? `<p class="meta">${ev.memo}</p>` : ''}
      </div>
      <button class="chip ghost small" data-id="${ev.id}" data-type="event">削除</button>
    `;
    li.querySelector('button').addEventListener('click', () => deleteEvent(ev.id));
    container.appendChild(li);
  });
}

function renderTasksList(container, tasks) {
  container.innerHTML = '';
  if (!tasks.length) {
    container.innerHTML = '<li class="muted">タスクはありません</li>';
    return;
  }
  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done));
  sorted.forEach(task => {
    const li = document.createElement('li');
    li.className = `item ${task.done ? 'done' : ''}`;
    li.innerHTML = `
      <input type="checkbox" ${task.done ? 'checked' : ''} aria-label="complete task">
      <div>
        <p class="title">${task.title}</p>
        <p class="meta">${task.note || ''}</p>
      </div>
      <div>
        <p class="status ${task.done ? 'done' : ''}">${task.date ? relativeBadge(task.date) : '期限なし'}</p>
      </div>
    `;
    const checkbox = li.querySelector('input');
    checkbox.addEventListener('change', (e) => toggleTask(task.id, e.target.checked));
    li.addEventListener('click', (e) => {
      // Avoid double toggling when clicking directly on the checkbox
      if (e.target.tagName.toLowerCase() === 'input') return;
      checkbox.checked = !checkbox.checked;
      toggleTask(task.id, checkbox.checked);
    });
    container.appendChild(li);
  });
}

function renderWeekStrips() {
  renderWeekStrip(document.getElementById('weekStripInline'), document.getElementById('weekRangeInline'), state.selectedDate);
}

function renderWeekStrip(container, rangeLabel, activeDate) {
  container.innerHTML = '';
  const start = state.weekStart;
  const end = addDays(start, 6);
  rangeLabel.textContent = `${formatDateLabel(start)} 〜 ${formatDateLabel(end)}`;
  const todayIso = toISO(today);
  for (let i = 0; i < 7; i++) {
    const dateObj = addDays(start, i);
    const iso = toISO(dateObj);
    const events = state.events.filter(ev => ev.date === iso);
    const tasks = state.tasks.filter(t => t.date === iso);
    const el = document.createElement('button');
    el.className = 'day-chip';
    if (events.length) el.classList.add('has-event');
    if (tasks.length) el.classList.add('has-task');
    if (iso === activeDate) el.classList.add('active');
    if (iso === todayIso) el.classList.add('today');
    el.innerHTML = `
      <div class="dow">${['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()]}</div>
      <div class="date">${dateObj.getDate()}</div>
      <span class="badge-dot"></span>
      <span class="badge-square"></span>
    `;
    el.addEventListener('click', () => {
      state.selectedDate = iso;
      state.selectedCalendarDate = iso;
      state.weekStart = startOfWeek(dateObj);
      render();
    });
    container.appendChild(el);
  }
}

function renderCalendar() {
  const monthLabel = document.getElementById('monthLabel');
  const grid = document.getElementById('calendarGrid');

  monthLabel.textContent = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(state.calendarMonth);

  grid.innerHTML = '';
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  weekdays.forEach(day => {
    const head = document.createElement('div');
    head.textContent = day;
    head.className = 'weekday';
    grid.appendChild(head);
  });

  const firstDay = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth(), 1);
  const startWeekday = firstDay.getDay(); // Sunday start
  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement('div');
    grid.appendChild(empty);
  }

  const daysInMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth(), day);
    const iso = toISO(dateObj);
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    if (iso === state.selectedCalendarDate) cell.classList.add('active');
    if (iso === toISO(today)) cell.classList.add('today');
    const hasEvents = state.events.some(ev => ev.date === iso);
    const hasTasks = state.tasks.some(t => t.date === iso && !t.done);
    cell.innerHTML = `
      <div class="day-number">${day}</div>
      <div class="dots">
        ${hasEvents ? '<span class="dot event"></span>' : ''}
        ${hasTasks ? '<span class="dot task"></span>' : ''}
      </div>
    `;
    cell.addEventListener('click', () => {
      state.selectedCalendarDate = iso;
      state.selectedDate = iso;
      state.weekStart = startOfWeek(dateObj);
      render();
    });
    grid.appendChild(cell);
  }
}

function toggleTask(id, done) {
  state.tasks = state.tasks.map(task => task.id === id ? { ...task, done } : task);
  persistState();
  render();
}

function deleteEvent(id) {
  state.events = state.events.filter(ev => ev.id !== id);
  persistState();
  render();
}

function convertRelativeToDate(relative) {
  const base = new Date();
  switch (relative) {
    case 'today':
      return toISO(base);
    case 'tomorrow':
      return toISO(addDays(base, 1));
    case 'this_week':
      return toISO(addDays(startOfWeek(base), 4));
    case 'next_week':
      return toISO(addDays(startOfWeek(base), 7));
    default:
      return null;
  }
}

function openTaskModal(targetDate = null) {
  state.taskModalTargetDate = targetDate;
  document.getElementById('taskForm').reset();
  if (targetDate) {
    const rel = pickRelativeForDate(targetDate);
    document.querySelectorAll('input[name="taskDue"]').forEach(radio => {
      radio.checked = radio.value === rel;
    });
  }
  document.getElementById('taskModal').classList.add('active');
}

function openEventModal(date = toISO(new Date())) {
  state.eventModalDate = date;
  document.getElementById('eventForm').reset();
  document.getElementById('eventDate').value = date;
  document.getElementById('eventModal').classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  state.taskModalTargetDate = null;
}

function pickRelativeForDate(dateIso) {
  const now = new Date();
  const target = new Date(dateIso);
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target - now) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  const start = startOfWeek(now);
  const endThisWeek = addDays(start, 6);
  const startNextWeek = addDays(start, 7);
  const endNextWeek = addDays(start, 13);
  if (target >= start && target <= endThisWeek) return 'this_week';
  if (target >= startNextWeek && target <= endNextWeek) return 'next_week';
  return 'none';
}

function wireEvents() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = document.querySelector(`.collapsible[data-section="${btn.dataset.toggle}"]`);
      const collapsed = section.classList.toggle('collapsed');
      btn.textContent = collapsed ? '▸' : '▾';
    });
  });

  document.getElementById('prevWeekInline').addEventListener('click', () => {
    state.weekStart = addDays(state.weekStart, -7);
    renderWeekStrips();
  });
  document.getElementById('nextWeekInline').addEventListener('click', () => {
    state.weekStart = addDays(state.weekStart, 7);
    renderWeekStrips();
  });
  document.getElementById('goCalendar').addEventListener('click', () => {
    state.showCalendarInline = !state.showCalendarInline;
    if (!state.showCalendarInline) {
      state.weekStart = startOfWeek(new Date(state.selectedDate));
    }
    render();
  });
  const prevMonthBtn = document.getElementById('prevMonth');
  const nextMonthBtn = document.getElementById('nextMonth');
  if (prevMonthBtn && nextMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
      state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    nextMonthBtn.addEventListener('click', () => {
      state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
      renderCalendar();
    });
  }

  document.getElementById('addTaskToday').addEventListener('click', () => openTaskModal(state.selectedDate || toISO(today)));
  document.getElementById('addEventToday').addEventListener('click', () => openEventModal(state.selectedDate || toISO(today)));
  document.getElementById('addQuickTask').addEventListener('click', () => openTaskModal(state.selectedDate || toISO(today)));
  document.getElementById('addQuickEvent').addEventListener('click', () => openEventModal(state.selectedDate || toISO(today)));
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  document.getElementById('taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) return;
    const note = document.getElementById('taskNote').value.trim();
    const relative = document.querySelector('input[name="taskDue"]:checked')?.value || 'today';
    let dueDate = state.taskModalTargetDate;
    if (!dueDate) {
      dueDate = relative === 'none' ? null : convertRelativeToDate(relative);
    }
    state.tasks.push({
      id: uid(),
      title,
      note,
      date: dueDate,
      due: relative,
      done: false
    });
    persistState();
    closeModal('taskModal');
    render();
  });

  document.getElementById('eventForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('eventTitle').value.trim();
    if (!title) return;
    const date = document.getElementById('eventDate').value || state.eventModalDate || toISO(today);
    const time = document.getElementById('eventTime').value;
    const memo = document.getElementById('eventMemo').value.trim();
    state.events.push({
      id: uid(),
      title,
      date,
      time,
      memo
    });
    persistState();
    closeModal('eventModal');
    render();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  wireEvents();
  render();
});

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
  editingTaskId: null,
  editingEventId: null,
  isCalendarOpen: false
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
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  renderWeekStrip();
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
}

function renderWeekStrip() {
  const strip = document.getElementById('weekStrip');
  const range = document.getElementById('weekRange');
  if (!strip || !range) return;

  strip.innerHTML = '';
  const start = state.weekStart;
  const end = addDays(start, 6);
  range.textContent = `${formatLongDate(start).replace(/\(.+?\)/, '')} 〜 ${formatLongDate(end).replace(/\(.+?\)/, '')}`;

  const todayIso = toISO(today);
  const activeIso = state.selectedDate;

  for (let i = 0; i < 7; i++) {
    const dateObj = addDays(start, i);
    const iso = toISO(dateObj);
    const events = state.events.filter(ev => ev.date === iso);
    const tasks = state.tasks.filter(t => t.date === iso);
    const el = document.createElement('button');
    el.className = 'day-chip';
    if (events.length) el.classList.add('has-event');
    if (tasks.length) el.classList.add('has-task');
    if (iso === activeIso) el.classList.add('active');
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
      state.calendarMonth = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
      state.weekStart = startOfWeek(dateObj);
      render();
    });
    strip.appendChild(el);
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
      <button class="chip ghost small icon-trash" data-id="${ev.id}" data-type="event" aria-label="削除" title="削除"><span class="icon-trash-symbol" aria-hidden="true"></span></button>
    `;
    const deleteBtn = li.querySelector('button');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteEvent(ev.id);
    });
    li.addEventListener('click', () => openEventEditModal(ev.id));
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
      <button class="chip ghost small btn-task-delete icon-trash" aria-label="削除" title="削除"><span class="icon-trash-symbol" aria-hidden="true"></span></button>
    `;
    const checkbox = li.querySelector('input');
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', (e) => toggleTask(task.id, e.target.checked));
    const deleteBtn = li.querySelector('.btn-task-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTask(task.id);
    });
    li.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase() === 'input') return;
      openTaskEditModal(task.id);
    });
    container.appendChild(li);
  });
}

function renderCalendar() {
  const monthLabel = document.getElementById('monthLabel');
  const grid = document.getElementById('calendarGrid');
  if (!monthLabel || !grid) return;
  const activeIso = state.selectedCalendarDate || state.selectedDate;

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
    if (iso === activeIso) cell.classList.add('active');
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
      state.calendarMonth = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
      state.weekStart = startOfWeek(dateObj);
      render();
      setCalendarPopover(false);
    });
    grid.appendChild(cell);
  }
}

function setCalendarPopover(open) {
  const popover = document.getElementById('calendarPopover');
  const trigger = document.getElementById('calendarTrigger');
  if (!popover || !trigger) return;

  state.isCalendarOpen = open;
  popover.classList.toggle('open', open);
  popover.setAttribute('aria-hidden', open ? 'false' : 'true');
  trigger.classList.toggle('active', open);
}

function toggleCalendarPopover() {
  const shouldOpen = !state.isCalendarOpen;
  if (shouldOpen) {
    const baseDate = new Date(state.selectedDate || toISO(today));
    state.calendarMonth = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
    renderCalendar();
  }
  setCalendarPopover(shouldOpen);
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

function deleteTask(id) {
  state.tasks = state.tasks.filter(task => task.id !== id);
  persistState();
  render();
}

function openTaskModal(targetDate = null) {
  state.taskModalTargetDate = targetDate;
  document.getElementById('taskForm').reset();
  document.getElementById('taskModal').classList.add('active');
}

function openTaskEditModal(taskId) {
  const target = state.tasks.find(t => t.id === taskId);
  if (!target) return;
  state.editingTaskId = taskId;
  const form = document.getElementById('taskEditForm');
  form.reset();
  document.getElementById('taskEditTitle').value = target.title || '';
  document.getElementById('taskEditNote').value = target.note || '';
  document.getElementById('taskEditModal').classList.add('active');
}

function openEventModal(date = toISO(new Date())) {
  state.eventModalDate = date;
  document.getElementById('eventForm').reset();
  document.getElementById('eventDate').value = date;
  document.getElementById('eventModal').classList.add('active');
}

function openEventEditModal(eventId) {
  const target = state.events.find(ev => ev.id === eventId);
  if (!target) return;
  state.editingEventId = eventId;
  const form = document.getElementById('eventEditForm');
  form.reset();
  document.getElementById('eventEditTitle').value = target.title || '';
  document.getElementById('eventEditDate').value = target.date || toISO(today);
  document.getElementById('eventEditTime').value = target.time || '';
  document.getElementById('eventEditMemo').value = target.memo || '';
  document.getElementById('eventEditModal').classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  state.taskModalTargetDate = null;
  state.editingTaskId = null;
  state.editingEventId = null;
}

function wireEvents() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = document.querySelector(`.collapsible[data-section="${btn.dataset.toggle}"]`);
      const collapsed = section.classList.toggle('collapsed');
      btn.textContent = collapsed ? '▸' : '▾';
    });
  });

  const calendarTrigger = document.getElementById('calendarTrigger');
  if (calendarTrigger) {
    calendarTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCalendarPopover();
    });
  }

  const prevWeekBtn = document.getElementById('prevWeek');
  const nextWeekBtn = document.getElementById('nextWeek');
  if (prevWeekBtn && nextWeekBtn) {
    prevWeekBtn.addEventListener('click', () => {
      state.weekStart = addDays(state.weekStart, -7);
      renderWeekStrip();
    });
    nextWeekBtn.addEventListener('click', () => {
      state.weekStart = addDays(state.weekStart, 7);
      renderWeekStrip();
    });
  }

  document.addEventListener('click', (e) => {
    const popover = document.getElementById('calendarPopover');
    const trigger = document.getElementById('calendarTrigger');
    if (!popover || !trigger) return;
    if (!state.isCalendarOpen) return;
    if (popover.contains(e.target) || trigger.contains(e.target)) return;
    setCalendarPopover(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isCalendarOpen) {
      setCalendarPopover(false);
    }
  });

  const prevMonthBtn = document.getElementById('prevMonth');
  const nextMonthBtn = document.getElementById('nextMonth');
  if (prevMonthBtn && nextMonthBtn) {
    prevMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    nextMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
      renderCalendar();
    });
  }

  document.getElementById('addTaskToday').addEventListener('click', () => openTaskModal(state.selectedDate || toISO(today)));
  document.getElementById('addEventToday').addEventListener('click', () => openEventModal(state.selectedDate || toISO(today)));
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  document.getElementById('taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) return;
    const note = document.getElementById('taskNote').value.trim();
    const date = state.taskModalTargetDate || state.selectedDate || toISO(today);
    state.tasks.push({
      id: uid(),
      title,
      note,
      date,
      done: false
    });
    persistState();
    closeModal('taskModal');
    render();
  });

  document.getElementById('taskEditForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.editingTaskId) return;
    const existing = state.tasks.find(task => task.id === state.editingTaskId);
    if (!existing) {
      closeModal('taskEditModal');
      return;
    }
    const title = document.getElementById('taskEditTitle').value.trim();
    if (!title) return;
    const note = document.getElementById('taskEditNote').value.trim();
    const date = typeof existing.date !== 'undefined' ? existing.date : (state.selectedDate || toISO(today));
    state.tasks = state.tasks.map(task => task.id === state.editingTaskId ? {
      ...task,
      title,
      note,
      date
    } : task);
    persistState();
    closeModal('taskEditModal');
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

  document.getElementById('eventEditForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.editingEventId) return;
    const title = document.getElementById('eventEditTitle').value.trim();
    if (!title) return;
    const date = document.getElementById('eventEditDate').value || toISO(today);
    const time = document.getElementById('eventEditTime').value;
    const memo = document.getElementById('eventEditMemo').value.trim();
    const exists = state.events.some(ev => ev.id === state.editingEventId);
    if (!exists) {
      closeModal('eventEditModal');
      return;
    }
    state.events = state.events.map(ev => ev.id === state.editingEventId ? {
      ...ev,
      title,
      date,
      time,
      memo
    } : ev);
    persistState();
    closeModal('eventEditModal');
    render();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  wireEvents();
  render();
});

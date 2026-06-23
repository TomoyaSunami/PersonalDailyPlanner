import './style.css';

const STORAGE_KEY = 'dayflow-data';
const UNDO_DURATION = 4000;
const TASK_DRAG_THRESHOLD = 6;
const TASK_DRAG_LONG_PRESS_MS = 450;
const today = new Date();

type ISODate = string;

type Task = {
  id: string;
  title: string;
  note?: string;
  date?: ISODate;
  due?: 'today' | 'tomorrow';
  done: boolean;
};

type CalendarEvent = {
  id: string;
  title: string;
  date: ISODate;
  time?: string;
  memo?: string;
};

type AppState = {
  tasks: Task[];
  events: CalendarEvent[];
  selectedDate: ISODate;
  selectedCalendarDate: ISODate;
  weekStart: Date;
  calendarMonth: Date;
  taskModalTargetDate: ISODate | null;
  eventModalDate: ISODate;
  editingTaskId: string | null;
  editingEventId: string | null;
  isCalendarOpen: boolean;
};

type StoredState = {
  tasks?: Task[];
  events?: CalendarEvent[];
};

type UndoHandler = () => void;

type TaskDragState = {
  pointerId: number;
  container: HTMLElement;
  row: HTMLLIElement;
  sourceIndex: number;
  dropIndex: number;
  orderedIds: string[];
  startX: number;
  startY: number;
  hasLongPressed: boolean;
  isDragging: boolean;
  longPressTimer: ReturnType<typeof window.setTimeout> | null;
};

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: #${id}`);
  }
  return element as T;
}

function maybeById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const state: AppState = {
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

let undoTimer: ReturnType<typeof window.setTimeout> | null = null;
let pendingUndoHandler: UndoHandler | null = null;
let taskDragState: TaskDragState | null = null;
let suppressTaskClick = false;
let suppressTaskClickTimer: ReturnType<typeof window.setTimeout> | null = null;

function startOfWeek(date: Date | ISODate): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base: Date | ISODate, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function toISO(date: Date | ISODate): ISODate {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatFixedDate(date: Date | ISODate): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}年${month}月${day}日`;
}

function formatLongDate(date: Date | ISODate): string {
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

function stylizeDateUnits(text: string): string {
  if (!text) return '';
  return String(text).replace(/(\d)([年月日])/g, (_, num, unit) => `${num}<span class="date-unit">${unit}</span>`);
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const data = JSON.parse(stored) as StoredState;
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

function hideSnackbar() {
  const snackbar = maybeById('undoSnackbar');
  const undoBtn = maybeById<HTMLButtonElement>('snackbarUndo');
  if (undoTimer) {
    clearTimeout(undoTimer);
    undoTimer = null;
  }
  pendingUndoHandler = null;
  if (undoBtn) {
    undoBtn.onclick = null;
  }
  if (snackbar) {
    snackbar.classList.remove('visible');
  }
}

function showUndoSnackbar(message: string, onUndo: UndoHandler) {
  const snackbar = maybeById('undoSnackbar');
  const messageEl = maybeById('snackbarMessage');
  const undoBtn = maybeById<HTMLButtonElement>('snackbarUndo');
  if (!snackbar || !messageEl || !undoBtn) return;

  // Replace any pending undo with the latest action
  hideSnackbar();
  messageEl.textContent = message;
  pendingUndoHandler = onUndo;

  undoBtn.onclick = () => {
    if (pendingUndoHandler) pendingUndoHandler();
    hideSnackbar();
  };

  snackbar.classList.add('visible');
  undoTimer = setTimeout(() => {
    hideSnackbar();
  }, UNDO_DURATION);
}

function render() {
  renderToday();
  renderWeekStrip();
  renderCalendar();
  setWeekRangeWidth();
}

function renderToday() {
  const todayLabel = byId('todayLabel');
  const selectedIso = state.selectedDate || toISO(today);
  const todayIso = toISO(today);
  const labelText = selectedIso === todayIso ? '今日' : formatLongDate(selectedIso);
  if (labelText === '今日') {
    todayLabel.textContent = labelText;
  } else {
    todayLabel.innerHTML = stylizeDateUnits(labelText);
  }
  byId('eventsTitle').textContent = '予定';
  byId('tasksTitle').textContent = 'タスク';

  const dayEvents = state.events.filter(ev => ev.date === selectedIso);
  const dayTasks = state.tasks.filter(task => (task.date ? task.date === selectedIso : true));

  renderEventsList(byId('todayEvents'), dayEvents);

  const taskList = byId('todayTasks');
  renderTasksList(taskList, dayTasks);
  const progress = byId('taskProgress');
  const doneCount = dayTasks.filter(t => t.done).length;
  progress.textContent = `${doneCount}/${dayTasks.length} 完了`;
}

function renderWeekStrip() {
  const strip = maybeById('weekStrip');
  const range = maybeById('weekRange');
  if (!strip || !range) return;

  strip.innerHTML = '';
  const start = state.weekStart;
  const end = addDays(start, 6);
  range.innerHTML = `${stylizeDateUnits(formatFixedDate(start))} <span class="range-separator">〜</span> ${stylizeDateUnits(formatFixedDate(end))}`;

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

function renderEventsList(container: HTMLElement, events: CalendarEvent[]) {
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
      <button class="task-action-btn btn-task-delete" data-id="${ev.id}" data-type="event" aria-label="削除" title="削除">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18"></path>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        </svg>
      </button>
    `;
    const deleteBtn = li.querySelector('button');
    if (!deleteBtn) return;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteEvent(ev.id);
    });
    li.addEventListener('click', () => openEventEditModal(ev.id));
    container.appendChild(li);
  });
}

function getReorderableTaskIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLLIElement>('.task-item[data-reorderable="true"]'))
    .map(row => row.dataset.taskId)
    .filter((id): id is string => Boolean(id));
}

function getTaskDropIndex(container: HTMLElement, pointerY: number): number {
  const rows = Array.from(container.querySelectorAll<HTMLLIElement>('.task-item[data-reorderable="true"]'));
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    const rowIndex = Number(row.dataset.dragIndex || 0);
    if (pointerY < rect.top + rect.height / 2) {
      return rowIndex;
    }
  }
  return rows.length;
}

function paintTaskDropIndicator(container: HTMLElement, dropIndex: number) {
  const rows = Array.from(container.querySelectorAll<HTMLLIElement>('.task-item[data-reorderable="true"]'));
  rows.forEach(row => {
    row.classList.remove('drop-before', 'drop-after');
  });

  if (!rows.length) return;
  if (dropIndex >= rows.length) {
    rows[rows.length - 1].classList.add('drop-after');
    return;
  }
  rows[dropIndex].classList.add('drop-before');
}

function buildMovedTaskIds(ids: string[], sourceIndex: number, dropIndex: number): string[] {
  if (sourceIndex < 0 || sourceIndex >= ids.length) return ids;
  const next = [...ids];
  const [movedId] = next.splice(sourceIndex, 1);
  const adjustedIndex = sourceIndex < dropIndex ? dropIndex - 1 : dropIndex;
  const insertIndex = Math.max(0, Math.min(adjustedIndex, next.length));
  next.splice(insertIndex, 0, movedId);
  return next;
}

function suppressNextTaskClick(duration = 250) {
  suppressTaskClick = true;
  if (suppressTaskClickTimer) {
    clearTimeout(suppressTaskClickTimer);
  }
  suppressTaskClickTimer = window.setTimeout(() => {
    suppressTaskClick = false;
    suppressTaskClickTimer = null;
  }, duration);
}

function applyVisibleTaskOrder(orderedIds: string[]) {
  const visibleIds = new Set(orderedIds);
  const orderedTasks = orderedIds
    .map(id => state.tasks.find(task => task.id === id))
    .filter((task): task is Task => Boolean(task));

  let nextVisibleIndex = 0;
  state.tasks = state.tasks.map(task => {
    if (!visibleIds.has(task.id)) return task;
    const orderedTask = orderedTasks[nextVisibleIndex];
    nextVisibleIndex += 1;
    return orderedTask || task;
  });
}

function cleanupTaskDrag() {
  if (!taskDragState) return;
  const { container, pointerId, row } = taskDragState;
  if (taskDragState.longPressTimer) {
    clearTimeout(taskDragState.longPressTimer);
  }
  if (row.hasPointerCapture(pointerId)) {
    row.releasePointerCapture(pointerId);
  }
  row.removeEventListener('pointermove', handleTaskDragMove);
  row.removeEventListener('pointerup', handleTaskDragEnd);
  row.removeEventListener('pointercancel', handleTaskDragCancel);
  row.classList.remove('drag-ready', 'dragging');
  container.classList.remove('is-task-dragging');
  container.querySelectorAll('.drop-before, .drop-after').forEach(el => {
    el.classList.remove('drop-before', 'drop-after');
  });
  taskDragState = null;
}

function activateTaskLongPressDrag(pointerId: number) {
  if (!taskDragState || taskDragState.pointerId !== pointerId) return;
  taskDragState.longPressTimer = null;
  taskDragState.hasLongPressed = true;
  taskDragState.row.classList.add('drag-ready');
}

function handleTaskDragMove(event: PointerEvent) {
  if (!taskDragState || event.pointerId !== taskDragState.pointerId) return;
  const moveX = Math.abs(event.clientX - taskDragState.startX);
  const moveY = Math.abs(event.clientY - taskDragState.startY);

  if (!taskDragState.hasLongPressed) {
    if (Math.hypot(moveX, moveY) >= TASK_DRAG_THRESHOLD) {
      suppressNextTaskClick();
      cleanupTaskDrag();
    }
    return;
  }

  if (!taskDragState.isDragging) {
    if (Math.hypot(moveX, moveY) < TASK_DRAG_THRESHOLD) return;
    taskDragState.isDragging = true;
    taskDragState.row.classList.remove('drag-ready');
    taskDragState.row.classList.add('dragging');
    taskDragState.container.classList.add('is-task-dragging');
  }
  event.preventDefault();
  taskDragState.dropIndex = getTaskDropIndex(taskDragState.container, event.clientY);
  paintTaskDropIndicator(taskDragState.container, taskDragState.dropIndex);
}

function handleTaskDragEnd(event: PointerEvent) {
  if (!taskDragState || event.pointerId !== taskDragState.pointerId) return;
  const hasLongPressed = taskDragState.hasLongPressed;
  const wasDragging = taskDragState.isDragging;
  if (hasLongPressed || wasDragging) {
    event.preventDefault();
  }

  const { orderedIds, sourceIndex, dropIndex } = taskDragState;
  const nextIds = buildMovedTaskIds(orderedIds, sourceIndex, dropIndex);
  const didChange = nextIds.some((id, index) => id !== orderedIds[index]);
  cleanupTaskDrag();

  if (hasLongPressed) suppressNextTaskClick();
  if (!wasDragging) return;

  if (!didChange) return;
  applyVisibleTaskOrder(nextIds);
  persistState();
  render();
}

function handleTaskDragCancel(event: PointerEvent) {
  if (!taskDragState || event.pointerId !== taskDragState.pointerId) return;
  cleanupTaskDrag();
}

function startTaskDrag(event: PointerEvent, container: HTMLElement, taskId: string, row: HTMLLIElement) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (target.closest('button, input, textarea, select, a')) return;

  const orderedIds = getReorderableTaskIds(container);
  if (orderedIds.length < 2) return;

  const sourceIndex = orderedIds.indexOf(taskId);
  if (sourceIndex < 0) return;

  event.stopPropagation();

  taskDragState = {
    pointerId: event.pointerId,
    container,
    row,
    sourceIndex,
    dropIndex: sourceIndex,
    orderedIds,
    startX: event.clientX,
    startY: event.clientY,
    hasLongPressed: false,
    isDragging: false,
    longPressTimer: window.setTimeout(() => activateTaskLongPressDrag(event.pointerId), TASK_DRAG_LONG_PRESS_MS)
  };

  row.setPointerCapture(event.pointerId);
  row.addEventListener('pointermove', handleTaskDragMove);
  row.addEventListener('pointerup', handleTaskDragEnd);
  row.addEventListener('pointercancel', handleTaskDragCancel);
}

function renderTasksList(container: HTMLElement, tasks: Task[]) {
  container.innerHTML = '';
  if (!tasks.length) {
    container.innerHTML = '<li class="muted">タスクはありません</li>';
    return;
  }
  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done));
  const reorderableIds = sorted.filter(task => !task.done).map(task => task.id);
  sorted.forEach(task => {
    const li = document.createElement('li');
    li.className = `item task-item ${task.done ? 'done' : ''}`;
    li.dataset.taskId = task.id;
    if (!task.done) {
      li.dataset.reorderable = 'true';
      li.dataset.dragIndex = String(reorderableIds.indexOf(task.id));
    }
    const actionButtons = task.done ? `
      <button class="task-action-btn btn-task-delete" aria-label="削除" title="削除">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18"></path>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        </svg>
      </button>
    ` : `
      <button class="task-action-btn btn-task-defer" aria-label="翌日に延期" title="翌日に延期">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m5 18 6-6-6-6"></path>
          <path d="m13 18 6-6-6-6"></path>
        </svg>
      </button>
      <button class="task-action-btn btn-task-delete" aria-label="削除" title="削除">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18"></path>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        </svg>
      </button>
    `;
    li.innerHTML = `
      <input type="checkbox" ${task.done ? 'checked' : ''} aria-label="complete task">
      <div>
        <p class="title">${task.title}</p>
        <p class="meta">${task.note || ''}</p>
      </div>
      ${actionButtons}
    `;
    const checkbox = li.querySelector('input');
    if (!checkbox) return;
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', (e) => toggleTask(task.id, (e.target as HTMLInputElement).checked));
    if (!task.done) {
      li.addEventListener('pointerdown', (e) => startTaskDrag(e, container, task.id, li));
      li.addEventListener('contextmenu', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, input, textarea, select, a')) return;
        e.preventDefault();
      });
    }
    const deleteBtn = li.querySelector('.btn-task-delete');
    if (!deleteBtn) return;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTask(task.id);
    });
    if (!task.done) {
      const deferBtn = li.querySelector('.btn-task-defer');
      if (!deferBtn) return;
      deferBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deferTask(task.id);
      });
    }
    li.addEventListener('click', (e) => {
      if (suppressTaskClick) {
        suppressTaskClick = false;
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('button, input, textarea, select, a')) return;
      openTaskEditModal(task.id);
    });
    container.appendChild(li);
  });
}

function renderCalendar() {
  const monthLabel = maybeById('monthLabel');
  const grid = maybeById('calendarGrid');
  if (!monthLabel || !grid) return;
  const activeIso = state.selectedCalendarDate || state.selectedDate;

  monthLabel.innerHTML = stylizeDateUnits(new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(state.calendarMonth));

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

function setCalendarPopover(open: boolean) {
  const popover = maybeById('calendarPopover');
  const trigger = maybeById('calendarTrigger');
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

function toggleTask(id: string, done: boolean) {
  state.tasks = state.tasks.map(task => task.id === id ? { ...task, done } : task);
  persistState();
  render();
}

function deleteEvent(id: string) {
  const target = state.events.find(ev => ev.id === id);
  if (!target) return;
  state.events = state.events.filter(ev => ev.id !== id);
  persistState();
  render();
  showUndoSnackbar('予定を削除しました', () => {
    state.events = [...state.events, target];
    persistState();
    render();
  });
}

function deleteTask(id: string) {
  const target = state.tasks.find(task => task.id === id);
  if (!target) return;
  const targetIndex = state.tasks.findIndex(task => task.id === id);
  state.tasks = state.tasks.filter(task => task.id !== id);
  persistState();
  render();
  showUndoSnackbar('タスクを削除しました', () => {
    const nextTasks = [...state.tasks];
    const insertIndex = Math.max(0, Math.min(targetIndex, nextTasks.length));
    nextTasks.splice(insertIndex, 0, target);
    state.tasks = nextTasks;
    persistState();
    render();
  });
}

function deferTask(id: string) {
  const target = state.tasks.find(task => task.id === id);
  if (!target) return;
  const base = target.date ? new Date(target.date) : new Date(state.selectedDate || today);
  const nextDayIso = toISO(addDays(base, 1));
  state.tasks = state.tasks.map(task => task.id === id ? { ...task, date: nextDayIso } : task);
  persistState();
  render();
}

function openTaskModal(targetDate: ISODate | null = null) {
  state.taskModalTargetDate = targetDate;
  byId<HTMLFormElement>('taskForm').reset();
  const defaultDate = targetDate || state.selectedDate || toISO(today);
  const dateInput = maybeById<HTMLInputElement>('taskDate');
  if (dateInput) dateInput.value = defaultDate;
  byId('taskModal').classList.add('active');
}

function openTaskEditModal(taskId: string) {
  const target = state.tasks.find(t => t.id === taskId);
  if (!target) return;
  state.editingTaskId = taskId;
  const form = byId<HTMLFormElement>('taskEditForm');
  form.reset();
  byId<HTMLInputElement>('taskEditTitle').value = target.title || '';
  byId<HTMLTextAreaElement>('taskEditNote').value = target.note || '';
  const editDateInput = maybeById<HTMLInputElement>('taskEditDate');
  if (editDateInput) editDateInput.value = target.date || state.selectedDate || toISO(today);
  byId('taskEditModal').classList.add('active');
}

function openEventModal(date: ISODate = toISO(new Date())) {
  state.eventModalDate = date;
  byId<HTMLFormElement>('eventForm').reset();
  byId<HTMLInputElement>('eventDate').value = date;
  byId('eventModal').classList.add('active');
}

function openEventEditModal(eventId: string) {
  const target = state.events.find(ev => ev.id === eventId);
  if (!target) return;
  state.editingEventId = eventId;
  const form = byId<HTMLFormElement>('eventEditForm');
  form.reset();
  byId<HTMLInputElement>('eventEditTitle').value = target.title || '';
  byId<HTMLInputElement>('eventEditDate').value = target.date || toISO(today);
  byId<HTMLInputElement>('eventEditTime').value = target.time || '';
  byId<HTMLTextAreaElement>('eventEditMemo').value = target.memo || '';
  byId('eventEditModal').classList.add('active');
}

function closeModal(id: string) {
  byId(id).classList.remove('active');
  state.taskModalTargetDate = null;
  state.editingTaskId = null;
  state.editingEventId = null;
}

function wireEvents() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const toggleTarget = (btn as HTMLElement).dataset.toggle;
      const section = document.querySelector(`.collapsible[data-section="${toggleTarget}"]`);
      if (!section) return;
      const collapsed = section.classList.toggle('collapsed');
      btn.textContent = collapsed ? '▸' : '▾';
    });
  });

  const calendarTrigger = maybeById('calendarTrigger');
  if (calendarTrigger) {
    calendarTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCalendarPopover();
    });
  }

  const prevWeekBtn = maybeById('prevWeek');
  const nextWeekBtn = maybeById('nextWeek');
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
    const popover = maybeById('calendarPopover');
    const trigger = maybeById('calendarTrigger');
    if (!popover || !trigger) return;
    if (!state.isCalendarOpen) return;
    const target = e.target as Node;
    if (popover.contains(target) || trigger.contains(target)) return;
    setCalendarPopover(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isCalendarOpen) {
      setCalendarPopover(false);
    }
  });

  const prevMonthBtn = maybeById('prevMonth');
  const nextMonthBtn = maybeById('nextMonth');
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

  byId('addTaskToday').addEventListener('click', () => openTaskModal(state.selectedDate || toISO(today)));
  byId('addEventToday').addEventListener('click', () => openEventModal(state.selectedDate || toISO(today)));
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = (btn as HTMLElement).dataset.close;
      if (modalId) closeModal(modalId);
    });
  });

  byId<HTMLFormElement>('taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = byId<HTMLInputElement>('taskTitle').value.trim();
    if (!title) return;
    const note = byId<HTMLTextAreaElement>('taskNote').value.trim();
    const dateInput = maybeById<HTMLInputElement>('taskDate');
    const date = (dateInput && dateInput.value) ? dateInput.value : (state.taskModalTargetDate || state.selectedDate || toISO(today));
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

  byId<HTMLFormElement>('taskEditForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.editingTaskId) return;
    const existing = state.tasks.find(task => task.id === state.editingTaskId);
    if (!existing) {
      closeModal('taskEditModal');
      return;
    }
    const title = byId<HTMLInputElement>('taskEditTitle').value.trim();
    if (!title) return;
    const note = byId<HTMLTextAreaElement>('taskEditNote').value.trim();
    const dateInput = maybeById<HTMLInputElement>('taskEditDate');
    const date = (dateInput && dateInput.value) ? dateInput.value : (typeof existing.date !== 'undefined' ? existing.date : (state.selectedDate || toISO(today)));
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

  byId<HTMLFormElement>('eventForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = byId<HTMLInputElement>('eventTitle').value.trim();
    if (!title) return;
    const date = byId<HTMLInputElement>('eventDate').value || state.eventModalDate || toISO(today);
    const time = byId<HTMLInputElement>('eventTime').value;
    const memo = byId<HTMLTextAreaElement>('eventMemo').value.trim();
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

  byId<HTMLFormElement>('eventEditForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.editingEventId) return;
    const existing = state.events.find(ev => ev.id === state.editingEventId);
    if (!existing) {
      closeModal('eventEditModal');
      return;
    }
    const title = byId<HTMLInputElement>('eventEditTitle').value.trim();
    if (!title) return;
    const dateInput = maybeById<HTMLInputElement>('eventEditDate');
    const date = (dateInput && dateInput.value) ? dateInput.value : (existing.date || toISO(today));
    const time = byId<HTMLInputElement>('eventEditTime').value;
    const memo = byId<HTMLTextAreaElement>('eventEditMemo').value.trim();
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

function setWeekRangeWidth() {
  const el = maybeById('weekRange');
  if (!el || !document.body) return;
  const sample = `${stylizeDateUnits('0000年00月00日')} <span class="range-separator">〜</span> ${stylizeDateUnits('0000年00月00日')}`; // 想定される最長テキスト（左右固定幅）
  const style = window.getComputedStyle(el);
  const ghost = document.createElement('span');
  ghost.className = el.className;
  ghost.style.position = 'absolute';
  ghost.style.visibility = 'hidden';
  ghost.style.whiteSpace = 'nowrap';
  ghost.style.boxSizing = style.boxSizing;
  ghost.style.padding = style.padding;
  ghost.style.border = style.border;
  ghost.style.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ghost.innerHTML = sample;
  document.body.appendChild(ghost);
  const width = Math.ceil(ghost.getBoundingClientRect().width);
  document.body.removeChild(ghost);
  el.style.width = `${width}px`;
  el.style.display = 'inline-block';
}

function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext && window.location.hostname !== 'localhost') return;

  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.warn('service worker registration failed', error);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  wireEvents();
  render();
  registerServiceWorker();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(setWeekRangeWidth).catch(() => {});
  }
});

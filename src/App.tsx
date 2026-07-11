import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

const STORAGE_KEY = 'dayflow-data';
const UNDO_DURATION = 4000;
const today = new Date();
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

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

type StoredState = {
  tasks?: Task[];
  events?: CalendarEvent[];
};

type ModalState =
  | { type: 'task-create'; date: ISODate }
  | { type: 'task-edit'; taskId: string }
  | { type: 'event-create'; date: ISODate }
  | { type: 'event-edit'; eventId: string }
  | null;

type UndoState = {
  message: string;
  onUndo: () => void;
} | null;

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function startOfWeek(date: Date | ISODate): Date {
  const d = new Date(date);
  const day = d.getDay();
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

function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(date);
}

function seedData(): StoredState {
  const isoToday = toISO(today);
  const isoTomorrow = toISO(addDays(today, 1));
  return {
    tasks: [
      { id: uid(), title: 'レポートの下書き', note: 'あと図を入れれば終わり', date: isoToday, due: 'today', done: false },
      { id: uid(), title: '買い物（牛乳）', note: '帰り道でOK', date: isoToday, due: 'today', done: false },
      { id: uid(), title: '上司への返信', note: '資料添付', date: isoTomorrow, due: 'tomorrow', done: false }
    ],
    events: [
      { id: uid(), title: 'チームMTG（Zoom）', date: isoToday, time: '09:00', memo: 'リンクはお気に入りにあり' },
      { id: uid(), title: '客先レビュー', date: isoToday, time: '13:00', memo: '' },
      { id: uid(), title: 'ジム', date: isoToday, time: '18:00', memo: '背中の日' }
    ]
  };
}

function loadStoredState(): Required<StoredState> {
  const fallback = seedData();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { tasks: fallback.tasks ?? [], events: fallback.events ?? [] };
    const parsed = JSON.parse(stored) as StoredState;
    return {
      tasks: parsed.tasks ?? [],
      events: parsed.events ?? []
    };
  } catch (error) {
    console.warn('failed to parse storage', error);
    return { tasks: fallback.tasks ?? [], events: fallback.events ?? [] };
  }
}

function persistState(tasks: Task[], events: CalendarEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, events }));
}

function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext && window.location.hostname !== 'localhost') return;

  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.warn('service worker registration failed', error);
  });
}

function DateText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const current = text[i];
    const next = text[i + 1];
    if (/\d/.test(current) && next && /[年月日]/.test(next)) {
      parts.push(current);
      parts.push(<span className="date-unit" key={`${i}-${next}`}>{next}</span>);
      i += 1;
      continue;
    }
    parts.push(current);
  }
  return <>{parts}</>;
}

function TrashIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function DeferIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 18 6-6-6-6" />
      <path d="m13 18 6-6-6-6" />
    </svg>
  );
}

function App() {
  const initialData = useMemo(loadStoredState, []);
  const [tasks, setTasks] = useState<Task[]>(initialData.tasks);
  const [events, setEvents] = useState<CalendarEvent[]>(initialData.events);
  const [selectedDate, setSelectedDate] = useState<ISODate>(toISO(today));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<ISODate>(toISO(today));
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(today));
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({ events: false, tasks: false });
  const [modal, setModal] = useState<ModalState>(null);
  const [undo, setUndo] = useState<UndoState>(null);

  const dayEvents = useMemo(
    () => events.filter((event) => event.date === selectedDate).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    [events, selectedDate]
  );
  const dayTasks = useMemo(
    () => tasks.filter((task) => (task.date ? task.date === selectedDate : true)),
    [tasks, selectedDate]
  );
  const taskProgress = `${dayTasks.filter((task) => task.done).length}/${dayTasks.length} 完了`;
  const todayLabel = selectedDate === toISO(today) ? '今日' : formatLongDate(selectedDate);

  useEffect(() => {
    persistState(tasks, events);
  }, [tasks, events]);

  useEffect(registerServiceWorker, []);

  useEffect(() => {
    if (!undo) return undefined;
    const timer = window.setTimeout(() => setUndo(null), UNDO_DURATION);
    return () => window.clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    if (!isCalendarOpen) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.calendar-popover') || target.closest('.calendar-trigger')) return;
      setIsCalendarOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCalendarOpen(false);
    };
    document.addEventListener('click', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isCalendarOpen]);

  function selectDate(date: Date | ISODate) {
    const nextDate = typeof date === 'string' ? new Date(date) : date;
    const iso = toISO(nextDate);
    setSelectedDate(iso);
    setSelectedCalendarDate(iso);
    setCalendarMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    setWeekStart(startOfWeek(nextDate));
  }

  function toggleTask(id: string, done: boolean) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, done } : task)));
  }

  function deleteTask(id: string) {
    const target = tasks.find((task) => task.id === id);
    const targetIndex = tasks.findIndex((task) => task.id === id);
    if (!target || targetIndex < 0) return;
    setTasks((current) => current.filter((task) => task.id !== id));
    setUndo({
      message: 'タスクを削除しました',
      onUndo: () => {
        setTasks((current) => {
          const next = [...current];
          next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, target);
          return next;
        });
      }
    });
  }

  function deleteEvent(id: string) {
    const target = events.find((event) => event.id === id);
    if (!target) return;
    setEvents((current) => current.filter((event) => event.id !== id));
    setUndo({
      message: '予定を削除しました',
      onUndo: () => setEvents((current) => [...current, target])
    });
  }

  function deferTask(id: string) {
    setTasks((current) => current.map((task) => {
      if (task.id !== id) return task;
      const base = task.date ? new Date(task.date) : new Date(selectedDate || today);
      return { ...task, date: toISO(addDays(base, 1)) };
    }));
  }

  function applyVisibleTaskOrder(orderedIds: string[]) {
    setTasks((current) => {
      const visibleIds = new Set(orderedIds);
      const orderedTasks = orderedIds
        .map((id) => current.find((task) => task.id === id))
        .filter((task): task is Task => Boolean(task));
      let nextVisibleIndex = 0;
      return current.map((task) => {
        if (!visibleIds.has(task.id)) return task;
        const orderedTask = orderedTasks[nextVisibleIndex];
        nextVisibleIndex += 1;
        return orderedTask || task;
      });
    });
  }

  function saveTask(input: { id?: string; title: string; note: string; date: ISODate }) {
    if (input.id) {
      setTasks((current) => current.map((task) => (
        task.id === input.id ? { ...task, title: input.title, note: input.note, date: input.date } : task
      )));
    } else {
      setTasks((current) => [...current, { id: uid(), title: input.title, note: input.note, date: input.date, done: false }]);
    }
    setModal(null);
  }

  function saveEvent(input: { id?: string; title: string; date: ISODate; time: string; memo: string }) {
    if (input.id) {
      setEvents((current) => current.map((event) => (
        event.id === input.id ? { ...event, title: input.title, date: input.date, time: input.time, memo: input.memo } : event
      )));
    } else {
      setEvents((current) => [...current, { id: uid(), title: input.title, date: input.date, time: input.time, memo: input.memo }]);
    }
    setModal(null);
  }

  return (
    <>
      <div className="bg-layer" />
      <div className="bg-sheen" />
      <main className="shell">
        <header className="hero glass-card app-enter">
          <div className="brand">
            <div className="brand-visual">
              <img src="logo-daily-canvas.svg" alt="Daily Canvasのロゴ" className="brand-mark" />
              <img src="logo-daily-canvas-wordmark.svg" alt="Daily Canvasのワードマーク" className="brand-wordmark" />
            </div>
          </div>
        </header>

        <section id="todayView" className="view active">
          <div className="stack">
            <article className="glass-card section-card app-enter app-enter-delayed">
              <div className="section-head date-row">
                <h2>{todayLabel === '今日' ? todayLabel : <DateText text={todayLabel} />}</h2>
                <div className="date-actions">
                  {selectedDate !== toISO(today) && (
                    <button className="today-btn" type="button" onClick={() => selectDate(today)}>
                      今日に戻る
                    </button>
                  )}
                  <button
                    className={`icon-btn calendar-trigger ${isCalendarOpen ? 'active' : ''}`}
                    aria-label="日付を選択"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!isCalendarOpen) {
                        const baseDate = new Date(selectedDate || toISO(today));
                        setCalendarMonth(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
                      }
                      setIsCalendarOpen((open) => !open);
                    }}
                  >
                    <span className="icon-calendar-symbol" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <CalendarPopover
                activeIso={selectedCalendarDate || selectedDate}
                calendarMonth={calendarMonth}
                events={events}
                isOpen={isCalendarOpen}
                tasks={tasks}
                onMonthChange={setCalendarMonth}
                onSelect={(date) => {
                  selectDate(date);
                  setIsCalendarOpen(false);
                }}
              />

              <WeekStrip
                activeIso={selectedDate}
                events={events}
                tasks={tasks}
                weekStart={weekStart}
                onMoveWeek={(days) => setWeekStart((current) => addDays(current, days))}
                onSelect={selectDate}
              />

              <CollapsibleSection
                isCollapsed={collapsed.events}
                title="予定"
                onToggle={() => setCollapsed((current) => ({ ...current, events: !current.events }))}
              >
                <EventList events={dayEvents} onDelete={deleteEvent} onEdit={(eventId) => setModal({ type: 'event-edit', eventId })} />
                <div className="section-actions">
                  <button className="ghost-btn btn-add-event" type="button" onClick={() => setModal({ type: 'event-create', date: selectedDate || toISO(today) })}>＋ 予定を追加</button>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                isCollapsed={collapsed.tasks}
                title="タスク"
                aside={<span className="chip ghost small">{taskProgress}</span>}
                onToggle={() => setCollapsed((current) => ({ ...current, tasks: !current.tasks }))}
              >
                <TaskList
                  tasks={dayTasks}
                  onDelete={deleteTask}
                  onDefer={deferTask}
                  onEdit={(taskId) => setModal({ type: 'task-edit', taskId })}
                  onReorder={applyVisibleTaskOrder}
                  onToggle={toggleTask}
                />
                <div className="section-actions">
                  <button className="ghost-btn btn-add-task" type="button" onClick={() => setModal({ type: 'task-create', date: selectedDate || toISO(today) })}>＋ タスクを追加</button>
                </div>
              </CollapsibleSection>
            </article>
          </div>
        </section>
      </main>

      <>
        {modal?.type === 'task-create' && (
          <TaskModal key="task-create" title="タスクを追加" initialDate={modal.date} onClose={() => setModal(null)} onSave={saveTask} />
        )}
        {modal?.type === 'task-edit' && (
          <TaskModal key="task-edit" title="タスクを編集" task={tasks.find((task) => task.id === modal.taskId)} onClose={() => setModal(null)} onSave={saveTask} />
        )}
        {modal?.type === 'event-create' && (
          <EventModal key="event-create" title="予定を追加" initialDate={modal.date} onClose={() => setModal(null)} onSave={saveEvent} />
        )}
        {modal?.type === 'event-edit' && (
          <EventModal key="event-edit" title="予定を編集" event={events.find((item) => item.id === modal.eventId)} onClose={() => setModal(null)} onSave={saveEvent} />
        )}
      </>

      <>
        {undo && (
          <div
            className="snackbar visible"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="snackbar-body">
              <span>{undo.message}</span>
              <button
                className="snackbar-undo"
                type="button"
                onClick={() => {
                  undo.onUndo();
                  setUndo(null);
                }}
              >
                元に戻す
              </button>
            </div>
          </div>
        )}
      </>
    </>
  );
}

function CollapsibleSection({
  aside,
  children,
  isCollapsed,
  onToggle,
  title
}: {
  aside?: ReactNode;
  children: ReactNode;
  isCollapsed: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <div className={`collapsible ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="collapsible-head">
        <div className="collapsible-left">
          <button className="chip toggle-btn" type="button" aria-label="折り畳み/展開" onClick={onToggle}>{isCollapsed ? '▸' : '▾'}</button>
          <h3>{title}</h3>
        </div>
        {aside && <div className="collapsible-controls">{aside}</div>}
      </div>
      {!isCollapsed && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

function WeekStrip({
  activeIso,
  events,
  onMoveWeek,
  onSelect,
  tasks,
  weekStart
}: {
  activeIso: ISODate;
  events: CalendarEvent[];
  onMoveWeek: (days: number) => void;
  onSelect: (date: Date) => void;
  tasks: Task[];
  weekStart: Date;
}) {
  const end = addDays(weekStart, 6);
  const todayIso = toISO(today);
  return (
    <div className="week-strip-row">
      <div className="week-controls">
        <button className="icon-btn" type="button" aria-label="前の週" onClick={() => onMoveWeek(-7)}>＜</button>
        <p className="week-range">
          <DateText text={formatFixedDate(weekStart)} />
          <span className="range-separator"> 〜 </span>
          <DateText text={formatFixedDate(end)} />
        </p>
        <button className="icon-btn" type="button" aria-label="次の週" onClick={() => onMoveWeek(7)}>＞</button>
      </div>
      <div className="week-strip">
        {Array.from({ length: 7 }, (_, index) => {
          const dateObj = addDays(weekStart, index);
          const iso = toISO(dateObj);
          const hasEvents = events.some((event) => event.date === iso);
          const hasTasks = tasks.some((task) => task.date === iso);
          return (
            <button
              className={`day-chip ${hasEvents ? 'has-event' : ''} ${hasTasks ? 'has-task' : ''} ${iso === activeIso ? 'active' : ''} ${iso === todayIso ? 'today' : ''}`}
              key={iso}
              type="button"
              onClick={() => onSelect(dateObj)}
            >
              <div className="dow">{weekdays[dateObj.getDay()]}</div>
              <div className="date">{dateObj.getDate()}</div>
              <span className="badge-dot" />
              <span className="badge-square" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventList({
  events,
  onDelete,
  onEdit
}: {
  events: CalendarEvent[];
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  if (!events.length) {
    return <ul className="item-list"><li className="muted">予定はありません</li></ul>;
  }
  return (
    <ul className="item-list">
      {events.map((event) => (
          <li
            className="item"
            key={event.id}
            onClick={() => onEdit(event.id)}
          >
            <div className="status">{event.time || '終日'}</div>
            <div>
              <p className="title">{event.title}</p>
              {event.memo && <p className="meta">{event.memo}</p>}
            </div>
            <button
              className="task-action-btn btn-task-delete"
              type="button"
              aria-label="削除"
              title="削除"
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                onDelete(event.id);
              }}
            >
              <TrashIcon />
            </button>
          </li>
      ))}
    </ul>
  );
}

function TaskList({
  onDelete,
  onDefer,
  onEdit,
  onReorder,
  onToggle,
  tasks
}: {
  onDelete: (id: string) => void;
  onDefer: (id: string) => void;
  onEdit: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onToggle: (id: string, done: boolean) => void;
  tasks: Task[];
}) {
  const activeTasks = tasks.filter((task) => !task.done);
  const doneTasks = tasks.filter((task) => task.done);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  if (!tasks.length) {
    return <ul className="item-list"><li className="muted">タスクはありません</li></ul>;
  }
  return (
    <ul
      className="item-list"
    >
      {activeTasks.map((task) => (
          <li
            className={`item task-item ${draggingId === task.id ? 'dragging' : ''}`}
            data-reorderable="true"
            draggable
            key={task.id}
            onDragStart={(event) => {
              setDraggingId(task.id);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', task.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = event.dataTransfer.getData('text/plain') || draggingId;
              if (!sourceId || sourceId === task.id) return;
              const ids = activeTasks.map((activeTask) => activeTask.id);
              const sourceIndex = ids.indexOf(sourceId);
              const targetIndex = ids.indexOf(task.id);
              if (sourceIndex < 0 || targetIndex < 0) return;
              const nextIds = [...ids];
              const [movedId] = nextIds.splice(sourceIndex, 1);
              nextIds.splice(targetIndex, 0, movedId);
              onReorder(nextIds);
            }}
            onDragEnd={() => setDraggingId(null)}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest('button, input, textarea, select, a')) return;
              onEdit(task.id);
            }}
          >
            <TaskRow task={task} onDelete={onDelete} onDefer={onDefer} onToggle={onToggle} />
          </li>
      ))}
      {doneTasks.map((task) => (
          <li
            className="item task-item done"
            key={task.id}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest('button, input, textarea, select, a')) return;
              onEdit(task.id);
            }}
          >
            <TaskRow task={task} onDelete={onDelete} onToggle={onToggle} />
          </li>
      ))}
    </ul>
  );
}

function TaskRow({
  onDelete,
  onDefer,
  onToggle,
  task
}: {
  onDelete: (id: string) => void;
  onDefer?: (id: string) => void;
  onToggle: (id: string, done: boolean) => void;
  task: Task;
}) {
  return (
    <>
      <input
        type="checkbox"
        checked={task.done}
        aria-label="complete task"
        onChange={(event) => onToggle(task.id, event.target.checked)}
        onClick={(event) => event.stopPropagation()}
      />
      <div>
        <p className="title">{task.title}</p>
        <p className="meta">{task.note || ''}</p>
      </div>
      {!task.done && onDefer && (
        <button
          className="task-action-btn btn-task-defer"
          type="button"
          aria-label="翌日に延期"
          title="翌日に延期"
          onClick={(event) => {
            event.stopPropagation();
            onDefer(task.id);
          }}
        >
          <DeferIcon />
        </button>
      )}
      <button
        className="task-action-btn btn-task-delete"
        type="button"
        aria-label="削除"
        title="削除"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(task.id);
        }}
      >
        <TrashIcon />
      </button>
    </>
  );
}

function CalendarPopover({
  activeIso,
  calendarMonth,
  events,
  isOpen,
  onMonthChange,
  onSelect,
  tasks
}: {
  activeIso: ISODate;
  calendarMonth: Date;
  events: CalendarEvent[];
  isOpen: boolean;
  onMonthChange: (date: Date) => void;
  onSelect: (date: Date) => void;
  tasks: Task[];
}) {
  const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const todayIso = toISO(today);
  return (
    <div className={`calendar-popover ${isOpen ? 'open' : ''}`} aria-hidden={isOpen ? 'false' : 'true'}>
      <div className="calendar-popover-head">
        <button className="icon-btn" type="button" aria-label="前の月" onClick={(event) => {
          event.stopPropagation();
          onMonthChange(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
        }}>←</button>
        <p className="week-range"><DateText text={formatMonth(calendarMonth)} /></p>
        <button className="icon-btn" type="button" aria-label="次の月" onClick={(event) => {
          event.stopPropagation();
          onMonthChange(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
        }}>→</button>
      </div>
      <div className="calendar">
        {weekdays.map((day) => <div className="weekday" key={day}>{day}</div>)}
        {Array.from({ length: firstDay.getDay() }, (_, index) => <div key={`empty-${index}`} />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const dateObj = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
          const iso = toISO(dateObj);
          const hasEvents = events.some((event) => event.date === iso);
          const hasTasks = tasks.some((task) => task.date === iso && !task.done);
          return (
            <button
              className={`calendar-cell ${iso === activeIso ? 'active' : ''} ${iso === todayIso ? 'today' : ''}`}
              key={iso}
              type="button"
              onClick={() => onSelect(dateObj)}
            >
              <div className="day-number">{day}</div>
              <div className="dots">
                {hasEvents && <span className="dot event" />}
                {hasTasks && <span className="dot task" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="modal-backdrop active"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal glass-card modal-enter">
        {children}
      </div>
    </div>
  );
}

function TaskModal({
  initialDate,
  onClose,
  onSave,
  task,
  title
}: {
  initialDate?: ISODate;
  onClose: () => void;
  onSave: (input: { id?: string; title: string; note: string; date: ISODate }) => void;
  task?: Task;
  title: string;
}) {
  const [taskTitle, setTaskTitle] = useState(task?.title ?? '');
  const [date, setDate] = useState(task?.date ?? initialDate ?? toISO(today));
  const [note, setNote] = useState(task?.note ?? '');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = taskTitle.trim();
    if (!trimmedTitle) return;
    onSave({ id: task?.id, title: trimmedTitle, note: note.trim(), date });
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="modal-head">
        <h3>{title}</h3>
        <button className="icon-btn" type="button" onClick={onClose}>✕</button>
      </div>
      <form onSubmit={submit}>
        <label>タイトル
          <input type="text" required placeholder="タイトルを入力" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
        </label>
        <label>日付
          <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>メモ（任意）
          <textarea placeholder="メモを入力" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="submit" className="primary-btn full">{task ? '更新' : '作成'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

function EventModal({
  event,
  initialDate,
  onClose,
  onSave,
  title
}: {
  event?: CalendarEvent;
  initialDate?: ISODate;
  onClose: () => void;
  onSave: (input: { id?: string; title: string; date: ISODate; time: string; memo: string }) => void;
  title: string;
}) {
  const [eventTitle, setEventTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.date ?? initialDate ?? toISO(today));
  const [time, setTime] = useState(event?.time ?? '');
  const [memo, setMemo] = useState(event?.memo ?? '');

  function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const trimmedTitle = eventTitle.trim();
    if (!trimmedTitle) return;
    onSave({ id: event?.id, title: trimmedTitle, date, time, memo: memo.trim() });
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="modal-head">
        <h3>{title}</h3>
        <button className="icon-btn" type="button" onClick={onClose}>✕</button>
      </div>
      <form onSubmit={submit} noValidate={Boolean(event)}>
        <label>タイトル
          <input type="text" required placeholder="タイトルを入力" value={eventTitle} onChange={(inputEvent) => setEventTitle(inputEvent.target.value)} />
        </label>
        <label>日付
          <input type="date" required value={date} onChange={(inputEvent) => setDate(inputEvent.target.value)} />
        </label>
        <label>時間（任意）
          <input type="time" value={time} onChange={(inputEvent) => setTime(inputEvent.target.value)} />
        </label>
        <label>メモ（任意）
          <textarea placeholder="メモを入力" value={memo} onChange={(inputEvent) => setMemo(inputEvent.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="submit" className="primary-btn full">{event ? '更新' : '保存'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

export default App;

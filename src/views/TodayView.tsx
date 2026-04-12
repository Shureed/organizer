import { useState } from 'react'
import { useAppStore } from '../store/appState'
import { useDataLoader } from '../hooks/useDataLoader'
import { useMutations } from '../hooks/useMutations'
import { TaskCard } from '../components/shared/TaskCard'
import { TaskDetailModal } from '../components/shared/TaskDetailModal'
import type { ActiveTask, ActiveProject, ActivityLogItem, ActionNode } from '../store/appState'

// Today's date string in local time (YYYY-MM-DD)
function getTodayStr(): string {
  const now = new Date()
  return now.toISOString().slice(0, 10)
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatCompletedTime(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
      className="rounded-xl p-3 flex flex-col gap-1.5"
    >
      <span style={{ color: 'var(--text)' }} className="text-2xl font-bold leading-none font-mono-data">
        {value}
      </span>
      <span style={{ color: 'var(--text-muted)' }} className="text-[11px] leading-snug">{label}</span>
    </div>
  )
}

// ── Collapsible Section ────────────────────────────────────────────────────────
function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  accentColor,
  children,
}: {
  title: string
  count: number
  defaultOpen?: boolean
  accentColor?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span
          style={{ color: accentColor ?? 'var(--text)' }}
          className="text-sm font-semibold"
        >
          {title}
        </span>
        <span
          style={{
            backgroundColor: accentColor ? `${accentColor}22` : 'var(--surface2)',
            color: accentColor ?? 'var(--text-muted)',
            border: `1px solid ${accentColor ? `${accentColor}44` : 'var(--border)'}`,
          }}
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
        >
          {count}
        </span>
        <span
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block', transition: 'transform 150ms' }}
          className="ml-auto text-xs"
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Add Task Dialog ────────────────────────────────────────────────────────────
interface AddTaskDialogProps {
  projects: ActiveProject[]
  onClose: () => void
}

function AddTaskDialog({ projects, onClose }: AddTaskDialogProps) {
  const { addTask } = useMutations()
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(getTodayStr())
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await addTask({
        name: name.trim(),
        parent_id: projectId || null,
        date: date || null,
        body: body.trim() || null,
        status: 'open',
        type: 'task',
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add task')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
        className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-4 mx-0 sm:mx-4"
      >
        <h2 style={{ color: 'var(--text)' }} className="text-base font-semibold">New Task</h2>

        {error && <p style={{ color: 'var(--red)' }} className="text-xs">{error}</p>}

        <div className="flex flex-col gap-1">
          <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
            Name *
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Task name"
            required
            style={{
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
            className="rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{
                backgroundColor: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
              className="rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="">— none —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id ?? ''}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                backgroundColor: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                colorScheme: 'dark',
              }}
              className="rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
            Notes
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Optional notes..."
            rows={3}
            style={{
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              resize: 'none',
            }}
            className="rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: 'var(--surface2)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            style={{
              backgroundColor: 'var(--accent)',
              color: '#0d1117',
            }}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add Task'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Activity Feed Item ─────────────────────────────────────────────────────────
function ActivityItem({ item }: { item: ActivityLogItem }) {
  const isClaude = item.actor === 'claude'
  return (
    <div className="flex items-start gap-2.5">
      <div
        style={{
          backgroundColor: isClaude ? 'rgba(88,166,255,0.15)' : 'var(--surface2)',
          color: isClaude ? '#58a6ff' : 'var(--text-muted)',
          border: '1px solid var(--border)',
          flexShrink: 0,
        }}
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
      >
        {isClaude ? '✦' : 'S'}
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <p style={{ color: 'var(--text)' }} className="text-sm leading-snug">{item.summary}</p>
        <p style={{ color: 'var(--text-muted)' }} className="text-[10px]">
          {item.timestamp ? timeAgo(item.timestamp) : ''}
        </p>
      </div>
    </div>
  )
}

// ── Completed Task Row ─────────────────────────────────────────────────────────
function CompletedTaskRow({ task }: { task: ActionNode }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        opacity: 0.5,
      }}
      className="rounded-xl p-3 flex items-center gap-2"
    >
      <span style={{ color: '#3fb950' }} className="text-xs">✓</span>
      <span style={{ color: 'var(--text)' }} className="text-sm flex-1 min-w-0 truncate">
        {task.name}
      </span>
      {task.completed_at && (
        <span style={{ color: 'var(--text-muted)' }} className="text-[10px] whitespace-nowrap">
          {formatCompletedTime(task.completed_at)}
        </span>
      )}
    </div>
  )
}

// ── Main View ──────────────────────────────────────────────────────────────────
export function TodayView() {
  const { data, ui, patchUI } = useAppStore()
  const { refreshTasks } = useDataLoader()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)

  const today = getTodayStr()

  // Derived data
  const openCount = data.tasks.filter(
    (t) => t.status === 'open' || t.status === 'in_progress'
  ).length

  const dueTodayCount = data.tasks.filter((t) => t.date === today).length

  const overdueItems = data.tasks.filter(
    (t) =>
      t.date != null &&
      t.date < today &&
      t.status !== 'done' &&
      t.status !== 'cancelled'
  )

  const completedTodayCount = data.completedToday.length

  // Pinned tasks (shown regardless of date)
  const pinnedTasks = data.tasks.filter((t: ActiveTask) => t.pinned)

  // Filtered today tasks (exclude pinned)
  const todayTasks = data.tasks.filter((t: ActiveTask) => {
    if (t.pinned) return false
    if (t.date !== today) return false
    if (ui.todayFilterType && t.type !== ui.todayFilterType) return false
    if (ui.todayFilterPriority && t.priority !== ui.todayFilterPriority) return false
    return true
  })

  const { toggleTaskPin } = useMutations()

  const handleTaskClick = (id: string | null) => {
    if (id) setSelectedTaskId(id)
  }

  const handleModalClose = () => {
    setSelectedTaskId(null)
    refreshTasks()
  }

  return (
    <div
      className="flex flex-col gap-5 px-4 pt-5"
      style={{ paddingBottom: '80px', minHeight: '100%' }}
    >
      {/* 1. Stats row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard value={openCount} label="Open tasks" />
        <StatCard value={dueTodayCount} label="Due today" />
        <StatCard value={overdueItems.length} label="Overdue" />
        <StatCard value={completedTodayCount} label="Done today" />
      </div>

      {/* 2. Filters */}
      <div className="flex gap-2">
        <select
          value={ui.todayFilterType}
          onChange={(e) => patchUI({ todayFilterType: e.target.value })}
          style={{
            backgroundColor: 'var(--surface)',
            color: ui.todayFilterType ? 'var(--text)' : 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}
          className="flex-1 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        >
          <option value="">All types</option>
          <option value="task">Task</option>
          <option value="bug">Bug</option>
          <option value="improvement">Improvement</option>
          <option value="feature">Feature</option>
          <option value="idea">Idea</option>
          <option value="thought">Thought</option>
          <option value="context_gathering">Context</option>
          <option value="plan">Plan</option>
        </select>

        <select
          value={ui.todayFilterPriority}
          onChange={(e) => patchUI({ todayFilterPriority: e.target.value })}
          style={{
            backgroundColor: 'var(--surface)',
            color: ui.todayFilterPriority ? 'var(--text)' : 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}
          className="flex-1 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* 3. Pinned tasks */}
      {pinnedTasks.length > 0 && (
        <CollapsibleSection
          title="Pinned"
          count={pinnedTasks.length}
          defaultOpen={true}
          accentColor="var(--accent)"
        >
          {pinnedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              showProject={true}
              onClick={() => handleTaskClick(task.id)}
              onPin={(pinned) => task.id && toggleTaskPin(task.id, pinned)}
            />
          ))}
        </CollapsibleSection>
      )}

      {/* 4. Overdue section */}
      {overdueItems.length > 0 && (
        <CollapsibleSection
          title="Overdue"
          count={overdueItems.length}
          defaultOpen={true}
          accentColor="#f85149"
        >
          {overdueItems.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              showDate={true}
              showProject={true}
              onClick={() => handleTaskClick(task.id)}
              onPin={(pinned) => task.id && toggleTaskPin(task.id, pinned)}
            />
          ))}
        </CollapsibleSection>
      )}

      {/* 4. Today's tasks */}
      <CollapsibleSection
        title="Today"
        count={todayTasks.length}
        defaultOpen={true}
      >
        {todayTasks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }} className="text-sm py-2">
            No tasks scheduled for today.
          </p>
        ) : (
          todayTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              showProject={true}
              onClick={() => handleTaskClick(task.id)}
              onPin={(pinned) => task.id && toggleTaskPin(task.id, pinned)}
            />
          ))
        )}
      </CollapsibleSection>

      {/* 5. Completed today */}
      {data.completedToday.length > 0 && (
        <CollapsibleSection
          title="Completed"
          count={data.completedToday.length}
          defaultOpen={false}
        >
          {data.completedToday.map((task) => (
            <CompletedTaskRow key={task.id} task={task} />
          ))}
        </CollapsibleSection>
      )}

      {/* 6. Activity feed */}
      {data.activityLog.length > 0 && (
        <div className="flex flex-col gap-3">
          <p style={{ color: 'var(--text)' }} className="text-sm font-semibold">Activity</p>
          <div className="flex flex-col gap-3">
            {data.activityLog.map((item) => (
              <ActivityItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowAddTask(true)}
        style={{
          backgroundColor: 'var(--accent)',
          color: '#0d1117',
          boxShadow: '0 4px 16px rgba(88,166,255,0.35), 0 0 0 1px rgba(88,166,255,0.2)',
        }}
        className="fixed bottom-20 right-4 w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold z-40 transition-all active:scale-95 hover:brightness-110"
        aria-label="Add task"
      >
        +
      </button>

      {/* Task detail modal */}
      <TaskDetailModal
        taskId={selectedTaskId}
        onClose={handleModalClose}
      />

      {/* Add task dialog */}
      {showAddTask && (
        <AddTaskDialog
          projects={data.projects}
          onClose={() => setShowAddTask(false)}
        />
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appState'
import { useDataLoader } from '../hooks/useDataLoader'
import { useMutations } from '../hooks/useMutations'
import { TaskCard } from '../components/shared/TaskCard'
import { TaskDetailModal } from '../components/shared/TaskDetailModal'
import { TypeBadge } from '../components/shared/TypeBadge'
import { StatusChip } from '../components/shared/StatusChip'
import { supabase } from '../lib/supabase'
import type { ActiveTask, ActiveProject, ChainStatusItem, ActionNode } from '../store/appState'

// Today's date string in local time (YYYY-MM-DD)
function getTodayStr(): string {
  return new Date().toLocaleDateString('en-CA')
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

// ── Chain Status Card ──────────────────────────────────────────────────────────
interface ChainNode {
  id: string
  name: string
  type: string
  status: string
}

function ChainStatusCard({ item, onOpenTask }: { item: ChainStatusItem; onOpenTask: (id: string) => void }) {
  const [chainNodes, setChainNodes] = useState<ChainNode[]>([])

  useEffect(() => {
    if (!item.origin_id) return
    supabase
      .from('action_node')
      .select('id, name, type, status')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('chain_origin_id' as any, item.origin_id)
      .eq('archived', false)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setChainNodes(data as ChainNode[])
      })
  }, [item.origin_id])

  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
      className="rounded-xl overflow-hidden flex flex-col"
    >
      <button
        onClick={() => item.origin_id && onOpenTask(item.origin_id)}
        className="flex items-center gap-2 px-3 py-2.5 text-left w-full"
        style={{ backgroundColor: 'transparent' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface2)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
      >
        <TypeBadge type={item.origin_type} />
        <span style={{ color: 'var(--text)' }} className="flex-1 text-sm font-medium truncate">
          {item.origin_name}
        </span>
        <StatusChip status={item.origin_status} />
      </button>
      {chainNodes.map((node) => (
        <div key={node.id}>
          <div style={{ height: '1px', backgroundColor: 'var(--border)' }} className="mx-3" />
          <button
            onClick={() => onOpenTask(node.id)}
            className="flex items-center gap-2 px-3 py-2 text-left w-full"
            style={{ backgroundColor: 'transparent' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface2)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
          >
            <TypeBadge type={node.type} />
            <span style={{ color: 'var(--text-muted)' }} className="flex-1 text-sm truncate">
              {node.name}
            </span>
            <StatusChip status={node.status} />
          </button>
        </div>
      ))}
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
  const { data } = useAppStore()
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

  // Pinned tasks (shown regardless of date) — includes done pinned tasks that linger until unpinned
  const pinnedTasks: ActiveTask[] = [
    ...data.tasks.filter((t: ActiveTask) => t.pinned),
    ...(data.pinnedDoneTasks as unknown as ActiveTask[]),
  ]

  // Filtered today tasks (exclude pinned)
  const todayTasks = data.tasks.filter((t: ActiveTask) => {
    if (t.pinned) return false
    if (t.date !== today) return false
    return true
  })

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
              dimmed={task.status === 'done'}
              onClick={() => handleTaskClick(task.id ?? null)}
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

      {/* 6. Active Chains */}
      {data.chainStatus.length > 0 && (
        <div className="flex flex-col gap-3">
          <p style={{ color: 'var(--text)' }} className="text-sm font-semibold">Active Chains</p>
          <div className="flex flex-col gap-2">
            {data.chainStatus.map((item) => (
              <ChainStatusCard key={item.origin_id} item={item} onOpenTask={setSelectedTaskId} />
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

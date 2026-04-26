import { useState, useEffect, lazy, Suspense } from 'react'
import { useDataStore, useUIStore } from '../store/appState'
import { loadTodayView } from '../hooks/useDataLoader'
import { TaskCard } from '../components/shared/TaskCard'
import { TypeBadge } from '../components/shared/TypeBadge'
import { PhaseBadge } from '../components/shared/PhaseBadge'
import type { NodePhase } from '../components/shared/PhaseBadge'
import type { ActionNode, ActiveTask } from '../store/appState'

const AddTaskDialog = lazy(() => import('../components/today/AddTaskDialog'))

// Today's date string in local time (YYYY-MM-DD)
function getTodayStr(): string {
  return new Date().toLocaleDateString('en-CA')
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

// ── Phase Progression Pips ─────────────────────────────────────────────────────
const PHASE_ORDER: NodePhase[] = ['discovery', 'plan', 'executing', 'retro']

function PhasePips({ phase }: { phase: NodePhase | null | undefined }) {
  const currentIndex = phase ? PHASE_ORDER.indexOf(phase) : -1

  return (
    <div className="flex items-center gap-0.5">
      {PHASE_ORDER.map((p, i) => {
        const isPast = i < currentIndex
        const isCurrent = i === currentIndex
        const isFuture = i > currentIndex

        let bg: string
        let border: string
        if (isCurrent) {
          bg = 'var(--accent)'
          border = 'var(--accent)'
        } else if (isPast) {
          bg = 'var(--text-muted)'
          border = 'var(--text-muted)'
        } else {
          bg = 'transparent'
          border = 'var(--border)'
        }

        return (
          <div key={p} className="flex items-center gap-0.5">
            <div
              title={p}
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: bg,
                border: `1.5px solid ${border}`,
                flexShrink: 0,
                opacity: isFuture ? 0.4 : 1,
              }}
            />
            {i < PHASE_ORDER.length - 1 && (
              <div
                style={{
                  width: '8px',
                  height: '1px',
                  backgroundColor: isPast || isCurrent ? 'var(--text-muted)' : 'var(--border)',
                  opacity: isFuture && i >= currentIndex ? 0.4 : 1,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Active Container Row ───────────────────────────────────────────────────────
function ContainerRow({
  node,
  onClick,
}: {
  node: ActionNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left"
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
        className="rounded-xl px-3 py-2.5 flex items-center gap-2 hover:brightness-110 transition-all active:scale-[0.99]"
      >
        <TypeBadge type={node.type} />
        <span
          style={{ color: 'var(--text)' }}
          className="flex-1 text-sm truncate min-w-0"
        >
          {node.name}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <PhaseBadge phase={node.phase as NodePhase | null} />
          <PhasePips phase={node.phase as NodePhase | null} />
        </div>
      </div>
    </button>
  )
}

// ── Main View ──────────────────────────────────────────────────────────────────
export function TodayView() {
  const data = useDataStore((s) => s.data)
  const activeContainers = useDataStore((s) => s.data.activeContainers)
  const patchUI = useUIStore((s) => s.patchUI)
  const [showAddTask, setShowAddTask] = useState(false)

  useEffect(() => { loadTodayView() }, [])
  const today = getTodayStr()

  // Derived data
  const overdueItems = data.tasks.filter(
    (t) =>
      t.date != null &&
      t.date < today &&
      t.status !== 'done' &&
      t.status !== 'cancelled'
  )

  // Pinned tasks (shown regardless of date) — includes non-task pinned nodes and done pinned tasks.
  // Dedupe by id: tasks.filter(pinned) → pinnedAll (catches non-task types) → pinnedDoneTasks.
  // First-occurrence wins so active tasks take precedence over duplicates from broader queries.
  const pinnedTasks: ActiveTask[] = (() => {
    const seen = new Set<string>()
    const merged: ActiveTask[] = []
    for (const item of [
      ...data.tasks.filter((t: ActiveTask) => t.pinned),
      ...(data.pinnedAll as unknown as ActiveTask[]),
      ...(data.pinnedDoneTasks as unknown as ActiveTask[]),
    ]) {
      if (item.id && !seen.has(item.id)) {
        seen.add(item.id)
        merged.push(item)
      }
    }
    return merged
  })()

  // Filtered today tasks (exclude pinned)
  const todayTasks = data.tasks.filter((t: ActiveTask) => {
    if (t.pinned) return false
    if (t.date !== today) return false
    return true
  })

  return (
    <div
      className="flex flex-col gap-5 px-4 pt-5"
      style={{ paddingBottom: '80px', minHeight: '100%' }}
    >
      {/* Active Containers */}
      <CollapsibleSection
        title="Active Containers"
        count={activeContainers.length}
        defaultOpen={true}
      >
        {activeContainers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }} className="text-sm py-2">
            No containers in progress.
          </p>
        ) : (
          activeContainers.map((node) => (
            <ContainerRow
              key={node.id}
              node={node}
              onClick={() => patchUI({ openTaskId: node.id })}
            />
          ))
        )}
      </CollapsibleSection>

      {/* Pinned tasks */}
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
              onClick={() => task.id && patchUI({ openTaskId: task.id })}
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
              onClick={() => task.id && patchUI({ openTaskId: task.id })}
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
              onClick={() => task.id && patchUI({ openTaskId: task.id })}
            />
          ))
        )}
      </CollapsibleSection>

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

      {/* Add task dialog */}
      {showAddTask && (
        <Suspense fallback={null}>
          <AddTaskDialog
            projects={data.projects}
            onClose={() => setShowAddTask(false)}
          />
        </Suspense>
      )}
    </div>
  )
}

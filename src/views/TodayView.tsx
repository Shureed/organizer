import { useState, useEffect, lazy, Suspense } from 'react'
import { useAppStore } from '../store/appState'
import { loadTodayView, useAutoRefresh } from '../hooks/useDataLoader'
import { TaskCard } from '../components/shared/TaskCard'
import { TypeBadge } from '../components/shared/TypeBadge'
import { StatusChip } from '../components/shared/StatusChip'
import { supabase } from '../lib/supabase'
import type { ActiveTask, ChainStatusItem } from '../store/appState'

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

// ── Main View ──────────────────────────────────────────────────────────────────
export function TodayView() {
  const { data, patchUI } = useAppStore()
  const [showAddTask, setShowAddTask] = useState(false)

  useEffect(() => { loadTodayView() }, [])
  useAutoRefresh(loadTodayView, 30000)

  const today = getTodayStr()

  // Derived data
  const overdueItems = data.tasks.filter(
    (t) =>
      t.date != null &&
      t.date < today &&
      t.status !== 'done' &&
      t.status !== 'cancelled'
  )

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

  return (
    <div
      className="flex flex-col gap-5 px-4 pt-5"
      style={{ paddingBottom: '80px', minHeight: '100%' }}
    >
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

      {/* Active Chains */}
      {data.chainStatus.length > 0 && (
        <div className="flex flex-col gap-3">
          <p style={{ color: 'var(--text)' }} className="text-sm font-semibold">Active Chains</p>
          <div className="flex flex-col gap-2">
            {data.chainStatus.map((item) => (
              <ChainStatusCard key={item.origin_id} item={item} onOpenTask={(id) => patchUI({ openTaskId: id })} />
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

import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Home,
  CalendarDays,
  Clock,
  AlertCircle,
  Inbox,
  Search,
  X,
} from 'lucide-react'
import { useAuth } from './hooks/useAuth'
import { useDataLoader, loadShellSeed } from './hooks/useDataLoader'
import { useRealtime } from './hooks/useRealtime'
import { useUIStore, useDataStore } from './store/appState'
import { scheduleSearchRebuild, useSearch } from './hooks/useSearch'
import { LoadingSpinner } from './components/LoadingSpinner'
import { OfflineIndicator } from './components/OfflineIndicator'
import { UpdatePrompt } from './components/UpdatePrompt'
import './App.css'

const LoginPage = lazy(() => import('./components/LoginPage').then(m => ({ default: m.LoginPage })))
const TodayView = lazy(() => import('./views/TodayView').then(m => ({ default: m.TodayView })))
const CalendarView = lazy(() => import('./views/CalendarView').then(m => ({ default: m.CalendarView })))
const RecentsView = lazy(() => import('./views/RecentsView').then(m => ({ default: m.RecentsView })))
const IssuesView = lazy(() => import('./views/IssuesView').then(m => ({ default: m.IssuesView })))
const InboxView = lazy(() => import('./views/InboxView').then(m => ({ default: m.InboxView })))
const TaskDetailModal = lazy(() => import('./components/shared/TaskDetailModal').then(m => ({ default: m.TaskDetailModal })))
const InboxDetailModal = lazy(() => import('./components/inbox/InboxDetailModal').then(m => ({ default: m.InboxDetailModal })))

type View = 'today' | 'calendar' | 'recents' | 'issues' | 'inbox'

// ── Prefetch helpers ────────────────────────────────────────────────────────────
// Called fire-and-forget on mouseenter / focus / touchstart over nav buttons.
// Each import() path must mirror the React.lazy() paths above so Vite serves
// the same chunk (deduped by the module registry).
function dataSaverEnabled(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as unknown as { connection?: { saveData?: boolean } }).connection
      ?.saveData === true
  )
}

export const prefetchToday = (): void => {
  if (dataSaverEnabled()) return
  import('./views/TodayView').catch(() => {/* swallow */})
}
export const prefetchCalendar = (): void => {
  if (dataSaverEnabled()) return
  import('./views/CalendarView').catch(() => {/* swallow */})
}
export const prefetchRecents = (): void => {
  if (dataSaverEnabled()) return
  import('./views/RecentsView').catch(() => {/* swallow */})
}
export const prefetchIssues = (): void => {
  if (dataSaverEnabled()) return
  import('./views/IssuesView').catch(() => {/* swallow */})
}
export const prefetchInbox = (): void => {
  if (dataSaverEnabled()) return
  import('./views/InboxView').catch(() => {/* swallow */})
}

type PrefetchFn = () => void

const VIEW_PREFETCH: Record<View, PrefetchFn> = {
  today: prefetchToday,
  calendar: prefetchCalendar,
  recents: prefetchRecents,
  issues: prefetchIssues,
  inbox: prefetchInbox,
}

const TABS: { id: View; label: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'today', label: 'Today', Icon: Home },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'recents', label: 'Recents', Icon: Clock },
  { id: 'issues', label: 'Issues', Icon: AlertCircle },
  { id: 'inbox', label: 'Inbox', Icon: Inbox },
]

// ── Search Bar ─────────────────────────────────────────────────────────────────
interface SearchBarProps {
  onSelect: (id: string, type: string) => void
}

function SearchBar({ onSelect }: SearchBarProps) {
  const { search } = useSearch()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const results = query.trim().length >= 2 ? search(query) : []

  useEffect(() => {
    if (results.length > 0) setOpen(true)
    else setOpen(false)
  }, [results.length])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (id: string, type: string) => {
    onSelect(id, type)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
        className="flex items-center gap-2 rounded-xl px-3 py-2"
      >
        <Search size={14} style={{ color: 'var(--text-muted)' }} strokeWidth={2} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks, projects, inbox…"
          style={{ color: 'var(--text)', background: 'transparent', outline: 'none', flex: 1 }}
          className="text-base placeholder:text-[var(--text-muted)] min-w-0"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }}>
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
          className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50 max-h-72 overflow-y-auto"
        >
          {results.slice(0, 12).map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => handleSelect(r.id, r.type)}
              className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-[var(--surface2)] transition-colors"
            >
              <span
                style={{
                  backgroundColor: 'var(--surface2)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
                className="text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide shrink-0 mt-0.5"
              >
                {r.type}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span style={{ color: 'var(--text)' }} className="text-sm leading-snug truncate">
                  {r.name}
                </span>
                {r.meta && (
                  <span style={{ color: 'var(--text-muted)' }} className="text-[11px] truncate">
                    {r.meta}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────────
interface MainAppProps {
  session: Session
}

function MainApp({ session }: MainAppProps) {
  const currentView = useUIStore((s) => s.ui.currentView)
  const openTaskId = useUIStore((s) => s.ui.openTaskId)
  const openInboxId = useUIStore((s) => s.ui.openInboxId)
  const patchUI = useUIStore((s) => s.patchUI)
  const data = useDataStore((s) => s.data)
  const { refreshTasks } = useDataLoader()

  // Mount realtime subscriptions for this authenticated session
  useRealtime(session)

  // Preserve refreshTasks-on-close behaviour (was Today-only; now applies to all views)
  const prevOpenTaskIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevOpenTaskIdRef.current && !openTaskId) {
      refreshTasks()
    }
    prevOpenTaskIdRef.current = openTaskId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTaskId])

  // Shell seed: kick off tasks load before any view mounts
  useEffect(() => {
    loadShellSeed()
  }, [])

  // Build search index per slice (idle-coalesced)
  useEffect(() => { scheduleSearchRebuild('tasks', data) }, [data.tasks])
  useEffect(() => { scheduleSearchRebuild('projects', data) }, [data.projects])
  useEffect(() => { scheduleSearchRebuild('closedTasks', data) }, [data.closedTasks])
  useEffect(() => { scheduleSearchRebuild('closedProjects', data) }, [data.closedProjects])
  useEffect(() => { scheduleSearchRebuild('inbox', data) }, [data.inbox])

  const handleSearchSelect = (id: string, type: string) => {
    if (type === 'inbox') {
      patchUI({ openInboxId: id })
    } else {
      patchUI({ openTaskId: id })
    }
  }

  return (
    <div
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
      className="min-h-screen flex flex-col"
    >
      <OfflineIndicator />
      <UpdatePrompt />
      {/* Top search bar */}
      <div
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}
        className="px-3 py-2 flex items-center gap-2 sticky top-0 z-30"
      >
        <SearchBar onSelect={handleSearchSelect} />
      </div>

      {/* View content */}
      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: '64px' }}>
        <Suspense fallback={<LoadingSpinner />}>
          {currentView === 'today' && <TodayView />}
          {currentView === 'calendar' && <CalendarView />}
          {currentView === 'recents' && <RecentsView />}
          {currentView === 'issues' && <IssuesView />}
          {currentView === 'inbox' && <InboxView />}
        </Suspense>
      </main>

      {/* Bottom tab bar */}
      <nav
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
        className="fixed bottom-0 left-0 right-0 flex items-center z-40"
      >
        {TABS.map((tab) => {
          const active = currentView === tab.id
          const prefetch = VIEW_PREFETCH[tab.id]
          return (
            <button
              key={tab.id}
              onClick={() => patchUI({ currentView: tab.id })}
              onMouseEnter={prefetch}
              onFocus={prefetch}
              onTouchStart={prefetch}
              style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors ${active ? 'tab-active-line' : ''}`}
            >
              <tab.Icon size={18} strokeWidth={active ? 2.5 : 1.75} />
              <span className={active ? 'font-semibold' : ''}>{tab.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Single top-level modals driven by store state */}
      {openTaskId && (
        <Suspense fallback={null}>
          <TaskDetailModal taskId={openTaskId} onClose={() => patchUI({ openTaskId: null })} />
        </Suspense>
      )}
      {openInboxId && (
        <Suspense fallback={null}>
          <InboxDetailModal itemId={openInboxId} onClose={() => patchUI({ openInboxId: null })} />
        </Suspense>
      )}
    </div>
  )
}

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return <LoadingSpinner />
  if (!session) return (
    <Suspense fallback={<LoadingSpinner />}>
      <LoginPage />
    </Suspense>
  )
  return <MainApp session={session} />
}

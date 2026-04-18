import { useEffect, useState, useRef } from 'react'
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
import { useAutoRefresh, useDataLoader } from './hooks/useDataLoader'
import { useAppStore } from './store/appState'
import { buildSearchIndex, useSearch } from './hooks/useSearch'
import { LoginPage } from './components/LoginPage'
import { LoadingSpinner } from './components/LoadingSpinner'
import { TodayView } from './views/TodayView'
import { CalendarView } from './views/CalendarView'
import { RecentsView } from './views/RecentsView'
import { IssuesView } from './views/IssuesView'
import { InboxView } from './views/InboxView'
import { TaskDetailModal } from './components/shared/TaskDetailModal'
import { InboxDetailModal } from './components/inbox/InboxDetailModal'
import './App.css'

type View = 'today' | 'calendar' | 'recents' | 'issues' | 'inbox'

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
function MainApp() {
  const currentView = useAppStore((s) => s.ui.currentView)
  const openInboxId = useAppStore((s) => s.ui.openInboxId)
  const patchUI = useAppStore((s) => s.patchUI)
  const data = useAppStore((s) => s.data)
  const { loadAll } = useDataLoader()
  useAutoRefresh(30000)

  const [searchSelectedId, setSearchSelectedId] = useState<string | null>(null)
  const [searchSelectedType, setSearchSelectedType] = useState<string | null>(null)

  // Initial load
  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build search index once data is loaded
  useEffect(() => {
    if (data.tasks.length > 0) {
      buildSearchIndex(data)
    }
  }, [data])

  const handleSearchSelect = (id: string, type: string) => {
    if (type === 'inbox') {
      patchUI({ openInboxId: id })
    } else {
      setSearchSelectedId(id)
      setSearchSelectedType(type)
    }
  }

  const handleSearchModalClose = () => {
    setSearchSelectedId(null)
    setSearchSelectedType(null)
  }

  return (
    <div
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
      className="min-h-screen flex flex-col"
    >
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
        {currentView === 'today' && <TodayView />}
        {currentView === 'calendar' && <CalendarView />}
        {currentView === 'recents' && <RecentsView />}
        {currentView === 'issues' && <IssuesView />}
        {currentView === 'inbox' && <InboxView />}
      </main>

      {/* Bottom tab bar */}
      <nav
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
        className="fixed bottom-0 left-0 right-0 flex items-center z-40"
      >
        {TABS.map((tab) => {
          const active = currentView === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => patchUI({ currentView: tab.id })}
              style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors ${active ? 'tab-active-line' : ''}`}
            >
              <tab.Icon size={18} strokeWidth={active ? 2.5 : 1.75} />
              <span className={active ? 'font-semibold' : ''}>{tab.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Search result modals — rendered at top level, no tab switch */}
      {searchSelectedType === 'task' && (
        <TaskDetailModal taskId={searchSelectedId} onClose={handleSearchModalClose} />
      )}

      {/* Top-level inbox detail modal */}
      <InboxDetailModal itemId={openInboxId} onClose={() => patchUI({ openInboxId: null })} />
    </div>
  )
}

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return <LoadingSpinner />
  if (!session) return <LoginPage />
  return <MainApp />
}

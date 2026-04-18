import { useEffect } from 'react'
import { useAppStore } from '../store/appState'
import { IssueCard } from '../components/issues/IssueCard'
import { ScrollArea } from '../components/ui/scroll-area'
import { loadIssuesView, useAutoRefresh } from '../hooks/useDataLoader'

const ISSUE_TYPES = ['bug', 'improvement', 'feature', 'idea', 'thought', 'context_gathering', 'plan'] as const
const TASK_TYPES_EXCLUDED = new Set(['task', 'project'])

const PRIORITY_RANK: Record<string, number> = {
  high: 1,
  medium: 2,
  low: 3,
}

export function IssuesView() {
  const { data, ui, patchUI } = useAppStore()

  useEffect(() => { loadIssuesView() }, [])
  useAutoRefresh(loadIssuesView, 30000)

  // Filter to issue types only
  const issues = data.tasks.filter((t) => t.type && !TASK_TYPES_EXCLUDED.has(t.type))

  // Apply type filter
  const typeFiltered = ui.issuesFilterType
    ? issues.filter((t) => t.type === ui.issuesFilterType)
    : issues

  // Apply priority filter
  const filtered = ui.issuesFilterPriority
    ? typeFiltered.filter((t) => t.priority === ui.issuesFilterPriority)
    : typeFiltered

  // Sort: priority asc (high first, nulls last), then created_at asc
  const sorted = [...filtered].sort((a, b) => {
    const pa = a.priority ? (PRIORITY_RANK[a.priority] ?? 4) : 4
    const pb = b.priority ? (PRIORITY_RANK[b.priority] ?? 4) : 4
    if (pa !== pb) return pa - pb
    const ca = a.created_at ?? ''
    const cb = b.created_at ?? ''
    return ca < cb ? -1 : ca > cb ? 1 : 0
  })

  return (
    <div
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
      className="flex flex-col min-h-0 h-full pb-20"
    >
      {/* Header */}
      <div
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
        className="flex-shrink-0 px-4 pt-safe-top pt-4 pb-3 space-y-3"
      >
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
            Issues
          </h1>
          <span
            style={{ color: 'var(--text-muted)' }}
            className="text-sm"
          >
            {sorted.length}
          </span>
        </div>

        {/* Filter bar */}
        <div className="flex gap-2">
          <select
            value={ui.issuesFilterType}
            onChange={(e) => patchUI({ issuesFilterType: e.target.value })}
            style={{
              background: 'var(--surface2)',
              color: ui.issuesFilterType ? 'var(--text)' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none"
          >
            <option value="">All Types</option>
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'context_gathering' ? 'context' : t}
              </option>
            ))}
          </select>

          <select
            value={ui.issuesFilterPriority}
            onChange={(e) => patchUI({ issuesFilterPriority: e.target.value })}
            style={{
              background: 'var(--surface2)',
              color: ui.issuesFilterPriority ? 'var(--text)' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none"
          >
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 py-3 space-y-2">
          {sorted.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p style={{ color: 'var(--text-muted)' }} className="text-sm">
                No issues matching filters
              </p>
            </div>
          ) : (
            sorted.map((task) => (
              <IssueCard
                key={task.id}
                task={task}
                onClick={() => task.id && patchUI({ openTaskId: task.id })}
              />
            ))
          )}
        </div>
      </ScrollArea>

    </div>
  )
}

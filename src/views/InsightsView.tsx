import { useAppStore } from '../store/appState'
import { InsightCard } from '../components/insights/InsightCard'

export function InsightsView() {
  const insights = useAppStore((s) => s.data.insights)

  // Filter expired, sort by priority asc then generated_at desc
  const visibleInsights = insights
    .filter((i) => !i.expires_at || new Date(i.expires_at) > new Date())
    .sort((a, b) => {
      const pa = Number(a.priority) || 99
      const pb = Number(b.priority) || 99
      if (pa !== pb) return pa - pb
      const ta = a.generated_at ? new Date(a.generated_at).getTime() : 0
      const tb = b.generated_at ? new Date(b.generated_at).getTime() : 0
      return tb - ta
    })

  return (
    <div
      className="flex flex-col min-h-full pb-20"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      {/* Header */}
      <div
        className="px-4 pt-5 pb-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h1
          style={{ color: 'var(--text)' }}
          className="text-base font-semibold"
        >
          Insights
        </h1>
        {visibleInsights.length > 0 && (
          <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-0.5">
            {visibleInsights.length} active
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4">
        {visibleInsights.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p
              style={{ color: 'var(--text-muted)' }}
              className="text-sm text-center"
            >
              No insights yet — insights are generated periodically.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

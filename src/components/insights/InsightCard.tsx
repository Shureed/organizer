import type { Insight } from '../../store/appState'

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

interface InsightCardProps {
  insight: Insight
}

export function InsightCard({ insight }: InsightCardProps) {
  const isPriority1 = String(insight.priority) === '1'

  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: isPriority1
          ? '1px solid rgba(88,166,255,0.35)'
          : '1px solid var(--border)',
        boxShadow: isPriority1 ? '0 0 0 1px rgba(88,166,255,0.08), 0 2px 8px rgba(88,166,255,0.06)' : undefined,
      }}
      className="rounded-xl p-4 flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p
          style={{ color: 'var(--text)' }}
          className="font-semibold text-sm leading-snug flex-1"
        >
          {insight.title}
        </p>
        {insight.entity_type && (
          <span
            style={{
              color: 'var(--purple)',
              backgroundColor: 'rgba(188,140,255,0.1)',
              border: '1px solid rgba(188,140,255,0.2)',
            }}
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap shrink-0"
          >
            {insight.entity_type}
          </span>
        )}
      </div>

      {insight.body && (
        <p
          style={{ color: 'var(--text-muted)' }}
          className="text-xs leading-relaxed whitespace-pre-wrap"
        >
          {insight.body}
        </p>
      )}

      {insight.generated_at && (
        <p
          style={{ color: 'var(--text-muted)' }}
          className="text-[10px] mt-1"
        >
          {timeAgo(insight.generated_at)}
        </p>
      )}
    </div>
  )
}

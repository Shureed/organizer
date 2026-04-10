type InboxSource = 'chat' | 'voice' | 'text' | 'email' | 'shortcut'

interface SourceBadgeProps {
  source: InboxSource | null | undefined
}

const SOURCE_LABELS: Record<InboxSource, string> = {
  chat: 'chat',
  voice: 'voice',
  text: 'text',
  email: 'email',
  shortcut: 'shortcut',
}

export function SourceBadge({ source }: SourceBadgeProps) {
  if (!source) return null
  const label = SOURCE_LABELS[source] ?? source

  return (
    <span
      style={{
        backgroundColor: 'var(--surface2)',
        color: 'var(--text-muted)',
        border: '1px solid var(--border)',
      }}
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap"
    >
      {label}
    </span>
  )
}

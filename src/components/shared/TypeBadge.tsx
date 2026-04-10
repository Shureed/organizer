interface TypeBadgeProps {
  type: string | null | undefined
}

const TYPE_LABELS: Record<string, string> = {
  task: 'task',
  project: 'project',
  bug: 'bug',
  improvement: 'improvement',
  feature: 'feature',
  idea: 'idea',
  thought: 'thought',
  context_gathering: 'context',
  plan: 'plan',
}

export function TypeBadge({ type }: TypeBadgeProps) {
  if (!type) return null
  const label = TYPE_LABELS[type]
  if (!label) return null

  return (
    <span
      style={{
        backgroundColor: 'var(--surface2)',
        color: 'var(--text-muted)',
      }}
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap"
    >
      {label}
    </span>
  )
}

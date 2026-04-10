interface PriorityDotProps {
  priority: string | null | undefined
}

const PRIORITY_COLORS: Record<string, string> = {
  high: '#f85149',
  medium: '#d29922',
  low: '#3fb950',
}

export function PriorityDot({ priority }: PriorityDotProps) {
  if (!priority) return null
  const color = PRIORITY_COLORS[priority]
  if (!color) return null

  return (
    <span
      style={{ backgroundColor: color }}
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      title={priority}
    />
  )
}

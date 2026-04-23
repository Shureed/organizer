import type { Database } from '../../types/database.types'

export type NodePhase = Database['public']['Enums']['node_phase']

interface PhaseBadgeProps {
  phase: NodePhase | null | undefined
}

const PHASE_STYLES: Record<NodePhase, { bg: string; color: string }> = {
  discovery: { bg: '#1e40af22', color: '#60a5fa' },
  plan:      { bg: '#6d28d922', color: '#a78bfa' },
  executing: { bg: '#92400e22', color: '#fb923c' },
  retro:     { bg: '#14532d22', color: '#4ade80' },
}

export function PhaseBadge({ phase }: PhaseBadgeProps) {
  if (!phase) return null
  const styles = PHASE_STYLES[phase]
  if (!styles) return null

  return (
    <span
      style={{
        backgroundColor: styles.bg,
        color: styles.color,
        border: `1px solid ${styles.color}44`,
      }}
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap"
    >
      {phase}
    </span>
  )
}

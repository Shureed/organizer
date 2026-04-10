interface StatusChipProps {
  status: string | null | undefined
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#58a6ff', bg: 'rgba(88,166,255,0.12)' },
  in_progress: { label: 'In Progress', color: '#d29922', bg: 'rgba(210,153,34,0.12)' },
  waiting: { label: 'Waiting', color: '#db6d28', bg: 'rgba(219,109,40,0.12)' },
  done: { label: 'Done', color: '#3fb950', bg: 'rgba(63,185,80,0.12)' },
  cancelled: { label: 'Cancelled', color: '#f85149', bg: 'rgba(248,81,73,0.12)' },
}

export function StatusChip({ status }: StatusChipProps) {
  if (!status) return null
  const config = STATUS_CONFIG[status]
  if (!config) return null

  return (
    <span
      style={{
        color: config.color,
        backgroundColor: config.bg,
        border: `1px solid ${config.color}33`,
      }}
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap"
    >
      {config.label}
    </span>
  )
}

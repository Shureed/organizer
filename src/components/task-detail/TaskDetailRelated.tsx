interface RelatedItem {
  link_id: string
  entity_type: string
  entity_id: string
  direction: string
  name: string
  display_type: string
}

interface TaskDetailRelatedProps {
  related: RelatedItem[]
  isOpen: boolean
  onToggleOpen: (updater: boolean | ((prev: boolean) => boolean)) => void
  onSelectItem: (id: string) => void
}

export function TaskDetailRelated({
  related,
  isOpen,
  onToggleOpen,
  onSelectItem,
}: TaskDetailRelatedProps) {
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => onToggleOpen(o => !o)}
        className="flex items-center justify-between w-full text-left"
      >
        <span style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
          Related Items
        </span>
        <span className="flex items-center gap-1.5">
          {related.length > 0 && (
            <span
              style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              className="text-[10px] rounded-full px-1.5 py-0.5 font-mono"
            >
              {related.length}
            </span>
          )}
          <span style={{ color: 'var(--text-muted)' }} className="text-[10px]">
            {isOpen ? '▼' : '▶'}
          </span>
        </span>
      </button>
      {isOpen && (
        <div className="flex flex-col gap-1 mt-1">
          {related.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }} className="text-xs py-1">No related items</p>
          ) : (
            related.map(r => {
              const isNode = r.entity_type === 'task' || r.entity_type === 'project'
              return (
                <button
                  key={r.link_id}
                  onClick={() => isNode ? onSelectItem(r.entity_id) : undefined}
                  disabled={!isNode}
                  style={{
                    backgroundColor: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    cursor: isNode ? 'pointer' : 'default',
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:border-[#8b949e]/40 transition-colors disabled:hover:border-[var(--border)]"
                >
                  <span
                    style={{ backgroundColor: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border)' }}
                    className="text-[10px] rounded px-1.5 py-0.5 font-medium shrink-0"
                  >
                    {r.display_type}
                  </span>
                  <span style={{ color: 'var(--text)' }} className="text-sm flex-1 min-w-0 truncate">
                    {r.name}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }} className="text-[10px] shrink-0">
                    {r.direction === 'forward' ? 'links to' : 'linked from'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

import type { Database } from '../../types/database.types'

type ItemStatus = Database['public']['Enums']['item_status']
type ItemBucket = Database['public']['Enums']['item_bucket']
type PriorityLevel = Database['public']['Enums']['priority_level']

const STATUS_OPTIONS: ItemStatus[] = ['open', 'in_progress', 'waiting', 'done', 'cancelled']
const PRIORITY_OPTIONS: PriorityLevel[] = ['high', 'medium', 'low']
const BUCKET_OPTIONS: ItemBucket[] = ['needs_doing', 'someday', 'maybe']

interface TaskDetailFormGridProps {
  status: ItemStatus
  date: string
  priority: string
  bucket: string
  isDateSet: boolean
  saving: boolean
  onStatusChange: (value: ItemStatus) => void
  onDateChange: (value: string) => void
  onPriorityChange: (value: string) => void
  onBucketChange: (value: string) => void
  onUpdate: () => void
}

export function TaskDetailFormGrid({
  status,
  date,
  priority,
  bucket,
  isDateSet,
  saving,
  onStatusChange,
  onDateChange,
  onPriorityChange,
  onBucketChange,
  onUpdate,
}: TaskDetailFormGridProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {/* Status */}
        <div className="flex flex-col gap-1">
          <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as ItemStatus)}
            style={{
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
            className="rounded-lg px-2 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div className="flex flex-col gap-1">
          <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => onPriorityChange(e.target.value)}
            style={{
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
            className="rounded-lg px-2 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            <option value="">— none —</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div className="flex flex-col gap-1">
          <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            style={{
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              colorScheme: 'dark',
            }}
            className="rounded-lg px-2 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>

        {/* Bucket */}
        <div className="flex flex-col gap-1">
          <label style={{ color: isDateSet ? 'var(--border)' : 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
            Bucket
          </label>
          <select
            value={bucket}
            onChange={(e) => onBucketChange(e.target.value)}
            disabled={isDateSet}
            style={{
              backgroundColor: 'var(--surface2)',
              color: isDateSet ? 'var(--text-muted)' : 'var(--text)',
              border: '1px solid var(--border)',
              opacity: isDateSet ? 0.5 : 1,
            }}
            className="rounded-lg px-2 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:cursor-not-allowed"
          >
            <option value="">— none —</option>
            {BUCKET_OPTIONS.map((b) => (
              <option key={b} value={b}>{b.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Update button */}
      <button
        onClick={onUpdate}
        disabled={saving}
        style={{
          backgroundColor: 'var(--accent)',
          color: '#0d1117',
        }}
        className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-opacity w-full"
      >
        {saving ? 'Saving...' : 'Update'}
      </button>
    </>
  )
}

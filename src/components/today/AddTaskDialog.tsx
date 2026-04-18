import { useState } from 'react'
import { useMutations } from '../../hooks/useMutations'
import type { ActiveProject } from '../../store/appState'

// Today's date string in local time (YYYY-MM-DD)
function getTodayStr(): string {
  return new Date().toLocaleDateString('en-CA')
}

interface AddTaskDialogProps {
  projects: ActiveProject[]
  onClose: () => void
}

export default function AddTaskDialog({ projects, onClose }: AddTaskDialogProps) {
  const { addTask } = useMutations()
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(getTodayStr())
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await addTask({
        name: name.trim(),
        parent_id: projectId || null,
        date: date || null,
        body: body.trim() || null,
        status: 'open',
        type: 'task',
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add task')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
        className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-4 mx-0 sm:mx-4"
      >
        <h2 style={{ color: 'var(--text)' }} className="text-base font-semibold">New Task</h2>

        {error && <p style={{ color: 'var(--red)' }} className="text-xs">{error}</p>}

        <div className="flex flex-col gap-1">
          <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
            Name *
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Task name"
            required
            style={{
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
            className="rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{
                backgroundColor: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
              className="rounded-lg px-2 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="">— none —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id ?? ''}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                backgroundColor: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                colorScheme: 'dark',
              }}
              className="rounded-lg px-2 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
            Notes
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Optional notes..."
            rows={3}
            style={{
              backgroundColor: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              resize: 'none',
            }}
            className="rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: 'var(--surface2)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            style={{
              backgroundColor: 'var(--accent)',
              color: '#0d1117',
            }}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add Task'}
          </button>
        </div>
      </form>
    </div>
  )
}

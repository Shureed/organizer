import { useRef } from 'react'
import { Button } from '../ui/button'

export interface CommentRow {
  id: string
  actor: string
  body: string
  created_at: string
  pending?: boolean
}

interface CommentSectionProps {
  comments: CommentRow[]
  value: string
  onChange: (text: string) => void
  onSubmit: () => void
  submitting: boolean
  bottomRef?: React.RefObject<HTMLDivElement>
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function CommentSection({ comments, value, onChange, onSubmit, submitting, bottomRef }: CommentSectionProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
        Comments
      </p>

      {comments.length > 0 && (
        <div className="flex flex-col gap-2">
          {comments.map((c) => (
            <div key={c.id} className={`flex items-start gap-2${c.pending ? ' opacity-50' : ''}`}>
              <div
                style={{
                  backgroundColor: c.actor === 'shureed' ? 'var(--surface2)' : 'rgba(88,166,255,0.15)',
                  color: c.actor === 'shureed' ? 'var(--text-muted)' : 'var(--accent)',
                  border: '1px solid var(--border)',
                  flexShrink: 0,
                }}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                title={c.actor}
              >
                {c.actor === 'shureed' ? 'S' : '✦'}
              </div>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <p style={{ color: 'var(--text)' }} className="text-sm leading-snug whitespace-pre-wrap break-words">
                  {c.body}
                </p>
                <p style={{ color: 'var(--text-muted)' }} className="text-[10px]">
                  {c.pending ? 'Posting…' : timeAgo(c.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {bottomRef && <div ref={bottomRef} />}

      <div className="flex flex-col gap-1">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment… (Cmd+Enter to submit)"
          rows={2}
          style={{
            backgroundColor: 'var(--surface2)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            resize: 'none',
          }}
          className="w-full rounded-lg px-3 py-2 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] w-full"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={submitting || !value.trim()}
            style={{ backgroundColor: 'var(--accent)', color: '#000' }}
            className="text-xs"
          >
            {submitting ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>
    </div>
  )
}

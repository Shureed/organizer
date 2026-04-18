import { useRef } from 'react'
import { useTaskDetail } from '../../hooks/useTaskDetail'
import { StatusChip } from './StatusChip'
import { PinIcon } from './PinIcon'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { CommentSection } from './CommentSection'
import type { Database } from '../../types/database.types'

type ItemStatus = Database['public']['Enums']['item_status']
type ItemBucket = Database['public']['Enums']['item_bucket']
type PriorityLevel = Database['public']['Enums']['priority_level']

interface TaskDetailModalProps {
  taskId: string | null
  onClose: () => void
}

const STATUS_OPTIONS: ItemStatus[] = ['open', 'in_progress', 'waiting', 'done', 'cancelled']
const PRIORITY_OPTIONS: PriorityLevel[] = ['high', 'medium', 'low']
const BUCKET_OPTIONS: ItemBucket[] = ['needs_doing', 'someday', 'maybe']

export function TaskDetailModal({ taskId, onClose }: TaskDetailModalProps) {
  const commentsBottomRef = useRef<HTMLDivElement>(null)

  const {
    task,
    subtasks,
    comments,
    related,
    parentNode,
    loading,
    saving,
    pinning,
    error,
    ui,
    actions,
  } = useTaskDetail(taskId)

  const {
    status,
    date,
    priority,
    bucket,
    commentBody,
    submittingComment,
    relatedOpen,
    isDateSet,
    setStatus,
    setDate,
    setPriority,
    setBucket,
    setCommentBody,
    setRelatedOpen,
    setActiveTaskId,
  } = ui

  return (
    <Dialog open={!!taskId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="max-w-lg w-full max-h-[85vh] overflow-y-auto overflow-x-hidden"
        style={{ backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--text)' }} className="text-base font-semibold pr-6">
            {loading ? 'Loading...' : (task?.name ?? 'Task')}
          </DialogTitle>
          {!loading && task && (
            <div className="flex items-center gap-2 mt-1">
              <span
                style={{ backgroundColor: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}
                className="text-[10px] rounded px-1.5 py-0.5 font-medium"
              >
                {task.type}
              </span>
              <button
                onClick={actions.handleTogglePin}
                disabled={pinning}
                style={{ color: task.pinned ? 'var(--accent)' : 'var(--text-muted)' }}
                className="hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                aria-label={task.pinned ? 'Unpin from today' : 'Pin to today'}
                title={task.pinned ? 'Unpin from today' : 'Pin to today'}
              >
                <PinIcon filled={task.pinned} />
              </button>
            </div>
          )}
        </DialogHeader>

        {error && (
          <p style={{ color: 'var(--red)' }} className="text-xs">{error}</p>
        )}

        {!loading && task && (
          <div className="flex flex-col gap-4 mt-1 min-w-0">
            {/* Parent node link */}
            {parentNode && (
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-muted)' }} className="text-xs">
                  {parentNode.type === 'project' ? '↑ Project' : '↑ Parent'}
                </span>
                <button
                  onClick={() => setActiveTaskId(parentNode.id)}
                  style={{
                    backgroundColor: 'var(--surface2)',
                    color: 'var(--accent)',
                    border: '1px solid var(--border)',
                  }}
                  className="text-xs rounded-full px-2.5 py-0.5 hover:brightness-110 transition-all"
                >
                  {parentNode.name}
                </button>
              </div>
            )}

            {/* Form fields */}
            <div className="grid grid-cols-2 gap-3">
              {/* Status */}
              <div className="flex flex-col gap-1">
                <label style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ItemStatus)}
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
                  onChange={(e) => setPriority(e.target.value)}
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

              {/* Bucket */}
              <div className="flex flex-col gap-1">
                <label style={{ color: isDateSet ? 'var(--border)' : 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
                  Bucket
                </label>
                <select
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
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
              onClick={() => actions.handleUpdate(onClose)}
              disabled={saving}
              style={{
                backgroundColor: 'var(--accent)',
                color: '#0d1117',
              }}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-opacity w-full"
            >
              {saving ? 'Saving...' : 'Update'}
            </button>

            {/* PR Link */}
            {task.git_pr_url && (
              <div className="flex flex-col gap-1">
                <p style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
                  Pull Request
                </p>
                <a
                  href={task.git_pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)' }}
                  className="text-sm hover:underline"
                >
                  View PR
                </a>
              </div>
            )}

            {/* Body */}
            {task.body && (
              <div className="flex flex-col gap-1">
                <p style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
                  Description
                </p>
                <p style={{ color: 'var(--text)', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}
                  className="text-sm leading-relaxed whitespace-pre-wrap break-words rounded-lg px-3 py-2">
                  {task.body}
                </p>
              </div>
            )}

            {/* Subtasks */}
            {subtasks.length > 0 && (
              <div className="flex flex-col gap-2">
                <p style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
                  Subtasks ({subtasks.length})
                </p>
                <div className="flex flex-col gap-1">
                  {subtasks.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setActiveTaskId(sub.id)}
                      style={{
                        backgroundColor: 'var(--surface2)',
                        border: '1px solid var(--border)',
                      }}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:border-[#8b949e]/40 transition-colors"
                    >
                      <StatusChip status={sub.status} />
                      <span style={{ color: 'var(--text)' }} className="text-sm flex-1 min-w-0 truncate">
                        {sub.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Related Items */}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setRelatedOpen(o => !o)}
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
                    {relatedOpen ? '▼' : '▶'}
                  </span>
                </span>
              </button>
              {relatedOpen && (
                <div className="flex flex-col gap-1 mt-1">
                  {related.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }} className="text-xs py-1">No related items</p>
                  ) : (
                    related.map(r => {
                      const isNode = r.entity_type === 'task' || r.entity_type === 'project'
                      return (
                        <button
                          key={r.link_id}
                          onClick={() => isNode ? setActiveTaskId(r.entity_id) : undefined}
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

            {/* Comments */}
            <CommentSection
              comments={comments}
              value={commentBody}
              onChange={setCommentBody}
              onSubmit={() => actions.handleCommentSubmit(() => commentsBottomRef.current?.scrollIntoView())}
              submitting={submittingComment}
              bottomRef={commentsBottomRef}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

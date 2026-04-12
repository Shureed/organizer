import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useMutations } from '../../hooks/useMutations'
import { useDataLoader } from '../../hooks/useDataLoader'
import { StatusChip } from './StatusChip'
import { PinIcon } from './PinIcon'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { CommentSection } from './CommentSection'
import type { CommentRow } from './CommentSection'
import type { Database } from '../../types/database.types'

type ItemStatus = Database['public']['Enums']['item_status']
type ItemBucket = Database['public']['Enums']['item_bucket']
type PriorityLevel = Database['public']['Enums']['priority_level']

interface TaskRow {
  id: string
  name: string
  status: ItemStatus | null
  date: string | null
  priority: PriorityLevel | null
  bucket: ItemBucket | null
  body: string | null
  parent_id: string | null
  type: string
  pinned: boolean
}

interface SubtaskRow {
  id: string
  name: string
  status: ItemStatus | null
}

interface RelatedItem {
  link_id: string
  entity_type: string
  entity_id: string
  direction: string
  name: string
  display_type: string
}

interface TaskDetailModalProps {
  taskId: string | null
  onClose: () => void
}

const STATUS_OPTIONS: ItemStatus[] = ['open', 'in_progress', 'waiting', 'done', 'cancelled']
const PRIORITY_OPTIONS: PriorityLevel[] = ['high', 'medium', 'low']
const BUCKET_OPTIONS: ItemBucket[] = ['needs_doing', 'someday', 'maybe']

export function TaskDetailModal({ taskId, onClose }: TaskDetailModalProps) {
  const [task, setTask] = useState<TaskRow | null>(null)
  const [subtasks, setSubtasks] = useState<SubtaskRow[]>([])
  const [comments, setComments] = useState<CommentRow[]>([])
  const [related, setRelated] = useState<RelatedItem[]>([])
  const [relatedOpen, setRelatedOpen] = useState(false)
  const [parentNode, setParentNode] = useState<{ id: string; name: string; type: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pinning, setPinning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [status, setStatus] = useState<ItemStatus>('open')
  const [date, setDate] = useState('')
  const [priority, setPriority] = useState('')
  const [bucket, setBucket] = useState('')

  // Comment state
  const [commentBody, setCommentBody] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  // Navigation stack for subtask drill-in
  const [activeTaskId, setActiveTaskId] = useState<string | null>(taskId)

  const { changeTaskStatus, postComment, toggleTaskPin } = useMutations()
  const { refreshTasks } = useDataLoader()
  const commentsBottomRef = useRef<HTMLDivElement>(null)

  const fetchTask = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const [taskRes, subtasksRes, commentsRes] = await Promise.all([
        supabase.from('action_node').select('*').eq('id', id).single(),
        supabase
          .from('action_node')
          .select('id, name, status')
          .eq('parent_id', id)
          .eq('archived', false)
          .order('status', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('comments')
          .select('id, actor, body, created_at')
          .eq('entity_type', 'task')
          .eq('entity_id', id)
          .order('created_at', { ascending: true }),
      ])

      if (taskRes.error) throw taskRes.error
      const t = taskRes.data as TaskRow
      setTask(t)
      setStatus(t.status ?? 'open')
      setDate(t.date ?? '')
      setPriority(t.priority ?? '')
      setBucket(t.bucket ?? '')
      setSubtasks((subtasksRes.data ?? []) as SubtaskRow[])
      setComments((commentsRes.data ?? []) as CommentRow[])

      // Load parent node
      if (t.parent_id) {
        const { data: parentData } = await supabase
          .from('action_node')
          .select('id, name, type')
          .eq('id', t.parent_id)
          .single()
        setParentNode(parentData ? { id: parentData.id, name: parentData.name ?? '', type: parentData.type ?? '' } : null)
      } else {
        setParentNode(null)
      }

      // Load related items via fn_related
      // All action_node items are stored as item_type 'task' in related_items
      const { data: rawRelated, error: relatedErr } = await supabase.rpc('fn_related', {
        p_type: 'task' as any,
        p_id: id,
      })
      if (relatedErr) console.error('fn_related error:', relatedErr)
      const relatedRows = (rawRelated ?? []) as Array<{
        link_id: string; entity_type: string; entity_id: string; direction: string
      }>
      if (relatedRows.length > 0) {
        // All action_node items (tasks, projects, bugs, etc.) are stored as entity_type='task'
        // Fetch actual name + type from action_node for all of them
        const nodeIds = relatedRows.map(r => r.entity_id)
        const nameMap: Record<string, string> = {}
        const typeMap: Record<string, string> = {}
        const { data: nameData } = await supabase
          .from('action_node')
          .select('id, name, type')
          .in('id', nodeIds)
        ;(nameData ?? []).forEach(n => {
          nameMap[n.id] = n.name ?? n.id
          typeMap[n.id] = n.type ?? 'task'
        })
        // Inbox items live in the inbox table, not action_node — fetch their titles separately
        const inboxIds = relatedRows.filter(r => r.entity_type === 'inbox').map(r => r.entity_id)
        if (inboxIds.length > 0) {
          const { data: inboxData } = await supabase
            .from('inbox')
            .select('id, title, body')
            .in('id', inboxIds)
          ;(inboxData ?? []).forEach(i => {
            nameMap[i.id] = i.title || (i.body?.slice(0, 50) ?? i.id)
            typeMap[i.id] = 'inbox'
          })
        }
        setRelated(relatedRows.map(r => ({
          ...r,
          name: nameMap[r.entity_id] ?? r.entity_type,
          display_type: typeMap[r.entity_id] ?? r.entity_type,
        })))
      } else {
        setRelated([])
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load task')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setActiveTaskId(taskId)
  }, [taskId])

  useEffect(() => {
    if (activeTaskId) {
      fetchTask(activeTaskId)
    }
  }, [activeTaskId, fetchTask])

  const handleUpdate = async () => {
    if (!activeTaskId) return
    setSaving(true)
    try {
      await changeTaskStatus(
        activeTaskId,
        status,
        (bucket || null) as ItemBucket | null,
        date || null,
        (priority || null) as PriorityLevel | null
      )
      await refreshTasks()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const handleCommentSubmit = async () => {
    if (!activeTaskId || !commentBody.trim()) return
    const body = commentBody.trim()
    const optimistic: CommentRow = {
      id: 'pending',
      actor: 'shureed',
      body,
      created_at: new Date().toISOString(),
      pending: true,
    }
    setComments(prev => [...prev, optimistic])
    setCommentBody('')
    setSubmittingComment(true)
    try {
      await postComment({
        entity_type: 'task',
        entity_id: activeTaskId,
        actor: 'shureed',
        body,
      })
      const { data } = await supabase
        .from('comments')
        .select('id, actor, body, created_at')
        .eq('entity_type', 'task')
        .eq('entity_id', activeTaskId)
        .order('created_at', { ascending: true })
      setComments((data ?? []) as CommentRow[])
      commentsBottomRef.current?.scrollIntoView()
    } catch (e: unknown) {
      setComments(prev => prev.filter(c => c.id !== 'pending'))
      setCommentBody(body)
      setError(e instanceof Error ? e.message : 'Failed to post comment')
    } finally {
      setSubmittingComment(false)
    }
  }

  const isDateSet = !!date

  return (
    <Dialog open={!!taskId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="max-w-lg w-full max-h-[85vh] overflow-y-auto"
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
                onClick={async () => {
                  if (!activeTaskId || pinning) return
                  setPinning(true)
                  try {
                    await toggleTaskPin(activeTaskId, !task.pinned)
                    await fetchTask(activeTaskId)
                  } finally {
                    setPinning(false)
                  }
                }}
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
          <div className="flex flex-col gap-4 mt-1">
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
                  className="rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
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
                  className="rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
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
                  className="rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
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
                  className="rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:cursor-not-allowed"
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
              onClick={handleUpdate}
              disabled={saving}
              style={{
                backgroundColor: 'var(--accent)',
                color: '#0d1117',
              }}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-opacity w-full"
            >
              {saving ? 'Saving...' : 'Update'}
            </button>

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
              onSubmit={handleCommentSubmit}
              submitting={submittingComment}
              bottomRef={commentsBottomRef}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

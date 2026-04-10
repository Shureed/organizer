import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useMutations } from '../../hooks/useMutations'
import { useDataLoader } from '../../hooks/useDataLoader'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { SourceBadge } from './SourceBadge'
import type { Database } from '../../types/database.types'

type InboxRow = Database['public']['Tables']['inbox']['Row']
type CommentRow = Database['public']['Tables']['comments']['Row']

interface InboxDetailModalProps {
  itemId: string | null
  onClose: () => void
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function InboxDetailModal({ itemId, onClose }: InboxDetailModalProps) {
  const [item, setItem] = useState<InboxRow | null>(null)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const { archiveInbox, postComment } = useMutations()
  const { refreshInbox } = useDataLoader()

  useEffect(() => {
    if (!itemId) {
      setItem(null)
      setComments([])
      return
    }

    const fetchItem = async () => {
      const { data } = await supabase
        .from('inbox')
        .select('*')
        .eq('id', itemId)
        .single()
      setItem(data)
    }

    const fetchComments = async () => {
      const { data } = await supabase
        .from('comments')
        .select('*')
        .eq('entity_type', 'inbox')
        .eq('entity_id', itemId)
        .order('created_at', { ascending: true })
      setComments(data ?? [])
    }

    fetchItem()
    fetchComments()
  }, [itemId])

  const handleDismiss = async () => {
    if (!item) return
    setDismissing(true)
    try {
      await archiveInbox(item.id)
      await refreshInbox()
      onClose()
    } finally {
      setDismissing(false)
    }
  }

  const handleSubmitComment = async () => {
    if (!item || !commentText.trim()) return
    setSubmitting(true)
    try {
      await postComment({
        entity_type: 'inbox',
        entity_id: item.id,
        actor: 'shureed',
        body: commentText.trim(),
      })
      setCommentText('')
      const { data } = await supabase
        .from('comments')
        .select('*')
        .eq('entity_type', 'inbox')
        .eq('entity_id', item.id)
        .order('created_at', { ascending: true })
      setComments(data ?? [])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!itemId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="max-w-lg w-full"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }}
      >
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--text)' }} className="text-base font-semibold leading-snug pr-6">
                {item.title}
              </DialogTitle>
            </DialogHeader>

            <div className="flex items-center gap-2 mt-1">
              <SourceBadge source={item.source} />
              <span style={{ color: 'var(--text-muted)' }} className="text-xs">
                {formatDateTime(item.created_at)}
              </span>
              {item.archived && (
                <span
                  style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface2)' }}
                  className="text-[10px] px-1.5 py-0.5 rounded"
                >
                  Archived
                </span>
              )}
            </div>

            {item.body && (
              <div
                style={{
                  color: 'var(--text)',
                  backgroundColor: 'var(--surface2)',
                  border: '1px solid var(--border)',
                }}
                className="rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap mt-2"
              >
                {item.body}
              </div>
            )}

            {!item.archived && (
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDismiss}
                  disabled={dismissing}
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  {dismissing ? 'Dismissing…' : 'Dismiss'}
                </Button>
              </div>
            )}

            {/* Comments section */}
            <div
              style={{ borderTop: '1px solid var(--border)' }}
              className="pt-3 mt-1"
            >
              <p style={{ color: 'var(--text-muted)' }} className="text-xs font-medium mb-2">
                Comments
              </p>

              {comments.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }} className="text-xs">
                  No comments yet.
                </p>
              ) : (
                <div className="flex flex-col gap-2 mb-3">
                  {comments.map((c) => (
                    <div key={c.id} className="flex flex-col gap-0.5">
                      <span
                        style={{ color: 'var(--text-muted)' }}
                        className="text-[10px] font-medium uppercase tracking-wide"
                      >
                        {c.actor}
                      </span>
                      <p style={{ color: 'var(--text)' }} className="text-sm leading-snug">
                        {c.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2 mt-2">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment…"
                  rows={2}
                  style={{
                    backgroundColor: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    resize: 'none',
                  }}
                  className="w-full rounded-lg px-3 py-2 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/40"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      handleSubmitComment()
                    }
                  }}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleSubmitComment}
                    disabled={submitting || !commentText.trim()}
                    style={{ backgroundColor: 'var(--accent)', color: '#000' }}
                    className="text-xs"
                  >
                    {submitting ? 'Posting…' : 'Post'}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
              className="w-6 h-6 rounded-full border-2 animate-spin"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

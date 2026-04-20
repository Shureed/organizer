import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useMutations } from '../../hooks/useMutations'
import { useDataLoader } from '../../hooks/useDataLoader'
import { useComments } from '../../hooks/useComments'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { CommentSection } from '../shared/CommentSection'
import { SourceBadge } from './SourceBadge'
import type { Database } from '../../types/database.types'

type InboxRow = Database['public']['Tables']['inbox']['Row']

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
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const { archiveInbox } = useMutations()
  const { refreshInbox } = useDataLoader()
  const { comments, post } = useComments('inbox', itemId)

  useEffect(() => {
    if (!itemId) {
      setItem(null)
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

    fetchItem()
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
    const body = commentText.trim()
    setCommentText('')
    try {
      await post(body)
    } catch {
      // Restore draft so the user doesn't lose it on failure.
      setCommentText(body)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!itemId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="max-w-lg w-full max-h-[85vh] overflow-y-auto"
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
                  style={{ backgroundColor: 'rgba(248,81,73,0.08)', borderColor: 'rgba(248,81,73,0.25)', color: 'var(--red)' }}
                >
                  {dismissing ? 'Dismissing…' : 'Dismiss'}
                </Button>
              </div>
            )}

            {/* Comments section */}
            <div style={{ borderTop: '1px solid var(--border)' }} className="pt-3 mt-1">
              <CommentSection
                comments={comments}
                value={commentText}
                onChange={setCommentText}
                onSubmit={handleSubmitComment}
                submitting={submitting}
              />
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

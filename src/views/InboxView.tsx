import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appState'
import { useDataLoader, loadInboxView, useAutoRefresh } from '../hooks/useDataLoader'
import { useMutations } from '../hooks/useMutations'
import { InboxItem } from '../components/inbox/InboxItem'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'

function CheckIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function InboxView() {
  const inbox = useAppStore((s) => s.data.inbox)
  const patchUI = useAppStore((s) => s.patchUI)
  const { refreshInbox } = useDataLoader()
  const { addInbox } = useMutations()

  useEffect(() => { loadInboxView() }, [])
  useAutoRefresh(loadInboxView, 300000)

  const [inboxOpen, setInboxOpen] = useState(true)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureTitle, setCaptureTitle] = useState('')
  const [captureBody, setCaptureBody] = useState('')
  const [capturing, setCapturing] = useState(false)

  // Pinned first, then rest by created_at desc (view already orders this way)
  const pinned = inbox.filter((i) => i.pinned)
  const unpinned = inbox.filter((i) => !i.pinned)

  const handleCapture = async () => {
    if (!captureTitle.trim()) return
    setCapturing(true)
    try {
      await addInbox({
        title: captureTitle.trim(),
        body: captureBody.trim() || undefined,
        source: 'shortcut',
      })
      await refreshInbox()
      setCaptureTitle('')
      setCaptureBody('')
      setCaptureOpen(false)
    } finally {
      setCapturing(false)
    }
  }

  return (
    <div
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
      className="min-h-screen flex flex-col pb-20"
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}
        className="sticky top-0 z-10 px-4 pt-4 pb-3 flex items-center gap-2"
      >
        <h1 style={{ color: 'var(--text)' }} className="text-base font-semibold leading-none">
          Inbox
        </h1>
        {inbox.length > 0 && (
          <span
            style={{
              backgroundColor: 'var(--accent)',
              color: '#000',
            }}
            className="inline-flex items-center justify-center rounded-full w-5 h-5 text-[10px] font-bold leading-none"
          >
            {inbox.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-4 flex flex-col gap-3">
        {inbox.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span style={{ color: 'var(--text-muted)' }}>
              <CheckIcon />
            </span>
            <p style={{ color: 'var(--text-muted)' }} className="text-sm">
              Inbox is clear
            </p>
          </div>
        ) : (
          <>
            {/* Pinned section */}
            {pinned.length > 0 && (
              <div className="flex flex-col gap-2">
                <p style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide px-0.5">
                  Pinned
                </p>
                {pinned.map((item) => (
                  <InboxItem
                    key={item.id ?? item.created_at}
                    item={item}
                    onOpenDetail={(id) => patchUI({ openInboxId: id })}
                  />
                ))}
              </div>
            )}

            {/* Main list */}
            {unpinned.length > 0 && (
              <div className="flex flex-col gap-2">
                {pinned.length > 0 && (
                  <button
                    onClick={() => setInboxOpen((v) => !v)}
                    style={{ color: 'var(--text-muted)' }}
                    className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide px-0.5 mt-1 hover:text-[var(--text)] transition-colors"
                  >
                    <ChevronIcon open={inboxOpen} />
                    Inbox ({unpinned.length})
                  </button>
                )}
                {(pinned.length === 0 || inboxOpen) && unpinned.map((item) => (
                  <InboxItem
                    key={item.id ?? item.created_at}
                    item={item}
                    onOpenDetail={(id) => patchUI({ openInboxId: id })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setCaptureOpen(true)}
        style={{
          backgroundColor: 'var(--accent)',
          color: '#000',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
        className="fixed bottom-24 right-4 w-12 h-12 rounded-full flex items-center justify-center z-20 active:scale-95 transition-transform"
        aria-label="Quick capture"
      >
        <PlusIcon />
      </button>

      {/* Quick capture dialog */}
      <Dialog open={captureOpen} onOpenChange={(open) => { if (!open) setCaptureOpen(false) }}>
        <DialogContent
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          className="max-w-sm w-full"
        >
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--text)' }}>Quick Capture</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2 mt-1">
            <input
              autoFocus
              value={captureTitle}
              onChange={(e) => setCaptureTitle(e.target.value)}
              placeholder="Title"
              style={{
                backgroundColor: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
              className="w-full rounded-lg px-3 py-2 text-base placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/40"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleCapture()
                }
              }}
            />
            <textarea
              value={captureBody}
              onChange={(e) => setCaptureBody(e.target.value)}
              placeholder="Body (optional)"
              rows={3}
              style={{
                backgroundColor: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                resize: 'none',
              }}
              className="w-full rounded-lg px-3 py-2 text-base placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/40"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCaptureOpen(false)}
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCapture}
              disabled={capturing || !captureTitle.trim()}
              style={{ backgroundColor: 'var(--accent)', color: '#000' }}
            >
              {capturing ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

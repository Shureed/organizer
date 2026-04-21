import { X, AlertTriangle, RefreshCw } from 'lucide-react'
import { useErrorStore } from '../store/appState'
import { cn } from '../lib/utils'

interface LoadErrorBannerProps {
  /** Optional override retry callback. Defaults to clearLoadError (dismiss). */
  onRetry?: (slice: string) => void
}

export function LoadErrorBanner({ onRetry }: LoadErrorBannerProps) {
  const loadError = useErrorStore((s) => s.loadError)
  const clearLoadError = useErrorStore((s) => s.clearLoadError)

  if (!loadError) return null

  const { slice, message } = loadError

  const handleRetry = () => {
    clearLoadError()
    onRetry?.(slice)
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm',
        'bg-red-950/80 border-b border-red-800 text-red-200',
      )}
    >
      <AlertTriangle size={14} className="shrink-0 text-red-400" strokeWidth={2} />

      <span className="flex-1 truncate">
        Couldn&apos;t load{' '}
        <span className="font-semibold text-red-100">{slice}</span>.{' '}
        <span className="text-red-300 text-xs">{message}</span>
      </span>

      <button
        onClick={handleRetry}
        aria-label={`Retry loading ${slice}`}
        className="shrink-0 flex items-center gap-1 text-xs text-red-300 hover:text-red-100 transition-colors"
      >
        <RefreshCw size={12} strokeWidth={2} />
        retry
      </button>

      <button
        onClick={clearLoadError}
        aria-label="Dismiss error"
        className="shrink-0 text-red-400 hover:text-red-200 transition-colors"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

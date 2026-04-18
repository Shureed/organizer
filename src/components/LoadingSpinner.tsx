export function LoadingSpinner() {
  return (
    <div
      style={{ background: 'var(--bg)' }}
      className="min-h-screen flex items-center justify-center"
    >
      <div
        style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
        className="w-8 h-8 rounded-full border-2 animate-spin"
      />
    </div>
  )
}

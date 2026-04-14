import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)

    try {
      await signIn(email.trim())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ background: 'var(--bg)' }}
      className="min-h-screen flex items-center justify-center px-4"
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
        className="w-full max-w-sm rounded-xl p-8"
      >
        <h1
          style={{ color: 'var(--text)' }}
          className="text-xl font-semibold mb-1"
        >
          Organizer
        </h1>
        <p style={{ color: 'var(--text-muted)' }} className="text-sm mb-6">
          Sign in with your email to continue
        </p>

        {sent ? (
          <div
            style={{
              background: 'color-mix(in srgb, var(--green) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)',
              color: 'var(--green)',
            }}
            className="rounded-lg p-4 text-sm"
          >
            Magic link sent to <strong>{email}</strong>. Check your inbox.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
              className="w-full rounded-lg px-3 py-2.5 text-base outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]"
            />

            {error && (
              <p style={{ color: 'var(--red)' }} className="text-xs">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                background: 'var(--accent)',
                color: '#0d1117',
              }}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { signIn, verifyOtp } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)

    try {
      await signIn(email.trim())
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    setError(null)

    try {
      await verifyOtp(email.trim(), code.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setLoading(true)
    setError(null)
    setCode('')

    try {
      await signIn(email.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code')
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
          {step === 'email' ? 'Sign in with your email to continue' : `Enter the code sent to ${email}`}
        </p>

        {step === 'email' ? (
          <form onSubmit={handleSendCode} className="flex flex-col gap-3">
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
              style={{ background: 'var(--accent)', color: '#0d1117' }}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-col gap-3">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
              className="w-full rounded-lg px-3 py-2.5 text-base text-center tracking-[0.5em] outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]"
            />

            {error && (
              <p style={{ color: 'var(--red)' }} className="text-xs">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || code.length < 6}
              style={{ background: 'var(--accent)', color: '#0d1117' }}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              style={{ color: 'var(--text-muted)' }}
              className="text-xs text-center hover:underline disabled:opacity-50"
            >
              Resend code
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

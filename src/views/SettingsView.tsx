import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export function SettingsView() {
  const { session, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignOut = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      await signOut()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div
      className="flex flex-col min-h-full pb-20"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <div
        className="px-4 pt-5 pb-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h1 style={{ color: 'var(--text)' }} className="text-base font-semibold">
          Settings
        </h1>
      </div>

      <div className="px-4 py-4 flex flex-col gap-6">
        <section className="flex flex-col gap-1">
          <div style={{ color: 'var(--text-muted)' }} className="text-xs uppercase tracking-wide">
            Account
          </div>
          <div style={{ color: 'var(--text)' }} className="text-sm">
            {session?.user.email ?? '—'}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <div style={{ color: 'var(--text-muted)' }} className="text-xs uppercase tracking-wide">
            Session
          </div>
          <button
            onClick={handleSignOut}
            disabled={busy}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              opacity: busy ? 0.6 : 1,
            }}
            className="px-3 py-2 rounded text-sm text-left disabled:cursor-not-allowed"
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
          <p style={{ color: 'var(--text-muted)' }} className="text-xs">
            Wipes the local OPFS cache so the next sign-in starts from a clean slate.
          </p>
          {error && (
            <p style={{ color: 'var(--danger, #f87171)' }} className="text-xs">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

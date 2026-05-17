import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useUIStore } from '../store/appState'

// PKCE storage keys — mirrored from useGcalConnection (the Connect button writes them).
const VERIFIER_KEY = 'gcal_oauth_verifier'
const STATE_KEY = 'gcal_oauth_state'
const STATE_VALUE = 'gcal_oauth'

// Module-level guard: a useRef would reset on a StrictMode dev double-mount,
// which would cause us to consume the `?code=` twice and POST a stale code.
let HANDLED = false

function fnUrl(name: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
  return `${base}/functions/v1/${name}`
}

function redirectUri(): string {
  return window.location.origin + import.meta.env.BASE_URL
}

function cleanUrl(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('scope')
  url.searchParams.delete('error')
  window.history.replaceState({}, '', url.toString())
}

async function exchangeCode(code: string, codeVerifier: string): Promise<void> {
  const session = (await supabase.auth.getSession()).data.session
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  const res = await fetch(fnUrl('gcal-oauth-callback'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri() }),
  })
  if (res.ok) return
  let body: { error?: string; detail?: unknown } | null = null
  try { body = await res.json() } catch { /* ignore */ }
  throw new Error(body?.error ? `${body.error}: ${JSON.stringify(body.detail)}` : `HTTP ${res.status}`)
}

function bumpConnectionVersion(): void {
  const cur = useUIStore.getState().ui.gcalConnectionVersion
  useUIStore.getState().patchUI({ gcalConnectionVersion: cur + 1 })
}

// Imperative core, exported for tests. Returns a Promise resolved once any
// async exchange has completed (or immediately for pass-through paths).
export async function processOAuthCallback(): Promise<void> {
  if (HANDLED) return
  HANDLED = true

  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const stateParam = params.get('state')
  const errParam = params.get('error')

  if (errParam) {
    cleanUrl()
    sessionStorage.removeItem(VERIFIER_KEY)
    sessionStorage.removeItem(STATE_KEY)
    bumpConnectionVersion()
    return
  }

  if (!code || stateParam !== STATE_VALUE) return

  const expectedState = sessionStorage.getItem(STATE_KEY)
  if (stateParam !== expectedState) return

  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  cleanUrl()
  if (!verifier) {
    bumpConnectionVersion()
    return
  }

  try {
    await exchangeCode(code, verifier)
  } finally {
    // Bump on both success and failure so subscribers re-probe and reflect
    // the actual (possibly still-disconnected) state.
    bumpConnectionVersion()
  }
}

// Shell-level hook: mount once in `MainApp` so the OAuth `?code=` bounce-back
// is exchanged regardless of which view is initially rendered. Without this,
// the exchange only ran when SettingsView happened to be mounted, leaving the
// stored refresh token to age out and surface as `reconnect_required` later.
export function useGcalCallback(): void {
  useEffect(() => {
    void processOAuthCallback()
  }, [])
}

// Test-only: reset the module-level guard so tests can re-exercise the path
// without re-importing the module each time.
export function __resetCallbackGuardForTests(): void {
  HANDLED = false
}

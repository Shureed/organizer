import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// PKCE storage key — short-lived (sessionStorage), cleared on success/failure.
const VERIFIER_KEY = 'gcal_oauth_verifier'
const STATE_KEY = 'gcal_oauth_state'
// State param value used to identify our redirects vs unrelated ?code= params.
const STATE_VALUE = 'gcal_oauth'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

const CLIENT_ID = import.meta.env.VITE_GCAL_WEB_CLIENT_ID as string | undefined

type ConnectionState = 'unknown' | 'connected' | 'disconnected' | 'connecting' | 'error'

export interface UseGcalConnectionReturn {
  state: ConnectionState
  error: string | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  refreshState: () => Promise<void>
}

function redirectUri(): string {
  // BASE_URL is injected by Vite from `base` config (e.g. '/organizer/').
  // window.location.origin lacks the trailing path; concatenate BASE_URL so
  // both dev (localhost:5173/organizer/) and prod register the same shape.
  return window.location.origin + import.meta.env.BASE_URL
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return bytes
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = ''
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  // RFC 7636: verifier 43–128 chars, [A-Z a-z 0-9 - . _ ~]. base64url of 32
  // random bytes is 43 chars and falls in that alphabet.
  const verifier = base64UrlEncode(randomBytes(32))
  const challenge = await sha256Base64Url(verifier)
  return { verifier, challenge }
}

async function probeConnected(): Promise<boolean> {
  // Probe with a 1-day window. fn_gcal_fetch_self raises on reconnect_required;
  // any successful return (even empty) means connected.
  const start = new Date().toISOString()
  const end = new Date(Date.now() + 86_400_000).toISOString()
  const { error } = await supabase.rpc('fn_gcal_fetch_self', {
    p_start: start,
    p_end: end,
    p_calendar_id: 'primary',
  })
  if (!error) return true
  // Distinguish reconnect_required (expected) from real errors. The PG hint
  // carries the original error code; the message contains the JSON body.
  const msg = error.message ?? ''
  const hint = (error as { hint?: string }).hint ?? ''
  if (hint === 'reconnect_required' || msg.includes('reconnect_required') || msg.includes('no_token_stored')) {
    return false
  }
  // Other errors bubble up — don't claim connected just because the call failed
  // for an unrelated reason.
  throw error
}

async function exchangeCode(code: string, codeVerifier: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('gcal-oauth-callback', {
    body: { code, code_verifier: codeVerifier, redirect_uri: redirectUri() },
  })
  if (error) {
    // FunctionsHttpError carries the body in error.context.response — unwrap if possible.
    const ctx = (error as { context?: { response?: Response } }).context
    if (ctx?.response) {
      try {
        const body = await ctx.response.clone().json()
        throw new Error(body?.error ? `${body.error}: ${JSON.stringify(body.detail)}` : error.message)
      } catch {
        throw error
      }
    }
    throw error
  }
  // 204 → data is null. No-op.
  void data
}

export function useGcalConnection(): UseGcalConnectionReturn {
  const [state, setState] = useState<ConnectionState>('unknown')
  const [error, setError] = useState<string | null>(null)
  const callbackHandledRef = useRef(false)

  const refreshState = useCallback(async () => {
    try {
      const ok = await probeConnected()
      setState(ok ? 'connected' : 'disconnected')
      setError(null)
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // On mount: handle OAuth callback if present, else probe.
  useEffect(() => {
    if (callbackHandledRef.current) return
    callbackHandledRef.current = true

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const stateParam = params.get('state')
    const errParam = params.get('error')

    const cleanUrl = () => {
      // Strip the OAuth params from the URL without reloading.
      const url = new URL(window.location.href)
      url.searchParams.delete('code')
      url.searchParams.delete('state')
      url.searchParams.delete('scope')
      url.searchParams.delete('error')
      window.history.replaceState({}, '', url.toString())
    }

    if (errParam) {
      setState('error')
      setError(`OAuth: ${errParam}`)
      cleanUrl()
      sessionStorage.removeItem(VERIFIER_KEY)
      sessionStorage.removeItem(STATE_KEY)
      return
    }

    const expectedState = sessionStorage.getItem(STATE_KEY)
    if (code && stateParam === STATE_VALUE && stateParam === expectedState) {
      const verifier = sessionStorage.getItem(VERIFIER_KEY)
      sessionStorage.removeItem(VERIFIER_KEY)
      sessionStorage.removeItem(STATE_KEY)
      cleanUrl()
      if (!verifier) {
        setState('error')
        setError('OAuth: missing PKCE verifier in session')
        return
      }
      ;(async () => {
        try {
          setState('connecting')
          await exchangeCode(code, verifier)
          await refreshState()
        } catch (err) {
          setState('error')
          setError(err instanceof Error ? err.message : String(err))
        }
      })()
      return
    }

    void refreshState()
  }, [refreshState])

  const connect = useCallback(async () => {
    if (!CLIENT_ID) {
      setState('error')
      setError('VITE_GCAL_WEB_CLIENT_ID not configured')
      return
    }
    try {
      setError(null)
      const { verifier, challenge } = await generatePkce()
      sessionStorage.setItem(VERIFIER_KEY, verifier)
      sessionStorage.setItem(STATE_KEY, STATE_VALUE)

      const url = new URL(AUTH_URL)
      url.searchParams.set('client_id', CLIENT_ID)
      url.searchParams.set('redirect_uri', redirectUri())
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', SCOPE)
      url.searchParams.set('code_challenge', challenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('access_type', 'offline')
      // prompt=consent forces refresh_token even on subsequent re-grants.
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('state', STATE_VALUE)
      url.searchParams.set('include_granted_scopes', 'true')

      window.location.href = url.toString()
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      setError(null)
      const { error: rpcErr } = await supabase.rpc('fn_gcal_token_clear_self')
      if (rpcErr) throw rpcErr
      setState('disconnected')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  return { state, error, connect, disconnect, refreshState }
}

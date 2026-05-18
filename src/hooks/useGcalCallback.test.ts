/**
 * useGcalCallback behavior tests.
 *
 * The companion regression test in src/App.callback.test.tsx verifies the
 * hook is actually mounted at the shell level (MainApp), which is the
 * mount-location regression class. These tests cover the imperative core
 * `processOAuthCallback` directly, avoiding the need for a React renderer
 * (the repo has no @testing-library install).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useUIStore } from '../store/appState'
import { processOAuthCallback, __resetCallbackGuardForTests } from './useGcalCallback'

// Mock supabase client used by the hook for the session token header.
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}))

// happy-dom sets a default origin; resolve at runtime. BASE_URL comes from
// Vite's `base` config and may differ between test/dev/prod — assert on
// shape, not exact value.
const ORIGIN = window.location.origin

function resetUIStore() {
  useUIStore.setState({
    ui: {
      currentView: 'today',
      calendarYear: 2026,
      calendarMonth: 0,
      calendarSelectedDay: null,
      showClosedSearch: false,
      searchItems: [],
      fuseIndex: null,
      openTaskId: null,
      openInboxId: null,
      gcalConnectionVersion: 0,
      gcalCallbackError: null,
    },
  })
}

function setLocation(search: string) {
  window.history.replaceState({}, '', `/${search}`)
}

describe('processOAuthCallback', () => {
  beforeEach(() => {
    resetUIStore()
    sessionStorage.clear()
    setLocation('')
    __resetCallbackGuardForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does nothing when ?code= is not present', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await processOAuthCallback()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(useUIStore.getState().ui.gcalConnectionVersion).toBe(0)
  })

  it('exchanges ?code=, cleans URL + sessionStorage, bumps version on 204', async () => {
    sessionStorage.setItem('gcal_oauth_state', 'gcal_oauth')
    sessionStorage.setItem('gcal_oauth_verifier', 'verifier-abc')
    setLocation('?code=fakecode&state=gcal_oauth')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await processOAuthCallback()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0]
    expect(String(calledUrl)).toContain('/functions/v1/gcal-oauth-callback')
    const body = JSON.parse(String((calledInit as RequestInit).body))
    expect(body.code).toBe('fakecode')
    expect(body.code_verifier).toBe('verifier-abc')
    expect(body.redirect_uri).toMatch(new RegExp(`^${ORIGIN}/`))

    expect(useUIStore.getState().ui.gcalConnectionVersion).toBe(1)
    expect(useUIStore.getState().ui.gcalCallbackError).toBeNull()
    expect(sessionStorage.getItem('gcal_oauth_verifier')).toBeNull()
    expect(sessionStorage.getItem('gcal_oauth_state')).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('parks gcalCallbackError when the exchange fails', async () => {
    sessionStorage.setItem('gcal_oauth_state', 'gcal_oauth')
    sessionStorage.setItem('gcal_oauth_verifier', 'verifier-abc')
    setLocation('?code=fakecode&state=gcal_oauth')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'token_exchange_failed' }), { status: 400 }),
    )
    await processOAuthCallback()

    expect(useUIStore.getState().ui.gcalCallbackError).toMatch(/^OAuth: token_exchange_failed/)
    expect(useUIStore.getState().ui.gcalConnectionVersion).toBe(1)
  })

  it('on ?error= cleans URL + bumps version, parks error, does not call fetch', async () => {
    sessionStorage.setItem('gcal_oauth_state', 'gcal_oauth')
    sessionStorage.setItem('gcal_oauth_verifier', 'verifier-abc')
    setLocation('?error=access_denied')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await processOAuthCallback()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(useUIStore.getState().ui.gcalConnectionVersion).toBe(1)
    expect(useUIStore.getState().ui.gcalCallbackError).toBe('OAuth: access_denied')
    expect(sessionStorage.getItem('gcal_oauth_verifier')).toBeNull()
    expect(sessionStorage.getItem('gcal_oauth_state')).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('module-level guard prevents a second exchange on repeat invocation', async () => {
    sessionStorage.setItem('gcal_oauth_state', 'gcal_oauth')
    sessionStorage.setItem('gcal_oauth_verifier', 'verifier-abc')
    setLocation('?code=fakecode&state=gcal_oauth')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))

    await processOAuthCallback()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Re-seed sessionStorage to simulate a fresh URL; without the guard a
    // second call would re-fire the exchange.
    sessionStorage.setItem('gcal_oauth_state', 'gcal_oauth')
    sessionStorage.setItem('gcal_oauth_verifier', 'verifier-xyz')
    setLocation('?code=fakecode2&state=gcal_oauth')

    await processOAuthCallback()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

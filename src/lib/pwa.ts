import { Workbox } from 'workbox-window'

type UpdateListener = () => void
const listeners = new Set<UpdateListener>()

export function onUpdateAvailable(fn: UpdateListener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

let wb: Workbox | null = null

export function registerPWA(): void {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  wb = new Workbox(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })

  wb.addEventListener('waiting', () => {
    for (const fn of listeners) fn()
  })

  // Visibility-aware: check for SW update on tab regain.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void wb?.update()
  })

  void wb.register()
}

export async function applyUpdateAndReload(): Promise<void> {
  if (!wb) return
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => { window.location.reload() },
    { once: true },
  )
  await wb.messageSkipWaiting()
}

// ---------------------------------------------------------------------------
// T6 — Per-user cache partitioning
//
// __SB_UID__ is read by the SW's cacheKeyWillBeUsed plugin (vite.config.ts T5).
// It is set in globalThis so the SW's in-process plugin closure picks it up
// on the main thread during the cache-key computation. (The plugin runs in the
// SW context as generated code; this global is on the page — see plan §8 (c)
// for the exact timing guarantee: getSession() resolves before useDataLoader
// fires inside MainApp, so the race window is zero in normal flows.)
//
// Note: __SB_UID__ lives on globalThis of the main page thread. The SW's
// cacheKeyWillBeUsed runs in the SW thread and reads globalThis there — which
// is the SW global scope, *not* the page. The plugin code is inlined by
// workbox/vite-plugin-pwa into the generated sw.js; at that point
// `(globalThis as …).__SB_UID__` refers to the SW's globalThis.
// We therefore postMessage the uid to the SW on every auth change so the SW
// can maintain its own copy. See setCacheUserScope below.
// ---------------------------------------------------------------------------

/** Broadcast the current user-id to the active SW so it can key cache entries. */
export function setCacheUserScope(uid: string | null): void {
  // Update SW-side global via MessageChannel broadcast.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SET_CACHE_UID',
      uid: uid ?? 'anon',
    })
  }
  // Also set on the main-thread globalThis as a fallback for any in-process
  // plugin invocations (e.g. during SSR / unit tests).
  ;(globalThis as unknown as { __SB_UID__?: string }).__SB_UID__ = uid ?? 'anon'
}

/**
 * Clear any remaining SW caches on sign-out.
 * supabase-rest cache was retired in PR-C T12; this clears leftover entries
 * from previous SW versions and any other per-user caches.
 */
export async function clearSupabaseRestCache(): Promise<void> {
  if (!('caches' in globalThis)) return
  // Delete the (now-retired) supabase-rest cache if it still exists from a
  // previous SW version.  All other named caches (view-chunks, fonts) are
  // asset caches and are intentionally kept across sign-out.
  await caches.delete('supabase-rest')
}

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

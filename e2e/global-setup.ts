import { chromium, type FullConfig } from '@playwright/test'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Global setup: authenticates the deterministic e2e test user once and writes
 * a Playwright storageState.json that every spec reuses.
 *
 * Auth path note: the app's LoginPage.tsx is OTP-only (email magic code), so a
 * fully UI-driven password sign-in against the real login page isn't possible.
 * To keep the session identical to what the app produces, we still use the
 * exact supabase-js client the app loads (same VITE_SUPABASE_URL / ANON_KEY
 * from the committed .env), call signInWithPassword, and seed the resulting
 * session into localStorage under the supabase-js default key. The app then
 * boots with that session and skips the login page — same runtime state as a
 * successful OTP flow, just bypassing the one-time code step that can't be
 * automated.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  void _config
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  const previewUrl = process.env.E2E_PREVIEW_URL

  if (!email || !password) {
    throw new Error(
      'E2E global-setup: E2E_EMAIL and E2E_PASSWORD must be set in the environment.',
    )
  }
  if (!previewUrl) {
    throw new Error('E2E global-setup: E2E_PREVIEW_URL must be set in the environment.')
  }

  // Resolve Supabase creds from the committed .env (single source of truth
  // shared with the app build). Falls back to VITE_* env vars if present.
  const envPath = resolve(process.cwd(), '.env')
  let supabaseUrl = process.env.VITE_SUPABASE_URL
  let supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  if ((!supabaseUrl || !supabaseAnonKey) && existsSync(envPath)) {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (m[1] === 'VITE_SUPABASE_URL' && !supabaseUrl) supabaseUrl = m[2].trim()
      if (m[1] === 'VITE_SUPABASE_ANON_KEY' && !supabaseAnonKey) supabaseAnonKey = m[2].trim()
    }
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('E2E global-setup: could not resolve VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.')
  }

  // Sign in via supabase-js (dynamic import to keep the config file cheap to parse).
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`E2E global-setup: signInWithPassword failed: ${error?.message ?? 'no session'}`)
  }

  // supabase-js v2 stores the session in localStorage under a key derived from
  // the project ref. Key format: sb-<project-ref>-auth-token.
  const projectRef = new URL(supabaseUrl).host.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`
  const storageValue = JSON.stringify(data.session)

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  // Seed the session before the app scripts run, then navigate so the
  // supabase-js client picks up the persisted session on boot.
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value)
    },
    { key: storageKey, value: storageValue },
  )

  // The app is served under /organizer/ (vite `base` config, mirroring the GH
  // Pages production path). Hitting the bare preview host gives a blank mount.
  const appUrl = previewUrl.replace(/\/$/, '') + '/organizer/'
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' })

  // Wait for the app to finish its initial auth + data load. If the login
  // page still shows, auth injection failed.
  await page.waitForLoadState('networkidle', { timeout: 45_000 })
  const onLoginPage = await page.getByText('Sign in with your email to continue').isVisible().catch(() => false)
  if (onLoginPage) {
    await browser.close()
    throw new Error('E2E global-setup: login page is still visible after session injection.')
  }

  const outPath = resolve(process.cwd(), 'e2e/storageState.json')
  mkdirSync(dirname(outPath), { recursive: true })
  await context.storageState({ path: outPath })
  // Also write a sentinel so failures that happen before the browser context
  // closes are still diagnosable in CI artefacts.
  const cacheDir = resolve(process.cwd(), 'e2e/.cache')
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(
    resolve(cacheDir, 'auth-summary.json'),
    JSON.stringify({ email, projectRef, at: new Date().toISOString() }, null, 2),
    { flag: 'w' },
  )
  await browser.close()
}

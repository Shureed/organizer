import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Shared helpers for flipover specs that drive a task through the
 * detail-modal completion flow. The flow:
 *
 *   tap card on Today
 *     -> TaskDetailModal opens
 *     -> Status select set to target value
 *     -> Update button click runs the mutation + closes modal
 *
 * Spec authors before this rewrite assumed a row-level checkbox /
 * done-button affordance that doesn't exist on TaskCard. The completion
 * mechanism is real, but it lives inside the detail modal — see
 * src/components/task-detail/TaskDetailFormGrid.tsx.
 */

/**
 * Open the detail modal for the task whose visible name is `fixtureText`
 * AND wait for the form fields to mount. The dialog opens immediately on
 * card click, but TaskDetailModal gates the form behind `!loading && task`
 * — until `useTaskDetail` resolves, the dialog title reads "Loading..."
 * and the Status/Priority/Bucket selects don't exist. Anchoring on the
 * dialog alone races the test against the data load; anchoring on the
 * Status select guarantees the form is mounted.
 */
export async function openDetailModal(page: Page, fixtureText: string): Promise<void> {
  await page.getByText(fixtureText).first().click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByLabel('Status').first()).toBeVisible({ timeout: 15_000 })
}

/**
 * Set the status select inside the open detail modal to one of the
 * item_status enum values: open / in_progress / waiting / done / cancelled.
 *
 * Anchored by aria-label via getByLabel — `getByRole('combobox', { name })`
 * doesn't match native <select> elements with aria-label reliably across
 * Playwright versions, but getByLabel resolves the aria-label as the
 * accessible name directly.
 */
export async function setStatus(
  page: Page,
  value: 'open' | 'in_progress' | 'waiting' | 'done' | 'cancelled',
): Promise<void> {
  // openDetailModal already waited for visibility — no need to re-poll.
  await page.getByLabel('Status').first().selectOption(value)
}

/**
 * Click the Update button inside the open detail modal and wait for the
 * modal to close. handleUpdate calls onClose after the mutation resolves
 * (synchronously when offline thanks to the optimistic write path in
 * useMutations); the assertion below blocks the spec from racing the
 * modal-close animation.
 */
export async function clickUpdate(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Update' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
}

function loadSupabaseCreds(): { url: string; anonKey: string } {
  let url = process.env.VITE_SUPABASE_URL
  let anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const envPath = resolve(process.cwd(), '.env')
  if ((!url || !anonKey) && existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (m[1] === 'VITE_SUPABASE_URL' && !url) url = m[2].trim()
      if (m[1] === 'VITE_SUPABASE_ANON_KEY' && !anonKey) anonKey = m[2].trim()
    }
  }
  if (!url || !anonKey) throw new Error('flipover helpers: missing Supabase creds')
  return { url, anonKey }
}

/**
 * Restore a task's status via a side-channel supabase-js call rather than
 * the modal flow. Within-run spec ordering still requires that mutating
 * specs leave the canonical fixture state for downstream specs (the CI-side
 * seed step only runs once before the suite, not between specs). The modal
 * restore path is fragile in offline-then-online transitions; a direct
 * REST UPDATE bypasses every UI race. Pattern matches the side-channel
 * UPDATE in realtime-direct-apply.
 *
 * `taskId` is the row UUID. Authenticates with the e2e user's password
 * since the test user is the row owner (RLS allows them to update).
 */
export async function restoreTaskStatusViaApi(
  taskId: string,
  restoreStatus: 'open' | 'in_progress' = 'open',
  bodyOverride?: string,
): Promise<void> {
  const { url, anonKey } = loadSupabaseCreds()
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) throw new Error('flipover helpers: E2E_EMAIL / E2E_PASSWORD not set')

  const sb = createClient(url, anonKey)
  const { error: authErr } = await sb.auth.signInWithPassword({ email, password })
  if (authErr) throw new Error(`flipover helpers: side-channel auth failed: ${authErr.message}`)

  const patch: Record<string, unknown> = { status: restoreStatus, completed_at: null }
  if (bodyOverride !== undefined) patch.body = bodyOverride
  const { error: updErr } = await sb.from('action_node').update(patch).eq('id', taskId)
  if (updErr) throw new Error(`flipover helpers: side-channel restore failed: ${updErr.message}`)
}

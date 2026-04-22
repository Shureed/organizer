import { test, expect } from '@playwright/test'

/**
 * Flip-over scenario 1: ONLINE COLD BOOT
 *
 * Maps to smoke-slices.mjs step 1 — "Clear OPFS, reload while online, expect
 * Today/Calendar/Issues/Inbox/Recents to render data."
 *
 * We can't reach OPFS eviction via CDP cleanly from Playwright against a
 * deployed preview, so we approximate a cold boot by using a fresh browser
 * context (no persisted OPFS / IndexedDB / localStorage beyond the seeded
 * supabase session injected in globalSetup's storageState). First-load
 * success for the seeded Today fixture is the signal: it requires the full
 * cold boot chain (supabase auth → pull → sqlite apply → Today view render)
 * to complete without error.
 */
test('online cold boot renders Today fixture from a fresh browser context', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Sign in with your email to continue')).toHaveCount(0)

  const fixtureTask = page.getByText('E2E fixture — today task').first()
  await expect(fixtureTask).toBeVisible({ timeout: 45_000 })
})

import { test, expect } from '@playwright/test'

/**
 * Phase 5 smoke: with the test-e2e user's session pre-loaded via global-setup,
 * the app should mount, load Today view, and render the seeded fixture task
 * ("E2E fixture — today task") dated 2026-04-21.
 *
 * Locator: plain getByText on the task body. The app doesn't expose data-testid
 * on TaskCard today, and we were explicitly told not to add any as part of
 * this bootstrap. The seeded title is deliberately distinctive enough to be
 * unambiguous in Today view.
 */
test('today view renders the seeded fixture task for the e2e user', async ({ page }) => {
  await page.goto('/organizer/')

  // Confirm we're authenticated (login page should not show).
  await expect(page.getByText('Sign in with your email to continue')).toHaveCount(0)

  // Today view loads async (SQLite + supabase). Wait up to 30s for the seeded
  // fixture task body to appear. first() guards against any duplicate mentions
  // (e.g. task + detail panel both showing the same text).
  const fixtureTask = page.getByText('E2E fixture — today task').first()
  await expect(fixtureTask).toBeVisible({ timeout: 30_000 })
})

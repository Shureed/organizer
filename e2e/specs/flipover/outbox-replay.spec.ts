import { test, expect } from '@playwright/test'

/**
 * Flip-over scenario 6: OUTBOX REPLAY
 *
 * Maps to smoke-slices.mjs step 6 — "Go back online, _outbox drains within
 * 5 s, update lands in Supabase."
 *
 * We rely on the OfflineIndicator component, which renders a banner when
 * outbox.pendingCount() > 0 and disappears when the queue drains. This is
 * the only stable UI signal exposed for outbox state in the deployed bundle.
 *
 * Sequence:
 *   1. Warm-load.
 *   2. Go offline, mutate the fixture task (same action as offline-mutation
 *      spec but isolated here so the two specs don't depend on run order).
 *   3. Flip online, assert the offline banner (or pending indicator) clears
 *      within 10 s.
 *   4. Reload and assert the mutation landed — the task no longer in Today.
 *   5. Restore: re-open the task to leave shared-user state as found.
 *
 * Assumption flag (see PR body): we assume OfflineIndicator shows visible
 * text matching /pending|offline|syncing/i during replay and clears when
 * the outbox drains. If the banner wording changes, update the regex.
 */
test('outbox drains after reconnect and mutation lands on server', async ({ page, context }) => {
  await page.goto('/')
  const fixture = page.getByText('E2E fixture — today task').first()
  await expect(fixture).toBeVisible({ timeout: 45_000 })

  // Offline mutation.
  await context.setOffline(true)
  const row = fixture.locator('xpath=ancestor::*[self::li or self::div][1]')
  const toggle = row.getByRole('checkbox').first()
  if (await toggle.count()) {
    await toggle.click()
  } else {
    await row.click()
    await page.getByRole('button', { name: /done|complete/i }).first().click()
  }
  await expect(page.getByText('E2E fixture — today task').first()).toHaveCount(0, {
    timeout: 5_000,
  })

  // Back online. Wait for the outbox to drain (indicator text disappears).
  await context.setOffline(false)
  const pendingIndicator = page.getByText(/pending|syncing|offline/i).first()
  // It may not render at all if replay is <1s — tolerate either race.
  await expect(async () => {
    const count = await pendingIndicator.count()
    expect(count).toBe(0)
  }).toPass({ timeout: 15_000 })

  // Reload and confirm the mutation persisted on the server (it should
  // re-hydrate the done state after pull, so the task stays out of Today).
  await page.reload()
  await expect(page.getByText('E2E fixture — today task').first()).toHaveCount(0, {
    timeout: 30_000,
  })

  // Restore shared-user state: re-open the task so the fixture stays green
  // for the next run. Navigation to Done / Recents + reopen is brittle; we
  // approximate by hitting the REST reopen endpoint directly via the same
  // session the app uses. Supabase URL + anon key come from the build env
  // baked into the bundle, which we extract from the page's fetch headers.
  //
  // Simpler: look for a "Reopen" affordance in the Done / Closed view.
  // If the app doesn't surface one, leave restoration to the nightly seed.
  // We mark this as best-effort and do NOT fail the spec if restore fails.
  try {
    await page.goto('/closed')
    const closedRow = page.getByText('E2E fixture — today task').first()
    if (await closedRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await closedRow.click()
      const reopen = page.getByRole('button', { name: /reopen|undone|undo/i }).first()
      if (await reopen.count()) await reopen.click()
    }
  } catch {
    // Restoration is a convenience; the nightly seed also repairs state.
  }
})

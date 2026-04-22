import { test, expect } from '@playwright/test'

/**
 * Flip-over scenario 4: AIRPLANE MODE READ
 *
 * Maps to smoke-slices.mjs step 4 — "Go offline, reload app, all 5 views
 * render last-known SQLite data; no 'No tasks' empty states."
 *
 * Procedure:
 *   1. Warm load online so SQLite is populated.
 *   2. Flip the context offline.
 *   3. Reload. Expect the fixture task still to be visible (served from
 *      OPFS) and no "No tasks" empty-state string to appear in Today.
 */
test('offline reload after warm boot still renders Today from SQLite', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('E2E fixture — today task').first()).toBeVisible({
    timeout: 45_000,
  })

  await context.setOffline(true)
  try {
    await page.reload()
    await expect(page.getByText('E2E fixture — today task').first()).toBeVisible({
      timeout: 30_000,
    })
    // The "No tasks" empty-state is the fallback when SQLite is empty. Its
    // presence during airplane-mode reload would mean the OPFS read path is
    // broken and we fell through to an empty live fetch.
    await expect(page.getByText('No tasks', { exact: false })).toHaveCount(0)
  } finally {
    await context.setOffline(false)
  }
})

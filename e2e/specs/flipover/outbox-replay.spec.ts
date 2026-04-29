import { test, expect } from '@playwright/test'
import { openDetailModal, setStatus, clickUpdate, restoreTaskStatus } from './_helpers'

/**
 * Flip-over scenario 6: OUTBOX REPLAY
 *
 * Maps to smoke-slices.mjs step 6 — "Go back online, _outbox drains within
 * 5 s, update lands in Supabase."
 *
 * Drives the real completion flow (tap card → modal → status=done →
 * Update) while offline so the mutation queues on `_outbox`. Then flips
 * online and asserts:
 *   1. The OfflineIndicator's pending banner clears within ~15s (drain).
 *   2. A reload re-hydrates from server and the task stays out of Today
 *      (mutation persisted, not just optimistic).
 *
 * Order matches offline-mutation: open modal online to dodge offline
 * actionability fights, then flip offline before Update. Restore re-opens
 * the today task via the same modal flow so the canonical seeded fixture
 * state is preserved for downstream specs.
 */
test('outbox drains after reconnect and mutation lands on server', async ({ page, context }) => {
  await page.goto('/')
  const fixtureText = 'E2E fixture — today task'
  await expect(page.getByText(fixtureText).first()).toBeVisible({ timeout: 45_000 })

  await openDetailModal(page, fixtureText)

  await context.setOffline(true)
  try {
    await setStatus(page, 'done')
    await clickUpdate(page)
    await expect(page.getByText(fixtureText).first()).toHaveCount(0, { timeout: 5_000 })

    // Back online. Wait for the outbox to drain — the OfflineIndicator
    // banner shows /pending|syncing|offline/i during replay and clears
    // when the queue empties.
    await context.setOffline(false)
    const pendingIndicator = page.getByText(/pending|syncing|offline/i).first()
    await expect(async () => {
      const count = await pendingIndicator.count()
      expect(count).toBe(0)
    }).toPass({ timeout: 15_000 })

    // Reload — fixture should remain absent because the mutation persisted
    // to the server (not just sitting in the local optimistic store).
    await page.reload()
    await expect(page.getByText(fixtureText).first()).toHaveCount(0, { timeout: 30_000 })
  } finally {
    // Network may still be offline if a try-block step threw before
    // setOffline(false) ran. Restore needs network.
    await context.setOffline(false)
    await restoreTaskStatus(page, fixtureText, 'open')
  }
})

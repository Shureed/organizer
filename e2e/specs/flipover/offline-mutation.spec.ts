import { test, expect } from '@playwright/test'
import { openDetailModal, setStatus, clickUpdate, restoreTaskStatus } from './_helpers'

/**
 * Flip-over scenario 5: OFFLINE MUTATION
 *
 * Maps to smoke-slices.mjs step 5 — "While offline: complete a task. Task
 * disappears from Today immediately (optimistic). Outbox has 1 pending
 * entry."
 *
 * Drives the real completion flow: tap card → detail modal → set status to
 * `done` → click Update. The earlier version of this spec assumed a
 * row-level checkbox / done-button affordance on TaskCard that doesn't
 * exist. See `e2e/specs/flipover/_helpers.ts` for the shared modal helpers.
 *
 * NOTE: this spec mutates the today fixture (e45d0a2b). The `finally`
 * restore re-opens it via the modal flow so subsequent specs (run
 * alphabetically: online-cold-boot, outbox-replay, ...) start from the
 * canonical seeded state.
 */
test('offline task complete removes task from Today optimistically', async ({ page, context }) => {
  await page.goto('/')
  const fixtureText = 'E2E fixture — today task'
  await expect(page.getByText(fixtureText).first()).toBeVisible({ timeout: 45_000 })

  await context.setOffline(true)
  try {
    await openDetailModal(page, fixtureText)
    await setStatus(page, 'done')
    await clickUpdate(page)

    // useMutations writes optimistically to the Zustand store while
    // offline (status=done + completed_at=now), so v_active_tasks-derived
    // slices should drop the row immediately. 5s tolerance for the
    // post-mutation re-render to land.
    await expect(page.getByText(fixtureText).first()).toHaveCount(0, { timeout: 5_000 })
  } finally {
    // Always come back online before attempting restore — the modal flow
    // needs network to persist status=open and unblock subsequent specs.
    await context.setOffline(false)
    await restoreTaskStatus(page, fixtureText, 'open')
  }
})

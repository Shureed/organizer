import { test, expect } from '@playwright/test'

/**
 * Flip-over scenario 5: OFFLINE MUTATION
 *
 * Maps to smoke-slices.mjs step 5 — "While offline: complete a task. Task
 * disappears from Today immediately (optimistic). Outbox has 1 pending
 * entry."
 *
 * We toggle the context offline, click the complete affordance on the
 * seeded today fixture task, and assert it leaves Today view optimistically.
 * Outbox pending-count verification is left to the next spec (outbox-replay)
 * which runs the drain end-to-end; separating them keeps this spec's signal
 * narrowly scoped to the optimistic UI behaviour.
 *
 * Assumption flag (see PR body): the complete affordance is a checkbox /
 * button adjacent to the task row. We target by role=checkbox near the
 * fixture task text. If the UI changes, this needs rewiring.
 *
 * NOTE: this spec mutates shared-user state (task e45d0a2b). Spec 6
 * (outbox-replay) re-opens the same task to restore state after drain.
 */
test('offline task complete removes task from Today optimistically', async ({ page, context }) => {
  await page.goto('/')
  const fixtureTask = page.getByText('E2E fixture — today task').first()
  await expect(fixtureTask).toBeVisible({ timeout: 45_000 })

  await context.setOffline(true)
  try {
    // Scope to the task row and click its complete control. The TaskCard
    // exposes a checkbox-like toggle. We use the row's closest interactive
    // ancestor as a click target.
    const row = fixtureTask.locator('xpath=ancestor::*[self::li or self::div][1]')
    const toggle = row.getByRole('checkbox').first()
    if (await toggle.count()) {
      await toggle.click()
    } else {
      // Fallback: click the row and look for a "Done" / complete button.
      await row.click()
      const doneBtn = page.getByRole('button', { name: /done|complete/i }).first()
      await doneBtn.click()
    }

    // Optimistic: the fixture text should leave Today within 5 s.
    await expect(page.getByText('E2E fixture — today task').first()).toHaveCount(0, {
      timeout: 5_000,
    })
  } finally {
    await context.setOffline(false)
  }
})

import { expect, type Page } from '@playwright/test'

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

/**
 * Re-open a task we previously completed, used in spec finally blocks so
 * mutating tests don't leave the today fixture in `done` and break every
 * downstream spec anchored on `getByText('E2E fixture — today task')`.
 */
export async function restoreTaskStatus(
  page: Page,
  fixtureText: string,
  restoreStatus: 'open' | 'in_progress' = 'open',
): Promise<void> {
  // The completed task is no longer on Today — navigate to /closed where
  // done tasks appear so we can click into the modal.
  await page.goto('/closed')
  await openDetailModal(page, fixtureText)
  await setStatus(page, restoreStatus)
  await clickUpdate(page)
  // Return to Today so subsequent specs (or chained restore steps) start
  // from the same baseline navigation as the seed fixture.
  await page.goto('/')
}

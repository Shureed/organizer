import { test, expect } from '@playwright/test'

/**
 * Flip-over scenario 3: JOIN COLS POPULATED
 *
 * Maps to smoke-slices.mjs step 3 — "joinColsPopulated.nullJoinRows === 0.
 * Confirms project_name / space_name / space_path are not NULL on active
 * tasks."
 *
 * The seeded today task lives under the seeded project
 * (1d13ff37-d367-4aa3-ac4a-985fcec79b63). If its join columns are populated
 * in SQLite, the TaskCard must render the project chip text. We assert on
 * the UI-visible project label next to the fixture task.
 *
 * Assumption flag (see PR body): we rely on the seeded project name being
 * rendered inline on the task row. If the UI changes to hide project names
 * inline, this spec needs to switch to a different user-visible signal or
 * to an app-exposed probe.
 */
test('active task shows populated project join column from SQLite', async ({ page }) => {
  await page.goto('/')

  const fixtureTask = page.getByText('E2E fixture — today task').first()
  await expect(fixtureTask).toBeVisible({ timeout: 45_000 })

  // The seeded task's project is "E2E fixture project". If join cols are
  // populated, this label renders next to the task. If NULL, UI shows only
  // the task body with no project chip.
  const projectChip = page.getByText('E2E fixture project').first()
  await expect(projectChip).toBeVisible({ timeout: 10_000 })
})

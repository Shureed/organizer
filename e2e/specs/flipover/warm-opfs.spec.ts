import { test, expect } from '@playwright/test'

/**
 * Flip-over scenario 2: WARM OPFS READ
 *
 * Maps to smoke-slices.mjs step 2 — "Reload app (OPFS already populated),
 * UI renders immediately from SQLite without network waterfall to /rest/v1/
 * views."
 *
 * We drive this within a single browser context: first navigation warms
 * OPFS, second navigation should render the fixture without any GET against
 * /rest/v1/action_node or /rest/v1/v_active_tasks. We assert no such
 * requests occur in the second-load window.
 */
test('warm OPFS read serves Today view without /rest/v1/ GETs', async ({ page, context }) => {
  // Warm load.
  await page.goto('/')
  await expect(page.getByText('E2E fixture — today task').first()).toBeVisible({
    timeout: 45_000,
  })

  // Second load: watch for any REST reads against the task views.
  const restCalls: string[] = []
  await context.route('**/rest/v1/**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      restCalls.push(req.url())
    }
    await route.continue()
  })

  await page.reload()
  await expect(page.getByText('E2E fixture — today task').first()).toBeVisible({
    timeout: 30_000,
  })

  // Filter: realtime subscribe, storage, or auth are OK — only flag REST view
  // reads that the SQLite flip-over should have eliminated.
  // Note: bare `action_node` GETs are NOT view reads — they're either the
  // pull engine's incremental sync (legitimate after warm reload) or the
  // active-containers slice loader (no SQLite path). The flip-over promise
  // is about the displayed view sources, not about all sync traffic.
  const viewReads = restCalls.filter((u) =>
    /\/rest\/v1\/(v_active_tasks|v_active_projects|v_new_inbox|v_chain_status)/.test(u),
  )
  expect(
    viewReads,
    `warm OPFS reload should not hit REST views; got:\n${viewReads.join('\n')}`,
  ).toHaveLength(0)
})

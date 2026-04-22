import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for organizer e2e smoke tests.
 *
 * baseURL is the CF Pages preview URL, injected by .github/workflows/e2e.yml
 * from the triggering deployment_status event. No fallback: CI always sets it,
 * and running locally without it is a misuse we want to fail loudly.
 *
 * storageState is produced by global-setup.ts (one authenticated session for
 * the test-e2e user) and reused by every spec so we don't re-sign-in per test.
 *
 * Single worker + single retry keeps cross-run contention on the shared test
 * user low — concurrent writers could clobber each other's optimistic UI state.
 */
export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_PREVIEW_URL,
    storageState: './e2e/storageState.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

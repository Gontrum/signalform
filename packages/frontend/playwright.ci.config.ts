/**
 * Playwright configuration for CI.
 *
 * Strategy: build the frontend, serve it with `vite preview`, and intercept
 * all /api/ calls via the per-test mockApi helpers.  No real backend or LMS
 * is needed — live-backend journeys are excluded explicitly.
 *
 * Excluded journeys:
 *  - recovery-live-smoke.spec.ts  (requires a real LMS — documented as manual-only)
 *  - queue-editing-live.spec.ts   (skips automatically without a live backend, but
 *                                  excluded here to keep the CI run clean and fast)
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/journeys',
  testIgnore: [
    '**/recovery-live-smoke.spec.ts', // requires real LMS — manual only
    '**/queue-editing-live.spec.ts', // requires real LMS — skips automatically but excluded for speed
    '**/m017-i18n-enrichment.spec.ts', // requires real LMS + Last.fm — test.skip after await doesn't work in Playwright
  ],
  fullyParallel: false, // sequential for stability with mocked APIs
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Block the Service Worker so vite preview serves index.html for all
    // SPA routes (e.g. /queue, /settings). Without this the Workbox SW
    // intercepts navigations to un-cached routes and shows offline.html.
    serviceWorkers: 'block',
  },
  webServer: {
    // `vite preview` serves the production build — no backend or LMS needed.
    // The frontend must be built before this config is used (see CI step).
    command: 'pnpm vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

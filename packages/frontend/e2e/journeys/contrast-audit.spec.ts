/**
 * WCAG AA Color Contrast Audit (S02/M002)
 *
 * Runs axe-core color-contrast checks on key views using mocked APIs.
 * Requires: pnpm dev running on localhost:3000 (or webServer in playwright.config.ts).
 *
 * axe-core uses real browser computed styles — this is the only reliable way
 * to check color contrast (happy-dom/jsdom don't compute CSS).
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { setupApiMocks } from '../helpers/mockApi.ts'

test.describe('WCAG AA Color Contrast', () => {
  test('search view (home) has no color-contrast violations', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="search-input"]')

    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()

    expect(results.violations).toEqual([])
  })

  test('queue view has no color-contrast violations', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/queue')
    // waitForLoadState('networkidle') is avoided here: socket.io abort-retries
    // keep the network busy indefinitely when no backend is running in CI.
    await page.waitForSelector('[data-testid="queue-view"]')

    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()

    expect(results.violations).toEqual([])
  })
})

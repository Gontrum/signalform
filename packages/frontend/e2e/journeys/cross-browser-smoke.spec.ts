/**
 * Cross-Browser Smoke Test (S04/M003)
 *
 * Verifies basic app functionality in chromium, firefox, and webkit.
 * Runs against mocked APIs — no real backend needed.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks } from '../helpers/mockApi.ts'

test.describe('Cross-browser smoke test', () => {
  test('app loads and search input is visible', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="search-input"]')

    const input = page.locator('[data-testid="search-input"]')
    await expect(input).toBeVisible()
    await expect(input).toBeEnabled()
  })

  test('nav links render correctly', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="main-nav"]')

    await expect(page.locator('[data-testid="nav-search"]')).toBeVisible()
    await expect(page.locator('[data-testid="nav-library"]')).toBeVisible()
  })

  test('page title is correct', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')

    await expect(page).toHaveTitle('Signalform')

    const ogTitle = page.locator('meta[property="og:title"]')
    await expect(ogTitle).toHaveAttribute('content', 'Signalform Music Player')
  })

  test('no JavaScript errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    expect(errors).toHaveLength(0)
  })
})

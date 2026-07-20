/**
 * Phone Layout Verification (S02/M003)
 *
 * Verifies the app layout at 375px (phone) is single-column
 * with no side-by-side panels.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks } from '../helpers/mockApi.ts'

test.describe('Phone Layout (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('right panel is hidden on phone', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="search-input"]')

    const rightPanel = page.locator('[data-testid="right-panel"]')
    // Right panel should not be rendered on phone
    await expect(rightPanel).toHaveCount(0)
  })

  test('left panel is full width on phone', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="search-input"]')

    const leftPanel = page.locator('[data-testid="left-panel"]')
    const box = await leftPanel.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(370)
  })

  test('nav links are accessible on phone', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="bottom-nav"]')

    // On phone, primary navigation lives in the bottom tab bar, not the top nav.
    const bottomNav = page.locator('[data-testid="bottom-nav"]')
    await expect(bottomNav).toBeVisible()

    const searchLink = page.locator('[data-testid="bottom-nav-search"]')
    await expect(searchLink).toBeVisible()

    // The top-nav link row is not rendered on phone.
    await expect(page.locator('[data-testid="nav-links"]')).toHaveCount(0)
  })

  test('search input is visible and usable on phone', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="search-input"]')

    const input = page.locator('[data-testid="search-input"]')
    await expect(input).toBeVisible()

    const box = await input.boundingBox()
    // Input should span most of phone width
    expect(box?.width).toBeGreaterThan(300)
  })

  // Regression guard: the wide four-item top nav used to overflow the viewport
  // on phones (long German labels), producing an ugly horizontal scroll.
  for (const path of ['/', '/queue', '/library', '/settings']) {
    test(`no horizontal overflow on phone at ${path}`, async ({ page }) => {
      await setupApiMocks(page, {})
      await page.goto(path)
      await page.waitForSelector('[data-testid="left-panel"]')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
    })
  }
})

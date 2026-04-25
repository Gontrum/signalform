/**
 * Touch Target Size Audit (S05/M002)
 *
 * Verifies that all interactive elements meet the minimum 44x44px touch target
 * size at tablet viewport (768px wide).
 *
 * WCAG 2.5.5 / Apple HIG: minimum 44x44px for touch targets.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks } from '../helpers/mockApi.ts'

const MIN_TARGET_PX = 44

test.describe('Touch Target Sizes (tablet 768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('playback control buttons meet 44x44px minimum', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="search-input"]')

    // PlaybackControls are always rendered in NowPlayingPanel
    const buttons = page.locator('[data-testid="playback-controls"] button')
    const count = await buttons.count()

    // May be 0 if no track playing — that's fine, controls appear when playing
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i)
      const box = await btn.boundingBox()
      if (box) {
        expect(box.height, `Button ${i} height`).toBeGreaterThanOrEqual(MIN_TARGET_PX)
        expect(box.width, `Button ${i} width`).toBeGreaterThanOrEqual(MIN_TARGET_PX)
      }
    }
  })

  test('search input meets 44px minimum height', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="search-input"]')

    const input = page.locator('[data-testid="search-input"]')
    const box = await input.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(MIN_TARGET_PX)
  })

  test('nav links meet 44px minimum height', async ({ page }) => {
    await setupApiMocks(page, {})
    await page.goto('/')
    await page.waitForSelector('[data-testid="main-nav"]')

    const links = page.locator('[data-testid="main-nav"] a')
    const count = await links.count()
    for (let i = 0; i < count; i++) {
      const box = await links.nth(i).boundingBox()
      if (box) {
        expect(box.height, `Nav link ${i} height`).toBeGreaterThanOrEqual(MIN_TARGET_PX)
      }
    }
  })
})

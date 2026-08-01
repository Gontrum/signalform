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

  // Regression guard: the global bottom nav must be present on every route (it
  // used to live only in the Home layout, leaving other routes without phone
  // navigation), and the wide four-item nav must not overflow the viewport on
  // phones (long German labels once produced an ugly horizontal scroll).
  for (const path of ['/', '/queue', '/library', '/settings']) {
    test(`bottom nav is visible with no horizontal overflow on phone at ${path}`, async ({
      page,
    }) => {
      await setupApiMocks(page, {})
      await page.goto(path)

      // The bottom nav is global, so it renders on every route — waiting on it
      // (instead of the Home-only left panel) also asserts the regression fix.
      await page.waitForSelector('[data-testid="bottom-nav"]')
      await expect(page.locator('[data-testid="bottom-nav"]')).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
    })
  }

  // The library filter block once measured 580px on a phone and pushed the album
  // grid to y=908 in an 844px viewport — not one cover was visible, and every
  // unit and E2E test stayed green because none of them measured actual height.
  // These two cases are that missing measurement.
  const sixAlbums = {
    albums: Array.from({ length: 6 }, (_, index) => ({
      id: String(index + 1),
      title: `Album ${index + 1}`,
      artist: 'Local Artist',
      trackCount: 3,
      coverArtUrl: 'http://localhost:3000/music/1/cover.jpg',
      releaseYear: 2020,
      genre: null,
    })),
    hasMore: false,
  }

  test('library album grid starts inside the viewport on phone', async ({ page }) => {
    await setupApiMocks(page, { libraryAlbums: sixAlbums })
    await page.goto('/library')
    await page.waitForSelector('[data-testid="album-grid"]')

    const view = page.locator('[data-testid="library-view"]')
    const viewBox = await view.boundingBox()
    const cardBox = await page.locator('[data-testid="album-card"]').first().boundingBox()
    expect(viewBox).not.toBeNull()
    expect(cardBox).not.toBeNull()

    // Nothing has been scrolled — this is what the user sees on arrival.
    expect(await view.evaluate((el) => el.scrollTop)).toBe(0)

    const viewBottom = (viewBox?.y ?? 0) + (viewBox?.height ?? 0)
    const cardBottom = (cardBox?.y ?? 0) + (cardBox?.height ?? 0)
    expect(cardBox?.y ?? 0).toBeGreaterThanOrEqual(viewBox?.y ?? 0)
    expect(cardBottom).toBeLessThanOrEqual(viewBottom)
  })

  test('library filter chips stay on one scrollable line on phone', async ({ page }) => {
    await setupApiMocks(page, { libraryAlbums: sixAlbums })
    await page.goto('/library')
    await page.waitForSelector('[data-testid="genre-chips"]')

    for (const testId of ['sort-chip-row', 'decade-chip-row', 'genre-chips']) {
      const row = page.locator(`[data-testid="${testId}"]`)
      const box = await row.boundingBox()
      // A second wrapped line would put this past 88px (two 44px chips).
      expect(box?.height, `${testId} height`).toBeLessThan(70)
    }

    // All 20 genre chips stay reachable — the row scrolls instead of wrapping.
    const genreOverflow = await page
      .locator('[data-testid="genre-chips"]')
      .evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(genreOverflow).toBeGreaterThan(0)
  })
})

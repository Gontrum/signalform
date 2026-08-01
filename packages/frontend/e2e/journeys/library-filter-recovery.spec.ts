/**
 * Library: never stuck behind a rejected filter.
 *
 * Two production bugs in one journey:
 *  1. sessionStorage written by the old client-side browse still holds
 *     'recently-added' plus a real decade — a pair the backend answers with
 *     400. The restored pair went into the first request unreconciled, so the
 *     library stayed on "Unable to load library" across every reload.
 *  2. The error state hid the filter block, so the control that would undo the
 *     rejected filter was gone. Without DevTools there was no way back.
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { setupApiMocks } from '../helpers/mockApi.ts'

const albums = {
  albums: [
    {
      id: '1',
      title: 'Local Album',
      artist: 'Local Artist',
      trackCount: 3,
      coverArtUrl: 'http://localhost:3000/music/1/cover.jpg',
      releaseYear: 1994,
      genre: null,
    },
  ],
  totalCount: 1,
}

/** Mirrors backend `resolvePagination`: this pair is a 400, never a list. */
const rejectRecentlyAddedWithDecade = async (page: Page): Promise<void> => {
  await page.route(
    (url: URL) => url.pathname === '/api/library/albums',
    async (route) => {
      const params = new URL(route.request().url()).searchParams
      const decade = params.get('decade')

      if (params.get('sort') === 'recently-added' && decade !== null && decade !== 'all') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: "Sort 'recently-added' cannot be combined with the decade filter",
          }),
        })
        return
      }

      await route.fallback()
    },
  )
}

/** One decade the server cannot answer — an LMS timeout, not a client mistake. */
const failDecade = async (page: Page, failing: string): Promise<void> => {
  await page.route(
    (url: URL) => url.pathname === '/api/library/albums',
    async (route) => {
      if (new URL(route.request().url()).searchParams.get('decade') === failing) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'LMS not reachable' }),
        })
        return
      }

      await route.fallback()
    },
  )
}

const seedStoredFilters = async (page: Page, sort: string, decade: string): Promise<void> => {
  await page.addInitScript(
    ([storedSort, storedDecade]: readonly string[]) => {
      sessionStorage.setItem('library-sort-by', storedSort ?? '')
      sessionStorage.setItem('library-decade-filter', storedDecade ?? '')
    },
    [sort, decade] as const,
  )
}

test('library loads with a filter pair stored before the server-side browse', async ({ page }) => {
  await setupApiMocks(page, { libraryAlbums: albums })
  await rejectRecentlyAddedWithDecade(page)
  await seedStoredFilters(page, 'recently-added', '1990s')

  await page.goto('/library')

  await expect(page.getByTestId('album-grid')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('error-state')).toHaveCount(0)

  // The stored sort survives, the decade it cannot be combined with does not —
  // and the corrected value is what the next reload reads back.
  await expect(page.getByTestId('sort-chip-recently-added')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('decade-chip-all')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => sessionStorage.getItem('library-decade-filter'))).toBeNull()
})

test('a click leads out of the library error state back into a list', async ({ page }) => {
  await setupApiMocks(page, { libraryAlbums: albums })
  await failDecade(page, '1990s')
  // The stored decade is the one the server fails on, so the view opens in the
  // error state — with no way back if the controls go away with the album list.
  await seedStoredFilters(page, 'artist-az', '1990s')

  await page.goto('/library')
  await expect(page.getByTestId('error-state')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('album-grid')).toHaveCount(0)

  // The way out: the filter chips are still on screen next to the message.
  await expect(page.getByTestId('decade-chip-all')).toBeVisible()
  await expect(page.getByTestId('library-search-input')).toBeVisible()
  await page.getByTestId('decade-chip-all').click()

  await expect(page.getByTestId('album-grid')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('error-state')).toHaveCount(0)
  await expect(page.getByTestId('album-card')).toHaveCount(1)
})

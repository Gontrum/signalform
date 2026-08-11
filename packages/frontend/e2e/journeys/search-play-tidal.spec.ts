/**
 * Journey 2: Search → Play Tidal Track
 *
 * Asserts that playing a Tidal track from search results calls
 * POST /api/playback/play with a tidal:// URL.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks, captureRequest } from '../helpers/mockApi.ts'
import { tidalTrackSearchResponse, tidalTrack } from '../helpers/fixtures.ts'

test('Journey 2: search for a Tidal track and click Play → POST /api/playback/play with tidal:// URL', async ({
  page,
}) => {
  await setupApiMocks(page, { search: tidalTrackSearchResponse })

  await page.goto('/')

  const searchInput = page.getByTestId('search-input')
  await searchInput.fill('tidal test')

  const playRequestPromise = captureRequest(page, '/api/playback/play')
  await searchInput.press('Enter')

  await expect(page.getByTestId('full-results-list')).toBeVisible({
    timeout: 5000,
  })
  await expect(page.getByTestId(`result-item-${tidalTrack.id}`)).toBeVisible()

  await page.getByTestId(`play-button-${tidalTrack.id}`).click()

  const request = await playRequestPromise
  const body = request.postDataJSON() as { trackUrl?: string }
  expect(body.trackUrl).toBeDefined()
  expect(body.trackUrl).toContain('tidal://')
  expect(body.trackUrl).toBe(tidalTrack.url)
})

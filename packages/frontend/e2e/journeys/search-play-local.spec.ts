/**
 * Journey 1: Search → Play Local Track (AC2)
 *
 * Asserts that the full search → play flow works end-to-end for a local track.
 * Verifies POST /api/playback/play is called with a non-tidal:// URL.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks, captureRequest } from '../helpers/mockApi.ts'
import { localTrackSearchResponse, localTrack } from '../helpers/fixtures.ts'

test('Journey 1: search for a local track and click Play → POST /api/playback/play with local URL', async ({
  page,
}) => {
  // ── Setup ─────────────────────────────────────────────────────────────────
  await setupApiMocks(page, { search: localTrackSearchResponse })

  // ── Navigate to home screen ───────────────────────────────────────────────
  await page.goto('/')

  // ── Type search query ─────────────────────────────────────────────────────
  const searchInput = page.getByTestId('search-input')
  await searchInput.fill('test')

  // ── Trigger full search (Enter) ───────────────────────────────────────────
  const playRequestPromise = captureRequest(page, '/api/playback/play')
  await searchInput.press('Enter')

  // ── Wait for full results to appear ──────────────────────────────────────
  await expect(page.getByTestId('full-results-list')).toBeVisible({
    timeout: 5000,
  })
  await expect(page.getByTestId(`result-item-${localTrack.id}`)).toBeVisible()

  // ── Click Play on the local track ─────────────────────────────────────────
  await page.getByTestId(`play-button-${localTrack.id}`).click()

  // ── Assert POST /api/playback/play was called ─────────────────────────────
  const request = await playRequestPromise
  const body = request.postDataJSON() as { trackUrl?: string }
  expect(body.trackUrl).toBeDefined()
  expect(body.trackUrl).not.toContain('tidal://')
  expect(body.trackUrl).toBe(localTrack.url)
})

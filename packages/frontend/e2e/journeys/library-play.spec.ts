/**
 * Journey 4: Library → Open Album → Play (AC5)
 *
 * Story 9.3 regression guard: confirms Library link in main nav works,
 * album grid loads, clicking an album navigates to AlbumDetailView,
 * and clicking "Play Album" calls POST /api/playback/play-album.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks, captureRequest } from '../helpers/mockApi.ts'
import { libraryAlbumsResponse, albumDetailResponse } from '../helpers/fixtures.ts'

test('Journey 4: Library nav → album grid → click album → AlbumDetailView → Play Album → POST /api/playback/play-album', async ({
  page,
}) => {
  // ── Setup ─────────────────────────────────────────────────────────────────
  await setupApiMocks(page, {
    libraryAlbums: libraryAlbumsResponse,
    albumDetail: albumDetailResponse,
  })

  // ── Navigate to home screen first ────────────────────────────────────────
  await page.goto('/')

  // ── Click Library link in main nav ───────────────────────────────────────
  await expect(page.getByTestId('nav-library')).toBeVisible({ timeout: 3000 })
  await page.getByTestId('nav-library').click()

  // ── Wait for LibraryView to load with album grid ──────────────────────────
  await expect(page.getByTestId('library-view')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('album-grid')).toBeVisible({ timeout: 5000 })

  // ── Click the album card to navigate to AlbumDetailView ─────────────────
  // Filter by title rather than .first() to be resilient against multiple cards
  const albumCard = page
    .getByTestId('album-card')
    .filter({ hasText: libraryAlbumsResponse.albums[0]!.title })
  await expect(albumCard).toBeVisible()
  await albumCard.click()

  // ── Wait for AlbumDetailView ──────────────────────────────────────────────
  await expect(page.getByTestId('album-detail-view')).toBeVisible({
    timeout: 5000,
  })
  await expect(page.getByTestId('play-album-button')).toBeVisible({
    timeout: 5000,
  })

  // ── Click Play Album and assert the API call ──────────────────────────────
  const playAlbumRequestPromise = captureRequest(page, '/api/playback/play-album')
  await page.getByTestId('play-album-button').click()

  const request = await playAlbumRequestPromise
  const body = request.postDataJSON() as { albumId?: string }
  expect(body.albumId).toBe(libraryAlbumsResponse.albums[0]!.id)
})

/**
 * Journey 3: Album Detail → Play Album
 *
 * Two scenarios:
 * - Local album: Search → click album card → AlbumDetailView → Play Album
 *   → asserts POST /api/playback/play-album
 * - Tidal album: Search → click play-track-list button
 *   → asserts POST /api/playback/play-tidal-search-album
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks, captureRequest } from '../helpers/mockApi.ts'
import {
  localAlbumSearchResponse,
  tidalAlbumSearchResponse,
  albumDetailResponse,
  localAlbumSearchResult,
  tidalAlbumSearchResult,
} from '../helpers/fixtures.ts'

test('Journey 3a: click local album in search → navigate to AlbumDetailView → Play Album → POST /api/playback/play-album', async ({
  page,
}) => {
  await setupApiMocks(page, {
    search: localAlbumSearchResponse,
    albumDetail: albumDetailResponse,
  })

  await page.goto('/')
  const searchInput = page.getByTestId('search-input')
  await searchInput.fill('local album')
  await searchInput.press('Enter')

  await expect(page.getByTestId('full-results-list')).toBeVisible({
    timeout: 5000,
  })
  await expect(page.getByTestId(`album-result-item-${localAlbumSearchResult.id}`)).toBeVisible()

  await page.getByTestId(`album-result-item-${localAlbumSearchResult.id}`).click()

  await expect(page.getByTestId('album-detail-view')).toBeVisible({
    timeout: 5000,
  })
  await expect(page.getByTestId('play-album-button')).toBeVisible({
    timeout: 5000,
  })

  const playAlbumRequestPromise = captureRequest(page, '/api/playback/play-album')
  await page.getByTestId('play-album-button').click()

  const request = await playAlbumRequestPromise
  const body = request.postDataJSON() as { albumId?: string }
  expect(body.albumId).toBe(localAlbumSearchResult.albumId)
})

test('Journey 3b: click Tidal album play button in search → POST /api/playback/play-tidal-search-album', async ({
  page,
}) => {
  await setupApiMocks(page, { search: tidalAlbumSearchResponse })

  await page.goto('/')
  const searchInput = page.getByTestId('search-input')
  await searchInput.fill('tidal album')
  await searchInput.press('Enter')

  await expect(page.getByTestId('full-results-list')).toBeVisible({
    timeout: 5000,
  })
  await expect(page.getByTestId(`album-result-item-${tidalAlbumSearchResult.id}`)).toBeVisible()

  const playTidalRequestPromise = captureRequest(page, '/api/playback/play-tidal-search-album')
  // The id suffix is not optional here: AlbumActionButtons renders the button as
  // play-album-button-{id}, unlike the bare play-album-button in AlbumDetailView.
  await page.getByTestId(`play-album-button-${tidalAlbumSearchResult.id}`).click()

  const request = await playTidalRequestPromise
  const body = request.postDataJSON() as {
    albumTitle?: string
    artist?: string
    trackUrls?: string[]
  }
  expect(body.albumTitle).toBe(tidalAlbumSearchResult.title)
  expect(body.artist).toBe(tidalAlbumSearchResult.artist)
  expect(body.trackUrls).toEqual(tidalAlbumSearchResult.trackUrls)
})

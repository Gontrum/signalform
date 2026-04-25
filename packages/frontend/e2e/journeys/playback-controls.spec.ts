/**
 * Journey: Playback Controls (H.1)
 *
 * Tests the core playback control user journeys end-to-end:
 * - Pause / Resume
 * - Next / Previous track
 * - Volume control
 *
 * Strategy:
 * - The app is started with a mocked /api/playback/status that returns "playing"
 *   so the Now Playing panel and transport controls are in their active state.
 * - External APIs (LMS, socket.io) are fully mocked via setupApiMocks().
 * - We use captureRequest() to assert that the correct HTTP calls are made.
 * - We do NOT assert on LMS side effects — that is covered by backend integration tests.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks, captureRequest } from '../helpers/mockApi.ts'

// ── Fixtures ───────────────────────────────────────────────────────────────────

const playingStatusResponse = {
  status: 'playing',
  currentTime: 42,
  trackDuration: 240,
  volume: 70,
  currentTrack: {
    id: 'track-1',
    title: 'Money',
    artist: 'Pink Floyd',
    album: 'Dark Side of the Moon',
    url: 'file:///music/money.flac',
    source: 'local',
    duration: 380,
  },
  queuePreview: [],
}

const pausedStatusResponse = {
  ...playingStatusResponse,
  status: 'paused',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Navigate to home and wait for playback controls to be visible.
 * Returns after the controls panel is confirmed in the DOM.
 */
const gotoWithPlaybackControls = async (
  page: Parameters<typeof setupApiMocks>[0],
  statusResponse: typeof playingStatusResponse,
): Promise<void> => {
  await setupApiMocks(page, { playbackStatus: statusResponse })
  await page.goto('/')
  await expect(page.getByTestId('playback-controls')).toBeVisible({ timeout: 5000 })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test('Journey H.1a: clicking Pause while playing → POST /api/playback/pause', async ({ page }) => {
  await gotoWithPlaybackControls(page, playingStatusResponse)

  const pauseRequestPromise = captureRequest(page, '/api/playback/pause')

  await page.getByTestId('play-pause-button').click()

  const request = await pauseRequestPromise
  expect(request.method()).toBe('POST')
})

test('Journey H.1b: clicking Play while paused → POST /api/playback/resume', async ({ page }) => {
  await gotoWithPlaybackControls(page, pausedStatusResponse)

  const resumeRequestPromise = captureRequest(page, '/api/playback/resume')

  await page.getByTestId('play-pause-button').click()

  const request = await resumeRequestPromise
  expect(request.method()).toBe('POST')
})

test('Journey H.1c: clicking Next → POST /api/playback/next', async ({ page }) => {
  await gotoWithPlaybackControls(page, playingStatusResponse)

  const nextRequestPromise = captureRequest(page, '/api/playback/next')

  await page.getByTestId('next-button').click()

  const request = await nextRequestPromise
  expect(request.method()).toBe('POST')
})

test('Journey H.1d: clicking Previous → POST /api/playback/previous', async ({ page }) => {
  await gotoWithPlaybackControls(page, playingStatusResponse)

  const previousRequestPromise = captureRequest(page, '/api/playback/previous')

  await page.getByTestId('previous-button').click()

  const request = await previousRequestPromise
  expect(request.method()).toBe('POST')
})

test('Journey H.1e: volume control group is visible with mute button', async ({ page }) => {
  await gotoWithPlaybackControls(page, playingStatusResponse)

  // Volume control group is rendered as a role="group" with aria-label
  const volumeGroup = page.getByRole('group', { name: 'Volume control' })
  await expect(volumeGroup).toBeVisible({ timeout: 3000 })

  // Mute button must be present and accessible
  const muteButton = volumeGroup.getByRole('button', { name: /mute/i })
  await expect(muteButton).toBeVisible()
})

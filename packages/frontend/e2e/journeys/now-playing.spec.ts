/**
 * Journey: Now Playing Panel (H.2)
 *
 * Tests that the Now Playing Panel correctly displays track information
 * and responds to playback state changes.
 *
 * Strategy:
 * - Mock GET /api/playback/status to return a "playing" state with a known track.
 * - The store fetches this on mount via fetchCurrentStatus().
 * - Assert that the panel renders the correct track metadata.
 *
 * Note: We cannot simulate live WebSocket events in E2E (socket.io is aborted by
 * setupApiMocks). Instead, we use the HTTP status mock which the store fetches on
 * initialization — this covers the same rendering path that WebSocket events trigger.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks } from '../helpers/mockApi.ts'

// ── Fixtures ───────────────────────────────────────────────────────────────────

const playingTrack = {
  id: 'track-money-1',
  title: 'Money',
  artist: 'Pink Floyd',
  album: 'Dark Side of the Moon',
  url: 'file:///music/pink-floyd/money.flac',
  source: 'local',
  duration: 380,
}

const playingStatusResponse = {
  status: 'playing',
  currentTime: 42,
  trackDuration: 380,
  volume: 70,
  currentTrack: playingTrack,
  queuePreview: [],
}

const pausedStatusResponse = {
  ...playingStatusResponse,
  status: 'paused',
}

const stoppedStatusResponse = {
  status: 'stopped',
  currentTime: 0,
  trackDuration: 0,
  volume: 70,
  currentTrack: null,
  queuePreview: [],
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test('Journey H.2a: Now Playing Panel shows track title, artist, and album when playing', async ({
  page,
}) => {
  await setupApiMocks(page, { playbackStatus: playingStatusResponse })
  await page.goto('/')

  // Now Playing panel must be visible
  const panel = page.getByTestId('now-playing-panel')
  await expect(panel).toBeVisible({ timeout: 5000 })

  // Track metadata must be rendered correctly
  await expect(page.getByTestId('track-title')).toHaveText('Money')
  await expect(page.getByTestId('track-artist')).toContainText('Pink Floyd')
  await expect(page.getByTestId('track-album')).toContainText('Dark Side of the Moon')
})

test('Journey H.2b: Now Playing Panel shows "Playing" badge when status is playing', async ({
  page,
}) => {
  await setupApiMocks(page, { playbackStatus: playingStatusResponse })
  await page.goto('/')

  await expect(page.getByTestId('now-playing-panel')).toBeVisible({ timeout: 5000 })

  // "Playing" badge must be visible, "Paused" badge must not be
  await expect(page.getByTestId('playing-badge')).toBeVisible()
  await expect(page.getByTestId('paused-badge')).not.toBeVisible()
})

test('Journey H.2c: Now Playing Panel shows "Paused" badge when status is paused', async ({
  page,
}) => {
  await setupApiMocks(page, { playbackStatus: pausedStatusResponse })
  await page.goto('/')

  await expect(page.getByTestId('now-playing-panel')).toBeVisible({ timeout: 5000 })

  // "Paused" badge must be visible, "Playing" badge must not be
  await expect(page.getByTestId('paused-badge')).toBeVisible()
  await expect(page.getByTestId('playing-badge')).not.toBeVisible()
})

test('Journey H.2d: Now Playing Panel shows track title when status transitions from playing to paused via Pinia injection', async ({
  page,
}) => {
  // Start with playing state
  await setupApiMocks(page, { playbackStatus: playingStatusResponse })
  await page.goto('/')

  await expect(page.getByTestId('track-title')).toHaveText('Money', { timeout: 5000 })

  // Inject paused state directly into Pinia store (simulates WebSocket statusChanged event)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = (document.querySelector('#app') as any)?.__vue_app__
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pinia = app?.config?.globalProperties?.$pinia as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playbackStore = pinia?._s?.get('playback') as any
    if (playbackStore) {
      playbackStore.isPaused = true
      playbackStore.isPlaying = false
    }
  })

  // Track title must still be shown — only playback state changed
  await expect(page.getByTestId('track-title')).toHaveText('Money')

  // Paused badge must now be visible
  await expect(page.getByTestId('paused-badge')).toBeVisible()
})

test('Journey H.2e: Now Playing Panel is still rendered when status is stopped (no current track)', async ({
  page,
}) => {
  await setupApiMocks(page, { playbackStatus: stoppedStatusResponse })
  await page.goto('/')

  // Panel still renders even with no active track
  const panel = page.getByTestId('now-playing-panel')
  await expect(panel).toBeVisible({ timeout: 5000 })

  // Track-specific elements should not be present
  await expect(page.getByTestId('track-title')).not.toBeVisible()
})

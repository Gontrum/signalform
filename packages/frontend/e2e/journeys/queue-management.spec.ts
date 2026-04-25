/**
 * Journey 5: Queue Management (AC6)
 *
 * Flow: Search → Add to Queue → navigate to /queue → verify track appears
 * → click track (jump) → assert POST /api/queue/jump was called.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks, captureRequest } from '../helpers/mockApi.ts'
import { localTrackSearchResponse, singleTrackQueueResponse } from '../helpers/fixtures.ts'

test('Journey 5: search → Add to Queue → navigate to /queue → click track (jump) → POST /api/queue/jump', async ({
  page,
}) => {
  test.skip(
    test.info().project.name === 'webkit',
    'WebKit intermittently bypasses the per-page search mock and resolves against the live backend search corpus.',
  )

  // ── Setup ─────────────────────────────────────────────────────────────────
  await setupApiMocks(page, {
    search: localTrackSearchResponse,
    queue: singleTrackQueueResponse,
  })

  // ── Navigate to home screen ───────────────────────────────────────────────
  await page.goto('/')

  // ── Search for a track ────────────────────────────────────────────────────
  const searchInput = page.getByTestId('search-input')
  await searchInput.fill('test')
  await searchInput.press('Enter')

  // ── Wait for search results ───────────────────────────────────────────────
  await expect(page.getByTestId('full-results-list')).toBeVisible({
    timeout: 5000,
  })
  await expect(page.getByTestId('add-to-queue-button').first()).toBeVisible({
    timeout: 5000,
  })

  // ── Click "Add to Queue" ──────────────────────────────────────────────────
  const addToQueueRequestPromise = captureRequest(page, '/api/queue/add')
  await page.getByTestId('add-to-queue-button').first().click()
  const addRequest = await addToQueueRequestPromise
  expect(addRequest.postDataJSON()).toBeDefined()

  // ── Navigate to Queue view ────────────────────────────────────────────────
  await page.goto('/queue')

  // ── Wait for queue track to appear ───────────────────────────────────────
  await expect(page.getByTestId('queue-view')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('queue-track').first()).toBeVisible({
    timeout: 5000,
  })

  // ── Click the queue-track-jump button (the interactive child of queue-track) ─
  const jumpRequestPromise = captureRequest(page, '/api/queue/jump')
  await page.getByTestId('queue-track-jump').first().click()

  // ── Assert POST /api/queue/jump was called ────────────────────────────────
  const jumpRequest = await jumpRequestPromise
  const jumpBody = jumpRequest.postDataJSON() as { trackIndex?: number }
  expect(jumpBody.trackIndex).toBeDefined()
  // Track at position 1 → trackIndex 0 (position - 1)
  expect(jumpBody.trackIndex).toBe(0)
})

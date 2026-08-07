/**
 * Queue Editing Live Tests — require a real LMS backend.
 *
 * These tests skip automatically when no live backend is available
 * (checked via isLiveBackendAvailable()). They are designed to run
 * against a real local LMS stack for manual pre-release verification.
 *
 * A run changes the running household system, not a fixture: the setup appends
 * tracks to the real queue and removes them again, switches radio mode on (the
 * radio test) or off (the local test, which also deletes the upcoming radio
 * segment), and can make real speakers resume, because radio replenishment
 * starts a stopped player. The afterEach hook restores that baseline — playback
 * paused, radio mode off, every track the run put into the queue swept out —
 * including after a failing test. Playback position it cannot rewind.
 *
 * The WebKit test.skip in queue-management.spec.ts is a known issue:
 * WebKit intermittently bypasses per-page route mocks and resolves
 * against the live backend search corpus. This is a Playwright/WebKit
 * mock isolation limitation — not a product bug. Chromium and Firefox
 * are the primary targets for the mocked E2E suite.
 */
import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import {
  countRadioTracks,
  ensureQueueEditingState,
  fetchLiveQueue,
  fetchLiveQueueProjection,
  fetchQueueDomSnapshot,
  isLiveBackendAvailable,
  isRadioTrack,
  restoreLiveQueueBaseline,
  waitForQueueBusyToClear,
  waitForQueueDomToMatchApi,
  type LiveQueueTrackSnapshot,
} from '../helpers/fixtures.ts'

const countUserTracks = (tracks: readonly LiveQueueTrackSnapshot[]): number =>
  tracks.filter((track) => !isRadioTrack(track)).length

const expectQueueTrackCount = async (
  page: Parameters<typeof fetchQueueDomSnapshot>[0],
  expectedCount: number,
): Promise<void> => {
  await expect
    .poll(async () => (await fetchQueueDomSnapshot(page)).rowCount, {
      message: `Expected queue DOM row count to settle at ${String(expectedCount)}`,
      timeout: 15_000,
    })
    .toBe(expectedCount)
}

const skipUnlessLiveBackendAvailable = async (request: APIRequestContext): Promise<void> => {
  test.skip(
    !(await isLiveBackendAvailable(request)),
    'Live backend is not available at PLAYWRIGHT_LIVE_BACKEND_URL/http://127.0.0.1:3001',
  )
}

test.describe('Live queue editing proof', () => {
  // afterEach, not afterAll: a failing radio test must not hand the next test —
  // or the household — a queue with radio mode still on.
  test.afterEach(async ({ request }) => {
    await restoreLiveQueueBaseline(request)
  })

  test('removes a live queue track and keeps queue DOM settled against the real local stack', async ({
    page,
    request,
  }) => {
    await skipUnlessLiveBackendAvailable(request)

    const setup = await ensureQueueEditingState({
      page,
      request,
      scenario: 'user-track-removal',
    })

    expect(setup.initialQueue.length).toBeGreaterThan(0)
    expect(setup.browserQueue.rowCount).toBeGreaterThan(0)
    expect(setup.browserQueue.busyTrackIds).toEqual([])

    const beforeQueue = await fetchLiveQueue(request)
    const removeTarget = setup.removableTrack
    expect(isRadioTrack(removeTarget)).toBe(false)
    expect(removeTarget.isCurrent).toBe(false)

    const removeRow = page.locator(
      `[data-testid="queue-track"][data-track-id="${removeTarget.id}"]`,
    )
    await expect(removeRow).toBeVisible({ timeout: 15_000 })

    const removeButton = removeRow.getByTestId('queue-track-remove')
    await removeButton.click()

    await expect(removeRow).toHaveAttribute('data-busy', 'true', { timeout: 5_000 })
    await waitForQueueBusyToClear(page)

    const afterQueue = await fetchLiveQueue(request)
    const beforeRadioTrackCount = countRadioTracks(beforeQueue)

    expect(afterQueue.some((track) => track.id === removeTarget.id)).toBe(false)
    // The user segment must lose exactly the removed track; the radio segment is
    // free to replenish underneath, which is why the raw length cannot be asserted.
    expect(countUserTracks(afterQueue)).toBe(countUserTracks(beforeQueue) - 1)
    if (beforeRadioTrackCount === 0) {
      expect(afterQueue.length).toBe(beforeQueue.length - 1)
    } else {
      expect(countRadioTracks(afterQueue)).toBeGreaterThanOrEqual(beforeRadioTrackCount - 1)
    }

    await waitForQueueDomToMatchApi(page, request)
    await expectQueueTrackCount(page, afterQueue.length)
    await expect(page.getByTestId('queue-mutation-error')).toHaveCount(0)
  })

  test('removes a live radio track and keeps radio boundary coherence after replenishment', async ({
    page,
    request,
  }) => {
    await skipUnlessLiveBackendAvailable(request)

    const setup = await ensureQueueEditingState({
      page,
      request,
      scenario: 'radio-track-removal',
    })

    const beforeQueue = await fetchLiveQueue(request)
    const beforeRadioTrackCount = countRadioTracks(beforeQueue)
    const radioTarget = setup.removableTrack
    expect(isRadioTrack(radioTarget)).toBe(true)
    expect(radioTarget.isCurrent).toBe(false)

    const radioRow = page.locator(`[data-testid="queue-track"][data-track-id="${radioTarget.id}"]`)
    await expect(radioRow).toBeVisible({ timeout: 15_000 })

    await radioRow.getByTestId('queue-track-remove').click()
    await expect(radioRow).toHaveAttribute('data-busy', 'true', { timeout: 5_000 })
    await waitForQueueBusyToClear(page)

    // Replenishment is asynchronous, so poll rather than reading the queue once.
    await expect
      .poll(async () => countRadioTracks(await fetchLiveQueue(request)), {
        message: 'Expected radio mode to replenish the radio segment after the removal',
        timeout: 20_000,
      })
      .toBeGreaterThan(0)

    const afterQueue = await fetchLiveQueue(request)
    expect(afterQueue.some((track) => track.id === radioTarget.id)).toBe(false)
    expect(countRadioTracks(afterQueue)).toBeGreaterThanOrEqual(beforeRadioTrackCount - 1)

    const settledDom = await waitForQueueDomToMatchApi(page, request)
    const settledProjection = await fetchLiveQueueProjection(request)
    const firstRadioIndex = settledProjection.tracks.findIndex(isRadioTrack)

    expect(settledProjection.radioModeActive).toBe(true)
    expect(settledProjection.radioBoundaryIndex).toBe(firstRadioIndex)
    expect(settledDom.radioBoundaryVisible).toBe(true)
    // Stronger than matching the separator caption — and immune to the UI language:
    // the separator has to sit exactly where the first radio-added track starts.
    expect(settledDom.radioBoundaryIndex).toBe(firstRadioIndex)
    await expect(page.getByTestId('queue-mutation-error')).toHaveCount(0)
  })
})

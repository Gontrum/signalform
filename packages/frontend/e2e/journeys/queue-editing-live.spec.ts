/**
 * Queue Editing Live Tests — require a real LMS backend.
 *
 * These tests skip automatically when no live backend is available
 * (checked via isLiveBackendAvailable()). They are designed to run
 * against a real local LMS stack for manual pre-release verification.
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
  ensureQueueEditingState,
  fetchLiveQueue,
  fetchQueueDomSnapshot,
  isLiveBackendAvailable,
  waitForQueueBusyToClear,
  waitForQueueDomToMatchApi,
} from '../helpers/fixtures.ts'

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
  test('removes a live queue track and keeps queue DOM settled against the real local stack', async ({
    page,
    request,
  }) => {
    await skipUnlessLiveBackendAvailable(request)

    const setup = await ensureQueueEditingState({ page, request })

    expect(setup.initialQueue.length).toBeGreaterThan(0)
    expect(setup.browserQueue.rowCount).toBeGreaterThan(0)
    expect(setup.browserQueue.busyTrackIds).toEqual([])

    const beforeQueue = await fetchLiveQueue(request)
    const removeTarget =
      beforeQueue.find(
        (track) =>
          track.isCurrent === false && track.source !== 'tidal' && track.source !== 'qobuz',
      ) ??
      beforeQueue.find((track) => track.source !== 'tidal' && track.source !== 'qobuz') ??
      beforeQueue[0]
    expect(removeTarget).toBeDefined()

    const removeRow = page.locator(
      `[data-testid="queue-track"][data-track-id="${removeTarget?.id ?? ''}"]`,
    )
    await expect(removeRow).toBeVisible({ timeout: 15_000 })

    const removeButton = removeRow.getByTestId('queue-track-remove')
    await removeButton.click()

    await expect(removeRow).toHaveAttribute('data-busy', 'true', { timeout: 5_000 })
    await waitForQueueBusyToClear(page)

    const afterQueue = await fetchLiveQueue(request)
    const beforeRadioTrackCount = beforeQueue.filter(
      (track) => track.source === 'tidal' || track.source === 'qobuz',
    ).length
    const afterRadioTrackCount = afterQueue.filter(
      (track) => track.source === 'tidal' || track.source === 'qobuz',
    ).length

    expect(afterQueue.some((track) => track.id === removeTarget?.id)).toBe(false)
    expect(afterQueue.length).toBeLessThanOrEqual(beforeQueue.length)
    if (beforeRadioTrackCount === 0) {
      expect(afterQueue.length).toBe(beforeQueue.length - 1)
    } else {
      expect(afterRadioTrackCount).toBeGreaterThanOrEqual(beforeRadioTrackCount - 1)
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

    const setup = await ensureQueueEditingState({ page, request })

    test.skip(
      setup.removableRadioTrack === null,
      'Live stack did not expose a removable radio track',
    )

    const beforeQueue = await fetchLiveQueue(request)
    const beforeRadioTrackCount = beforeQueue.filter(
      (track) => track.source === 'tidal' || track.source === 'qobuz',
    ).length
    const radioTarget = setup.removableRadioTrack
    expect(radioTarget).not.toBeNull()

    const radioRow = page.locator(
      `[data-testid="queue-track"][data-track-id="${radioTarget?.id ?? ''}"]`,
    )
    await expect(radioRow).toBeVisible({ timeout: 15_000 })

    await radioRow.getByTestId('queue-track-remove').click()
    await expect(radioRow).toHaveAttribute('data-busy', 'true', { timeout: 5_000 })
    await waitForQueueBusyToClear(page)

    const afterQueue = await fetchLiveQueue(request)
    const afterRadioTrackCount = afterQueue.filter(
      (track) => track.source === 'tidal' || track.source === 'qobuz',
    ).length

    expect(afterQueue.some((track) => track.id === radioTarget?.id)).toBe(false)
    expect(afterRadioTrackCount).toBeGreaterThan(0)
    expect(afterRadioTrackCount).toBeGreaterThanOrEqual(beforeRadioTrackCount - 1)

    const settledDom = await waitForQueueDomToMatchApi(page, request)
    expect(settledDom.rowCount).toBe(afterQueue.length)
    expect(settledDom.radioBoundaryVisible).toBe(true)
    expect(settledDom.radioBoundaryText).toContain('Radio Mode')
    await expect(page.getByTestId('queue-mutation-error')).toHaveCount(0)
  })
})

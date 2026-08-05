/**
 * Guards the helpers that only the live queue journeys use.
 *
 * queue-editing-live.spec.ts skips itself whenever no LMS answers, so a
 * translated selector inside its helpers stays invisible until someone happens
 * to have a live stack — which is how `getByRole('heading', { name: 'Queue' })`
 * survived a dev config switched to `language: de`. This spec drives the very
 * same helpers against a mocked German UI, on every run.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks } from '../helpers/mockApi.ts'
import { setRadioBoundaryIndex } from '../helpers/mockSocket.ts'
import {
  fetchQueueDomSnapshot,
  radioQueueResponse,
  waitForQueueViewRoute,
} from '../helpers/fixtures.ts'

const openGermanQueue = async (page: import('@playwright/test').Page): Promise<void> => {
  await setupApiMocks(page, { queue: radioQueueResponse, config: { language: 'de' } })
  await page.goto('/queue')
}

test.describe('Live queue helpers survive a non-English UI', () => {
  test('waitForQueueViewRoute settles on a German queue view', async ({ page }) => {
    await openGermanQueue(page)

    // Proves the UI really is in the other language — without this the rest
    // of the spec would also pass against an English build.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Warteschlange')

    await waitForQueueViewRoute(page)
  })

  test('queue DOM snapshot reports the radio separator position, not its caption', async ({
    page,
  }) => {
    await openGermanQueue(page)
    await expect(page.getByTestId('queue-track')).toHaveCount(3, { timeout: 5000 })

    const beforeBoundary = await fetchQueueDomSnapshot(page)
    expect(beforeBoundary.radioBoundaryVisible).toBe(false)
    expect(beforeBoundary.radioBoundaryIndex).toBeNull()

    await setRadioBoundaryIndex(page, 2)
    await expect(page.getByTestId('radio-boundary')).toBeVisible({ timeout: 3000 })

    const afterBoundary = await fetchQueueDomSnapshot(page)
    expect(afterBoundary.rowCount).toBe(3)
    expect(afterBoundary.radioBoundaryVisible).toBe(true)
    expect(afterBoundary.radioBoundaryIndex).toBe(2)
    expect(afterBoundary.rows.map((row) => row.trackId)).toEqual(['q-1', 'q-2', 'q-3'])
  })
})

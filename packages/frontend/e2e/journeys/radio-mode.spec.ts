/**
 * Journey 6: Radio Mode E2E (AC7)
 *
 * Flow: mock GET /api/queue with 3 tracks → navigate to /queue → wait for
 * 3 queue-track items → inject radioBoundaryIndex=2 via page.evaluate()
 * → assert data-testid="radio-boundary" is visible.
 */
import { test, expect } from '@playwright/test'
import { setupApiMocks } from '../helpers/mockApi.ts'
import { setRadioBoundaryIndex } from '../helpers/mockSocket.ts'
import { radioQueueResponse } from '../helpers/fixtures.ts'

test('Journey 6: radio mode boundary separator appears when radioBoundaryIndex=2 is set in Pinia store', async ({
  page,
}) => {
  // ── Setup ─────────────────────────────────────────────────────────────────
  await setupApiMocks(page, { queue: radioQueueResponse })

  // ── Navigate directly to /queue ───────────────────────────────────────────
  await page.goto('/queue')

  // ── Wait for all 3 queue tracks to appear ────────────────────────────────
  await expect(page.getByTestId('queue-view')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('queue-track')).toHaveCount(3, {
    timeout: 5000,
  })

  // ── Inject radioBoundaryIndex=2 into Pinia queue store ────────────────────
  await setRadioBoundaryIndex(page, 2)

  // ── Assert radio-boundary separator is now visible ────────────────────────
  await expect(page.getByTestId('radio-boundary')).toBeVisible({
    timeout: 3000,
  })
})

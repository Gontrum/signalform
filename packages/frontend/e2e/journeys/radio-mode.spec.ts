/**
 * Journey 6: Radio Mode E2E
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
  await setupApiMocks(page, { queue: radioQueueResponse })

  await page.goto('/queue')

  await expect(page.getByTestId('queue-view')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('queue-track')).toHaveCount(3, {
    timeout: 5000,
  })

  await setRadioBoundaryIndex(page, 2)

  await expect(page.getByTestId('radio-boundary')).toBeVisible({
    timeout: 3000,
  })
})

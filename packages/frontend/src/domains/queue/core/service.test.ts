import { describe, expect, it } from 'vitest'
import {
  getQueueEntryKey,
  getQueueAutoScrollDelta,
  getQueueDropPosition,
  getQueueDropIndicatorLabel,
} from './service'

describe('queue core reorder helpers', () => {
  it('returns after when dragging downward onto a later row', () => {
    expect(getQueueDropPosition(3, 1)).toBe('after')
  })

  it('returns before when dragging upward onto an earlier row', () => {
    expect(getQueueDropPosition(1, 3)).toBe('before')
  })

  it('returns null when drag target is not a real reorder target', () => {
    expect(getQueueDropPosition(2, 2)).toBeNull()
    expect(getQueueDropPosition(null, 2)).toBeNull()
  })

  it('maps drop position to the correct helper label', () => {
    expect(
      getQueueDropIndicatorLabel(3, 3, 1, {
        before: 'before',
        after: 'after',
      }),
    ).toBe('after')

    expect(
      getQueueDropIndicatorLabel(1, 1, 3, {
        before: 'before',
        after: 'after',
      }),
    ).toBe('before')
  })

  it('computes upward auto-scroll near the top edge', () => {
    expect(
      getQueueAutoScrollDelta(108, 100, 500, {
        thresholdPx: 40,
        maxStepPx: 20,
      }),
    ).toBeLessThan(0)
  })

  it('computes downward auto-scroll near the bottom edge', () => {
    expect(
      getQueueAutoScrollDelta(492, 100, 500, {
        thresholdPx: 40,
        maxStepPx: 20,
      }),
    ).toBeGreaterThan(0)
  })

  it('returns zero in the safe middle zone', () => {
    expect(
      getQueueAutoScrollDelta(250, 100, 500, {
        thresholdPx: 40,
        maxStepPx: 20,
      }),
    ).toBe(0)
  })

  it('builds a position-specific queue entry key for duplicate track ids', () => {
    expect(
      getQueueEntryKey({
        id: 'shared-id',
        position: 4,
        title: 'Cold Hearted',
        artist: 'Paula Abdul',
        album: 'Forever Your Girl',
        duration: 231,
        isCurrent: false,
      }),
    ).toBe('4:shared-id')
  })
})

import { describe, expect, it } from 'vitest'
import {
  deriveRadioBoundaryIndex,
  getQueueEntryKey,
  getQueueAutoScrollDelta,
  getQueueDropHalf,
  getQueueDropPosition,
  getQueueDropIndicatorLabel,
  getQueueReorderTargetIndex,
  reorderQueueTracks,
} from './service'
import type { QueueTrack } from '@signalform/shared'
import type { QueueDropPosition } from './types'

const buildTracks = (ids: readonly string[]): readonly QueueTrack[] =>
  ids.map((id, index) => ({
    id,
    position: index + 1,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Album',
    duration: 180,
    isCurrent: false,
  }))

describe('queue core reorder helpers', () => {
  it('resolves the upper row half to before', () => {
    expect(getQueueDropHalf(104, 100, 140)).toBe('before')
  })

  it('resolves the lower row half to after', () => {
    expect(getQueueDropHalf(136, 100, 140)).toBe('after')
  })

  it('resolves the exact midpoint to after', () => {
    expect(getQueueDropHalf(120, 100, 140)).toBe('after')
  })

  it('resolves degenerate row rects to after', () => {
    expect(getQueueDropHalf(120, 140, 140)).toBe('after')
    expect(getQueueDropHalf(120, 140, 100)).toBe('after')
  })

  it('keeps the plain midpoint behaviour without a previous half', () => {
    expect(getQueueDropHalf(119, 100, 140, null)).toBe('before')
    expect(getQueueDropHalf(121, 100, 140, null)).toBe('after')
  })

  it('keeps before when the pointer sits within the hysteresis band below the midpoint', () => {
    expect(getQueueDropHalf(125, 100, 140, 'before')).toBe('before')
  })

  it('flips to after once the pointer leaves the hysteresis band below the midpoint', () => {
    expect(getQueueDropHalf(129, 100, 140, 'before')).toBe('after')
  })

  it('keeps before at exactly midpoint plus hysteresis', () => {
    expect(getQueueDropHalf(128, 100, 140, 'before')).toBe('before')
  })

  it('keeps after when the pointer sits within the hysteresis band above the midpoint', () => {
    expect(getQueueDropHalf(115, 100, 140, 'after')).toBe('after')
  })

  it('flips to before once the pointer leaves the hysteresis band above the midpoint', () => {
    expect(getQueueDropHalf(111, 100, 140, 'after')).toBe('before')
  })

  it('resolves degenerate row rects to after regardless of the previous half', () => {
    expect(getQueueDropHalf(120, 140, 140, 'before')).toBe('after')
    expect(getQueueDropHalf(120, 140, 100, 'before')).toBe('after')
  })

  it('passes through the cursor half as the drop position', () => {
    expect(getQueueDropPosition(3, 1, 'after')).toBe('after')
    expect(getQueueDropPosition(3, 1, 'before')).toBe('before')
    expect(getQueueDropPosition(1, 3, 'before')).toBe('before')
    expect(getQueueDropPosition(1, 3, 'after')).toBe('after')
  })

  it('returns null when drag target is not a real reorder target', () => {
    expect(getQueueDropPosition(2, 2, 'before')).toBeNull()
    expect(getQueueDropPosition(null, 2, 'before')).toBeNull()
    expect(getQueueDropPosition(2, null, 'before')).toBeNull()
    expect(getQueueDropPosition(3, 1, null)).toBeNull()
  })

  it('returns null for the adjacency no-op cases that the commit logic skips', () => {
    expect(getQueueDropPosition(2, 1, 'before')).toBeNull()
    expect(getQueueDropPosition(1, 2, 'after')).toBeNull()
  })

  it('still passes through the half for adjacent rows when the drop is a real move', () => {
    expect(getQueueDropPosition(2, 1, 'after')).toBe('after')
    expect(getQueueDropPosition(3, 1, 'before')).toBe('before')
    expect(getQueueDropPosition(1, 2, 'before')).toBe('before')
    expect(getQueueDropPosition(0, 2, 'after')).toBe('after')
  })

  it('returns no label for an adjacency no-op drop', () => {
    expect(
      getQueueDropIndicatorLabel(2, 2, 1, 'before', {
        before: 'before',
        after: 'after',
      }),
    ).toBeNull()
  })

  it('reports a drop position exactly when the commit logic reports a target index', () => {
    const halves: readonly QueueDropPosition[] = ['before', 'after']
    const rowIndices = [0, 1, 2, 3]
    const combinations = rowIndices.flatMap((from) =>
      rowIndices.flatMap((over) => halves.map((half) => ({ from, over, half }))),
    )

    combinations.forEach(({ from, over, half }) => {
      const dropPosition = getQueueDropPosition(over, from, half)
      const targetIndex = getQueueReorderTargetIndex(from, over, half)
      expect(dropPosition === null).toBe(targetIndex === null)
    })
  })

  it('maps drop position to the correct helper label', () => {
    expect(
      getQueueDropIndicatorLabel(3, 3, 1, 'after', {
        before: 'before',
        after: 'after',
      }),
    ).toBe('after')

    expect(
      getQueueDropIndicatorLabel(3, 3, 1, 'before', {
        before: 'before',
        after: 'after',
      }),
    ).toBe('before')

    expect(
      getQueueDropIndicatorLabel(1, 1, 3, 'before', {
        before: 'before',
        after: 'after',
      }),
    ).toBe('before')
  })

  it('returns no label for rows that are not the drop target or without a half', () => {
    expect(
      getQueueDropIndicatorLabel(2, 3, 1, 'after', {
        before: 'before',
        after: 'after',
      }),
    ).toBeNull()

    expect(
      getQueueDropIndicatorLabel(3, 3, 1, null, {
        before: 'before',
        after: 'after',
      }),
    ).toBeNull()
  })

  it('returns null for all three reorder no-op cases', () => {
    expect(getQueueReorderTargetIndex(2, 2, 'before')).toBeNull()
    expect(getQueueReorderTargetIndex(2, 2, 'after')).toBeNull()
    expect(getQueueReorderTargetIndex(2, 3, 'before')).toBeNull()
    expect(getQueueReorderTargetIndex(2, 1, 'after')).toBeNull()
  })

  it('returns null for negative indices', () => {
    expect(getQueueReorderTargetIndex(-1, 2, 'before')).toBeNull()
    expect(getQueueReorderTargetIndex(2, -1, 'after')).toBeNull()
  })

  it('computes the target index when moving downward', () => {
    expect(getQueueReorderTargetIndex(1, 3, 'before')).toBe(2)
    expect(getQueueReorderTargetIndex(1, 3, 'after')).toBe(3)
  })

  it('computes the target index when moving upward', () => {
    expect(getQueueReorderTargetIndex(3, 1, 'before')).toBe(1)
    expect(getQueueReorderTargetIndex(3, 1, 'after')).toBe(2)
  })

  it('computes the target index for edge rows', () => {
    expect(getQueueReorderTargetIndex(0, 4, 'after')).toBe(4)
    expect(getQueueReorderTargetIndex(0, 4, 'before')).toBe(3)
    expect(getQueueReorderTargetIndex(4, 0, 'before')).toBe(0)
  })

  it('places the moved element exactly before the over element via reorderQueueTracks', () => {
    const tracks = buildTracks(['a', 'b', 'c', 'd', 'e'])
    const cases: readonly (readonly [number, number])[] = [
      [0, 2],
      [0, 4],
      [1, 3],
      [3, 1],
      [4, 0],
      [4, 2],
    ]

    cases.forEach(([from, over]) => {
      const overId = tracks[over]?.id
      const movedId = tracks[from]?.id
      const toIndex = getQueueReorderTargetIndex(from, over, 'before')
      expect(toIndex).not.toBeNull()
      if (toIndex === null) {
        return
      }

      const result = reorderQueueTracks(tracks, from, toIndex)
      const overResultIndex = result.findIndex((track) => track.id === overId)
      expect(result[overResultIndex - 1]?.id).toBe(movedId)
    })
  })

  it('places the moved element exactly after the over element via reorderQueueTracks', () => {
    const tracks = buildTracks(['a', 'b', 'c', 'd', 'e'])
    const cases: readonly (readonly [number, number])[] = [
      [0, 2],
      [0, 4],
      [1, 3],
      [3, 1],
      [4, 0],
      [4, 2],
    ]

    cases.forEach(([from, over]) => {
      const overId = tracks[over]?.id
      const movedId = tracks[from]?.id
      const toIndex = getQueueReorderTargetIndex(from, over, 'after')
      expect(toIndex).not.toBeNull()
      if (toIndex === null) {
        return
      }

      const result = reorderQueueTracks(tracks, from, toIndex)
      const overResultIndex = result.findIndex((track) => track.id === overId)
      expect(result[overResultIndex + 1]?.id).toBe(movedId)
    })
  })

  it('only reports null for drops that would leave the element in place', () => {
    const tracks = buildTracks(['a', 'b', 'c', 'd'])
    const halves: readonly QueueDropPosition[] = ['before', 'after']
    const rowIndices = tracks.map((_, index) => index)
    const combinations = rowIndices.flatMap((from) =>
      rowIndices.flatMap((over) => halves.map((half) => ({ from, over, half }))),
    )

    combinations.forEach(({ from, over, half }) => {
      const toIndex = getQueueReorderTargetIndex(from, over, half)

      if (toIndex === null) {
        return
      }

      const result = reorderQueueTracks(tracks, from, toIndex)
      expect(result.map((track) => track.id)).not.toEqual(tracks.map((track) => track.id))
    })
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

  it('reorders queue tracks and rewrites positions for optimistic UI updates', () => {
    const tracks = [
      {
        id: '1',
        position: 1,
        title: 'Track A',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        isCurrent: false,
        addedBy: 'user' as const,
      },
      {
        id: '2',
        position: 2,
        title: 'Track B',
        artist: 'Artist',
        album: 'Album',
        duration: 200,
        isCurrent: true,
        addedBy: 'user' as const,
      },
      {
        id: '3',
        position: 3,
        title: 'Track C',
        artist: 'Artist',
        album: 'Album',
        duration: 240,
        isCurrent: false,
        addedBy: 'radio' as const,
      },
    ] as const

    expect(reorderQueueTracks(tracks, 0, 2)).toEqual([
      { ...tracks[1], position: 1 },
      { ...tracks[2], position: 2 },
      { ...tracks[0], position: 3 },
    ])
  })

  it('derives the radio boundary from the first radio-tagged track', () => {
    expect(
      deriveRadioBoundaryIndex([
        {
          id: '1',
          position: 1,
          title: 'Track A',
          artist: 'Artist',
          album: 'Album',
          duration: 180,
          isCurrent: false,
          addedBy: 'user',
        },
        {
          id: '2',
          position: 2,
          title: 'Track B',
          artist: 'Artist',
          album: 'Album',
          duration: 200,
          isCurrent: false,
          addedBy: 'radio',
        },
      ]),
    ).toBe(1)
  })
})

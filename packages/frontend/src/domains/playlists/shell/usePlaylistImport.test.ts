import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VNode } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/platform/api/playlistImportApi', () => ({
  importPlaylist: vi.fn(),
  importPlaylistFromLastFm: vi.fn(),
}))

const fetchQueueMock = vi.fn<() => Promise<void>>()
vi.mock('@/domains/queue/shell/useQueueStore', () => ({
  useQueueStore: vi.fn(() => ({ fetchQueue: fetchQueueMock })),
}))

// Import AFTER mocks
import { usePlaylistImport } from './usePlaylistImport'
import { importPlaylist, importPlaylistFromLastFm } from '@/platform/api/playlistImportApi'
import type { PlaylistImportOutcome } from '@/platform/api/playlistImportApi'

const mockImportPlaylist = vi.mocked(importPlaylist)
const mockImportFromLastFm = vi.mocked(importPlaylistFromLastFm)

const mountComposable = async (): Promise<{
  readonly result: ReturnType<typeof usePlaylistImport>
}> => {
  let result: ReturnType<typeof usePlaylistImport> | undefined
  const TestComponent = defineComponent({
    setup(): () => VNode {
      result = usePlaylistImport()
      return () => h('div')
    },
  })
  mount(TestComponent)
  await flushPromises()
  return { result: result! }
}

const okOutcome = (
  imported: number,
  missing: readonly string[],
  total: number,
  skippedLines = 0,
): PlaylistImportOutcome => ({ ok: true, imported, missing, total, skippedLines })

describe('usePlaylistImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchQueueMock.mockResolvedValue(undefined)
  })

  describe('submitText', () => {
    it('on success, stores the numbers, refreshes the queue and stops importing', async () => {
      mockImportPlaylist.mockResolvedValue(okOutcome(2, ['Song X'], 3, 1))
      const { result } = await mountComposable()

      await result.submitText('Song A\nSong B\nSong X')

      expect(result.result.value).toEqual({
        imported: 2,
        missing: ['Song X'],
        total: 3,
        skippedLines: 1,
      })
      expect(result.errorKind.value).toBeUndefined()
      expect(fetchQueueMock).toHaveBeenCalledTimes(1)
      expect(result.isImporting.value).toBe(false)
    })

    it('does not refresh the queue when nothing was imported', async () => {
      mockImportPlaylist.mockResolvedValue(okOutcome(0, ['Song A'], 1))
      const { result } = await mountComposable()

      await result.submitText('Song A')

      expect(result.result.value?.imported).toBe(0)
      expect(result.result.value?.total).toBe(1)
      expect(fetchQueueMock).not.toHaveBeenCalled()
    })

    it('on failure, sets errorKind failed and leaves result unset', async () => {
      mockImportPlaylist.mockResolvedValue({ ok: false, status: 503 })
      const { result } = await mountComposable()

      await result.submitText('Song A')

      // The text endpoint has no Last.fm-specific states, so even a 503 is
      // just "failed" here.
      expect(result.errorKind.value).toBe('failed')
      expect(result.result.value).toBeUndefined()
      expect(fetchQueueMock).not.toHaveBeenCalled()
      expect(result.isImporting.value).toBe(false)
    })

    it('sets savedAs to the trimmed name when at least one track was imported', async () => {
      mockImportPlaylist.mockResolvedValue(okOutcome(2, [], 2))
      const { result } = await mountComposable()

      await result.submitText('Song A\nSong B', '  Road trip  ')

      expect(mockImportPlaylist).toHaveBeenCalledWith('Song A\nSong B', 'Road trip')
      expect(result.result.value?.savedAs).toBe('Road trip')
    })

    it('leaves savedAs unset and skips the queue refresh when a name was passed but nothing was imported', async () => {
      mockImportPlaylist.mockResolvedValue(okOutcome(0, ['Song A'], 1))
      const { result } = await mountComposable()

      await result.submitText('Song A', 'Road trip')

      expect(result.result.value?.savedAs).toBeUndefined()
      expect(fetchQueueMock).not.toHaveBeenCalled()
    })

    it('sends an empty-after-trim name as undefined', async () => {
      mockImportPlaylist.mockResolvedValue(okOutcome(1, [], 1))
      const { result } = await mountComposable()

      await result.submitText('Song A', '   ')

      expect(mockImportPlaylist).toHaveBeenCalledWith('Song A', undefined)
      expect(result.result.value?.savedAs).toBeUndefined()
    })

    it('ignores a second submit while one is already in flight', async () => {
      let releaseFirst: ((value: PlaylistImportOutcome) => void) | undefined
      mockImportPlaylist.mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            releaseFirst = resolve
          }),
      )
      const { result } = await mountComposable()

      const first = result.submitText('Song A')
      await result.submitText('Song B')

      expect(mockImportPlaylist).toHaveBeenCalledTimes(1)
      expect(mockImportPlaylist).toHaveBeenCalledWith('Song A', undefined)
      expect(result.isImporting.value).toBe(true)

      releaseFirst?.(okOutcome(1, [], 1))
      await first
      expect(result.isImporting.value).toBe(false)
    })
  })

  describe('submitLastFm', () => {
    it('on success, calls the api with source and limit and stores the numbers', async () => {
      mockImportFromLastFm.mockResolvedValue(okOutcome(4, ['Gone'], 9))
      const { result } = await mountComposable()

      await result.submitLastFm({ kind: 'tag', tag: 'shoegaze' }, 25)

      expect(mockImportFromLastFm).toHaveBeenCalledWith(
        { kind: 'tag', tag: 'shoegaze' },
        25,
        undefined,
      )
      expect(result.result.value).toEqual({
        imported: 4,
        missing: ['Gone'],
        total: 9,
        skippedLines: 0,
      })
      expect(fetchQueueMock).toHaveBeenCalledTimes(1)
      expect(result.isImporting.value).toBe(false)
    })

    it('maps a 400 about a missing username to lastfm-not-configured', async () => {
      mockImportFromLastFm.mockResolvedValue({
        ok: false,
        status: 400,
        message: 'No Last.fm username configured',
      })
      const { result } = await mountComposable()

      await result.submitLastFm({ kind: 'loved' }, 50)

      expect(result.errorKind.value).toBe('lastfm-not-configured')
      expect(result.result.value).toBeUndefined()
    })

    it('maps a 400 about a missing session to lastfm-not-configured', async () => {
      mockImportFromLastFm.mockResolvedValue({
        ok: false,
        status: 400,
        message: 'No Last.fm session configured for this user',
      })
      const { result } = await mountComposable()

      await result.submitLastFm({ kind: 'recommended' }, 50)

      expect(result.errorKind.value).toBe('lastfm-not-configured')
    })

    it('does not blame the Last.fm setup for a 400 the route sent for another reason', async () => {
      mockImportFromLastFm.mockResolvedValue({
        ok: false,
        status: 400,
        message: 'Invalid import request',
      })
      const { result } = await mountComposable()

      await result.submitLastFm({ kind: 'loved' }, 50)

      expect(result.errorKind.value).toBe('failed')
      expect(result.result.value).toBeUndefined()
    })

    it('maps a 400 with no readable message to failed', async () => {
      mockImportFromLastFm.mockResolvedValue({ ok: false, status: 400 })
      const { result } = await mountComposable()

      await result.submitLastFm({ kind: 'loved' }, 50)

      expect(result.errorKind.value).toBe('failed')
    })

    it('maps a 503 to lastfm-unavailable', async () => {
      mockImportFromLastFm.mockResolvedValue({ ok: false, status: 503 })
      const { result } = await mountComposable()

      await result.submitLastFm({ kind: 'loved' }, 50)

      expect(result.errorKind.value).toBe('lastfm-unavailable')
      expect(result.result.value).toBeUndefined()
    })

    it('maps a status-less failure to failed', async () => {
      mockImportFromLastFm.mockResolvedValue({ ok: false })
      const { result } = await mountComposable()

      await result.submitLastFm({ kind: 'recommended' }, 50)

      expect(result.errorKind.value).toBe('failed')
      expect(result.result.value).toBeUndefined()
    })

    it('maps any other status to failed', async () => {
      mockImportFromLastFm.mockResolvedValue({ ok: false, status: 500 })
      const { result } = await mountComposable()

      await result.submitLastFm({ kind: 'recommended' }, 50)

      expect(result.errorKind.value).toBe('failed')
    })

    it('passes the trimmed name on and reports it as savedAs', async () => {
      mockImportFromLastFm.mockResolvedValue(okOutcome(3, [], 3))
      const { result } = await mountComposable()

      await result.submitLastFm({ kind: 'top-tracks', period: '1month' }, 20, '  Top month  ')

      expect(mockImportFromLastFm).toHaveBeenCalledWith(
        { kind: 'top-tracks', period: '1month' },
        20,
        'Top month',
      )
      expect(result.result.value?.savedAs).toBe('Top month')
    })

    it('clears a previous error before the next import', async () => {
      mockImportFromLastFm.mockResolvedValueOnce({ ok: false, status: 503 })
      mockImportFromLastFm.mockResolvedValueOnce(okOutcome(1, [], 1))
      const { result } = await mountComposable()

      await result.submitLastFm({ kind: 'loved' }, 50)
      expect(result.errorKind.value).toBe('lastfm-unavailable')

      await result.submitLastFm({ kind: 'loved' }, 50)

      expect(result.errorKind.value).toBeUndefined()
      expect(result.result.value?.imported).toBe(1)
    })

    it('ignores a text submit while a Last.fm import is in flight', async () => {
      let releaseFirst: ((value: PlaylistImportOutcome) => void) | undefined
      mockImportFromLastFm.mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            releaseFirst = resolve
          }),
      )
      const { result } = await mountComposable()

      const first = result.submitLastFm({ kind: 'loved' }, 50)
      await result.submitText('Song A')

      expect(mockImportFromLastFm).toHaveBeenCalledTimes(1)
      expect(mockImportPlaylist).not.toHaveBeenCalled()

      releaseFirst?.(okOutcome(1, [], 1))
      await first
      expect(result.isImporting.value).toBe(false)
    })
  })
})

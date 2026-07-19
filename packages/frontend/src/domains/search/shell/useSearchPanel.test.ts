/**
 * useSearchPanel — Loved Tracks Radio action unit tests
 *
 * Exercises startLovedRadioMode directly by calling the composable outside a
 * component, with all I/O dependencies (router, stores, APIs) mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ok } from '@signalform/shared'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockStartLovedRadio, mockStartPersonalRadio, mockStartGenreRadio, mockGetConfig } =
  vi.hoisted(() => ({
    mockStartLovedRadio: vi.fn(),
    mockStartPersonalRadio: vi.fn(),
    mockStartGenreRadio: vi.fn(),
    mockGetConfig: vi.fn(),
  }))

vi.mock('@/platform/api/lovedRadioApi', () => ({
  startLovedRadio: mockStartLovedRadio,
}))

vi.mock('@/platform/api/personalRadioApi', () => ({
  startPersonalRadio: mockStartPersonalRadio,
}))

vi.mock('@/platform/api/genreRadioApi', () => ({
  startGenreRadio: mockStartGenreRadio,
}))

vi.mock('@/platform/api/configApi', () => ({
  getConfig: mockGetConfig,
}))

vi.mock('@/platform/api/playbackApi', () => ({
  playAlbum: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: (): { readonly query: Record<string, string> } => ({ query: {} }),
  useRouter: (): {
    readonly push: ReturnType<typeof vi.fn>
    readonly replace: ReturnType<typeof vi.fn>
  } => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}))

vi.mock('./useSearchStore', () => ({
  useSearchStore: (): Record<string, unknown> => ({
    fullResults: null,
    searchQuery: '',
    autocompleteSuggestions: [],
    hasSuggestions: false,
    clearAutocompleteSuggestions: vi.fn(),
    clearFullResults: vi.fn(),
  }),
}))

vi.mock('@/domains/playback/shell/usePlaybackStore', () => ({
  usePlaybackStore: (): Record<string, unknown> => ({
    play: vi.fn(),
    pause: vi.fn(),
  }),
}))

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useSearchPanel } from './useSearchPanel'

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetConfig.mockResolvedValue(ok({ personalRadioEnabled: true }))
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useSearchPanel — startLovedRadioMode', () => {
  it('calls the loved-radio API and clears loading on success', async () => {
    mockStartLovedRadio.mockResolvedValue({ tracksAdded: 5 })

    const { startLovedRadioMode, lovedRadioLoading, lovedRadioError } = useSearchPanel()

    const pending = startLovedRadioMode()
    expect(lovedRadioLoading.value).toBe(true)

    await pending

    expect(mockStartLovedRadio).toHaveBeenCalledOnce()
    expect(lovedRadioLoading.value).toBe(false)
    expect(lovedRadioError.value).toBe(false)
  })

  it('sets lovedRadioError when the API returns null', async () => {
    mockStartLovedRadio.mockResolvedValue(null)

    const { startLovedRadioMode, lovedRadioLoading, lovedRadioError } = useSearchPanel()

    await startLovedRadioMode()

    expect(mockStartLovedRadio).toHaveBeenCalledOnce()
    expect(lovedRadioLoading.value).toBe(false)
    expect(lovedRadioError.value).toBe(true)
  })

  it('resets a previous error before a new attempt', async () => {
    mockStartLovedRadio.mockResolvedValueOnce(null)

    const panel = useSearchPanel()
    await panel.startLovedRadioMode()
    expect(panel.lovedRadioError.value).toBe(true)

    mockStartLovedRadio.mockResolvedValueOnce({ tracksAdded: 2 })
    await panel.startLovedRadioMode()

    expect(panel.lovedRadioError.value).toBe(false)
  })
})

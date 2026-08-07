/**
 * QueueView — the row actions, the list container and the radio separator all
 * carry translated accessible names. The roving-focus handler must find the
 * list without reading that translated name.
 *
 * Own file because QueueView.test.ts is already 65 KB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { ok, type Result, type QueueTrack } from '@signalform/shared'
import QueueView from './QueueView.vue'
import { useI18nStore } from '@/app/i18nStore'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Language } from '@/types/i18n'

const isPhone = ref(false)

vi.mock('@/app/useResponsiveLayout', () => ({
  useResponsiveLayout: (): {
    readonly isPhone: typeof isPhone
    readonly isTablet: ReturnType<typeof ref<boolean>>
    readonly isDesktop: ReturnType<typeof ref<boolean>>
  } => ({
    isPhone,
    isTablet: ref(false),
    isDesktop: ref(true),
  }),
}))

vi.mock('@/app/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    socket: {},
    connectionState: { value: 'connected' },
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    onReconnect: vi.fn(),
  })),
}))

vi.mock('@/platform/api/queueApi', () => ({
  getQueue: vi.fn(),
  jumpToTrack: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderQueue: vi.fn(),
  setRadioMode: vi.fn(),
  clearQueue: vi.fn(),
  removeMultipleFromQueue: vi.fn(),
}))

vi.mock('@/domains/playlists/ui/PlaylistsPanel.vue', () => ({
  default: {
    name: 'PlaylistsPanel',
    template: '<div data-testid="playlists-panel-stub" />',
  },
}))

import { getQueue, type QueueApiError } from '@/platform/api/queueApi'

const mockGetQueue = vi.mocked(getQueue)

const tracks: readonly QueueTrack[] = [
  {
    id: '1',
    position: 1,
    title: 'Paranoid Android',
    artist: 'Radiohead',
    album: 'OK Computer',
    duration: 383,
    isCurrent: false,
    addedBy: 'user',
  },
  {
    id: '2',
    position: 2,
    title: 'Karma Police',
    artist: 'Radiohead',
    album: 'OK Computer',
    duration: 261,
    isCurrent: false,
    addedBy: 'user',
  },
]

type QueueResponse = {
  readonly tracks: readonly QueueTrack[]
  readonly radioModeActive: boolean
  readonly radioBoundaryIndex: number | null
}

const queueResult: Result<QueueResponse, QueueApiError> = ok({
  tracks,
  radioModeActive: false,
  radioBoundaryIndex: null,
})

const mountQueue = async (
  language: Language,
  options: { readonly attachTo?: HTMLElement } = {},
): Promise<VueWrapper> => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)

  const router = await createTestRouter(
    [
      { path: '/', component: { template: '<div />' } },
      { path: '/queue', name: 'queue', component: { template: '<div />' } },
      { path: '/now-playing', name: 'now-playing', component: { template: '<div />' } },
    ],
    '/queue',
  )
  const wrapper = mount(QueueView, {
    attachTo: options.attachTo,
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

const labelsOf = (wrapper: VueWrapper, testId: string): readonly (string | undefined)[] =>
  wrapper.findAll(`[data-testid="${testId}"]`).map((button) => button.attributes('aria-label'))

describe('QueueView – row action labels', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    isPhone.value = false
    mockGetQueue.mockResolvedValue(queueResult)
  })

  it('names each track in the English remove label', async () => {
    const wrapper = await mountQueue('en')

    expect(labelsOf(wrapper, 'queue-track-remove')).toEqual([
      'Remove Paranoid Android from queue',
      'Remove Karma Police from queue',
    ])
  })

  it('names each track in the German remove label', async () => {
    const wrapper = await mountQueue('de')

    // A hard-coded literal here would keep saying "Remove …" to a German user.
    expect(labelsOf(wrapper, 'queue-track-remove')).toEqual([
      'Paranoid Android aus Warteschlange entfernen',
      'Karma Police aus Warteschlange entfernen',
    ])
  })

  it('names each track in the English reorder label', async () => {
    const wrapper = await mountQueue('en')

    expect(labelsOf(wrapper, 'queue-track-reorder')).toEqual([
      'Reorder Paranoid Android',
      'Reorder Karma Police',
    ])
  })

  it('names each track in the German reorder label', async () => {
    const wrapper = await mountQueue('de')

    expect(labelsOf(wrapper, 'queue-track-reorder')).toEqual([
      'Paranoid Android verschieben',
      'Karma Police verschieben',
    ])
  })

  it('names each track in the select-mode checkbox label in both languages', async () => {
    const english = await mountQueue('en')
    await english.find('[data-testid="queue-menu"]').trigger('click')
    await english.find('[data-testid="queue-select-mode-toggle"]').trigger('click')
    await nextTick()

    expect(
      english.findAll('input[type="checkbox"][aria-label]').map((c) => c.attributes('aria-label')),
    ).toEqual(['Select all', 'Select Paranoid Android', 'Select Karma Police'])

    const german = await mountQueue('de')
    await german.find('[data-testid="queue-menu"]').trigger('click')
    await german.find('[data-testid="queue-select-mode-toggle"]').trigger('click')
    await nextTick()

    expect(
      german.findAll('input[type="checkbox"][aria-label]').map((c) => c.attributes('aria-label')),
    ).toEqual(['Alle auswählen', 'Paranoid Android auswählen', 'Karma Police auswählen'])
  })
})

describe('QueueView – jump button labels', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    isPhone.value = false
    mockGetQueue.mockResolvedValue(
      ok({
        tracks: [tracks[0]!, { ...tracks[1]!, isCurrent: true }],
        radioModeActive: false,
        radioBoundaryIndex: null,
      }),
    )
  })

  it('marks only the playing row as current in English', async () => {
    const wrapper = await mountQueue('en')

    expect(labelsOf(wrapper, 'queue-track-jump')).toEqual([
      'Paranoid Android by Radiohead',
      'Karma Police by Radiohead — currently playing',
    ])
  })

  it('marks only the playing row as current in German', async () => {
    const wrapper = await mountQueue('de')

    expect(labelsOf(wrapper, 'queue-track-jump')).toEqual([
      'Paranoid Android von Radiohead',
      'Karma Police von Radiohead — läuft gerade',
    ])
  })
})

describe('QueueView – list and radio separator labels', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    isPhone.value = false
    mockGetQueue.mockResolvedValue(ok({ tracks, radioModeActive: true, radioBoundaryIndex: 1 }))
  })

  it('labels the list and the radio separator in English', async () => {
    const wrapper = await mountQueue('en')

    expect(wrapper.find('[data-testid="queue-track-list"]').attributes('aria-label')).toBe(
      'Queue tracks',
    )
    expect(wrapper.find('[data-testid="radio-boundary"]').attributes('aria-label')).toBe(
      'Radio mode starts here',
    )
  })

  it('labels the list and the radio separator in German', async () => {
    const wrapper = await mountQueue('de')

    expect(wrapper.find('[data-testid="queue-track-list"]').attributes('aria-label')).toBe(
      'Titel in der Warteschlange',
    )
    expect(wrapper.find('[data-testid="radio-boundary"]').attributes('aria-label')).toBe(
      'Ab hier beginnt der Radiomodus',
    )
  })
})

describe('QueueView – a language switch after mount', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    isPhone.value = false
    mockGetQueue.mockResolvedValue(queueResult)
  })

  // `const t = i18nStore.t` reads the translator once and keeps it: everything
  // below stayed English for the rest of the session, no matter the setting.
  it('re-renders the heading and the row labels in the new language', async () => {
    const wrapper = await mountQueue('en')

    expect(wrapper.find('[data-testid="page-header"] h1').text()).toBe('Queue')
    expect(labelsOf(wrapper, 'queue-track-remove')[0]).toBe('Remove Paranoid Android from queue')

    useI18nStore().setLanguage('de')
    await nextTick()

    expect(wrapper.find('[data-testid="page-header"] h1').text()).toBe('Warteschlange')
    expect(labelsOf(wrapper, 'queue-track-remove')[0]).toBe(
      'Paranoid Android aus Warteschlange entfernen',
    )
  })

  // The drop hint goes into useQueueDrag, which is created once in setup — so
  // it has to arrive as a getter, not as an already-translated string.
  it('announces the drop target in the new language', async () => {
    const elementFromPoint = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => document.querySelector('[data-track-index="1"]'))

    const wrapper = await mountQueue('en', { attachTo: document.body })

    useI18nStore().setLanguage('de')
    await nextTick()

    await wrapper.findAll('[data-testid="queue-track-reorder"]')[0]?.trigger('mousedown', {
      clientX: 10,
      clientY: 100,
      button: 0,
    })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 30 }))
    await nextTick()

    expect(wrapper.find('[data-testid="queue-drop-live-region"]').text()).toBe(
      'Nach diesem Titel einfügen.',
    )

    // No mouseup: the drop itself is covered in QueueView.test.ts, and
    // unmounting releases the document listeners.
    wrapper.unmount()
    elementFromPoint.mockRestore()
  })
})

describe('QueueView – roving focus survives translation', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    isPhone.value = false
    mockGetQueue.mockResolvedValue(queueResult)
  })

  // The handler locates the list to walk. It used to do that via the list's
  // aria-label, which now differs per language — in German it would find
  // nothing and arrow keys would stop working, silently and only there.
  it.each([['en'], ['de']] as const)(
    'moves focus to the next jump button with language %s',
    async (language) => {
      const wrapper = await mountQueue(language, { attachTo: document.body })

      const items = wrapper.findAll('[data-testid="queue-track-jump"]')
      expect(items).toHaveLength(2)
      const first = items[0]!.element
      expect(first).toBeInstanceOf(HTMLButtonElement)
      if (!(first instanceof HTMLButtonElement)) {
        wrapper.unmount()
        return
      }
      first.focus()

      await items[0]!.trigger('keydown', { key: 'ArrowDown' })

      expect(document.activeElement).toBe(items[1]!.element)

      await items[1]!.trigger('keydown', { key: 'ArrowUp' })

      expect(document.activeElement).toBe(items[0]!.element)
      wrapper.unmount()
    },
  )
})

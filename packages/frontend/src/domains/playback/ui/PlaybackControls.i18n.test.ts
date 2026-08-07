/**
 * PlaybackControls — the three transport buttons are icon-only, so their
 * aria-labels are the whole accessible name. They used to be English literals.
 *
 * Every case mounts in English and switches afterwards, because that is the
 * order the app runs in: the language comes from the server config and lands
 * after these controls have been set up. Setting it before mounting would let a
 * label read once during setup pass.
 *
 * Own file because PlaybackControls.test.ts is already 16 KB.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import PlaybackControls from '@/domains/playback/ui/PlaybackControls.vue'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'
import { useI18nStore } from '@/app/i18nStore'
import { setupTestEnv } from '@/test-utils'
import type { Language } from '@/types/i18n'

vi.mock('@/platform/api/playbackApi', async () => {
  const { mockPlaybackApiModule } = await import('@/test-utils')
  const base = await mockPlaybackApiModule()
  const { ok } = await import('@signalform/shared')
  return {
    ...base,
    nextTrack: vi.fn().mockResolvedValue(ok(undefined)),
    previousTrack: vi.fn().mockResolvedValue(ok(undefined)),
    pausePlayback: vi.fn().mockResolvedValue(ok(undefined)),
    resumePlayback: vi.fn().mockResolvedValue(ok(undefined)),
    setShuffleMode: vi.fn().mockResolvedValue(ok(undefined)),
    setRepeatMode: vi.fn().mockResolvedValue(ok(undefined)),
  }
})

// The store is patched after mount because mounting kicks off a status sync
// that resets `isPlaying` back to the stopped state it reports.
const mountControls = async (isPlaying: boolean): Promise<VueWrapper> => {
  setupTestEnv()

  const wrapper = mount(PlaybackControls)
  await flushPromises()

  usePlaybackStore().$patch({ isPlaying, isPaused: false })
  await nextTick()

  return wrapper
}

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const labelOf = (wrapper: VueWrapper, testId: string): string | undefined =>
  wrapper.find(`[data-testid="${testId}"]`).attributes('aria-label')

describe('PlaybackControls — translated transport labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('names the skip buttons in English', async () => {
    const wrapper = await mountControls(false)

    expect(labelOf(wrapper, 'previous-button')).toBe('Skip to previous track')
    expect(labelOf(wrapper, 'next-button')).toBe('Skip to next track')
  })

  it('names the skip buttons in German', async () => {
    const wrapper = await mountControls(false)

    await switchTo('de')

    expect(labelOf(wrapper, 'previous-button')).toBe('Zum vorherigen Titel springen')
    expect(labelOf(wrapper, 'next-button')).toBe('Zum nächsten Titel springen')
  })

  // Previous and next share a template shape; a copy-paste of one key into the
  // other would still pass a per-button check but not this one.
  it('keeps the two skip directions distinct in German', async () => {
    const wrapper = await mountControls(false)

    await switchTo('de')

    expect(labelOf(wrapper, 'previous-button')).not.toBe(labelOf(wrapper, 'next-button'))
  })

  it('names the play/pause button in English for both states', async () => {
    expect(labelOf(await mountControls(false), 'play-pause-button')).toBe('Play')
    expect(labelOf(await mountControls(true), 'play-pause-button')).toBe('Pause')
  })

  // Each pair of controls is switched on its own: `setupTestEnv` installs a
  // fresh Pinia per mount, so only the most recently mounted one sees a later
  // language change.
  it('names the play/pause button in German for both states', async () => {
    const stopped = await mountControls(false)
    await switchTo('de')
    expect(labelOf(stopped, 'play-pause-button')).toBe('Abspielen')

    const playing = await mountControls(true)
    await switchTo('de')
    expect(labelOf(playing, 'play-pause-button')).toBe('Pause')
  })
})

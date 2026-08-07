/**
 * VolumeControl — group, slider and the mute/unmute pair are icon-only or
 * unlabelled, so their accessible names carry the whole meaning.
 *
 * Every case mounts in English and switches afterwards, because that is the
 * order the app runs in: the language comes from the server config and lands
 * after this control has been set up. Setting it before mounting would let a
 * label read once during setup pass.
 *
 * Own file so VolumeControl.test.ts stays about volume behaviour.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import VolumeControl from '@/domains/playback/ui/VolumeControl.vue'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'
import { useI18nStore } from '@/app/i18nStore'
import { setupTestEnv } from '@/test-utils'
import type { Language } from '@/types/i18n'

vi.mock('@/platform/api/playbackApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    setVolume: vi.fn().mockResolvedValue(ok(undefined)),
    getVolume: vi.fn().mockResolvedValue(ok(50)),
    getPlaybackStatus: vi
      .fn()
      .mockResolvedValue(
        ok({ status: 'stopped', currentTime: 0, currentTrack: null, queuePreview: [] }),
      ),
  }
})

const mountControl = async (isMuted = false): Promise<VueWrapper> => {
  setupTestEnv()

  const wrapper = mount(VolumeControl)
  await flushPromises()
  usePlaybackStore().$patch({ isMuted })
  await nextTick()
  return wrapper
}

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const muteButtonLabel = (wrapper: VueWrapper): string | undefined =>
  wrapper.find('.mute-button').attributes('aria-label')

describe('VolumeControl — translated accessible names', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('names the group and the slider in English', async () => {
    const wrapper = await mountControl()

    expect(wrapper.find('.volume-control').attributes('aria-label')).toBe('Volume control')
    expect(wrapper.find('input[type="range"]').attributes('aria-label')).toBe('Volume slider')
  })

  it('names the group and the slider in German', async () => {
    const wrapper = await mountControl()

    await switchTo('de')

    expect(wrapper.find('.volume-control').attributes('aria-label')).toBe('Lautstärkeregelung')
    expect(wrapper.find('input[type="range"]').attributes('aria-label')).toBe('Lautstärkeregler')
  })

  it('offers the action, not the state, in English for both mute states', async () => {
    expect(muteButtonLabel(await mountControl(false))).toBe('Mute')
    expect(muteButtonLabel(await mountControl(true))).toBe('Unmute')
  })

  // Each control is switched on its own: `setupTestEnv` installs a fresh Pinia
  // per mount, so only the most recently mounted one sees a later change.
  it('offers the action, not the state, in German for both mute states', async () => {
    const unmuted = await mountControl(false)
    await switchTo('de')
    expect(muteButtonLabel(unmuted)).toBe('Stummschalten')

    const muted = await mountControl(true)
    await switchTo('de')
    expect(muteButtonLabel(muted)).toBe('Stummschaltung aufheben')
  })
})

/**
 * ProgressBar — the timer region and the seek thumb both carry an accessible
 * name that embeds the formatted time. German needs the number *after* the
 * label, which is why the key interpolates rather than concatenates.
 *
 * Every case mounts in English and switches afterwards, because that is the
 * order the app runs in: the language comes from the server config and lands
 * after this bar has been set up. Setting it before mounting would let a label
 * read once during setup pass — which is the exact defect these cases exist for.
 *
 * Own file because ProgressBar.test.ts is already 16 KB and is about seeking.
 */
import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ProgressBar from '@/domains/playback/ui/ProgressBar.vue'
import { usePlaybackStore } from '@/domains/playback/shell/usePlaybackStore'
import { useI18nStore } from '@/app/i18nStore'
import { setupTestEnv } from '@/test-utils'
import type { Language } from '@/types/i18n'

const mountBar = (currentTime: number, trackDuration: number): VueWrapper => {
  setupTestEnv()

  const playbackStore = usePlaybackStore()
  playbackStore.$patch({ currentTime, trackDuration })

  return mount(ProgressBar)
}

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const timerLabel = (wrapper: VueWrapper): string | undefined =>
  wrapper.find('[role="timer"]').attributes('aria-label')

const sliderLabel = (wrapper: VueWrapper): string | undefined =>
  wrapper.find('[role="slider"]').attributes('aria-label')

describe('ProgressBar — translated time labels', () => {
  it('names the timer region in English with the formatted time', () => {
    expect(timerLabel(mountBar(65, 200))).toBe('Playback time: 1:05 / 3:20')
  })

  it('names the timer region in German with the formatted time', async () => {
    const wrapper = mountBar(65, 200)

    await switchTo('de')

    expect(timerLabel(wrapper)).toBe('Wiedergabezeit: 1:05 / 3:20')
  })

  it('names the seek thumb in English with the formatted time', () => {
    expect(sliderLabel(mountBar(65, 200))).toBe('Playback position: 1:05 / 3:20')
  })

  it('names the seek thumb in German with the formatted time', async () => {
    const wrapper = mountBar(65, 200)

    await switchTo('de')

    expect(sliderLabel(wrapper)).toBe('Wiedergabeposition: 1:05 / 3:20')
  })

  it('gives two playback positions distinct English labels', () => {
    expect(sliderLabel(mountBar(5, 200))).toBe('Playback position: 0:05 / 3:20')
    expect(sliderLabel(mountBar(125, 200))).toBe('Playback position: 2:05 / 3:20')
  })

  // Each bar is switched on its own: `setupTestEnv` installs a fresh Pinia per
  // mount, so only the most recently mounted bar sees a later language change.
  it('gives two playback positions distinct German labels', async () => {
    const early = mountBar(5, 200)
    await switchTo('de')
    expect(sliderLabel(early)).toBe('Wiedergabeposition: 0:05 / 3:20')

    const late = mountBar(125, 200)
    await switchTo('de')
    expect(sliderLabel(late)).toBe('Wiedergabeposition: 2:05 / 3:20')
  })
})

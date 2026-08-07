/**
 * QualityBadge — the badge's accessible name, in both languages.
 *
 * Three sentences share one component: the source-only badge, the lossy
 * quality badge and the lossless one, the last of which German renders with a
 * fronted adjective instead of a trailing parenthetical.
 *
 * Own file so QualityBadge.test.ts stays about tier colors and display text.
 */
import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import QualityBadge from './QualityBadge.vue'
import type { AudioQuality } from '@signalform/shared'
import { setupTestEnv } from '@/test-utils'
import type { Language } from '@/types/i18n'

type Source = 'local' | 'qobuz' | 'tidal' | 'unknown'

const losslessFlac: AudioQuality = {
  format: 'FLAC',
  bitDepth: 24,
  bitrate: 1411000,
  sampleRate: 96000,
  lossless: true,
}

const lossyAac: AudioQuality = {
  format: 'AAC',
  bitrate: 320000,
  sampleRate: 44100,
  lossless: false,
}

const mountBadge = (
  language: Language,
  source: Source,
  quality?: AudioQuality,
): VueWrapper<InstanceType<typeof QualityBadge>> => {
  const i18nStore = setupTestEnv()
  i18nStore.setLanguage(language)

  return mount(QualityBadge, { props: { source, quality } })
}

const labelOf = (wrapper: VueWrapper<InstanceType<typeof QualityBadge>>): string | undefined =>
  wrapper.find('[data-testid="quality-badge"]').attributes('aria-label')

const textOf = (wrapper: VueWrapper<InstanceType<typeof QualityBadge>>): string =>
  wrapper.find('[data-testid="quality-badge"]').text().trim()

describe('QualityBadge — source label without quality data', () => {
  it('names the source badge in English', () => {
    expect(labelOf(mountBadge('en', 'local'))).toBe('Source: Local')
  })

  it('names the source badge in German', () => {
    expect(labelOf(mountBadge('de', 'local'))).toBe('Quelle: Lokal')
  })

  // The source name is part of the sentence, so an untranslated badgeText would
  // leave "Local" sitting inside the German label.
  it('leaves no English source word in the German label', () => {
    const label = labelOf(mountBadge('de', 'local'))

    expect(label).toBe('Quelle: Lokal')
    expect(label).not.toContain('Local')
    expect(label).not.toContain('Source')
  })

  it('translates the visible badge text as well', () => {
    expect(textOf(mountBadge('en', 'local'))).toBe('Local')
    expect(textOf(mountBadge('de', 'local'))).toBe('Lokal')
  })

  it('keeps brand source names untranslated in both languages', () => {
    expect(labelOf(mountBadge('en', 'qobuz'))).toBe('Source: Qobuz')
    expect(labelOf(mountBadge('de', 'qobuz'))).toBe('Quelle: Qobuz')
    expect(labelOf(mountBadge('de', 'tidal'))).toBe('Quelle: Tidal')
  })
})

describe('QualityBadge — quality label', () => {
  it('names a lossy quality badge in English', () => {
    expect(labelOf(mountBadge('en', 'qobuz', lossyAac))).toBe('Quality: AAC 320')
  })

  it('names a lossy quality badge in German', () => {
    expect(labelOf(mountBadge('de', 'qobuz', lossyAac))).toBe('Qualität: AAC 320')
  })

  it('names a lossless quality badge in English', () => {
    expect(labelOf(mountBadge('en', 'local', losslessFlac))).toBe('Quality: FLAC 24/96 (lossless)')
  })

  // German fronts the adjective — a concatenated " (verlustfrei)" would read as
  // an afterthought, and the sentence is owned by the catalog, not by the code.
  it('names a lossless quality badge in German', () => {
    expect(labelOf(mountBadge('de', 'local', losslessFlac))).toBe(
      'Verlustfreie Qualität: FLAC 24/96',
    )
  })

  it('distinguishes the lossless from the lossy sentence in German', () => {
    expect(labelOf(mountBadge('de', 'local', losslessFlac))).not.toBe(
      labelOf(mountBadge('de', 'local', lossyAac)),
    )
  })

  it('drops the lossless qualifier for lossy tracks in both languages', () => {
    expect(labelOf(mountBadge('en', 'local', lossyAac))).not.toContain('lossless')
    expect(labelOf(mountBadge('de', 'local', lossyAac))).not.toContain('Verlustfrei')
  })

  // The quality string wins over the source name in the label.
  it('names the quality, not the source, when quality data is present', () => {
    expect(labelOf(mountBadge('de', 'local', lossyAac))).toBe('Qualität: AAC 320')
  })

  it('follows a language switch made after mount', async () => {
    const i18nStore = setupTestEnv()
    const wrapper = mount(QualityBadge, {
      props: { source: 'local' as Source, quality: losslessFlac },
    })

    expect(labelOf(wrapper)).toBe('Quality: FLAC 24/96 (lossless)')

    i18nStore.setLanguage('de')
    await nextTick()

    expect(labelOf(wrapper)).toBe('Verlustfreie Qualität: FLAC 24/96')
  })

  it('follows a language switch on the source badge too', async () => {
    const i18nStore = setupTestEnv()
    const wrapper = mount(QualityBadge, { props: { source: 'local' as Source } })

    expect(labelOf(wrapper)).toBe('Source: Local')

    i18nStore.setLanguage('de')
    await nextTick()

    expect(labelOf(wrapper)).toBe('Quelle: Lokal')
    expect(textOf(wrapper)).toBe('Lokal')
  })
})

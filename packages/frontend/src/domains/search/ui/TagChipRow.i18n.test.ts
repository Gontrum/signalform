/**
 * TagChipRow — the row's accessible name. The chip labels themselves are
 * proper nouns from the shared vocabulary and stay untranslated, which the
 * last case pins down.
 */

import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import TagChipRow from './TagChipRow.vue'
import { setupTestEnv } from '@/test-utils'
import { useI18nStore } from '@/app/i18nStore'
import type { Language } from '@/types/i18n'

const mountRow = (): VueWrapper => {
  setupTestEnv()
  return mount(TagChipRow, { props: { activeTagId: 'sacd' } })
}

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const rowLabel = (wrapper: VueWrapper): string | undefined =>
  wrapper.get('[data-testid="tag-chip-row"]').attributes('aria-label')

describe('TagChipRow — translated accessible name', () => {
  it('names the row in English', () => {
    expect(rowLabel(mountRow())).toBe('Filter by tag')
  })

  it('names the row in German', async () => {
    const wrapper = mountRow()

    await switchTo('de')

    expect(rowLabel(wrapper)).toBe('Nach Tag filtern')
  })

  it('keeps the chip labels untranslated in both languages', async () => {
    const wrapper = mountRow()
    expect(wrapper.get('[data-testid="tag-chip-qsound"]').text()).toBe('QSound')

    await switchTo('de')

    expect(wrapper.get('[data-testid="tag-chip-qsound"]').text()).toBe('QSound')
    expect(wrapper.get('[data-testid="tag-chip-sacd"]').text()).toBe('SACD')
  })
})

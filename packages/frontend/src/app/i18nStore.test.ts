import { describe, expect, it, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useI18nStore } from './i18nStore'

describe('i18nStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('uses English as default language', () => {
    const store = useI18nStore()
    expect(store.currentLanguage).toBe('en')
    expect(store.t('settings.title')).toBe('Settings')
  })

  it('returns German translations when language is set to de', () => {
    const store = useI18nStore()

    store.setLanguage('de')

    expect(store.currentLanguage).toBe('de')
    expect(store.t('settings.title')).toBe('Einstellungen')
    expect(store.t('settings.saveSuccess')).toBe('Einstellungen gespeichert')
  })

  it('initializes language from config when valid', () => {
    const store = useI18nStore()

    store.initLanguageFromConfig('de')
    expect(store.currentLanguage).toBe('de')

    store.initLanguageFromConfig('en')
    expect(store.currentLanguage).toBe('en')
  })

  it('falls back to default language when config language is invalid', () => {
    const store = useI18nStore()

    store.initLanguageFromConfig(null)
    expect(store.currentLanguage).toBe('en')
  })

  it('returns the key if translation is missing', () => {
    const store = useI18nStore()

    // @ts-expect-error intentionally exercises missing-key fallback
    expect(store.t('non.existing.key')).toBe('non.existing.key')
  })
})

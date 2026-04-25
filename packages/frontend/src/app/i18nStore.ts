import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Language } from '@/types/i18n'
import { getMessage, type MessageKey } from '@/i18n'

const DEFAULT_LANGUAGE: Language = 'en'

export const useI18nStore = defineStore('i18n', () => {
  const currentLanguage = ref<Language>(DEFAULT_LANGUAGE)

  const setLanguage = (language: Language): void => {
    currentLanguage.value = language
  }

  const initLanguageFromConfig = (language: Language | null | undefined): void => {
    currentLanguage.value = language === 'de' || language === 'en' ? language : DEFAULT_LANGUAGE
  }

  const t = computed(() => {
    return (key: MessageKey): string => {
      return getMessage(currentLanguage.value, key)
    }
  })

  return {
    currentLanguage,
    setLanguage,
    initLanguageFromConfig,
    t,
  }
})

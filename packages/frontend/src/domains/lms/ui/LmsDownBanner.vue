<script setup lang="ts">
import { useI18nStore } from '@/app/i18nStore'
import type { MessageKey } from '@/i18n'

const i18nStore = useI18nStore()

const t = (key: MessageKey): string => i18nStore.t(key)
</script>

<template>
  <div
    class="fixed inset-x-0 top-0 z-[60] w-full border-b border-amber-300 bg-amber-100 px-4 pb-1.5 pt-[calc(env(safe-area-inset-top)+0.375rem)] text-center text-sm text-amber-900"
    role="status"
    aria-live="polite"
    data-testid="lms-down-banner"
  >
    {{ t('lms.downBanner') }}
  </div>
</template>

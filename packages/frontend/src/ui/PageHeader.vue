<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/app/i18nStore'

withDefaults(
  defineProps<{
    readonly title: string
    readonly showBack?: boolean
    readonly backIcon?: 'left' | 'down'
  }>(),
  { showBack: false, backIcon: 'left' },
)
const router = useRouter()
const i18nStore = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

const goBack = (): void => {
  router.back()
}
</script>

<template>
  <header
    data-testid="page-header"
    class="sticky top-0 z-20 flex h-11 flex-shrink-0 items-center gap-1 border-b border-neutral-200/80 bg-white/85 px-2 backdrop-blur-xl"
  >
    <button
      v-if="showBack"
      type="button"
      data-testid="page-header-back"
      class="flex min-h-[44px] min-w-[44px] items-center justify-center text-accent-500 hover:opacity-70 active:opacity-50"
      :aria-label="t('nav.back')"
      @click="goBack"
    >
      <svg
        class="h-6 w-6"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          v-if="backIcon === 'left'"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M15 19l-7-7 7-7"
        />
        <path v-else stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    <h1 class="min-w-0 flex-1 truncate px-1 text-[17px] font-semibold text-neutral-900">
      {{ title }}
    </h1>
    <div class="flex items-center gap-0.5">
      <slot name="trailing" />
    </div>
  </header>
</template>

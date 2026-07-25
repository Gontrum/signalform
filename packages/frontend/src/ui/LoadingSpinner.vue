<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/app/i18nStore'

const props = withDefaults(
  defineProps<{
    readonly size?: 'sm' | 'md' | 'lg'
    readonly color?: 'current' | 'neutral-900' | 'accent-400'
    /**
     * Whether the spinner announces itself to screen readers via
     * `role="status"` + an `sr-only` "Loading" text. Set to `false` when the
     * surrounding markup already announces the loading state (e.g. via its
     * own live region) to avoid a duplicate announcement.
     */
    readonly announce?: boolean
  }>(),
  { size: 'md', color: 'current', announce: true },
)

const i18nStore = useI18nStore()
const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

// Tailwind v4 statically scans source for literal class names — interpolating
// `border-${size}`/`border-${color}` into a template string would silently
// produce zero generated CSS. Each branch below must be a fully-literal
// class string.
const sizeClasses = computed((): string => {
  switch (props.size) {
    case 'sm':
      return 'h-5 w-5 border-2'
    case 'lg':
      return 'h-12 w-12 border-4'
    case 'md':
    default:
      return 'h-8 w-8 border-4'
  }
})

const colorClasses = computed((): string => {
  switch (props.color) {
    case 'neutral-900':
      return 'border-neutral-900 border-t-transparent'
    case 'accent-400':
      return 'border-accent-400 border-t-transparent'
    case 'current':
    default:
      return 'inline-block border-solid border-current border-r-transparent align-[-0.125em]'
  }
})
</script>

<template>
  <div
    :class="[
      sizeClasses,
      colorClasses,
      'animate-spin rounded-full motion-reduce:animate-[spin_1.5s_linear_infinite]',
    ]"
    :role="announce ? 'status' : undefined"
  >
    <span v-if="announce" class="sr-only">{{ t('home.loading') }}</span>
  </div>
</template>

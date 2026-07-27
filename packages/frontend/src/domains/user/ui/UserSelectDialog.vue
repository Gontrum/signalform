<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useI18nStore } from '@/app/i18nStore'
import { useUserStore } from '../shell/useUserStore'

const i18nStore = useI18nStore()
const userStore = useUserStore()

const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

const firstOptionEl = ref<HTMLButtonElement | null>(null)

// Function-ref callback (matches useQueueDrag's setScrollContainer pattern):
// Vue calls this with an Element/ComponentPublicInstance/null, so narrow it
// before storing rather than blind-casting.
const setFirstOptionRef = (el: Element | ComponentPublicInstance | null): void => {
  firstOptionEl.value = el instanceof HTMLButtonElement ? el : null
}

onMounted(() => {
  firstOptionEl.value?.focus()
})

// Simple flat-list focus trap — the dialog only ever contains the option
// buttons, so wrapping Tab/Shift+Tab between the first and last is sufficient
// (no nested focusable content to walk).
const trapFocus = (event: KeyboardEvent): void => {
  if (event.key !== 'Tab') return
  const dialog = event.currentTarget
  if (!(dialog instanceof HTMLElement)) return
  const options = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('[data-testid="user-select-option"]'),
  )
  const first = options[0]
  const last = options[options.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- deliberate modal focus trap: this keydown handler contains Tab/Shift+Tab inside the dialog (WCAG 2.4.3), the standard way to implement a modal without a dedicated dialog element; role="dialog" is a window/landmark role, not a "widget" role, so this heuristic rule doesn't recognize it as interactive even though it legitimately needs a keyboard handler. -->
  <div
    class="fixed inset-0 z-overlay flex items-center justify-center bg-neutral-900/40 p-6"
    data-testid="user-select-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="user-select-title"
    @keydown="trapFocus"
  >
    <div class="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
      <h1 id="user-select-title" class="mb-6 text-2xl font-bold text-neutral-900">
        {{ t('user.selectTitle') }}
      </h1>

      <div class="flex flex-col gap-3">
        <button
          v-for="(user, index) in userStore.users"
          :key="user.id"
          :ref="index === 0 ? setFirstOptionRef : undefined"
          type="button"
          data-testid="user-select-option"
          class="w-full rounded-lg border border-neutral-200 px-4 py-3 text-left text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          @click="userStore.selectUser(user.id)"
        >
          {{ user.name }}
        </button>
      </div>
    </div>
  </div>
</template>

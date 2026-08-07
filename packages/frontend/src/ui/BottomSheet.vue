<script setup lang="ts">
import { nextTick, useId, useTemplateRef, watch } from 'vue'

const props = defineProps<{
  readonly open: boolean
  readonly title: string
  readonly closeLabel: string
  // The element focus returns to on close. Popover.vue derives this from
  // `document.activeElement` at open time, which is `<body>` whenever the
  // sheet was opened by a mouse click on macOS/WebKit — a click there does not
  // focus a <button>. So the trigger is passed in, and activeElement is only
  // the fallback for a keyboard-opened sheet whose consumer holds no ref.
  readonly returnFocusTo?: HTMLElement | null
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
}>()

const titleId = useId()
const panel = useTemplateRef<HTMLElement>('panel')

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const focusableItems = (container: HTMLElement): readonly HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

let fallbackTrigger: HTMLElement | null = null

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      fallbackTrigger =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      panel.value?.focus()
      return
    }

    ;(props.returnFocusTo ?? fallbackTrigger)?.focus()
  },
)

const close = (): void => emit('update:open', false)

// The panel itself holds focus on open, so Shift+Tab has to wrap from it as
// well — otherwise the very first keystroke leaves the sheet behind.
const trapFocus = (event: KeyboardEvent): void => {
  const container = panel.value
  if (container === null) {
    return
  }

  const items = focusableItems(container)
  const first = items[0]
  const last = items[items.length - 1]
  if (first === undefined || last === undefined) {
    return
  }

  const active = document.activeElement
  if (event.shiftKey && (active === first || active === container)) {
    event.preventDefault()
    last.focus()
    return
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    // Claimed here: an ancestor must not also react to the same Escape.
    event.stopPropagation()
    close()
    return
  }

  if (event.key === 'Tab') {
    trapFocus(event)
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-overlay flex flex-col justify-end">
    <button
      type="button"
      aria-hidden="true"
      tabindex="-1"
      data-testid="bottom-sheet-backdrop"
      class="absolute inset-0 cursor-default bg-neutral-900/40"
      @click="close"
    />

    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- deliberate modal focus trap, as in UserSelectDialog.vue: this keydown handler keeps Tab/Shift+Tab inside the dialog (WCAG 2.4.3) and closes on Escape; role="dialog" is a window role, so the rule does not recognize the element as interactive even though it must handle keys. -->
    <div
      ref="panel"
      data-testid="bottom-sheet"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      class="relative max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-8 pt-3 shadow-lg focus:outline-none"
      @keydown="handleKeydown"
    >
      <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" aria-hidden="true" />

      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 :id="titleId" class="text-base font-semibold text-neutral-900">{{ title }}</h2>
        <button
          type="button"
          data-testid="bottom-sheet-close"
          :aria-label="closeLabel"
          class="-mr-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
          @click="close"
        >
          <svg
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <slot />
    </div>
  </div>
</template>

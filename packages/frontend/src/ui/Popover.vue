<script setup lang="ts">
import { watch } from 'vue'

// The panel needs `data-testid`/extra attrs, but the backdrop button must
// never receive them (it's a purely structural close-target) — so automatic
// attribute inheritance is disabled and `$attrs` is spread only onto the panel.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  readonly open: boolean
  readonly panelClass?: string
  readonly ariaLabel?: string
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
}>()

// Capture the element that had focus when the popover opened (the trigger),
// so focus can be returned to it once the popover closes — required for
// keyboard/screen-reader users (WCAG 2.1.1/2.4.3) so focus never gets
// dropped onto <body> after Escape or an outside click.
let triggerElement: HTMLElement | null = null

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      triggerElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
      return
    }

    triggerElement?.focus()
  },
)

const close = (): void => emit('update:open', false)

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    // Stop the keydown from bubbling to any ancestor keyboard handling once
    // this popover has claimed it — closing is this component's concern.
    event.stopPropagation()
    close()
  }
}
</script>

<template>
  <!-- Backdrop closes the menu on outside click -->
  <button
    v-if="open"
    type="button"
    aria-hidden="true"
    tabindex="-1"
    class="fixed inset-0 z-raised cursor-default"
    @click="close"
  />

  <div
    v-if="open"
    v-bind="$attrs"
    role="menu"
    tabindex="-1"
    :aria-label="ariaLabel"
    :class="['z-sticky rounded-xl border border-neutral-200 bg-white p-1 shadow-lg', panelClass]"
    @keydown="handleKeydown"
  >
    <slot />
  </div>
</template>

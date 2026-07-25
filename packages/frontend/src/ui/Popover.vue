<script setup lang="ts">
// The panel needs `data-testid`/extra attrs, but the backdrop button must
// never receive them (it's a purely structural close-target) — so automatic
// attribute inheritance is disabled and `$attrs` is spread only onto the panel.
defineOptions({ inheritAttrs: false })

defineProps<{
  readonly open: boolean
  readonly panelClass?: string
  readonly ariaLabel?: string
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
}>()
</script>

<template>
  <!-- Backdrop closes the menu on outside click -->
  <button
    v-if="open"
    type="button"
    aria-hidden="true"
    tabindex="-1"
    class="fixed inset-0 z-raised cursor-default"
    @click="emit('update:open', false)"
  />

  <div
    v-if="open"
    v-bind="$attrs"
    role="menu"
    :aria-label="ariaLabel"
    :class="['z-sticky rounded-xl border border-neutral-200 bg-white p-1 shadow-lg', panelClass]"
  >
    <slot />
  </div>
</template>

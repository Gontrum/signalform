<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = defineProps<{
  readonly variant: 'error' | 'warning'
}>()

const slots = useSlots()

// Tailwind v4 statically scans source for literal class names — an explicit
// switch (not `border-${variant}/30` string interpolation) so every class
// this component can render is a literal string somewhere in this file.
const containerClasses = computed((): string => {
  switch (props.variant) {
    case 'warning':
      return 'rounded-lg border border-warning/30 bg-warning/10 p-4'
    case 'error':
    default:
      return 'rounded-lg border border-error/30 bg-error/10 p-4'
  }
})

const messageClasses = computed((): string => {
  switch (props.variant) {
    case 'warning':
      return 'text-sm font-medium text-warning'
    case 'error':
    default:
      return 'text-sm font-medium text-error'
  }
})

const hasAction = computed((): boolean => Boolean(slots.action))
</script>

<template>
  <div :class="containerClasses" role="alert" aria-live="assertive">
    <p :class="messageClasses">
      <slot />
    </p>
    <div v-if="hasAction" class="mt-2">
      <slot name="action" />
    </div>
  </div>
</template>

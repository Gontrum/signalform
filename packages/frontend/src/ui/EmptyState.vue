<script setup lang="ts">
defineProps<{
  readonly title: string
  readonly subtitle?: string
  /**
   * Optional `data-testid` for the icon wrapper — lets a call site keep an
   * existing testid on the wrapper div (e.g. a "placeholder cover" testid)
   * when migrating inline markup onto this shared component.
   */
  readonly iconTestid?: string
}>()
</script>

<template>
  <div class="flex flex-col items-center text-center">
    <!-- Icon graphic — provided by the parent via the `icon` slot -->
    <div
      :data-testid="iconTestid"
      class="mb-6 flex h-30 w-30 md:h-40 md:w-40 lg:h-50 lg:w-50 items-center justify-center rounded-lg bg-neutral-100"
    >
      <slot name="icon" />
    </div>

    <h2 class="mb-2 text-xl font-semibold text-neutral-900">
      {{ title }}
    </h2>
    <p v-if="subtitle" class="text-sm text-neutral-500">
      {{ subtitle }}
    </p>

    <slot />
  </div>
</template>

<script setup lang="ts">
import { useResponsiveLayout } from '@/app/useResponsiveLayout'

const { isPhone, isTablet, isDesktop } = useResponsiveLayout()
</script>

<template>
  <div
    data-testid="layout-container"
    class="flex h-full min-h-0 w-full transition-all duration-300 ease-out"
    :class="{
      'flex-row gap-6': isTablet || isDesktop,
      'flex-col': isPhone,
    }"
  >
    <!-- Left Panel: Search (60% on tablet/desktop, 100% on phone) -->
    <main
      data-testid="left-panel"
      class="h-full overflow-hidden transition-all duration-300 ease-out"
      :class="{
        'w-full md:w-[60%]': isTablet || isDesktop,
        'w-full': isPhone,
      }"
    >
      <slot name="left" />
    </main>

    <!-- Right Panel: Now Playing (40% on tablet/desktop, hidden on phone) -->
    <aside
      v-if="isTablet || isDesktop"
      data-testid="right-panel"
      aria-label="Now Playing"
      class="h-full w-full overflow-hidden md:w-[40%] transition-all duration-300 ease-out"
    >
      <slot name="right" />
    </aside>
  </div>
</template>

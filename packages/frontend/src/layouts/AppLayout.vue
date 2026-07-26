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
    <!-- Left Panel: Search (60% on tablet/desktop, 100% on phone). Relatively
         positioned so App.vue's nested push/pop page-transition (absolutely
         positioned, inset: 0) scopes to just this column instead of
         escaping to the nearest positioned ancestor (app-content), which
         would blow out over the right/Now Playing column during the
         transition. -->
    <main
      data-testid="left-panel"
      class="relative h-full overflow-hidden transition-all duration-300 ease-out"
      :class="{
        'w-full md:w-[60%]': isTablet || isDesktop,
        'w-full': isPhone,
      }"
    >
      <slot name="left" />
    </main>

    <!-- Right Panel: Now Playing (40% on tablet/desktop, hidden on phone).
         overflow-y-auto (not overflow-hidden) so NowPlayingPanel content that
         exceeds the available height (art + track info + sleep timer +
         controls + volume + progress + queue preview) can be scrolled into
         view instead of being silently clipped — this can happen on any
         non-immersive route now, not just occasionally on Home. -->
    <aside
      v-if="isTablet || isDesktop"
      data-testid="right-panel"
      aria-label="Now Playing"
      class="h-full w-full overflow-y-auto md:w-[40%] transition-all duration-300 ease-out"
    >
      <slot name="right" />
    </aside>
  </div>
</template>

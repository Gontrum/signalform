<template>
  <div class="progress-container flex w-full flex-col gap-2 py-2">
    <!-- Time display -->
    <!-- Issue #10: Add ARIA label for screen readers -->
    <div
      class="time-display flex justify-between text-xs font-medium text-neutral-600 [font-variant-numeric:tabular-nums]"
      role="timer"
      :aria-label="timeAriaLabel"
    >
      <span>{{ formattedTime }}</span>
    </div>

    <!-- Progress bar -->
    <!-- Issue #13: Disable during loading -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- click-to-seek here is a mouse/touch convenience; keyboard seeking is fully supported via the sibling role="slider" thumb (tabindex, arrow keys), so no keyboard equivalent is needed on this wrapper. -->
    <div
      class="progress-wrapper cursor-pointer select-none py-4"
      :class="{ 'pointer-events-none cursor-not-allowed opacity-50': isLoading }"
      @mousedown="handleMouseDown"
      @touchstart="handleTouchStart"
    >
      <div class="progress-track relative h-1 w-full rounded-sm bg-neutral-200">
        <div
          class="progress-fill absolute h-full rounded-sm bg-accent-600 transition-[width] duration-100 ease-linear motion-reduce:transition-none"
          :style="{ width: progressPercent + '%' }"
        />
        <div
          class="progress-thumb absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-accent-600 shadow transition-transform duration-100 ease-out hover:scale-125 active:cursor-grabbing active:bg-accent-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-600 focus-visible:outline-offset-2 motion-reduce:transition-none [@media(hover:none)]:h-5 [@media(hover:none)]:w-5"
          :style="{ left: progressPercent + '%' }"
          role="slider"
          tabindex="0"
          :aria-valuenow="currentTime"
          :aria-valuemin="0"
          :aria-valuemax="trackDuration || 0"
          :aria-valuetext="formattedTime"
          :aria-label="positionAriaLabel"
          @keydown="handleKeyDown"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/app/i18nStore'
import { useProgressBar } from '@/domains/playback/shell/useProgressBar'

const {
  currentTime,
  trackDuration,
  isLoading,
  progressPercent,
  formattedTime,
  handleMouseDown,
  handleTouchStart,
  handleKeyDown,
} = useProgressBar()

const i18n = useI18nStore()

const timeAriaLabel = computed(() =>
  i18n.t('nowPlaying.playbackTime').replace('{time}', formattedTime.value),
)

const positionAriaLabel = computed(() =>
  i18n.t('nowPlaying.playbackPosition').replace('{time}', formattedTime.value),
)
</script>

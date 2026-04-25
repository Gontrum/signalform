<template>
  <div class="progress-container">
    <!-- Time display -->
    <!-- Issue #10: Add ARIA label for screen readers -->
    <div class="time-display" role="timer" :aria-label="`Playback time: ${formattedTime}`">
      <span>{{ formattedTime }}</span>
    </div>

    <!-- Progress bar -->
    <!-- Issue #13: Disable during loading -->
    <div
      class="progress-wrapper"
      :class="{ disabled: isLoading }"
      @mousedown="handleMouseDown"
      @touchstart="handleTouchStart"
    >
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
        <div
          class="progress-thumb"
          :style="{ left: progressPercent + '%' }"
          role="slider"
          tabindex="0"
          :aria-valuenow="currentTime"
          :aria-valuemin="0"
          :aria-valuemax="trackDuration || 0"
          :aria-label="`Playback position: ${formattedTime}`"
          @keydown="handleKeyDown"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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
</script>

<style scoped>
.progress-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 8px 0;
}

.time-display {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 500;
  color: rgb(75 85 99); /* gray-600 */
  font-variant-numeric: tabular-nums;
}

.divider {
  color: rgb(156 163 175); /* gray-400 */
}

.progress-wrapper {
  cursor: pointer;
  padding: 16px 0;
  user-select: none;
}

/* Issue #13: Disabled state during loading */
.progress-wrapper.disabled {
  opacity: 0.5;
  pointer-events: none;
  cursor: not-allowed;
}

.progress-track {
  position: relative;
  width: 100%;
  height: 4px;
  background-color: rgb(229 231 235); /* gray-200 */
  border-radius: 2px;
}

.progress-fill {
  position: absolute;
  height: 100%;
  background-color: rgb(37 99 235); /* blue-600 */
  border-radius: 2px;
  transition: width 0.1s linear;
}

.progress-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  background-color: rgb(37 99 235); /* blue-600 */
  border: 2px solid white;
  border-radius: 50%;
  cursor: grab;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.1s ease-out;
}

.progress-thumb:hover {
  transform: translate(-50%, -50%) scale(1.2);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
}

.progress-thumb:active {
  cursor: grabbing;
  background-color: rgb(29 78 216); /* blue-700 */
}

.progress-thumb:focus-visible {
  outline: 2px solid rgb(37 99 235); /* blue-600 */
  outline-offset: 2px;
}

/* Touch devices */
@media (hover: none) {
  .progress-wrapper {
    padding: 16px 0;
  }

  .progress-thumb {
    width: 20px;
    height: 20px;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .progress-fill,
  .progress-thumb {
    transition: none !important;
  }
}
</style>

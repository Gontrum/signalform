<script setup lang="ts">
import { useVolumeControl } from '@/domains/playback/shell/useVolumeControl'

const { isLoading, currentVolume, isMuted, handleVolumeChange, handleToggleMute } =
  useVolumeControl()
</script>

<template>
  <div
    class="volume-control flex items-center gap-2 px-4 py-3"
    role="group"
    aria-label="Volume control"
  >
    <!-- Mute Button -->
    <button
      type="button"
      :disabled="isLoading"
      :aria-label="isMuted ? 'Unmute' : 'Mute'"
      class="mute-button min-h-11 min-w-11 flex items-center justify-center rounded-lg border-0 bg-transparent transition-all duration-150 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2"
      :class="{ muted: isMuted }"
      @click="handleToggleMute"
    >
      <!-- Muted Speaker Icon 🔇 -->
      <svg
        v-if="isMuted"
        class="icon h-5 w-5 text-red-500"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
        />
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
        />
      </svg>

      <!-- Speaker Icon 🔊 -->
      <svg
        v-else
        class="icon h-5 w-5 text-gray-600"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
        />
      </svg>
    </button>

    <!-- Volume Slider -->
    <input
      type="range"
      min="0"
      max="100"
      :value="currentVolume ?? 50"
      :disabled="isLoading"
      aria-label="Volume slider"
      class="volume-slider flex-1 min-w-[150px] h-1 appearance-none rounded-sm bg-gray-200 outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
      :style="{
        background: `linear-gradient(to right, rgb(37 99 235) 0%, rgb(37 99 235) ${currentVolume ?? 50}%, rgb(229 231 235) ${currentVolume ?? 50}%, rgb(229 231 235) 100%)`,
      }"
      @input="handleVolumeChange"
    />

    <!-- Volume Percentage -->
    <span
      class="volume-display w-12 text-right text-sm text-gray-600"
      aria-live="polite"
      style="font-variant-numeric: tabular-nums"
    >
      {{ currentVolume ?? 50 }}%
    </span>
  </div>
</template>

<style scoped>
.mute-button.muted {
  background-color: rgb(254 242 242); /* red-50 */
}

.volume-slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  background: rgb(37 99 235); /* blue-600 */
  border: 2px solid white;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 150ms ease;
}

.volume-slider::-webkit-slider-thumb:hover {
  width: 18px;
  height: 18px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
}

.volume-slider::-webkit-slider-thumb:active {
  background: rgb(29 78 216); /* blue-700 */
}

.volume-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: rgb(37 99 235); /* blue-600 */
  border: 2px solid white;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 150ms ease;
}

.volume-slider::-moz-range-thumb:hover {
  width: 18px;
  height: 18px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
}

.volume-slider::-moz-range-thumb:active {
  background: rgb(29 78 216); /* blue-700 */
}
</style>

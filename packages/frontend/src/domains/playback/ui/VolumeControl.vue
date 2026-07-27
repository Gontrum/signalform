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
      class="mute-button flex min-h-11 min-w-11 items-center justify-center rounded-lg border-0 bg-transparent transition-all duration-200 hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-600 focus-visible:outline-offset-2"
      :class="{ 'bg-error/10': isMuted }"
      @click="handleToggleMute"
    >
      <!-- Muted Speaker Icon 🔇 -->
      <svg
        v-if="isMuted"
        class="icon h-5 w-5 text-error"
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
        class="icon h-5 w-5 text-neutral-600"
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
      class="volume-slider h-1 min-w-37.5 flex-1 cursor-pointer appearance-none rounded-sm bg-neutral-200 outline-none disabled:cursor-not-allowed disabled:opacity-40 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-accent-600 [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-200 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-accent-600 [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:duration-200 hover:[&::-webkit-slider-thumb]:h-4.5 hover:[&::-webkit-slider-thumb]:w-4.5 hover:[&::-webkit-slider-thumb]:shadow-md hover:[&::-moz-range-thumb]:h-4.5 hover:[&::-moz-range-thumb]:w-4.5 hover:[&::-moz-range-thumb]:shadow-md active:[&::-webkit-slider-thumb]:bg-accent-700 active:[&::-moz-range-thumb]:bg-accent-700"
      :style="{
        background: `linear-gradient(to right, #2563EB 0%, #2563EB ${currentVolume ?? 50}%, #E5E5E5 ${currentVolume ?? 50}%, #E5E5E5 100%)`,
      }"
      @input="handleVolumeChange"
    />

    <!-- Volume Percentage -->
    <span
      class="volume-display w-12 text-right text-sm text-neutral-600"
      aria-hidden="true"
      style="font-variant-numeric: tabular-nums"
    >
      {{ currentVolume ?? 50 }}%
    </span>
  </div>
</template>

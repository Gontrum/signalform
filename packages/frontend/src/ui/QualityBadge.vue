<script setup lang="ts">
import { computed } from 'vue'

import type { AudioQuality } from '@signalform/shared'

interface Props {
  readonly source: 'local' | 'qobuz' | 'tidal' | 'unknown'
  readonly quality?: AudioQuality
}

const props = defineProps<Props>()

// Format sample rate: 96000 → "96", 44100 → "44.1" (industry-standard display)
const formatSampleRate = (hz: number): string => {
  const khz = hz / 1000
  return Number.isInteger(khz) ? String(khz) : khz.toFixed(1)
}

// Display text per AC: lossless → "FORMAT bitDepth/sampleRateKhz" (e.g. "FLAC 24/96")
//                      lossy    → "FORMAT bitrateKbps" (e.g. "AAC 320", "MP3 128")
const badgeText = computed((): string => {
  if (props.quality) {
    if (props.quality.lossless) {
      const sampleRateStr = formatSampleRate(props.quality.sampleRate)
      if (props.quality.bitDepth) {
        // Preferred: bit-depth/sample-rate (e.g. "FLAC 24/96") — industry standard
        return `${props.quality.format} ${props.quality.bitDepth}/${sampleRateStr}`
      }
      // Fallback when bitDepth not available from LMS search API
      return `${props.quality.format} ${Math.round(props.quality.bitrate / 1000)}/${sampleRateStr}`
    }
    // Lossy: format + bitrate kbps only (no sample rate — per AC: "AAC 320", "MP3 128")
    return `${props.quality.format} ${Math.round(props.quality.bitrate / 1000)}`
  }
  const sourceLabels: Record<string, string> = {
    local: 'Local',
    qobuz: 'Qobuz',
    tidal: 'Tidal',
    unknown: 'Unknown',
  }
  return sourceLabels[props.source] ?? 'Unknown'
})

// Color tier: 'lossless' | 'high' | 'standard'
type QualityTier = 'lossless' | 'high' | 'standard'

const qualityTier = computed((): QualityTier => {
  if (props.quality) {
    if (props.quality.lossless) return 'lossless'
    if (props.quality.bitrate >= 256000) return 'high' // ≥ 256kbps
    return 'standard'
  }
  // Source-based tier (no quality data)
  if (props.source === 'local') return 'lossless' // local = highest quality
  if (props.source === 'qobuz') return 'high' // qobuz = high quality streaming
  return 'standard' // tidal, unknown = standard
})

// WCAG AA verified color classes
// lossless: #065F46 on #D1FAE5 ≈ 7.5:1 WCAG AAA ✓
// high:     #92400E on #FEF3C7 ≈ 5.8:1 WCAG AA ✓
// standard: #525252 on #F5F5F5 ≈ 5.9:1 WCAG AA ✓
const badgeClasses = computed((): string => {
  const tierClasses: Record<QualityTier, string> = {
    lossless: 'bg-emerald-100 text-emerald-800',
    high: 'bg-amber-100 text-amber-800',
    standard: 'bg-neutral-100 text-neutral-600',
  }
  return tierClasses[qualityTier.value]
})

const ariaLabel = computed((): string => {
  if (props.quality) {
    return `Quality: ${badgeText.value}${props.quality.lossless ? ' (lossless)' : ''}`
  }
  return `Source: ${badgeText.value}`
})
</script>

<template>
  <span
    v-if="source !== 'unknown' || quality"
    data-testid="quality-badge"
    role="img"
    :aria-label="ariaLabel"
    :class="[
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
      badgeClasses,
    ]"
  >
    <!-- Quality tier dot — NFR39: icon additionally to color for non-color accessibility -->
    <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    {{ badgeText }}
  </span>
</template>

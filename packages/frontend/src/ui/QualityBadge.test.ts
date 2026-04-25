import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import QualityBadge from './QualityBadge.vue'
import type { AudioQuality } from '@signalform/shared'

describe('QualityBadge', () => {
  // 5.1 — renders source badge "Local" when source=local and no quality
  it('renders source badge "Local" when source=local and no quality', () => {
    const wrapper = mount(QualityBadge, {
      props: { source: 'local' },
    })
    expect(wrapper.find('[data-testid="quality-badge"]').text()).toBe('Local')
  })

  // 5.2 — renders source badge "Qobuz" when source=qobuz and no quality
  it('renders source badge "Qobuz" when source=qobuz and no quality', () => {
    const wrapper = mount(QualityBadge, {
      props: { source: 'qobuz' },
    })
    expect(wrapper.find('[data-testid="quality-badge"]').text()).toBe('Qobuz')
  })

  // 5.3 — renders source badge "Tidal" when source=tidal and no quality
  it('renders source badge "Tidal" when source=tidal and no quality', () => {
    const wrapper = mount(QualityBadge, {
      props: { source: 'tidal' },
    })
    expect(wrapper.find('[data-testid="quality-badge"]').text()).toBe('Tidal')
  })

  // 5.4 — hides badge when source=unknown and no quality
  it('does not render badge when source=unknown and no quality', () => {
    const wrapper = mount(QualityBadge, {
      props: { source: 'unknown' },
    })
    expect(wrapper.find('[data-testid="quality-badge"]').exists()).toBe(false)
  })

  // 5.5 — renders "FLAC 24/96" for FLAC 24-bit lossless 96kHz (AC format: bitDepth/sampleRate)
  it('renders quality text "FLAC 24/96" when quality is FLAC 24-bit lossless 96kHz', () => {
    const quality: AudioQuality = {
      format: 'FLAC',
      bitDepth: 24,
      bitrate: 1411000,
      sampleRate: 96000,
      lossless: true,
    }
    const wrapper = mount(QualityBadge, {
      props: { source: 'local', quality },
    })
    expect(wrapper.find('[data-testid="quality-badge"]').text().trim()).toBe('FLAC 24/96')
  })

  // 5.5b — fallback: shows "FLAC 1411/96" (bitrate/sampleRate) when bitDepth not available
  it('renders "FLAC 1411/96" fallback when lossless but bitDepth not provided', () => {
    const quality: AudioQuality = {
      format: 'FLAC',
      bitrate: 1411000,
      sampleRate: 96000,
      lossless: true,
    }
    const wrapper = mount(QualityBadge, {
      props: { source: 'local', quality },
    })
    expect(wrapper.find('[data-testid="quality-badge"]').text().trim()).toBe('FLAC 1411/96')
  })

  // 5.5c — sample rate 44.1kHz displays as "44.1" not "44" (H2: rounding fix)
  it('displays 44.1kHz sample rate as "44.1" not "44"', () => {
    const quality: AudioQuality = {
      format: 'FLAC',
      bitDepth: 16,
      bitrate: 1411000,
      sampleRate: 44100,
      lossless: true,
    }
    const wrapper = mount(QualityBadge, {
      props: { source: 'local', quality },
    })
    expect(wrapper.find('[data-testid="quality-badge"]').text().trim()).toBe('FLAC 16/44.1')
  })

  // 5.5d — lossy format shows only bitrate, no sample rate (per AC: "AAC 320" not "AAC 320/44")
  it('renders lossy quality as "AAC 320" without sample rate', () => {
    const quality: AudioQuality = {
      format: 'AAC',
      bitrate: 320000,
      sampleRate: 44100,
      lossless: false,
    }
    const wrapper = mount(QualityBadge, {
      props: { source: 'qobuz', quality },
    })
    expect(wrapper.find('[data-testid="quality-badge"]').text().trim()).toBe('AAC 320')
  })

  // 5.6 — green class applied for lossless quality
  it('applies emerald (green) classes for lossless quality', () => {
    const quality: AudioQuality = {
      format: 'FLAC',
      bitrate: 1411000,
      sampleRate: 44100,
      lossless: true,
    }
    const wrapper = mount(QualityBadge, {
      props: { source: 'local', quality },
    })
    const badge = wrapper.find('[data-testid="quality-badge"]')
    expect(badge.classes()).toContain('bg-emerald-100')
    expect(badge.classes()).toContain('text-emerald-800')
  })

  // 5.7 — green class applied for source=local (no quality data)
  it('applies emerald (green) classes for source=local without quality', () => {
    const wrapper = mount(QualityBadge, {
      props: { source: 'local' },
    })
    const badge = wrapper.find('[data-testid="quality-badge"]')
    expect(badge.classes()).toContain('bg-emerald-100')
    expect(badge.classes()).toContain('text-emerald-800')
  })

  // 5.8 — amber class applied for high-bitrate lossy quality (bitrate ≥ 256000)
  it('applies amber classes for high-bitrate lossy quality (bitrate ≥ 256kbps)', () => {
    const quality: AudioQuality = {
      format: 'AAC',
      bitrate: 320000,
      sampleRate: 44100,
      lossless: false,
    }
    const wrapper = mount(QualityBadge, {
      props: { source: 'local', quality },
    })
    const badge = wrapper.find('[data-testid="quality-badge"]')
    expect(badge.classes()).toContain('bg-amber-100')
    expect(badge.classes()).toContain('text-amber-800')
  })

  // 5.9 — amber class applied for source=qobuz (no quality data)
  it('applies amber classes for source=qobuz without quality', () => {
    const wrapper = mount(QualityBadge, {
      props: { source: 'qobuz' },
    })
    const badge = wrapper.find('[data-testid="quality-badge"]')
    expect(badge.classes()).toContain('bg-amber-100')
    expect(badge.classes()).toContain('text-amber-800')
  })

  // 5.10 — gray class applied for standard quality (bitrate < 256kbps, non-lossless)
  it('applies gray (neutral) classes for standard quality', () => {
    const quality: AudioQuality = {
      format: 'MP3',
      bitrate: 128000,
      sampleRate: 44100,
      lossless: false,
    }
    const wrapper = mount(QualityBadge, {
      props: { source: 'local', quality },
    })
    const badge = wrapper.find('[data-testid="quality-badge"]')
    expect(badge.classes()).toContain('bg-neutral-100')
    expect(badge.classes()).toContain('text-neutral-600')
  })

  // 5.11 — gray class applied for source=tidal (no quality data maps to standard tier)
  it('applies gray (neutral) classes for source=tidal without quality', () => {
    const wrapper = mount(QualityBadge, {
      props: { source: 'tidal' },
    })
    const badge = wrapper.find('[data-testid="quality-badge"]')
    expect(badge.classes()).toContain('bg-neutral-100')
    expect(badge.classes()).toContain('text-neutral-600')
  })

  // 5.12 — has role="img" and aria-label attribute
  it('has role="img" and aria-label for accessibility', () => {
    const wrapper = mount(QualityBadge, {
      props: { source: 'qobuz' },
    })
    const badge = wrapper.find('[data-testid="quality-badge"]')
    expect(badge.attributes('role')).toBe('img')
    expect(badge.attributes('aria-label')).toContain('Qobuz')
  })

  // 5.13 — data-testid="quality-badge" present
  it('has data-testid="quality-badge" attribute', () => {
    const wrapper = mount(QualityBadge, {
      props: { source: 'local' },
    })
    expect(wrapper.find('[data-testid="quality-badge"]').exists()).toBe(true)
  })

  // Bonus: aria-label includes "(lossless)" for lossless quality
  it('includes lossless qualifier in aria-label for lossless tracks', () => {
    const quality: AudioQuality = {
      format: 'FLAC',
      bitrate: 1411000,
      sampleRate: 96000,
      lossless: true,
    }
    const wrapper = mount(QualityBadge, {
      props: { source: 'local', quality },
    })
    const badge = wrapper.find('[data-testid="quality-badge"]')
    expect(badge.attributes('aria-label')).toContain('lossless')
  })

  // NFR39: badge contains a dot icon additionally to color (non-color accessibility indicator)
  it('renders a dot icon inside the badge for non-color accessibility (NFR39)', () => {
    const wrapper = mount(QualityBadge, {
      props: { source: 'local' },
    })
    const badge = wrapper.find('[data-testid="quality-badge"]')
    // The dot is a span with rounded-full bg-current inside the badge
    const dot = badge.find('span.rounded-full.bg-current')
    expect(dot.exists()).toBe(true)
    expect(dot.attributes('aria-hidden')).toBe('true')
  })

  // Bonus: renders badge for unknown source when quality is provided
  it('renders badge for unknown source when quality prop is provided', () => {
    const quality: AudioQuality = {
      format: 'MP3',
      bitrate: 128000,
      sampleRate: 44100,
      lossless: false,
    }
    const wrapper = mount(QualityBadge, {
      props: { source: 'unknown', quality },
    })
    expect(wrapper.find('[data-testid="quality-badge"]').exists()).toBe(true)
  })
})

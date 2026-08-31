// Below sm the chip rows are single-line scrollers instead of wrapping —
// 20 genre chips otherwise stack seven rows deep and push the album grid off a
// phone screen entirely. A fade would sink the last chip's contrast and a
// scrollbar is invisible at rest on iOS and macOS, so the row clips at the
// container edge instead: the half-cut chip there is the "there is more"
// affordance. py-1 keeps the focus ring (ring-2 + ring-offset-2 = 4px) out of
// the clip.
export const CHIP_ROW_FLUSH_CLASS =
  'flex gap-2 overflow-x-auto py-1 sm:flex-wrap sm:overflow-x-visible sm:py-0'

// The bleed only cancels out inside a container padded exactly px-4: the
// negative margin widens the row by 32px and the padding gives it back as
// scrollable inset. Anywhere else the row hangs 16px past each edge of its box,
// and the nearest ancestor with overflow-y-auto turns the right-hand overhang
// into real horizontal scrolling of that whole pane. Such a place takes
// CHIP_ROW_FLUSH_CLASS.
const CHIP_ROW_EDGE_BLEED_CLASS = '-mx-4 px-4 sm:mx-0 sm:px-0'

export const CHIP_ROW_CLASS = `${CHIP_ROW_EDGE_BLEED_CLASS} ${CHIP_ROW_FLUSH_CLASS}`

const CHIP_CLASS =
  'min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

const CHIP_ACTIVE_CLASS = 'border-neutral-900 bg-neutral-900 text-white'

const CHIP_INACTIVE_CLASS =
  'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'

export const chipClass = (isActive: boolean): readonly string[] => [
  CHIP_CLASS,
  isActive ? CHIP_ACTIVE_CLASS : CHIP_INACTIVE_CLASS,
]

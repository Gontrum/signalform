// Below sm the chip rows are single-line scrollers instead of wrapping —
// 20 genre chips otherwise stack seven rows deep and push the album grid off a
// phone screen entirely. The horizontal padding is inside the scroller and
// cancelled by the negative margin so the row clips at the screen edge: the
// half-cut chip there is the "there is more" affordance. A fade would sink the
// last chip's contrast and a scrollbar is invisible at rest on iOS and macOS.
// py-1 keeps the focus ring (ring-2 + ring-offset-2 = 4px) out of the clip.
export const CHIP_ROW_CLASS =
  '-mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:py-0'

const CHIP_CLASS =
  'min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

const CHIP_ACTIVE_CLASS = 'border-neutral-900 bg-neutral-900 text-white'

const CHIP_INACTIVE_CLASS =
  'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'

export const chipClass = (isActive: boolean): readonly string[] => [
  CHIP_CLASS,
  isActive ? CHIP_ACTIVE_CLASS : CHIP_INACTIVE_CLASS,
]

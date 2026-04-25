import { useBreakpoints } from '@vueuse/core'
import { computed, type ComputedRef } from 'vue'

interface ResponsiveLayout {
  readonly isPhone: ComputedRef<boolean>
  readonly isTablet: ComputedRef<boolean>
  readonly isDesktop: ComputedRef<boolean>
}

/**
 * Composable for responsive layout breakpoint detection
 *
 * Breakpoints:
 * - phone: < 768px
 * - tablet: 768px - 1279px
 * - desktop: >= 1280px
 *
 * @returns {ResponsiveLayout} Reactive breakpoint flags
 */
export const useResponsiveLayout = (): ResponsiveLayout => {
  const breakpoints = useBreakpoints({
    phone: 0,
    tablet: 768,
    desktop: 1280,
  })

  const isPhone = computed(() => breakpoints.smaller('tablet').value)
  const isTablet = computed(() => breakpoints.between('tablet', 'desktop').value)
  const isDesktop = computed(() => breakpoints.greaterOrEqual('desktop').value)

  return {
    isPhone,
    isTablet,
    isDesktop,
  }
}

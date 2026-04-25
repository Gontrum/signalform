import { describe, it, expect } from 'vitest'
import { isRef } from 'vue'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'

describe('useResponsiveLayout', () => {
  it('returns responsive layout interface with computed refs', async () => {
    const layout = whenUseResponsiveLayoutIsCalled()

    await thenIsPhoneIsComputedRef(layout)
    await thenIsTabletIsComputedRef(layout)
    await thenIsDesktopIsComputedRef(layout)
  })

  it('returns boolean values for breakpoint flags', async () => {
    const layout = whenUseResponsiveLayoutIsCalled()

    await thenBreakpointFlagsAreBoolean(layout)
  })

  // === WHEN ===

  const whenUseResponsiveLayoutIsCalled = (): ReturnType<typeof useResponsiveLayout> => {
    return useResponsiveLayout()
  }

  // === THEN ===

  const thenIsPhoneIsComputedRef = async (
    layout: ReturnType<typeof useResponsiveLayout>,
  ): Promise<void> => {
    expect(isRef(layout.isPhone)).toBe(true)
    expect(typeof layout.isPhone.value).toBe('boolean')
  }

  const thenIsTabletIsComputedRef = async (
    layout: ReturnType<typeof useResponsiveLayout>,
  ): Promise<void> => {
    expect(isRef(layout.isTablet)).toBe(true)
    expect(typeof layout.isTablet.value).toBe('boolean')
  }

  const thenIsDesktopIsComputedRef = async (
    layout: ReturnType<typeof useResponsiveLayout>,
  ): Promise<void> => {
    expect(isRef(layout.isDesktop)).toBe(true)
    expect(typeof layout.isDesktop.value).toBe('boolean')
  }

  const thenBreakpointFlagsAreBoolean = async (
    layout: ReturnType<typeof useResponsiveLayout>,
  ): Promise<void> => {
    expect(typeof layout.isPhone.value).toBe('boolean')
    expect(typeof layout.isTablet.value).toBe('boolean')
    expect(typeof layout.isDesktop.value).toBe('boolean')
  }
})

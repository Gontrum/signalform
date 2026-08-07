/**
 * AppLayout — the right column is a landmark, so its accessible name is the
 * only thing naming it.
 *
 * Every case mounts in English and switches afterwards, because that is the
 * order the app runs in: the language comes from the server config and lands
 * after this layout has been set up. Setting it before mounting would let a
 * label read once during setup pass.
 *
 * Own file to keep AppLayout.test.ts about breakpoints.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import AppLayout from './AppLayout.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import { useI18nStore } from '@/app/i18nStore'
import type { Language } from '@/types/i18n'

const createMatchMediaMock = (): ((query: string) => MediaQueryList) => {
  return (query: string): MediaQueryList => {
    const minWidthMatch = /min-width:\s*(\d+(?:\.\d+)?)px/.exec(query)
    const maxWidthMatch = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(query)
    const matches = minWidthMatch
      ? globalThis.innerWidth >= parseFloat(minWidthMatch[1] ?? '0')
      : maxWidthMatch
        ? globalThis.innerWidth <= parseFloat(maxWidthMatch[1] ?? '0')
        : false

    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
  }
}

const mountLayout = async (): Promise<VueWrapper> => {
  setupTestEnv()

  const router = await createTestRouter([{ path: '/', component: { template: '<div />' } }])

  return mount(AppLayout, { global: { plugins: [router] } })
}

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const rightPanelLabel = (wrapper: VueWrapper): string | undefined =>
  wrapper.find('[data-testid="right-panel"]').attributes('aria-label')

describe('AppLayout — now-playing landmark name', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('innerWidth', 1024)
    vi.stubGlobal('matchMedia', vi.fn(createMatchMediaMock()))
  })

  it('names the right panel in English', async () => {
    expect(rightPanelLabel(await mountLayout())).toBe('Now Playing')
  })

  it('names the right panel in German', async () => {
    const wrapper = await mountLayout()

    await switchTo('de')

    expect(rightPanelLabel(wrapper)).toBe('Läuft gerade')
  })
})

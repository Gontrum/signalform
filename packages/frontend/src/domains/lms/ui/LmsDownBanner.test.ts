import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LmsDownBanner from '@/domains/lms/ui/LmsDownBanner.vue'
import { setupTestEnv } from '@/test-utils'

describe('LmsDownBanner', () => {
  beforeEach(() => {
    setupTestEnv()
  })

  it('renders the localized banner text', () => {
    const wrapper = mount(LmsDownBanner)
    expect(wrapper.text()).toBe('LMS server unreachable — trying to wake it…')
  })

  it('renders the German text when the language is German', () => {
    const i18nStore = setupTestEnv()
    i18nStore.setLanguage('de')

    const wrapper = mount(LmsDownBanner)
    expect(wrapper.text()).toBe('LMS-Server nicht erreichbar — Weckversuch läuft…')
  })

  it('exposes an accessible polite status region', () => {
    const wrapper = mount(LmsDownBanner)
    const banner = wrapper.find('[data-testid="lms-down-banner"]')

    expect(banner.exists()).toBe(true)
    expect(banner.attributes('role')).toBe('status')
    expect(banner.attributes('aria-live')).toBe('polite')
  })
})

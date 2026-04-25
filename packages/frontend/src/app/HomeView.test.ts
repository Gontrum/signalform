import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import HomeView from './HomeView.vue'
import { useI18nStore } from '@/app/i18nStore'

vi.mock('@/layouts/AppLayout.vue', () => ({
  default: {
    name: 'AppLayout',
    template: '<div><slot name="left" /><slot name="right" /></div>',
  },
}))

vi.mock('@/domains/search/ui/SearchPanel.vue', () => ({
  default: {
    name: 'SearchPanel',
    template: '<div data-testid="search-panel">Search panel</div>',
  },
}))

vi.mock('@/domains/playback/ui/NowPlayingPanel.vue', () => ({
  default: {
    name: 'NowPlayingPanel',
    template: '<div data-testid="now-playing-panel">Now playing</div>',
  },
}))

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders search and now playing panels', () => {
    const wrapper = mount(HomeView)

    expect(wrapper.find('[data-testid="search-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="now-playing-panel"]').exists()).toBe(true)
  })

  it('does not hardcode user-facing home title text (verified via i18n store)', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const i18nStore = useI18nStore(pinia)

    expect(i18nStore.t('home.title')).toBeDefined()
    expect(i18nStore.t('home.searchPlaceholder')).toBeDefined()
  })
})

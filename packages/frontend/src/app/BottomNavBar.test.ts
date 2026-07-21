import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Router } from 'vue-router'
import { createTestRouter, setupTestEnv } from '@/test-utils'
import BottomNavBar from './BottomNavBar.vue'

const createRouter = async (): Promise<Router> => {
  return createTestRouter([
    { path: '/', component: { template: '<div />' } },
    { path: '/library', component: { template: '<div />' } },
    { path: '/queue', component: { template: '<div />' } },
    { path: '/settings', component: { template: '<div />' } },
    { path: '/settings/profile', component: { template: '<div />' } },
  ])
}

beforeEach(() => {
  setupTestEnv()
})

describe('BottomNavBar', () => {
  it('renders a full-width, non-shrinking bottom nav container', async () => {
    const router = await createRouter()
    const wrapper = mount(BottomNavBar, { global: { plugins: [router] } })

    const nav = wrapper.find('[data-testid="bottom-nav"]')
    expect(nav.exists()).toBe(true)
    expect(nav.element.tagName).toBe('NAV')
    // The nav is a normal flex child of App.vue's column layout, not fixed.
    expect(nav.classes()).not.toContain('fixed')
    expect(nav.classes()).toContain('w-full')
    expect(nav.classes()).toContain('shrink-0')
    expect(nav.classes()).toContain('overflow-hidden')
  })

  it('applies the app-chrome class to the root nav for native-feeling touch behavior', async () => {
    const router = await createRouter()
    const wrapper = mount(BottomNavBar, { global: { plugins: [router] } })
    expect(wrapper.find('[data-testid="bottom-nav"]').classes()).toContain('app-chrome')
  })

  it('labels the landmark with its own distinct name', async () => {
    const router = await createRouter()
    const wrapper = mount(BottomNavBar, { global: { plugins: [router] } })

    const nav = wrapper.find('[data-testid="bottom-nav"]')
    expect(nav.attributes('aria-label')).toBe('Primary')
  })

  it('renders four links with correct destinations and testids', async () => {
    const router = await createRouter()
    const wrapper = mount(BottomNavBar, { global: { plugins: [router] } })

    const cases = [
      { testid: 'bottom-nav-search', href: '/' },
      { testid: 'bottom-nav-library', href: '/library' },
      { testid: 'bottom-nav-queue', href: '/queue' },
      { testid: 'bottom-nav-settings', href: '/settings' },
    ] as const

    cases.forEach(({ testid, href }) => {
      const link = wrapper.find(`[data-testid="${testid}"]`)
      expect(link.exists()).toBe(true)
      expect(link.element.tagName).toBe('A')
      expect(link.attributes('href')).toBe(href)
    })
  })

  it('exposes i18n labels on each link', async () => {
    const router = await createRouter()
    const wrapper = mount(BottomNavBar, { global: { plugins: [router] } })

    expect(wrapper.find('[data-testid="bottom-nav-search"]').text()).toContain('Search')
    expect(wrapper.find('[data-testid="bottom-nav-library"]').text()).toContain('Library')
    expect(wrapper.find('[data-testid="bottom-nav-queue"]').text()).toContain('Queue')
    expect(wrapper.find('[data-testid="bottom-nav-settings"]').text()).toContain('Settings')

    expect(wrapper.find('[data-testid="bottom-nav-queue"]').attributes('aria-label')).toBe('Queue')
  })

  it('marks Search active with aria-current on /', async () => {
    const router = await createRouter()
    const wrapper = mount(BottomNavBar, { global: { plugins: [router] } })

    expect(wrapper.find('[data-testid="bottom-nav-search"]').attributes('aria-current')).toBe(
      'page',
    )
    expect(
      wrapper.find('[data-testid="bottom-nav-library"]').attributes('aria-current'),
    ).toBeUndefined()
  })

  it('marks Library active with aria-current on /library', async () => {
    const router = await createRouter()
    await router.push('/library')
    await router.isReady()
    const wrapper = mount(BottomNavBar, { global: { plugins: [router] } })

    expect(wrapper.find('[data-testid="bottom-nav-library"]').attributes('aria-current')).toBe(
      'page',
    )
    expect(
      wrapper.find('[data-testid="bottom-nav-search"]').attributes('aria-current'),
    ).toBeUndefined()
  })

  it('marks Queue active with aria-current on /queue', async () => {
    const router = await createRouter()
    await router.push('/queue')
    await router.isReady()
    const wrapper = mount(BottomNavBar, { global: { plugins: [router] } })

    expect(wrapper.find('[data-testid="bottom-nav-queue"]').attributes('aria-current')).toBe('page')
  })

  it('keeps Settings active on nested settings routes', async () => {
    const router = await createRouter()
    await router.push('/settings/profile')
    await router.isReady()
    const wrapper = mount(BottomNavBar, { global: { plugins: [router] } })

    expect(wrapper.find('[data-testid="bottom-nav-settings"]').attributes('aria-current')).toBe(
      'page',
    )
  })

  it('applies active styling to the active link label', async () => {
    const router = await createRouter()
    const wrapper = mount(BottomNavBar, { global: { plugins: [router] } })

    const activeLink = wrapper.find('[data-testid="bottom-nav-search"]')
    expect(activeLink.classes()).toContain('text-accent-500')

    const inactiveLink = wrapper.find('[data-testid="bottom-nav-library"]')
    expect(inactiveLink.classes()).toContain('text-neutral-500')
  })
})

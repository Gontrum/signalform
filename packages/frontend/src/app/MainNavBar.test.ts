import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Router } from 'vue-router'
import { createTestRouter, setupTestEnv } from '@/test-utils'
import MainNavBar from './MainNavBar.vue'

const createRouter = async (): Promise<Router> => {
  return createTestRouter([
    { path: '/', component: { template: '<div />' } },
    { path: '/library', component: { template: '<div />' } },
    { path: '/queue', component: { template: '<div />' } },
    { path: '/settings', component: { template: '<div />' } },
    { path: '/settings/profile', component: { template: '<div />' } },
  ])
}

const setViewportWidth = (width: number): void => {
  vi.stubGlobal('innerWidth', width)
}

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

beforeEach(() => {
  setupTestEnv()
  // Default to a desktop viewport so the top-nav link row renders.
  setViewportWidth(1280)
  vi.stubGlobal('matchMedia', vi.fn(createMatchMediaMock()))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MainNavBar', () => {
  it('renders Signalform brand badge with icon and name', async () => {
    const router = await createRouter()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })
    const badge = wrapper.find('[data-testid="brand-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('Signalform')
    expect(wrapper.find('[data-testid="brand-motto"]').text()).toBe('Focus on the music')

    const icon = badge.find('img')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('src')).toBe('/icon-192.png')
    expect(icon.attributes('alt')).toBe('Signalform icon')
  })

  it('renders a semantic nav element with aria-label from i18n', async () => {
    const router = await createRouter()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })
    const nav = wrapper.find('[data-testid="main-nav"]')
    expect(nav.exists()).toBe(true)
    expect(nav.element.tagName).toBe('NAV')
    expect(nav.attributes('aria-label')).toBe('Signalform · Focus on the music')
  })

  it('renders a link to /library with correct href', async () => {
    const router = await createRouter()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })
    const link = wrapper.find('[data-testid="nav-library"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/library')
  })

  it('renders a link to / (Search/Home) with correct href', async () => {
    const router = await createRouter()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })
    const link = wrapper.find('[data-testid="nav-search"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/')
  })

  it('marks Search as active (aria-current=page, active class) when on /', async () => {
    const router = await createRouter()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })
    const searchLink = wrapper.find('[data-testid="nav-search"]')
    const libraryLink = wrapper.find('[data-testid="nav-library"]')
    expect(searchLink.attributes('aria-current')).toBe('page')
    expect(searchLink.classes()).toContain('bg-neutral-950')
    expect(libraryLink.attributes('aria-current')).toBeUndefined()
    expect(libraryLink.classes()).toContain('text-neutral-600')
  })

  it('marks Library as active (aria-current=page, active class) when on /library', async () => {
    const router = await createRouter()
    await router.push('/library')
    await router.isReady()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })
    const libraryLink = wrapper.find('[data-testid="nav-library"]')
    const searchLink = wrapper.find('[data-testid="nav-search"]')
    expect(libraryLink.attributes('aria-current')).toBe('page')
    expect(libraryLink.classes()).toContain('bg-neutral-950')
    expect(searchLink.attributes('aria-current')).toBeUndefined()
    expect(searchLink.classes()).toContain('text-neutral-600')
  })

  it('renders a link to /queue with correct href', async () => {
    const router = await createRouter()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })
    const link = wrapper.find('[data-testid="nav-queue"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/queue')
    expect(link.attributes('aria-label')).toBe('Queue')
  })

  it('marks Queue as active (aria-current=page, active class) when on /queue', async () => {
    const router = await createRouter()
    await router.push('/queue')
    await router.isReady()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })
    const queueLink = wrapper.find('[data-testid="nav-queue"]')
    const searchLink = wrapper.find('[data-testid="nav-search"]')
    expect(queueLink.attributes('aria-current')).toBe('page')
    expect(queueLink.classes()).toContain('bg-neutral-950')
    expect(searchLink.attributes('aria-current')).toBeUndefined()
    expect(searchLink.classes()).toContain('text-neutral-600')
  })

  it('does not mark Queue as active on other routes', async () => {
    const router = await createRouter()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })
    const queueLink = wrapper.find('[data-testid="nav-queue"]')
    expect(queueLink.attributes('aria-current')).toBeUndefined()
    expect(queueLink.classes()).toContain('text-neutral-600')
  })

  it('renders nav links as anchor elements (keyboard accessible)', async () => {
    const router = await createRouter()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })
    expect(wrapper.find('[data-testid="nav-search"]').element.tagName).toBe('A')
    expect(wrapper.find('[data-testid="nav-library"]').element.tagName).toBe('A')
  })

  it('groups mobile nav links inside a shared pill container', async () => {
    const router = await createRouter()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })
    const linkGroup = wrapper.find('[data-testid="nav-links"]')

    expect(linkGroup.exists()).toBe(true)
    expect(linkGroup.classes()).toContain('rounded-2xl')
    expect(linkGroup.classes()).toContain('bg-neutral-100/80')
  })

  it('renders the top-nav link row on desktop', async () => {
    setViewportWidth(1280)
    const router = await createRouter()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })

    expect(wrapper.find('[data-testid="nav-links"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nav-search"]').exists()).toBe(true)
  })

  it('does not render the top-nav link row on phone', async () => {
    setViewportWidth(375)
    const router = await createRouter()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })

    expect(wrapper.find('[data-testid="nav-links"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="nav-search"]').exists()).toBe(false)
    // Brand badge stays visible in the top bar.
    expect(wrapper.find('[data-testid="brand-badge"]').exists()).toBe(true)
  })

  it('keeps Settings active on nested settings routes', async () => {
    const router = await createRouter()
    await router.push('/settings/profile')
    await router.isReady()
    const wrapper = mount(MainNavBar, { global: { plugins: [router] } })

    expect(wrapper.find('[data-testid="nav-settings"]').attributes('aria-current')).toBe('page')
  })
})

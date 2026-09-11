import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import type { Router } from 'vue-router'
import { createTestRouter, setupTestEnv } from '@/test-utils'

// The panel owns its own fetching (usePlaylists → playlistsApi); this file is
// about the screen around it.
vi.mock('./PlaylistsPanel.vue', () => ({
  default: {
    name: 'PlaylistsPanel',
    template: '<div data-testid="playlists-panel-stub" />',
  },
}))

import PlaylistsView from './PlaylistsView.vue'

const makeRouter = async (): Promise<Router> =>
  await createTestRouter(
    [
      { path: '/queue', name: 'queue', component: { template: '<div />' } },
      { path: '/playlists', name: 'playlists', component: PlaylistsView },
    ],
    '/playlists',
  )

// Attached to the document because the focus case reads document.activeElement
// — which means every wrapper has to come down again, or its <h1> is left in
// the document and the next case's focus assertion is decided by test order.
enableAutoUnmount(afterEach)

const mountView = async (): Promise<{
  readonly wrapper: VueWrapper
  readonly router: Router
}> => {
  const router = await makeRouter()
  const wrapper = mount(PlaylistsView, {
    attachTo: document.body,
    global: { plugins: [router] },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('PlaylistsView', () => {
  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
  })

  it('renders the playlists panel as the body of the screen', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="playlists-panel-stub"]').exists()).toBe(true)
  })

  // The title itself reads 'Playlists' in both languages, so asserting only it
  // would pass on any translation at all. The back control is the string on
  // this screen that actually differs.
  it('titles the screen and labels its back control in both languages', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('h1').text()).toBe('Playlists')
    expect(wrapper.find('[data-testid="page-header-back"]').attributes('aria-label')).toBe('Back')

    setupTestEnv().setLanguage('de')
    const german = await mountView()

    expect(german.wrapper.find('h1').text()).toBe('Playlists')
    expect(german.wrapper.find('[data-testid="page-header-back"]').attributes('aria-label')).toBe(
      'Zurück',
    )
  })

  // Installed as a PWA there is no browser back button, so a pushed route
  // without this control is a dead end that costs a force-quit.
  it('offers a back control that calls router.back()', async () => {
    const { wrapper, router } = await mountView()
    const backSpy = vi.spyOn(router, 'back')

    const back = wrapper.find('[data-testid="page-header-back"]')
    expect(back.exists()).toBe(true)

    await back.trigger('click')
    expect(backSpy).toHaveBeenCalled()
  })

  // The screen owns the only vertical scroller; the panel inside it must not
  // add a second one (see docs/mobile-pwa.md rules 1 and 2). jsdom cannot
  // measure that — the proof is e2e/journeys/phone-layout.spec.ts.
  it('puts the screen scroller on its own root', async () => {
    const { wrapper } = await mountView()

    const rootClasses = wrapper.find('[data-testid="playlists-view"]').classes()
    expect(rootClasses).toContain('overflow-y-auto')
    expect(rootClasses).toContain('h-full')
  })

  // A pushed route otherwise leaves screen-reader focus on the menu item that
  // opened it, and the screen change is announced nowhere.
  it('moves focus to the screen title on entry', async () => {
    const { wrapper } = await mountView()

    const title = wrapper.find('h1')
    expect(title.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(title.element)
  })
})

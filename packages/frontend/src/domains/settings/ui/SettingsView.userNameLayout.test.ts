import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount, VueWrapper, flushPromises } from '@vue/test-utils'
import SettingsView from '@/domains/settings/ui/SettingsView.vue'
import { setupTestEnv, createTestRouter } from '@/test-utils'
import type { Router } from 'vue-router'

// ---------------------------------------------------------------------------
// Regression coverage for the user-row name truncation bug: the row renders
// inside AppLayout's left column, which is only 60% of the *viewport* width
// on tablet/desktop, not the full viewport — so a `md:flex-row` layout on
// the row (reacting to viewport width, not the narrower column it actually
// lives in) squeezed long names against a wrapping button group and clipped
// them. The fix always stacks name-above-buttons regardless of viewport
// width. See SettingsView.vue and SettingsView.test.ts for the companion
// class-list assertions; this file focuses on real long-name content not
// being clipped, using a name long enough (two words, 25+ characters) that
// a narrow-column truncation bug reliably reproduces.
// ---------------------------------------------------------------------------

const isPhone = ref(false)

vi.mock('@/app/useResponsiveLayout', () => ({
  useResponsiveLayout: (): {
    readonly isPhone: typeof isPhone
    readonly isTablet: ReturnType<typeof ref<boolean>>
    readonly isDesktop: ReturnType<typeof ref<boolean>>
  } => ({
    isPhone,
    isTablet: ref(false),
    isDesktop: ref(true),
  }),
}))

vi.mock('@/platform/api/configApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    getConfig: vi.fn().mockResolvedValue(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: false,
        hasLastFmSharedSecret: false,
        hasFanartKey: false,
        isConfigured: true,
        configuredAt: '2024-01-01T00:00:00Z',
        personalRadioEnabled: false,
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      }),
    ),
    updateConfig: vi.fn().mockResolvedValue(
      ok({
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: false,
        hasLastFmSharedSecret: false,
        hasFanartKey: false,
        isConfigured: true,
        configuredAt: '2024-01-01T00:00:00Z',
        personalRadioEnabled: false,
        scrobblingEnabled: false,
        personalRadioDiscovery: 50,
      }),
    ),
  }
})

vi.mock('@/platform/api/setupApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    discoverServers: vi.fn().mockResolvedValue(ok([])),
    getPlayers: vi.fn().mockResolvedValue(ok([])),
  }
})

vi.mock('@/platform/api/lastFmAuthApi', () => ({
  requestLastFmAuth: vi.fn().mockResolvedValue(null),
  completeLastFmAuth: vi.fn().mockResolvedValue(null),
  disconnectLastFm: vi.fn().mockResolvedValue(false),
}))

// vi.mock factories are hoisted above the rest of this module, so a plain
// top-level `const` referenced directly inside a factory body (not inside a
// nested closure deferred until call time, unlike `isPhone` above) would hit
// a temporal-dead-zone ReferenceError. `vi.hoisted` guarantees this value is
// initialized before any hoisted `vi.mock` factory runs.
const { LONG_NAME } = vi.hoisted(() => ({ LONG_NAME: 'Maximilian Schwarzenberg-Müller' }))

vi.mock('@/platform/api/usersApi', async () => {
  const { ok } = await import('@signalform/shared')
  return {
    getUsers: vi.fn().mockResolvedValue(
      ok({
        users: [{ id: 'u1', name: LONG_NAME, hasLastFmSession: false }],
        activeListenerId: undefined,
      }),
    ),
    createUser: vi.fn().mockResolvedValue(ok({ id: 'u2', name: 'X' })),
    renameUser: vi.fn().mockResolvedValue(ok(undefined)),
    deleteUser: vi.fn().mockResolvedValue(ok(undefined)),
  }
})

const settingsRoutes = [
  { path: '/', name: 'home', component: { template: '<div />' } },
  { path: '/settings', name: 'settings', component: { template: '<div />' } },
  { path: '/setup', name: 'setup', component: { template: '<div />' } },
] as const

describe('SettingsView - user name layout regression', () => {
  beforeEach(() => {
    setupTestEnv()
    localStorage.clear()
    vi.clearAllMocks()
    isPhone.value = false
  })

  const createRouter = async (): Promise<Router> => {
    return createTestRouter([...settingsRoutes], '/settings')
  }

  const mountView = async (router: Router): Promise<VueWrapper> => {
    const wrapper = mount(SettingsView, {
      global: { plugins: [router] },
    })
    await vi.dynamicImportSettled()
    await flushPromises()
    return wrapper
  }

  it('does not truncate a long two-word user name and renders it in full', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    const nameEl = wrapper.find('[data-testid="user-name"]')
    expect(nameEl.text()).toBe(LONG_NAME)
    // The truncate utility class (overflow-hidden + text-overflow: ellipsis +
    // whitespace-nowrap) is exactly what caused the earlier bug: it silently
    // clips content instead of wrapping it. It must not be present on the
    // name element regardless of the surrounding column width.
    expect(nameEl.classes()).not.toContain('truncate')
  })

  it('keeps the user row and name wrapper free of viewport-breakpoint row classes', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    const row = wrapper.find('[data-testid="user-row"]')
    expect(row.classes()).not.toContain('md:flex-row')
    expect(row.classes()).not.toContain('sm:flex-row')

    const nameWrapper = wrapper.find('[data-testid="user-name"]').element.parentElement
    expect(nameWrapper).not.toBeNull()
    if (nameWrapper !== null) {
      expect(nameWrapper.className).not.toContain('md:flex-1')
      expect(nameWrapper.className).not.toContain('md:min-w')
    }
  })

  it('does not truncate a long name while the user row is in rename mode', async () => {
    const router = await createRouter()
    const wrapper = await mountView(router)

    await wrapper.find('[data-testid="user-rename-button"]').trigger('click')

    const renameRow = wrapper.find('[data-testid="user-row"]')
    expect(renameRow.classes()).not.toContain('md:flex-row')

    const renameInput = wrapper.find('[data-testid="user-rename-input"]')
    expect(renameInput.exists()).toBe(true)
    expect(renameInput.classes()).not.toContain('md:flex-1')
  })
})

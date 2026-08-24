/**
 * SetupWizardView — the "online" badge on a reachable player and the closing
 * sentence that names host and player.
 *
 * Own file so SetupWizard.test.ts stays about the step machine. Every case
 * mounts in English and switches afterwards, because that is the order the app
 * runs in: the language comes from the server config and lands after the
 * wizard has been set up.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import type { Router } from 'vue-router'
import type { VueWrapper } from '@vue/test-utils'
import type { Language } from '@/types/i18n'
import SetupWizardView from '@/domains/setup/ui/SetupWizardView.vue'
import { setupTestEnv } from '@/test-utils'
import { useI18nStore } from '@/app/i18nStore'

vi.mock('@/platform/api/setupApi', () => ({
  discoverServers: vi.fn(),
  getPlayers: vi.fn(),
}))

vi.mock('@/platform/api/configApi', () => ({
  updateConfig: vi.fn(),
}))

import { discoverServers, getPlayers } from '@/platform/api/setupApi'
import { updateConfig } from '@/platform/api/configApi'

const makeRouter = (): Router =>
  createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/setup', name: 'setup', component: SetupWizardView },
      { path: '/', name: 'home', component: { template: '<div />' } },
    ],
  })

const switchTo = async (language: Language): Promise<void> => {
  useI18nStore().setLanguage(language)
  await nextTick()
}

const mountAtPlayerStep = async (): Promise<VueWrapper> => {
  setupTestEnv()

  const router = makeRouter()
  await router.push('/setup')
  await router.isReady()

  const wrapper = mount(SetupWizardView, { global: { plugins: [router] } })
  await wrapper.find('[data-testid="manual-host-input"]').setValue('192.168.1.100')
  await wrapper.find('[data-testid="proceed-to-player-button"]').trigger('click')
  await flushPromises()
  return wrapper
}

const mountAtDoneStep = async (): Promise<VueWrapper> => {
  const wrapper = await mountAtPlayerStep()
  await wrapper.find('[data-testid="player-item"]').trigger('click')
  await wrapper.find('[data-testid="proceed-to-keys-button"]').trigger('click')
  await wrapper.find('[data-testid="skip-keys-button"]').trigger('click')
  await flushPromises()
  return wrapper
}

describe('SetupWizardView — player and completion text in both languages', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(discoverServers).mockResolvedValue({ ok: true, value: [] })
    vi.mocked(getPlayers).mockResolvedValue({
      ok: true,
      value: [
        { id: 'aa:bb:cc:dd:ee:ff', name: 'Living Room', model: 'squeezelite', connected: true },
      ],
    })
    vi.mocked(updateConfig).mockResolvedValue({
      ok: true,
      value: {
        lmsHost: '192.168.1.100',
        lmsPort: 9000,
        playerId: 'aa:bb:cc:dd:ee:ff',
        hasLastFmKey: false,
        hasLastFmSharedSecret: false,
        hasFanartKey: false,
        hasDiscogsToken: false,
        isConfigured: true,
        language: 'en',
      },
    })
  })

  // The word reads the same in both languages — which is why a literal would
  // hide a key that only exists in `en` and renders as its own id here.
  it('badges a reachable player in both languages', async () => {
    const wrapper = await mountAtPlayerStep()
    expect(wrapper.find('[data-testid="player-online-badge"]').text()).toBe('online')

    await switchTo('de')

    expect(wrapper.find('[data-testid="player-online-badge"]').text()).toBe('online')
  })

  // One sentence, two values: German moves "verbunden" behind the player, so
  // gluing translated fragments around host and player cannot produce it.
  it('names host and player in the English closing sentence', async () => {
    const wrapper = await mountAtDoneStep()

    expect(wrapper.find('[data-testid="setup-done-message"]').text()).toBe(
      'Signalform is connected to 192.168.1.100 · Living Room.',
    )
  })

  it('reorders the closing sentence when German arrives after mount', async () => {
    const wrapper = await mountAtDoneStep()

    await switchTo('de')

    expect(wrapper.find('[data-testid="setup-done-message"]').text()).toBe(
      'Signalform ist mit 192.168.1.100 · Living Room verbunden.',
    )
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import type { Router } from 'vue-router'
import NowPlayingView from './NowPlayingView.vue'
import { createTestRouter, setupTestEnv } from '@/test-utils'

const isPhone = ref(true)

vi.mock('@/app/useResponsiveLayout', () => ({
  useResponsiveLayout: (): {
    readonly isPhone: typeof isPhone
    readonly isTablet: ReturnType<typeof ref<boolean>>
    readonly isDesktop: ReturnType<typeof ref<boolean>>
  } => ({
    isPhone,
    isTablet: ref(false),
    isDesktop: ref(false),
  }),
}))

vi.mock('@/domains/playback/ui/NowPlayingPanel.vue', () => ({
  default: {
    name: 'NowPlayingPanel',
    template: '<div data-testid="now-playing-panel">Now playing panel</div>',
  },
}))

describe('NowPlayingView', () => {
  const patchQueuePreview = async (
    queuePreview: readonly {
      readonly id: string
      readonly title: string
      readonly artist: string
    }[],
  ): Promise<void> => {
    const { usePlaybackStore } = await import('@/domains/playback/shell/usePlaybackStore')
    usePlaybackStore().$patch({ queuePreview })
    await flushPromises()
  }

  beforeEach(() => {
    setupTestEnv()
    vi.clearAllMocks()
    isPhone.value = true
  })

  const mountView = async (): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [
        { path: '/now-playing', component: NowPlayingView },
        { path: '/queue', name: 'queue', component: { template: '<div>Queue</div>' } },
      ],
      '/now-playing',
    )

    const wrapper = mount(NowPlayingView, {
      global: { plugins: [router] },
    })

    await flushPromises()
    return { wrapper, router }
  }

  it('shows a fixed queue shortcut on phone when the queue has tracks', async () => {
    const { wrapper } = await mountView()
    await patchQueuePreview([{ id: '1', title: 'Believe', artist: 'Cher' }])

    const shortcut = wrapper.find('[data-testid="now-playing-queue-shortcut"]')
    expect(shortcut.exists()).toBe(true)
    expect(shortcut.text()).toContain('View Full Queue')
    expect(wrapper.text().match(/View Full Queue/g)?.length ?? 0).toBe(1)

    const scrollContainer = wrapper.find('.overflow-auto')
    expect(scrollContainer.classes()).toContain('pb-[calc(7rem+env(safe-area-inset-bottom))]')
  })

  it('navigates to the queue when the fixed shortcut is pressed', async () => {
    const { wrapper, router } = await mountView()
    await patchQueuePreview([{ id: '1', title: 'Believe', artist: 'Cher' }])

    await wrapper.find('[data-testid="now-playing-queue-shortcut"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('queue')
  })

  it('does not show the fixed queue shortcut when there are no queued tracks', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="now-playing-queue-shortcut"]').exists()).toBe(false)
  })

  it('does not show the fixed queue shortcut off phone layouts', async () => {
    isPhone.value = false

    const { wrapper } = await mountView()
    await patchQueuePreview([{ id: '1', title: 'Believe', artist: 'Cher' }])

    expect(wrapper.find('[data-testid="now-playing-queue-shortcut"]').exists()).toBe(false)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Router } from 'vue-router'
import PageHeader from './PageHeader.vue'
import { createTestRouter, setupTestEnv } from '@/test-utils'

describe('PageHeader', () => {
  beforeEach(() => {
    setupTestEnv()
  })

  const mountHeader = async (
    props: {
      readonly title: string
      readonly showBack?: boolean
      readonly backIcon?: 'left' | 'down'
    },
    slots?: Record<string, string>,
  ): Promise<{
    readonly wrapper: ReturnType<typeof mount>
    readonly router: Router
  }> => {
    const router = await createTestRouter(
      [
        { path: '/', component: PageHeader },
        { path: '/previous', component: { template: '<div>Previous</div>' } },
      ],
      '/',
    )

    const wrapper = mount(PageHeader, {
      props,
      slots,
      global: { plugins: [router] },
    })

    return { wrapper, router }
  }

  it('renders the given title', async () => {
    const { wrapper } = await mountHeader({ title: 'Queue' })

    expect(wrapper.find('h1').text()).toBe('Queue')
  })

  it('does not render the back button when showBack is omitted', async () => {
    const { wrapper } = await mountHeader({ title: 'Queue' })

    expect(wrapper.find('[data-testid="page-header-back"]').exists()).toBe(false)
  })

  it('does not render the back button when showBack is false', async () => {
    const { wrapper } = await mountHeader({ title: 'Queue', showBack: false })

    expect(wrapper.find('[data-testid="page-header-back"]').exists()).toBe(false)
  })

  it('renders the back button and calls router.back() on click when showBack is true', async () => {
    const { wrapper, router } = await mountHeader({ title: 'Queue', showBack: true })
    const backSpy = vi.spyOn(router, 'back')

    const backButton = wrapper.find('[data-testid="page-header-back"]')
    expect(backButton.exists()).toBe(true)

    await backButton.trigger('click')

    expect(backSpy).toHaveBeenCalled()
  })

  it('renders the left-chevron path by default', async () => {
    const { wrapper } = await mountHeader({ title: 'Queue', showBack: true })

    const path = wrapper.find('[data-testid="page-header-back"] svg path')
    expect(path.attributes('d')).toBe('M15 19l-7-7 7-7')
  })

  it('renders the down-chevron path when backIcon is "down"', async () => {
    const { wrapper } = await mountHeader({ title: 'Queue', showBack: true, backIcon: 'down' })

    const path = wrapper.find('[data-testid="page-header-back"] svg path')
    expect(path.attributes('d')).toBe('M19 9l-7 7-7-7')
  })

  it('renders trailing slot content when provided', async () => {
    const { wrapper } = await mountHeader(
      { title: 'Queue' },
      { trailing: '<button data-testid="trailing-action">Action</button>' },
    )

    expect(wrapper.find('[data-testid="trailing-action"]').exists()).toBe(true)
  })
})

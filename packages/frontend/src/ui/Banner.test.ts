import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Banner from './Banner.vue'

describe('Banner', () => {
  it('renders the default slot as the message', () => {
    const wrapper = mount(Banner, {
      props: { variant: 'error' },
      slots: { default: 'Something went wrong' },
    })

    expect(wrapper.text()).toContain('Something went wrong')
  })

  it('applies error-variant classes', () => {
    const wrapper = mount(Banner, { props: { variant: 'error' } })

    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['rounded-lg', 'border', 'border-error/30', 'bg-error/10', 'p-4']),
    )
  })

  it('applies warning-variant classes', () => {
    const wrapper = mount(Banner, { props: { variant: 'warning' } })

    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['rounded-lg', 'border', 'border-warning/30', 'bg-warning/10', 'p-4']),
    )
  })

  it('bakes in role="alert" and aria-live="assertive" by default', () => {
    const wrapper = mount(Banner, { props: { variant: 'error' } })

    expect(wrapper.attributes('role')).toBe('alert')
    expect(wrapper.attributes('aria-live')).toBe('assertive')
  })

  it('renders the action slot when provided', () => {
    const wrapper = mount(Banner, {
      props: { variant: 'error' },
      slots: { action: '<button data-testid="retry-button">Retry</button>' },
    })

    expect(wrapper.find('[data-testid="retry-button"]').exists()).toBe(true)
  })

  it('omits the action wrapper entirely when the action slot is not used', () => {
    const wrapper = mount(Banner, { props: { variant: 'error' } })

    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('forwards extra attributes (e.g. data-testid, class) to the root element', () => {
    const wrapper = mount(Banner, {
      props: { variant: 'error' },
      attrs: { 'data-testid': 'queue-jump-error', class: 'mx-4 mb-3' },
    })

    expect(wrapper.attributes('data-testid')).toBe('queue-jump-error')
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['mx-4', 'mb-3']))
  })
})

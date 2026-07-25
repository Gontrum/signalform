import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LoadingSpinner from './LoadingSpinner.vue'
import { setupTestEnv } from '@/test-utils'

describe('LoadingSpinner', () => {
  beforeEach(() => {
    setupTestEnv()
  })

  it('renders with default props (md size, current color, announced)', () => {
    const wrapper = mount(LoadingSpinner)

    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['h-8', 'w-8', 'border-4', 'border-current', 'animate-spin']),
    )
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.find('.sr-only').exists()).toBe(true)
    expect(wrapper.find('.sr-only').text()).toBe('Loading…')
  })

  it('bakes in the reduced-motion fallback by default', () => {
    const wrapper = mount(LoadingSpinner)

    expect(wrapper.classes()).toContain('motion-reduce:animate-[spin_1.5s_linear_infinite]')
  })

  it('maps size="sm" to h-5 w-5 border-2', () => {
    const wrapper = mount(LoadingSpinner, { props: { size: 'sm' } })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['h-5', 'w-5', 'border-2']))
  })

  it('maps size="lg" to h-12 w-12 border-4', () => {
    const wrapper = mount(LoadingSpinner, { props: { size: 'lg' } })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['h-12', 'w-12', 'border-4']))
  })

  it('maps color="neutral-900" to a solid border-t-transparent ring', () => {
    const wrapper = mount(LoadingSpinner, { props: { color: 'neutral-900' } })

    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['border-neutral-900', 'border-t-transparent']),
    )
    expect(wrapper.classes()).not.toContain('border-current')
  })

  it('maps color="accent-400" to a solid border-t-transparent ring', () => {
    const wrapper = mount(LoadingSpinner, { props: { color: 'accent-400' } })

    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['border-accent-400', 'border-t-transparent']),
    )
  })

  it('maps color="current" (default) to the inline border-r-transparent ring', () => {
    const wrapper = mount(LoadingSpinner)

    expect(wrapper.classes()).toEqual(
      expect.arrayContaining([
        'inline-block',
        'border-solid',
        'border-current',
        'border-r-transparent',
        'align-[-0.125em]',
      ]),
    )
  })

  it('omits role="status" and the sr-only text when announce is false', () => {
    const wrapper = mount(LoadingSpinner, { props: { announce: false } })

    expect(wrapper.attributes('role')).toBeUndefined()
    expect(wrapper.find('.sr-only').exists()).toBe(false)
  })

  it('forwards extra attributes (e.g. data-testid, class) to the root element', () => {
    const wrapper = mount(LoadingSpinner, {
      attrs: { 'data-testid': 'loading-spinner', class: 'text-white' },
    })

    expect(wrapper.attributes('data-testid')).toBe('loading-spinner')
    expect(wrapper.classes()).toContain('text-white')
  })
})

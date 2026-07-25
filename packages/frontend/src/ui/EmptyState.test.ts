import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('renders the title', () => {
    const wrapper = mount(EmptyState, { props: { title: 'No track playing' } })

    expect(wrapper.find('h2').text()).toBe('No track playing')
  })

  it('renders the subtitle when provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No track playing', subtitle: 'Search and play music to see it here' },
    })

    expect(wrapper.find('p').text()).toBe('Search and play music to see it here')
  })

  it('omits the subtitle paragraph when not provided', () => {
    const wrapper = mount(EmptyState, { props: { title: 'No track playing' } })

    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('renders the icon slot content', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No track playing' },
      slots: { icon: '<svg data-testid="music-note-icon" />' },
    })

    expect(wrapper.find('[data-testid="music-note-icon"]').exists()).toBe(true)
  })

  it('renders default slot content below the title/subtitle', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No track playing' },
      slots: { default: '<div data-testid="secondary-content">Queued tracks</div>' },
    })

    expect(wrapper.find('[data-testid="secondary-content"]').exists()).toBe(true)
  })

  it('applies the reference layout classes on the root element', () => {
    const wrapper = mount(EmptyState, { props: { title: 'No track playing' } })

    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['flex', 'flex-col', 'items-center', 'text-center']),
    )
  })

  it('forwards extra attributes (e.g. data-testid) to the root element', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No track playing' },
      attrs: { 'data-testid': 'empty-state' },
    })

    expect(wrapper.attributes('data-testid')).toBe('empty-state')
  })

  it('applies iconTestid to the icon wrapper div, not the root', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'No track playing', iconTestid: 'placeholder-album-cover' },
      attrs: { 'data-testid': 'empty-state' },
    })

    const iconWrapper = wrapper.find('[data-testid="placeholder-album-cover"]')
    expect(iconWrapper.exists()).toBe(true)
    expect(wrapper.attributes('data-testid')).toBe('empty-state')
    expect(iconWrapper.classes()).toEqual(
      expect.arrayContaining(['h-30', 'w-30', 'md:h-40', 'md:w-40', 'lg:h-50', 'lg:w-50']),
    )
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Popover from './Popover.vue'

describe('Popover', () => {
  it('renders nothing when closed', () => {
    const wrapper = mount(Popover, { props: { open: false } })

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(wrapper.find('[aria-hidden="true"][tabindex="-1"]').exists()).toBe(false)
  })

  it('renders the backdrop and panel when open', () => {
    const wrapper = mount(Popover, { props: { open: true } })

    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    expect(wrapper.find('[aria-hidden="true"][tabindex="-1"]').exists()).toBe(true)
  })

  it('renders default slot content inside the panel', () => {
    const wrapper = mount(Popover, {
      props: { open: true },
      slots: { default: '<button data-testid="menu-item">Item</button>' },
    })

    expect(wrapper.find('[role="menu"] [data-testid="menu-item"]').exists()).toBe(true)
  })

  it('emits update:open(false) when the backdrop is clicked', async () => {
    const wrapper = mount(Popover, { props: { open: true } })

    await wrapper.find('[aria-hidden="true"][tabindex="-1"]').trigger('click')

    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('supports v-model:open via the update:open event', async () => {
    const wrapper = mount(Popover, { props: { open: true, 'onUpdate:open': () => undefined } })

    await wrapper.find('[aria-hidden="true"][tabindex="-1"]').trigger('click')

    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  it('applies panelClass to the panel only', () => {
    const wrapper = mount(Popover, {
      props: { open: true, panelClass: 'absolute right-0 top-full mt-1 w-48' },
    })

    const panel = wrapper.find('[role="menu"]')
    expect(panel.classes()).toEqual(expect.arrayContaining(['absolute', 'right-0', 'w-48']))
    const backdrop = wrapper.find('[aria-hidden="true"][tabindex="-1"]')
    expect(backdrop.classes()).not.toContain('w-48')
  })

  it('sets aria-label on the panel from the ariaLabel prop', () => {
    const wrapper = mount(Popover, { props: { open: true, ariaLabel: 'Queue options' } })

    expect(wrapper.find('[role="menu"]').attributes('aria-label')).toBe('Queue options')
  })

  it('forwards extra attributes (e.g. data-testid) to the panel only, not the backdrop', () => {
    const wrapper = mount(Popover, {
      props: { open: true },
      attrs: { 'data-testid': 'queue-menu-panel' },
    })

    expect(wrapper.find('[role="menu"]').attributes('data-testid')).toBe('queue-menu-panel')
    expect(
      wrapper.find('[aria-hidden="true"][tabindex="-1"]').attributes('data-testid'),
    ).toBeUndefined()
  })
})

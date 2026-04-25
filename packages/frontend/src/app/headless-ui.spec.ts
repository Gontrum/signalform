/* eslint-disable vue/one-component-per-file -- Test file with multiple test components */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/vue'
import { defineComponent, h } from 'vue'

describe('Headless UI Integration', () => {
  it('should import all Menu components from @headlessui/vue', () => {
    expect(Menu).toBeDefined()
    expect(MenuButton).toBeDefined()
    expect(MenuItems).toBeDefined()
    expect(MenuItem).toBeDefined()
  })

  it('should render Menu with button', () => {
    const TestComponent = defineComponent({
      setup(): () => ReturnType<typeof h> {
        return (): ReturnType<typeof h> =>
          h(Menu, null, {
            default: () => h(MenuButton, null, { default: () => 'Open Menu' }),
          })
      },
    })

    const wrapper = mount(TestComponent)
    expect(wrapper.text()).toContain('Open Menu')
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('should render Menu with items when opened', async () => {
    const TestComponent = defineComponent({
      setup(): () => ReturnType<typeof h> {
        return (): ReturnType<typeof h> =>
          h(Menu, null, {
            default: () => [
              h(MenuButton, null, { default: () => 'Options' }),
              h(MenuItems, null, {
                default: () =>
                  h(MenuItem, null, {
                    default: ({ active }: { readonly active: boolean }) =>
                      h('button', { class: active ? 'active' : '' }, 'Item 1'),
                  }),
              }),
            ],
          })
      },
    })

    const wrapper = mount(TestComponent)
    const button = wrapper.find('button')

    // Initially menu items should not be visible
    expect(wrapper.text()).toContain('Options')

    // Click to open menu
    await button.trigger('click')

    // After opening, menu item should be present
    expect(wrapper.text()).toContain('Item 1')
  })

  it('should support MenuItem active state', () => {
    const TestComponent = defineComponent({
      setup(): () => ReturnType<typeof h> {
        return (): ReturnType<typeof h> =>
          h(Menu, null, {
            default: () =>
              h(MenuItem, null, {
                default: ({ active }: { readonly active: boolean }) =>
                  h('div', { 'data-active': active }, 'Test Item'),
              }),
          })
      },
    })

    const wrapper = mount(TestComponent)
    expect(wrapper.html()).toContain('Test Item')
  })
})

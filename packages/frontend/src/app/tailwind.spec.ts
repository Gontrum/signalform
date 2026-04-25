/* eslint-disable vue/one-component-per-file -- Test file with multiple test components */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

describe('Tailwind CSS Integration', () => {
  it('should apply Tailwind CSS classes to components', () => {
    const TestComponent = defineComponent({
      setup(): () => ReturnType<typeof h> {
        return (): ReturnType<typeof h> =>
          h('div', { class: 'bg-blue-500 text-white p-4' }, 'Tailwind Test')
      },
    })

    const wrapper = mount(TestComponent)
    expect(wrapper.classes()).toContain('bg-blue-500')
    expect(wrapper.classes()).toContain('text-white')
    expect(wrapper.classes()).toContain('p-4')
    expect(wrapper.text()).toBe('Tailwind Test')
  })

  it('should support responsive Tailwind classes', () => {
    const TestComponent = defineComponent({
      setup(): () => ReturnType<typeof h> {
        return (): ReturnType<typeof h> =>
          h('div', { class: 'w-full md:w-1/2 lg:w-1/3' }, 'Responsive')
      },
    })

    const wrapper = mount(TestComponent)
    expect(wrapper.classes()).toContain('w-full')
    expect(wrapper.classes()).toContain('md:w-1/2')
    expect(wrapper.classes()).toContain('lg:w-1/3')
  })
})

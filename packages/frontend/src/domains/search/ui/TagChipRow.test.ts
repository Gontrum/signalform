import { describe, it, expect, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { TAG_VOCABULARY } from '@signalform/shared'
import TagChipRow from './TagChipRow.vue'
import { setupTestEnv } from '@/test-utils'

const mountRow = (activeTagId?: string): VueWrapper =>
  mount(TagChipRow, { props: activeTagId === undefined ? {} : { activeTagId } })

const emittedSelections = (wrapper: VueWrapper): readonly unknown[] =>
  (wrapper.emitted('select') ?? []).map((payload) => payload[0])

describe('TagChipRow', () => {
  beforeEach(() => {
    setupTestEnv()
  })

  it('renders one chip per vocabulary entry with the vocabulary label', () => {
    const wrapper = mountRow()

    const labels = wrapper.findAll('[data-testid="tag-chip-row"] button').map((chip) => chip.text())

    expect(labels).toHaveLength(TAG_VOCABULARY.length)
    expect(labels).toEqual(TAG_VOCABULARY.map((tag) => tag.label))
    expect(labels).toContain('SACD')
    expect(labels).toContain('QSound')
    expect(labels).toContain('Half-Speed Mastered')
  })

  it('emits the id of an inactive chip that is clicked', async () => {
    const wrapper = mountRow('sacd')

    await wrapper.get('[data-testid="tag-chip-qsound"]').trigger('click')

    expect(emittedSelections(wrapper)).toEqual(['qsound'])
  })

  it('emits undefined when the active chip is clicked again', async () => {
    const wrapper = mountRow('qsound')

    await wrapper.get('[data-testid="tag-chip-qsound"]').trigger('click')

    expect(emittedSelections(wrapper)).toEqual([undefined])
  })

  it('marks only the active chip as pressed', () => {
    const wrapper = mountRow('hdcd')

    const pressed = wrapper
      .findAll('[data-testid="tag-chip-row"] button')
      .filter((chip) => chip.attributes('aria-pressed') === 'true')
      .map((chip) => chip.attributes('data-testid'))

    expect(pressed).toEqual(['tag-chip-hdcd'])
    expect(wrapper.get('[data-testid="tag-chip-sacd"]').attributes('aria-pressed')).toBe('false')
  })

  it('marks no chip as pressed when no tag is active', () => {
    const wrapper = mountRow()

    const states = wrapper
      .findAll('[data-testid="tag-chip-row"] button')
      .map((chip) => chip.attributes('aria-pressed'))

    expect(states.every((state) => state === 'false')).toBe(true)
  })

  it('scrolls on one line below sm and wraps from sm upward', () => {
    const wrapper = mountRow()

    const rowClass = wrapper.get('[data-testid="tag-chip-row"]').attributes('class') ?? ''

    expect(rowClass).toContain('overflow-x-auto')
    expect(rowClass).toContain('sm:flex-wrap')
  })
})

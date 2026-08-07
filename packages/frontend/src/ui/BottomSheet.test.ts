/**
 * BottomSheet — the modal promises of a phone sheet: it takes focus when it
 * opens, gives it back to the trigger when it closes, keeps Tab inside while
 * it is open, and closes on Escape as well as on a tap outside.
 *
 * The focus-return case is the one that has already gone wrong once (see
 * Popover.vue): on macOS/WebKit a mouse click on a <button> does not focus it,
 * so a sheet that only remembers `document.activeElement` at open time
 * remembers <body> and drops the focus on close.
 */

import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import BottomSheet from './BottomSheet.vue'

const SLOT = `
  <button data-testid="first">First</button>
  <button data-testid="last">Last</button>
`

type MountOptions = {
  readonly open?: boolean
  readonly returnFocusTo?: HTMLElement | null
}

const mountSheet = (options: MountOptions = {}): VueWrapper =>
  mount(BottomSheet, {
    attachTo: document.body,
    props: {
      open: options.open ?? false,
      title: 'Sort & filter',
      closeLabel: 'Close sort and filter',
      returnFocusTo: options.returnFocusTo,
    },
    slots: { default: SLOT },
  })

const panelOf = (wrapper: VueWrapper): HTMLElement =>
  wrapper.find<HTMLElement>('[data-testid="bottom-sheet"]').element

const open = async (wrapper: VueWrapper): Promise<void> => {
  await wrapper.setProps({ open: true })
  await flushPromises()
}

describe('BottomSheet — rendering', () => {
  it('renders neither panel nor backdrop while closed', () => {
    const wrapper = mountSheet()

    expect(wrapper.find('[data-testid="bottom-sheet"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="bottom-sheet-backdrop"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('renders a labelled modal dialog with its slot content when open', async () => {
    const wrapper = mountSheet()
    await open(wrapper)

    const panel = wrapper.find('[data-testid="bottom-sheet"]')
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.attributes('aria-modal')).toBe('true')

    const labelledBy = panel.attributes('aria-labelledby')
    expect(labelledBy).toBeDefined()
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe('Sort & filter')

    expect(wrapper.find('[data-testid="first"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('names the close button from the closeLabel prop', async () => {
    const wrapper = mountSheet()
    await open(wrapper)

    expect(wrapper.find('[data-testid="bottom-sheet-close"]').attributes('aria-label')).toBe(
      'Close sort and filter',
    )

    wrapper.unmount()
  })
})

describe('BottomSheet — closing', () => {
  it('emits update:open(false) on Escape', async () => {
    const wrapper = mountSheet()
    await open(wrapper)

    await wrapper.find('[data-testid="bottom-sheet"]').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('update:open')).toEqual([[false]])

    wrapper.unmount()
  })

  it('leaves other keys alone', async () => {
    const wrapper = mountSheet()
    await open(wrapper)

    await wrapper.find('[data-testid="bottom-sheet"]').trigger('keydown', { key: 'ArrowDown' })

    expect(wrapper.emitted('update:open')).toBeUndefined()

    wrapper.unmount()
  })

  it('emits update:open(false) when the backdrop is clicked', async () => {
    const wrapper = mountSheet()
    await open(wrapper)

    await wrapper.find('[data-testid="bottom-sheet-backdrop"]').trigger('click')

    expect(wrapper.emitted('update:open')).toEqual([[false]])

    wrapper.unmount()
  })

  it('emits update:open(false) when the close button is clicked', async () => {
    const wrapper = mountSheet()
    await open(wrapper)

    await wrapper.find('[data-testid="bottom-sheet-close"]').trigger('click')

    expect(wrapper.emitted('update:open')).toEqual([[false]])

    wrapper.unmount()
  })
})

describe('BottomSheet — focus', () => {
  it('moves focus into the sheet when it opens', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    const wrapper = mountSheet()
    await open(wrapper)

    expect(document.activeElement).toBe(panelOf(wrapper))

    wrapper.unmount()
    outside.remove()
  })

  it('returns focus to the trigger it was given, even when the click never focused it', async () => {
    // The macOS/WebKit case: the trigger was clicked, so `document.activeElement`
    // is <body> — only the explicit trigger can bring the focus back.
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    document.body.focus()

    const wrapper = mountSheet({ returnFocusTo: trigger })
    await open(wrapper)
    expect(document.activeElement).not.toBe(trigger)

    await wrapper.setProps({ open: false })
    await flushPromises()

    expect(document.activeElement).toBe(trigger)

    wrapper.unmount()
    trigger.remove()
  })

  it('falls back to whatever had focus when it opened if no trigger is given', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const wrapper = mountSheet()
    await open(wrapper)
    expect(document.activeElement).toBe(panelOf(wrapper))

    await wrapper.setProps({ open: false })
    await flushPromises()

    expect(document.activeElement).toBe(trigger)

    wrapper.unmount()
    trigger.remove()
  })

  it('prefers the given trigger over the remembered element', async () => {
    const keyboardFocus = document.createElement('button')
    const trigger = document.createElement('button')
    document.body.append(keyboardFocus, trigger)
    keyboardFocus.focus()

    const wrapper = mountSheet({ returnFocusTo: trigger })
    await open(wrapper)
    await wrapper.setProps({ open: false })
    await flushPromises()

    expect(document.activeElement).toBe(trigger)

    wrapper.unmount()
    keyboardFocus.remove()
    trigger.remove()
  })
})

describe('BottomSheet — focus trap', () => {
  it('wraps Tab from the last focusable back to the first', async () => {
    const wrapper = mountSheet()
    await open(wrapper)

    const last = wrapper.find<HTMLElement>('[data-testid="last"]')
    last.element.focus()
    await last.trigger('keydown', { key: 'Tab' })

    expect(document.activeElement).toBe(
      wrapper.find<HTMLElement>('[data-testid="bottom-sheet-close"]').element,
    )

    wrapper.unmount()
  })

  it('wraps Shift+Tab from the first focusable to the last', async () => {
    const wrapper = mountSheet()
    await open(wrapper)

    const close = wrapper.find<HTMLElement>('[data-testid="bottom-sheet-close"]')
    close.element.focus()
    await close.trigger('keydown', { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(wrapper.find<HTMLElement>('[data-testid="last"]').element)

    wrapper.unmount()
  })

  it('wraps Shift+Tab from the panel itself, which is what holds focus on open', async () => {
    const wrapper = mountSheet()
    await open(wrapper)

    expect(document.activeElement).toBe(panelOf(wrapper))
    await wrapper
      .find('[data-testid="bottom-sheet"]')
      .trigger('keydown', { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(wrapper.find<HTMLElement>('[data-testid="last"]').element)

    wrapper.unmount()
  })

  it('lets Tab run its normal course in the middle of the sheet', async () => {
    const wrapper = mountSheet()
    await open(wrapper)

    const first = wrapper.find<HTMLElement>('[data-testid="first"]')
    first.element.focus()
    await first.trigger('keydown', { key: 'Tab' })

    expect(document.activeElement).toBe(first.element)

    wrapper.unmount()
  })
})

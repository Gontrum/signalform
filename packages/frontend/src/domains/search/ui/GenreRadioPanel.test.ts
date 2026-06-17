import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import GenreRadioPanel from './GenreRadioPanel.vue'
import { setupTestEnv } from '@/test-utils'

vi.mock('@/platform/api/genreRadioApi', () => ({
  startGenreRadio: vi.fn(),
  searchTags: vi.fn(),
}))

describe('GenreRadioPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupTestEnv()
  })

  const mountPanel = (): ReturnType<typeof mount> => mount(GenreRadioPanel)

  it('renders genre radio heading', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('Genre Radio')
  })

  it('input triggers debounced tag search after typing', async () => {
    const { searchTags } = await import('@/platform/api/genreRadioApi')
    vi.mocked(searchTags).mockResolvedValue([
      { name: 'Jazz', count: 100, url: 'https://last.fm/tag/jazz' },
    ])

    vi.useFakeTimers()
    const wrapper = mountPanel()

    const input = wrapper.find('[data-testid="genre-radio-input"]')
    await input.setValue('Ja')
    await input.trigger('input')

    // Should not call yet (debounce)
    expect(searchTags).not.toHaveBeenCalled()

    // Advance timer past debounce threshold
    vi.advanceTimersByTime(300)
    await flushPromises()

    expect(searchTags).toHaveBeenCalledWith('Ja')
    vi.useRealTimers()
  })

  it('shows suggestions after searchTags returns results', async () => {
    const { searchTags } = await import('@/platform/api/genreRadioApi')
    vi.mocked(searchTags).mockResolvedValue([
      { name: 'Jazz', count: 50, url: 'https://last.fm/tag/jazz' },
      { name: 'Punk', count: 30, url: 'https://last.fm/tag/punk' },
    ])

    vi.useFakeTimers()
    const wrapper = mountPanel()

    const input = wrapper.find('[data-testid="genre-radio-input"]')
    await input.setValue('Ja')
    await input.trigger('input')

    vi.advanceTimersByTime(300)
    await flushPromises()

    const suggestions = wrapper.findAll('[data-testid="genre-radio-suggestion"]')
    expect(suggestions).toHaveLength(2)
    expect(suggestions[0]?.text()).toContain('Jazz')
    expect(suggestions[1]?.text()).toContain('Punk')
    vi.useRealTimers()
  })

  it('selecting a suggestion fills input and hides dropdown', async () => {
    const { searchTags } = await import('@/platform/api/genreRadioApi')
    vi.mocked(searchTags).mockResolvedValue([
      { name: 'Jazz', count: 50, url: 'https://last.fm/tag/jazz' },
    ])

    vi.useFakeTimers()
    const wrapper = mountPanel()

    const input = wrapper.find('[data-testid="genre-radio-input"]')
    await input.setValue('Ja')
    await input.trigger('input')

    vi.advanceTimersByTime(300)
    await flushPromises()

    const suggestion = wrapper.find('[data-testid="genre-radio-suggestion"]')
    expect(suggestion.exists()).toBe(true)

    await suggestion.trigger('click')
    await nextTick()

    // Dropdown should be gone
    expect(wrapper.find('[data-testid="genre-radio-suggestion"]').exists()).toBe(false)
    // Input value should now be 'Jazz'
    const inputEl = wrapper.find('[data-testid="genre-radio-input"]')
    expect(inputEl.element).toBeInstanceOf(HTMLInputElement)
    if (!(inputEl.element instanceof HTMLInputElement)) {
      return
    }
    expect(inputEl.element.value).toBe('Jazz')
    vi.useRealTimers()
  })

  it('start button calls startGenreRadio with current input value', async () => {
    const { startGenreRadio } = await import('@/platform/api/genreRadioApi')
    vi.mocked(startGenreRadio).mockResolvedValue({ genreName: 'Jazz', tracksAdded: 5 })

    const wrapper = mountPanel()

    const input = wrapper.find('[data-testid="genre-radio-input"]')
    await input.setValue('Jazz')
    await input.trigger('input')
    await nextTick()

    const btn = wrapper.find('[data-testid="genre-radio-start-button"]')
    await btn.trigger('click')
    await flushPromises()

    expect(startGenreRadio).toHaveBeenCalledWith('Jazz')
  })

  it('pressing Enter in input triggers genre radio start', async () => {
    const { startGenreRadio } = await import('@/platform/api/genreRadioApi')
    vi.mocked(startGenreRadio).mockResolvedValue({ genreName: 'Punk', tracksAdded: 3 })

    const wrapper = mountPanel()

    const input = wrapper.find('[data-testid="genre-radio-input"]')
    await input.setValue('Punk')
    await input.trigger('input')
    await nextTick()

    await input.trigger('keydown.enter')
    await flushPromises()

    expect(startGenreRadio).toHaveBeenCalledWith('Punk')
  })

  it('shows error message when startGenreRadio returns null', async () => {
    const { startGenreRadio } = await import('@/platform/api/genreRadioApi')
    vi.mocked(startGenreRadio).mockResolvedValue(null)

    const wrapper = mountPanel()

    const input = wrapper.find('[data-testid="genre-radio-input"]')
    await input.setValue('Jazz')
    await input.trigger('input')
    await nextTick()

    await wrapper.find('[data-testid="genre-radio-start-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="genre-radio-panel-error"]').exists()).toBe(true)
  })

  it('start button is disabled when input is empty', () => {
    const wrapper = mountPanel()

    const btn = wrapper.find('[data-testid="genre-radio-start-button"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })
})

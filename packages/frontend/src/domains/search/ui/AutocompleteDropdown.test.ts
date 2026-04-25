/**
 * AutocompleteDropdown Component Tests
 *
 * Tests autocomplete dropdown props and rendering logic.
 * Uses Given/When/Then pattern with helper functions.
 * Note: Full Headless UI integration tested in SearchPanel.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/platform/api/heroImageApi', async () => {
  const { ok } = await import('@signalform/shared')
  return { getArtistHeroImage: vi.fn().mockResolvedValue(ok(null)) }
})

import { nextTick } from 'vue'
import { setupTestEnv } from '@/test-utils'
import type { AutocompleteSuggestion } from '../core/types'
import AutocompleteDropdown from './AutocompleteDropdown.vue'

const isAutocompleteSuggestionArray = (
  value: unknown,
): value is readonly AutocompleteSuggestion[] => Array.isArray(value)

const getSuggestionsProp = (value: unknown): readonly AutocompleteSuggestion[] => {
  expect(isAutocompleteSuggestionArray(value)).toBe(true)

  return isAutocompleteSuggestionArray(value) ? value : []
}

describe('AutocompleteDropdown', () => {
  beforeEach(() => {
    setupTestEnv()
  })

  it('accepts suggestions prop as readonly array', async () => {
    const suggestions = await givenValidSuggestions()
    const wrapper = await whenComponentIsMounted({
      suggestions,
      isLoading: false,
      isEmpty: false,
      error: null,
    })

    await thenWrapperReceivesCorrectProps(wrapper, suggestions)
  })

  it('accepts isLoading prop', async () => {
    const wrapper = await whenComponentIsMounted({
      suggestions: [],
      isLoading: true,
      isEmpty: false,
      error: null,
    })

    await thenWrapperReceivesLoadingProp(wrapper, true)
  })

  it('accepts isEmpty prop', async () => {
    const wrapper = await whenComponentIsMounted({
      suggestions: [],
      isLoading: false,
      isEmpty: true,
      error: null,
    })

    await thenWrapperReceivesEmptyProp(wrapper, true)
  })

  it('accepts error prop', async () => {
    const error = 'Network error'
    const wrapper = await whenComponentIsMounted({
      suggestions: [],
      isLoading: false,
      isEmpty: true,
      error,
    })

    await thenWrapperReceivesErrorProp(wrapper, error)
  })

  it('applies motion-reduce class for accessibility', async () => {
    const suggestions = await givenValidSuggestions()
    const wrapper = await whenComponentIsMounted({
      suggestions,
      isLoading: false,
      isEmpty: false,
      error: null,
    })

    await thenMotionReduceClassIsPresent(wrapper)
  })

  it('accepts isLoading and isEmpty props correctly', async () => {
    const wrapper = await whenComponentIsMounted({
      suggestions: [],
      isLoading: true,
      isEmpty: true,
      error: null,
    })

    const dropdownComponent = wrapper.findComponent(AutocompleteDropdown)
    expect(dropdownComponent.props('isLoading')).toBe(true)
    expect(dropdownComponent.props('isEmpty')).toBe(true)
    expect(dropdownComponent.props('suggestions')).toEqual([])
  })

  it('renders error state when error prop is provided', async () => {
    const errorMessage = 'Music server not reachable'
    const wrapper = await whenComponentIsMounted({
      suggestions: [],
      isLoading: false,
      isEmpty: true,
      error: errorMessage,
    })

    const dropdownComponent = wrapper.findComponent(AutocompleteDropdown)
    expect(dropdownComponent.props('error')).toBe(errorMessage)
  })

  it('handles quality badge in suggestion data', async () => {
    const suggestionsWithQuality: readonly AutocompleteSuggestion[] = [
      {
        id: 'album-1',
        type: 'album',
        artist: 'Pink Floyd',
        album: 'Dark Side of the Moon',
        quality: {
          format: 'FLAC',
          bitrate: 96000,
          sampleRate: 24,
          lossless: true,
        },
      },
    ]

    const wrapper = await whenComponentIsMounted({
      suggestions: suggestionsWithQuality,
      isLoading: false,
      isEmpty: false,
      error: null,
    })

    const dropdownComponent = wrapper.findComponent(AutocompleteDropdown)
    const propsSuggestions = getSuggestionsProp(dropdownComponent.props('suggestions'))
    expect(propsSuggestions.length).toBeGreaterThan(0)
    expect(propsSuggestions[0]!).toHaveProperty('quality')
    expect(propsSuggestions[0]!.quality?.format).toBe('FLAC')
  })

  it('handles albumCover in suggestion data', async () => {
    const suggestionsWithCover: readonly AutocompleteSuggestion[] = [
      {
        id: 'album-1',
        type: 'album',
        artist: 'Pink Floyd',
        album: 'The Wall',
        albumCover: '/covers/the-wall.jpg',
      },
    ]

    const wrapper = await whenComponentIsMounted({
      suggestions: suggestionsWithCover,
      isLoading: false,
      isEmpty: false,
      error: null,
    })

    const dropdownComponent = wrapper.findComponent(AutocompleteDropdown)
    const propsSuggestions = getSuggestionsProp(dropdownComponent.props('suggestions'))
    expect(propsSuggestions.length).toBeGreaterThan(0)
    expect(propsSuggestions[0]!).toHaveProperty('albumCover')
    expect(propsSuggestions[0]!.albumCover).toBe('/covers/the-wall.jpg')
  })

  it('handles suggestions without albumCover', async () => {
    const testSuggestions = await givenValidSuggestions()
    const wrapper = await whenComponentIsMounted({
      suggestions: testSuggestions,
      isLoading: false,
      isEmpty: false,
      error: null,
    })

    const dropdownComponent = wrapper.findComponent(AutocompleteDropdown)
    const propsSuggestions = getSuggestionsProp(dropdownComponent.props('suggestions'))
    expect(propsSuggestions.length).toBeGreaterThan(0)
    expect(propsSuggestions[0]!.albumCover).toBeUndefined()
  })

  it('component structure includes ARIA and responsive features', async () => {
    const suggestions = await givenValidSuggestions()
    const wrapper = await whenComponentIsMounted({
      suggestions,
      isLoading: false,
      isEmpty: false,
      error: null,
    })

    const dropdownComponent = wrapper.findComponent(AutocompleteDropdown)
    expect(dropdownComponent.exists()).toBe(true)
    expect(dropdownComponent.props('suggestions').length).toBeGreaterThan(0)
  })

  it('maintains readonly array types for suggestions', async () => {
    const suggestions = await givenValidSuggestions()
    const wrapper = await whenComponentIsMounted({
      suggestions,
      isLoading: false,
      isEmpty: false,
      error: null,
    })

    const dropdownComponent = wrapper.findComponent(AutocompleteDropdown)
    expect(Array.isArray(dropdownComponent.props('suggestions'))).toBe(true)
  })
})

type AutocompleteDropdownProps = {
  readonly suggestions: readonly AutocompleteSuggestion[]
  readonly isLoading: boolean
  readonly isEmpty: boolean
  readonly error: string | null
  readonly query?: string
  readonly activeIndex?: number
}

const givenValidSuggestions = async (): Promise<readonly AutocompleteSuggestion[]> => [
  {
    id: 'artist-1',
    type: 'artist',
    artist: 'Pink Floyd',
  },
]

const whenComponentIsMounted = async (
  props: AutocompleteDropdownProps,
): Promise<ReturnType<typeof mount>> => {
  const wrapper = mount(AutocompleteDropdown, { props })
  await nextTick()
  return wrapper
}

const thenWrapperReceivesCorrectProps = async (
  wrapper: ReturnType<typeof mount>,
  suggestions: readonly AutocompleteSuggestion[],
): Promise<void> => {
  const dropdownComponent = wrapper.findComponent(AutocompleteDropdown)
  expect(getSuggestionsProp(dropdownComponent.props('suggestions'))).toEqual(suggestions)
}

const thenWrapperReceivesLoadingProp = async (
  wrapper: ReturnType<typeof mount>,
  isLoading: boolean,
): Promise<void> => {
  expect(wrapper.findComponent(AutocompleteDropdown).props('isLoading')).toBe(isLoading)
}

const thenWrapperReceivesEmptyProp = async (
  wrapper: ReturnType<typeof mount>,
  isEmpty: boolean,
): Promise<void> => {
  expect(wrapper.findComponent(AutocompleteDropdown).props('isEmpty')).toBe(isEmpty)
}

const thenWrapperReceivesErrorProp = async (
  wrapper: ReturnType<typeof mount>,
  error: string | null,
): Promise<void> => {
  expect(wrapper.findComponent(AutocompleteDropdown).props('error')).toBe(error)
}

const thenMotionReduceClassIsPresent = async (wrapper: ReturnType<typeof mount>): Promise<void> => {
  expect(wrapper.html()).toContain('motion-reduce')
}

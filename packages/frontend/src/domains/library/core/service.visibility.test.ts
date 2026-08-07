import { describe, expect, it } from 'vitest'
import { showsAlbumContent, showsTidalFeatured } from './service'

describe('showsTidalFeatured', () => {
  it('offers the featured row when Tidal holds no favourites', () => {
    expect(showsTidalFeatured('tidal', 0)).toBe(true)
  })

  it('shows the favourites themselves as soon as there is one', () => {
    expect(showsTidalFeatured('tidal', 1)).toBe(false)
  })

  it('leaves an empty local library to its own empty state', () => {
    expect(showsTidalFeatured('local', 0)).toBe(false)
  })
})

describe('showsAlbumContent', () => {
  const content = (
    overrides: Partial<Parameters<typeof showsAlbumContent>[0]> = {},
  ): ReturnType<typeof showsAlbumContent> =>
    showsAlbumContent({
      status: 'success',
      artistBrowser: false,
      emptyLibrary: false,
      tidalFeatured: false,
      ...overrides,
    })

  it('claims the states no earlier branch of the chain takes', () => {
    expect(content()).toBe(true)
  })

  it('yields to the spinner while the list is loading', () => {
    expect(content({ status: 'loading' })).toBe(false)
  })

  it('yields to the error message after a failed request', () => {
    expect(content({ status: 'error' })).toBe(false)
  })

  it('yields to the artist browser, which has no grid to toggle', () => {
    expect(content({ artistBrowser: true })).toBe(false)
  })

  it('yields to the empty library state', () => {
    expect(content({ emptyLibrary: true })).toBe(false)
  })

  it('yields to the Tidal featured row', () => {
    expect(content({ tidalFeatured: true })).toBe(false)
  })

  it('stays away while two branches claim the screen at once', () => {
    expect(content({ status: 'error', tidalFeatured: true })).toBe(false)
  })
})

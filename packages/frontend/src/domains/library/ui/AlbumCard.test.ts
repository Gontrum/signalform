import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AlbumCard from './AlbumCard.vue'

const makeAlbum = (): {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly releaseYear: number
  readonly genre: null
  readonly coverArtUrl: string
} => ({
  id: '42',
  title: 'Dark Side of the Moon',
  artist: 'Pink Floyd',
  releaseYear: 1973,
  genre: null,
  coverArtUrl: 'http://localhost:9000/music/1/cover.jpg',
})

describe('AlbumCard', () => {
  // AC3: hover shows overlay with play button
  it('renders hover overlay element in DOM', () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    expect(wrapper.find('[data-testid="album-hover-overlay"]').exists()).toBe(true)
  })

  it('renders play album button inside overlay', () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    expect(wrapper.find('[data-testid="play-album-button"]').exists()).toBe(true)
  })

  it('overlay is hidden by default (opacity-0 class)', () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    const overlay = wrapper.find('[data-testid="album-hover-overlay"]')
    expect(overlay.classes()).toContain('opacity-0')
  })

  // Bug fix: overlay must not capture taps on mobile (no real hover state) so
  // taps fall through to the card's own click:navigate handler
  it('overlay is non-interactive until hovered (pointer-events-none / group-hover:pointer-events-auto)', () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    const overlay = wrapper.find('[data-testid="album-hover-overlay"]')
    expect(overlay.classes()).toContain('pointer-events-none')
    expect(overlay.classes()).toContain('group-hover:pointer-events-auto')
  })

  // AC4: click on cover image → emit 'click:navigate' with albumId
  // (nested-interactive fix: the cover image is inside the single
  // "navigate" region, so its click bubbles up to that region's handler)
  it('emits click:navigate with albumId when cover image is clicked', async () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    await wrapper.find('[data-testid="album-cover-img"]').trigger('click')

    expect(wrapper.emitted('click:navigate')).toBeTruthy()
    expect(wrapper.emitted('click:navigate')?.[0]).toEqual(['42'])
  })

  // AC4: click on title/artist info block → emit 'click:navigate' with albumId
  // (bubbles up to the same single "navigate" region as the cover image above)
  it('emits click:navigate with albumId when info block is clicked', async () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    await wrapper.find('[data-testid="album-title"]').trigger('click')

    expect(wrapper.emitted('click:navigate')).toBeTruthy()
    expect(wrapper.emitted('click:navigate')?.[0]).toEqual(['42'])
  })

  // A11y: keyboard equivalent for the single "navigate" region (Enter/Space
  // act like a click). Cover image and info block share this one tab-stop,
  // so there is only one pair of keyboard-equivalent cases to cover here.
  it('emits click:navigate with albumId when Enter is pressed on the navigate region', async () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    await wrapper.find('[data-testid="album-navigate-button"]').trigger('keydown.enter')

    expect(wrapper.emitted('click:navigate')).toBeTruthy()
    expect(wrapper.emitted('click:navigate')?.[0]).toEqual(['42'])
  })

  it('emits click:navigate with albumId when Space is pressed on the navigate region', async () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    await wrapper.find('[data-testid="album-navigate-button"]').trigger('keydown.space')

    expect(wrapper.emitted('click:navigate')).toBeTruthy()
    expect(wrapper.emitted('click:navigate')?.[0]).toEqual(['42'])
  })

  // nested-interactive fix: the outer card wrapper itself must not carry an
  // interactive role/tabindex/handlers — only the single navigate region
  // (sibling of the two real <button> elements) does.
  it('does not put role="button"/tabindex on the outer album-card wrapper', () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    const card = wrapper.find('[data-testid="album-card"]')
    expect(card.attributes('role')).toBeUndefined()
    expect(card.attributes('tabindex')).toBeUndefined()
  })

  // Regression guard for the reviewer-flagged bug: the cover image and info
  // block used to be two separate role="button" regions (two tab-stops for
  // one action). There must be exactly one interactive "navigate" region now.
  it('exposes exactly one role="button" tab-stop for the navigate action', () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    expect(wrapper.findAll('[role="button"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="album-navigate-button"]').attributes('tabindex')).toBe('0')
  })

  // nested-interactive: the single navigate region must contain both the
  // cover image and the info block, while the hover overlay (and its two
  // real buttons) stay outside of it as a sibling.
  it('nests the cover image and info block inside the navigate region, but not the hover overlay', () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    const navigateRegion = wrapper.find('[data-testid="album-navigate-button"]')
    expect(navigateRegion.find('[data-testid="album-cover-img"]').exists()).toBe(true)
    expect(navigateRegion.find('[data-testid="album-title"]').exists()).toBe(true)
    expect(navigateRegion.find('[data-testid="album-hover-overlay"]').exists()).toBe(false)
  })

  // AC5: click on play button → emit 'click:play', propagation stopped (no 'click:navigate')
  it('emits click:play with albumId when play button is clicked', async () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    await wrapper.find('[data-testid="play-album-button"]').trigger('click')

    expect(wrapper.emitted('click:play')).toBeTruthy()
    expect(wrapper.emitted('click:play')?.[0]).toEqual(['42'])
  })

  it('does NOT emit click:navigate when play button is clicked (propagation stopped)', async () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    await wrapper.find('[data-testid="play-album-button"]').trigger('click')

    expect(wrapper.emitted('click:navigate')).toBeFalsy()
  })

  // Renders album title and artist (AC2 support)
  it('renders album title', () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    expect(wrapper.find('[data-testid="album-title"]').text()).toBe('Dark Side of the Moon')
  })

  it('renders album artist', () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    expect(wrapper.find('[data-testid="album-artist"]').text()).toBe('Pink Floyd')
  })

  it('renders cover image when coverArtUrl provided', () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    expect(wrapper.find('[data-testid="album-cover-img"]').exists()).toBe(true)
  })

  it('shows music note fallback on image error', async () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    const img = wrapper.find('[data-testid="album-cover-img"]')
    if (img.exists()) {
      await img.trigger('error')
      await wrapper.vm.$nextTick()
    }

    // After error, cover-img should be gone or fallback should show
    const coverImg = wrapper.find('[data-testid="album-cover-img"]')
    expect(coverImg.exists()).toBe(false)
  })

  // AC3 (Story 9.4): add-to-queue button in hover overlay
  it('renders add-album-to-queue button inside overlay', () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    expect(wrapper.find('[data-testid="add-album-to-queue-button"]').exists()).toBe(true)
  })

  it('emits click:add-to-queue with albumId when add-to-queue button is clicked', async () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    await wrapper.find('[data-testid="add-album-to-queue-button"]').trigger('click')

    expect(wrapper.emitted('click:add-to-queue')).toBeTruthy()
    expect(wrapper.emitted('click:add-to-queue')?.[0]).toEqual(['42'])
  })

  it('does NOT emit click:navigate when add-to-queue button is clicked (propagation stopped)', async () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    await wrapper.find('[data-testid="add-album-to-queue-button"]').trigger('click')

    expect(wrapper.emitted('click:navigate')).toBeFalsy()
  })
})

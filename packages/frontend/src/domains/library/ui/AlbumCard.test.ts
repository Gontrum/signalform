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

  // AC4: click on card body → emit 'click:navigate' with albumId
  it('emits click:navigate with albumId when card body is clicked', async () => {
    const wrapper = mount(AlbumCard, {
      props: { album: makeAlbum() },
    })

    await wrapper.find('[data-testid="album-card"]').trigger('click')

    expect(wrapper.emitted('click:navigate')).toBeTruthy()
    expect(wrapper.emitted('click:navigate')?.[0]).toEqual(['42'])
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

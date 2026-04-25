import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AlbumListRow from './AlbumListRow.vue'

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

const makeAlbumNoYear = (): {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly releaseYear: null
  readonly genre: null
  readonly coverArtUrl: string
} => ({
  id: '43',
  title: 'Unknown Album',
  artist: 'Unknown Artist',
  releaseYear: null,
  genre: null,
  coverArtUrl: 'http://localhost:9000/music/2/cover.jpg',
})

describe('AlbumListRow', () => {
  // AC3 / AC6: renders album data
  it('renders album title, artist, and year', () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    expect(wrapper.find('[data-testid="list-row-title"]').text()).toBe('Dark Side of the Moon')
    expect(wrapper.find('[data-testid="list-row-artist"]').text()).toBe('Pink Floyd')
    expect(wrapper.find('[data-testid="list-row-year"]').text()).toBe('1973')
  })

  it('shows em-dash when releaseYear is null', () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbumNoYear() } })

    expect(wrapper.find('[data-testid="list-row-year"]').text()).toBe('—')
  })

  it('renders thumbnail image', () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    expect(wrapper.find('[data-testid="list-row-thumbnail"]').exists()).toBe(true)
  })

  it('shows music note fallback on image error', async () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    const img = wrapper.find('[data-testid="list-row-thumbnail"]')
    expect(img.exists()).toBe(true)
    await img.trigger('error')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="list-row-thumbnail"]').exists()).toBe(false)
  })

  // AC6: click on row body → emit 'click:navigate'
  it('emits click:navigate with albumId when row is clicked', async () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    await wrapper.find('[data-testid="album-list-row"]').trigger('click')

    expect(wrapper.emitted('click:navigate')).toBeTruthy()
    expect(wrapper.emitted('click:navigate')?.[0]).toEqual(['42'])
  })

  // AC7: click on play button → emit 'click:play', no 'click:navigate'
  it('emits click:play with albumId when play button is clicked', async () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    await wrapper.find('[data-testid="list-row-play-button"]').trigger('click')

    expect(wrapper.emitted('click:play')).toBeTruthy()
    expect(wrapper.emitted('click:play')?.[0]).toEqual(['42'])
  })

  it('does NOT emit click:navigate when play button is clicked (propagation stopped)', async () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    await wrapper.find('[data-testid="list-row-play-button"]').trigger('click')

    expect(wrapper.emitted('click:navigate')).toBeFalsy()
  })

  it('play button has type="button"', () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    const btn = wrapper.find('[data-testid="list-row-play-button"]')
    expect(btn.attributes('type')).toBe('button')
  })

  it('play button has aria-label with album title', () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    const btn = wrapper.find('[data-testid="list-row-play-button"]')
    expect(btn.attributes('aria-label')).toBe('Play Dark Side of the Moon')
  })

  it('thumbnail has correct alt text', () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    const img = wrapper.find('[data-testid="list-row-thumbnail"]')
    expect(img.attributes('alt')).toBe('Dark Side of the Moon by Pink Floyd')
  })

  // AC3 (Story 9.4): add-to-queue button alongside play button
  it('renders add-to-queue button', () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    expect(wrapper.find('[data-testid="list-row-add-to-queue-button"]').exists()).toBe(true)
  })

  it('emits click:add-to-queue with albumId when add-to-queue button is clicked', async () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    await wrapper.find('[data-testid="list-row-add-to-queue-button"]').trigger('click')

    expect(wrapper.emitted('click:add-to-queue')).toBeTruthy()
    expect(wrapper.emitted('click:add-to-queue')?.[0]).toEqual(['42'])
  })

  it('does NOT emit click:navigate when add-to-queue button is clicked', async () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    await wrapper.find('[data-testid="list-row-add-to-queue-button"]').trigger('click')

    expect(wrapper.emitted('click:navigate')).toBeFalsy()
  })
})

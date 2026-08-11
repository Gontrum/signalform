import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AlbumListRow from './AlbumListRow.vue'
import { setupTestEnv } from '@/test-utils'

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
  beforeEach(() => {
    setupTestEnv()
  })

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

  it('emits click:navigate with albumId when row is clicked', async () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    await wrapper.find('[data-testid="album-list-row"]').trigger('click')

    expect(wrapper.emitted('click:navigate')).toBeTruthy()
    expect(wrapper.emitted('click:navigate')?.[0]).toEqual(['42'])
  })

  // A11y: keyboard equivalent for the clickable row (Enter/Space act like a click)
  it('emits click:navigate with albumId when Enter is pressed on the row', async () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    await wrapper.find('[data-testid="album-list-row"]').trigger('keydown.enter')

    expect(wrapper.emitted('click:navigate')).toBeTruthy()
    expect(wrapper.emitted('click:navigate')?.[0]).toEqual(['42'])
  })

  it('emits click:navigate with albumId when Space is pressed on the row', async () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    await wrapper.find('[data-testid="album-list-row"]').trigger('keydown.space')

    expect(wrapper.emitted('click:navigate')).toBeTruthy()
    expect(wrapper.emitted('click:navigate')?.[0]).toEqual(['42'])
  })

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
    expect(btn.attributes('aria-label')).toBe('Play album Dark Side of the Moon')
  })

  // Decorative: title and artist are visible text in the same row, and the row
  // itself carries a translated accessible name. An alternative text here would
  // be read out twice — and would be an untranslated English string.
  it('leaves the thumbnail out of the accessible name', () => {
    const wrapper = mount(AlbumListRow, { props: { album: makeAlbum() } })

    const img = wrapper.find('[data-testid="list-row-thumbnail"]')
    expect(img.attributes('alt')).toBe('')
  })

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

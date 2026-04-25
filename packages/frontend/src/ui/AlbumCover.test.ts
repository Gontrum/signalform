import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AlbumCover from './AlbumCover.vue'

describe('AlbumCover', () => {
  it('renders container with data-testid="album-cover"', () => {
    const wrapper = mount(AlbumCover)
    expect(wrapper.find('[data-testid="album-cover"]').exists()).toBe(true)
  })

  it('shows music note fallback when no coverArtUrl provided', () => {
    const wrapper = mount(AlbumCover)
    expect(wrapper.find('[data-testid="album-cover-fallback"]').isVisible()).toBe(true)
    expect(wrapper.find('[data-testid="album-cover-thumbnail"]').exists()).toBe(false)
  })

  it('shows thumbnail img when coverArtUrl provided', () => {
    const wrapper = mount(AlbumCover, {
      props: { coverArtUrl: 'http://localhost:9000/music/123/cover.jpg' },
    })
    const thumbnail = wrapper.find('[data-testid="album-cover-thumbnail"]')
    expect(thumbnail.exists()).toBe(true)
    expect(thumbnail.attributes('src')).toBe('http://localhost:9000/music/123/cover_100x100.jpg')
  })

  it('derives thumbnail URL by replacing cover.jpg with cover_100x100.jpg', () => {
    const wrapper = mount(AlbumCover, {
      props: { coverArtUrl: 'http://lms:9000/music/456/cover.jpg' },
    })
    expect(wrapper.find('[data-testid="album-cover-thumbnail"]').attributes('src')).toBe(
      'http://lms:9000/music/456/cover_100x100.jpg',
    )
  })

  it('derives thumbnail URL correctly for proxied playback cover URLs', () => {
    const wrapper = mount(AlbumCover, {
      props: {
        coverArtUrl:
          '/api/playback/cover?src=http%3A%2F%2F192.168.178.39%3A9000%2Fmusic%2F456%2Fcover.jpg',
      },
    })
    expect(wrapper.find('[data-testid="album-cover-thumbnail"]').attributes('src')).toBe(
      '/api/playback/cover?src=http%3A%2F%2F192.168.178.39%3A9000%2Fmusic%2F456%2Fcover_100x100.jpg',
    )
  })

  it('shows music note fallback on image error', async () => {
    const wrapper = mount(AlbumCover, {
      props: { coverArtUrl: 'http://localhost:9000/music/999/cover.jpg' },
    })
    await wrapper.find('[data-testid="album-cover-thumbnail"]').trigger('error')
    expect(wrapper.find('[data-testid="album-cover-fallback"]').isVisible()).toBe(true)
    expect(wrapper.find('[data-testid="album-cover-thumbnail"]').exists()).toBe(false)
  })

  it('shows full-res image after thumbnail loads', async () => {
    const wrapper = mount(AlbumCover, {
      props: { coverArtUrl: 'http://localhost:9000/music/123/cover.jpg' },
    })
    await wrapper.find('[data-testid="album-cover-thumbnail"]').trigger('load')
    expect(wrapper.find('[data-testid="album-cover-image"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="album-cover-image"]').attributes('src')).toBe(
      'http://localhost:9000/music/123/cover.jpg',
    )
  })

  it('has loading="lazy" on thumbnail image', () => {
    const wrapper = mount(AlbumCover, {
      props: { coverArtUrl: 'http://localhost:9000/music/123/cover.jpg' },
    })
    expect(wrapper.find('[data-testid="album-cover-thumbnail"]').attributes('loading')).toBe('lazy')
  })

  it('has responsive size classes on container', () => {
    const wrapper = mount(AlbumCover)
    const classes = wrapper.find('[data-testid="album-cover"]').classes()
    expect(classes).toContain('h-[120px]')
    expect(classes).toContain('w-[120px]')
    expect(classes).toContain('md:h-[160px]')
    expect(classes).toContain('lg:h-[200px]')
    expect(classes).toContain('lg:w-[200px]')
  })

  it('has shadow-lg on container (Apple depth aesthetic)', () => {
    const wrapper = mount(AlbumCover)
    expect(wrapper.find('[data-testid="album-cover"]').classes()).toContain('shadow-lg')
  })

  it('has rounded-lg on container (12px border-radius per UX spec)', () => {
    const wrapper = mount(AlbumCover)
    expect(wrapper.find('[data-testid="album-cover"]').classes()).toContain('rounded-lg')
  })

  it('resets image state when coverArtUrl changes', async () => {
    const wrapper = mount(AlbumCover, {
      props: { coverArtUrl: 'http://localhost:9000/music/123/cover.jpg' },
    })
    await wrapper.find('[data-testid="album-cover-thumbnail"]').trigger('load')
    expect(wrapper.find('[data-testid="album-cover-image"]').exists()).toBe(true)

    // Change track
    await wrapper.setProps({ coverArtUrl: 'http://localhost:9000/music/456/cover.jpg' })
    // Full-res should be hidden again (thumbnail not yet reloaded)
    expect(wrapper.find('[data-testid="album-cover-image"]').exists()).toBe(false)
  })

  it('stays on thumbnail when full-res image errors (does not fall back to music note)', async () => {
    const wrapper = mount(AlbumCover, {
      props: { coverArtUrl: 'http://localhost:9000/music/123/cover.jpg' },
    })
    // Load thumbnail
    await wrapper.find('[data-testid="album-cover-thumbnail"]').trigger('load')
    expect(wrapper.find('[data-testid="album-cover-image"]').exists()).toBe(true)

    // Full-res fails
    await wrapper.find('[data-testid="album-cover-image"]').trigger('error')

    // Full-res removed from DOM
    expect(wrapper.find('[data-testid="album-cover-image"]').exists()).toBe(false)
    // Thumbnail stays visible (showImage=true proves hasError=false — if hasError were true, thumbnail would also be gone)
    expect(wrapper.find('[data-testid="album-cover-thumbnail"]').exists()).toBe(true)
    // Music note is hidden (v-show=false): style attribute contains display:none
    expect(wrapper.find('[data-testid="album-cover-fallback"]').attributes('style')).toContain(
      'display: none',
    )
  })

  it('has loading="lazy" on full-res image', async () => {
    const wrapper = mount(AlbumCover, {
      props: { coverArtUrl: 'http://localhost:9000/music/123/cover.jpg' },
    })
    await wrapper.find('[data-testid="album-cover-thumbnail"]').trigger('load')
    expect(wrapper.find('[data-testid="album-cover-image"]').attributes('loading')).toBe('lazy')
  })
})

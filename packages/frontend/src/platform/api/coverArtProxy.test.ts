import { describe, expect, it } from 'vitest'
import { proxyCoverArtUrl } from './coverArtProxy'

describe('proxyCoverArtUrl', () => {
  it('rewrites insecure LMS cover URLs through the playback cover proxy', () => {
    expect(proxyCoverArtUrl('http://192.168.1.20:9000/music/42/cover.jpg')).toBe(
      '/api/playback/cover?src=http%3A%2F%2F192.168.1.20%3A9000%2Fmusic%2F42%2Fcover.jpg',
    )
  })

  it('leaves https URLs unchanged', () => {
    expect(proxyCoverArtUrl('https://resources.tidal.com/images/cover.jpg')).toBe(
      'https://resources.tidal.com/images/cover.jpg',
    )
  })

  it('leaves already proxied URLs unchanged', () => {
    expect(
      proxyCoverArtUrl(
        '/api/playback/cover?src=http%3A%2F%2F192.168.1.20%3A9000%2Fmusic%2F42%2Fcover.jpg',
      ),
    ).toBe('/api/playback/cover?src=http%3A%2F%2F192.168.1.20%3A9000%2Fmusic%2F42%2Fcover.jpg')
  })

  it('preserves empty and nullable values', () => {
    expect(proxyCoverArtUrl('')).toBe('')
    expect(proxyCoverArtUrl(undefined)).toBeUndefined()
    expect(proxyCoverArtUrl(null)).toBeNull()
  })
})

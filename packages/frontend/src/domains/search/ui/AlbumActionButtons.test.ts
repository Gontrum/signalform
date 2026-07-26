import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AlbumActionButtons from './AlbumActionButtons.vue'
import { setupTestEnv } from '@/test-utils'

describe('AlbumActionButtons', () => {
  beforeEach(() => {
    setupTestEnv()
  })

  const mountButtons = (
    props: Partial<InstanceType<typeof AlbumActionButtons>['$props']> = {},
  ): ReturnType<typeof mount> =>
    mount(AlbumActionButtons, {
      props: {
        albumId: '42',
        albumTitle: 'Dark Side of the Moon',
        albumArtist: 'Pink Floyd',
        playState: 'idle',
        queueState: 'idle',
        ...props,
      },
    })

  describe('default (compact) size — zero visual change for SearchResultsList', () => {
    it('renders the play button label hidden below sm (hidden sm:inline)', () => {
      const wrapper = mountButtons()

      const label = wrapper.find('[data-testid="play-album-text"]')
      expect(label.classes()).toContain('hidden')
      expect(label.classes()).toContain('sm:inline')
    })

    it('does not render an add-to-queue label', () => {
      const wrapper = mountButtons()

      expect(wrapper.find('[data-testid="add-album-to-queue-text"]').exists()).toBe(false)
    })

    it('uses the compact button padding classes', () => {
      const wrapper = mountButtons()

      const playButton = wrapper.find('[data-testid="play-album-button-42"]')
      expect(playButton.classes()).toContain('px-3')
      expect(playButton.classes()).toContain('sm:px-6')
      expect(playButton.classes()).not.toContain('px-6')
    })

    it('keeps the compact ml-4 wrapper margin', () => {
      const wrapper = mountButtons()

      expect(wrapper.classes()).toContain('ml-4')
    })
  })

  describe('size="large" variant (AlbumDetailView hero CTA)', () => {
    it('always shows the play button label (no hidden/sm:inline classes)', () => {
      const wrapper = mountButtons({ size: 'large' })

      const label = wrapper.find('[data-testid="play-album-text"]')
      expect(label.classes()).not.toContain('hidden')
      expect(label.classes()).not.toContain('sm:inline')
      expect(label.text()).toBe('Play album')
    })

    it('always shows the add-to-queue label', () => {
      const wrapper = mountButtons({ size: 'large' })

      const label = wrapper.find('[data-testid="add-album-to-queue-text"]')
      expect(label.exists()).toBe(true)
      expect(label.text()).toBe('+ Queue')
    })

    it('uses the larger padding and font-semibold classes for the play button', () => {
      const wrapper = mountButtons({ size: 'large' })

      const playButton = wrapper.find('[data-testid="play-album-button"]')
      expect(playButton.classes()).toContain('px-6')
      expect(playButton.classes()).toContain('py-3')
      expect(playButton.classes()).toContain('font-semibold')
      expect(playButton.classes()).not.toContain('font-medium')
    })

    it('uses the larger padding and font-semibold classes for the queue button', () => {
      const wrapper = mountButtons({ size: 'large' })

      const queueButton = wrapper.find('[data-testid="add-album-to-queue-button"]')
      expect(queueButton.classes()).toContain('px-4')
      expect(queueButton.classes()).toContain('py-3')
      expect(queueButton.classes()).toContain('font-semibold')
      expect(queueButton.classes()).not.toContain('font-medium')
    })

    it('drops the ml-4 wrapper margin (not needed outside a dense results row)', () => {
      const wrapper = mountButtons({ size: 'large' })

      expect(wrapper.classes()).not.toContain('ml-4')
    })

    // Regression guard: AlbumDetailView renders exactly one album per page, so its
    // hero Play/Queue/Go-to-artist buttons use stable, bare test-ids instead of the
    // albumId-suffixed ones the compact (list) variant needs to disambiguate rows.
    // e2e journeys (album-play.spec.ts, library-play.spec.ts) navigate to
    // AlbumDetailView and assert on these bare ids directly.
    it('uses bare (non-parametrized) test-ids, unlike the albumId-suffixed compact variant', () => {
      const wrapper = mountButtons({ size: 'large' })

      expect(wrapper.find('[data-testid="play-album-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="add-album-to-queue-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="play-album-button-42"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="add-album-to-queue-button-42"]').exists()).toBe(false)
    })

    it('uses a bare go-to-artist test-id when shown', () => {
      const wrapper = mountButtons({ size: 'large', showGoToArtist: true })

      expect(wrapper.find('[data-testid="go-to-artist-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="go-to-artist-button-42"]').exists()).toBe(false)
    })
  })

  describe('shared behaviour, size="large"', () => {
    it('emits play on play button click', async () => {
      const wrapper = mountButtons({ size: 'large' })

      await wrapper.find('[data-testid="play-album-button"]').trigger('click')

      expect(wrapper.emitted('play')).toHaveLength(1)
    })

    it('emits add-to-queue on queue button click', async () => {
      const wrapper = mountButtons({ size: 'large' })

      await wrapper.find('[data-testid="add-album-to-queue-button"]').trigger('click')

      expect(wrapper.emitted('add-to-queue')).toHaveLength(1)
    })

    it('shows the error icon on the queue button when queueState is error', () => {
      const wrapper = mountButtons({ size: 'large', queueState: 'error' })

      expect(wrapper.find('[data-testid="add-album-to-queue-error"]').exists()).toBe(true)
    })
  })

  describe('shared behaviour, default (compact) size', () => {
    it('emits play on play button click', async () => {
      const wrapper = mountButtons()

      await wrapper.find('[data-testid="play-album-button-42"]').trigger('click')

      expect(wrapper.emitted('play')).toHaveLength(1)
    })

    it('emits add-to-queue on queue button click', async () => {
      const wrapper = mountButtons()

      await wrapper.find('[data-testid="add-album-to-queue-button-42"]').trigger('click')

      expect(wrapper.emitted('add-to-queue')).toHaveLength(1)
    })

    it('uses an albumId-suffixed go-to-artist test-id when shown', () => {
      const wrapper = mountButtons({ showGoToArtist: true })

      expect(wrapper.find('[data-testid="go-to-artist-button-42"]').exists()).toBe(true)
    })
  })
})

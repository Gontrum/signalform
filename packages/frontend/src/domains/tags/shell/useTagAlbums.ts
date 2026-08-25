import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { findTag } from '@signalform/shared'
import { getTagAlbumsPage } from '@/platform/api/tagsApi'
import type { TagAlbum } from '@/platform/api/tagsApi'
import { resolveAlbum } from '@/platform/api/tidalAlbumsApi'
import { classifyError, type TagAlbumsErrorKind } from '../core/error'

const PAGE_SIZE = 12

type TagAlbumsStatus = 'loading' | 'success' | 'error'

type UseTagAlbumsResult = {
  readonly status: Ref<TagAlbumsStatus>
  readonly errorKind: Ref<TagAlbumsErrorKind | null>
  readonly albums: Ref<readonly TagAlbum[]>
  readonly hasMore: Ref<boolean>
  readonly isLoadingMore: Ref<boolean>
  readonly resolvingKey: Ref<string | null>
  readonly loadMore: () => Promise<void>
  readonly handleAlbumClick: (album: TagAlbum, key: string) => Promise<void>
}

export const useTagAlbums = (): UseTagAlbumsResult => {
  const route = useRoute()
  const router = useRouter()

  const tagId = computed(() => {
    const raw = route.query['tag']
    return typeof raw === 'string' ? findTag(raw)?.id : undefined
  })

  const text = computed(() => (typeof route.query['q'] === 'string' ? route.query['q'] : ''))

  const status = ref<TagAlbumsStatus>('loading')
  const errorKind = ref<TagAlbumsErrorKind | null>(null)
  const albums = ref<readonly TagAlbum[]>([])
  const hasMore = ref(false)
  const isLoadingMore = ref(false)
  const resolvingKey = ref<string | null>(null)

  // Every load carries the counter value it started with; a response whose
  // token is no longer current belongs to a tag the user already left.
  const requestRef = { current: 0 }

  const loadFirstPage = async (): Promise<void> => {
    requestRef.current += 1
    const token = requestRef.current
    const tag = tagId.value

    albums.value = []
    hasMore.value = false
    isLoadingMore.value = false
    resolvingKey.value = null
    errorKind.value = null

    // No tag: nothing to ask Discogs — an empty result is the correct answer,
    // not a network error.
    if (tag === undefined) {
      status.value = 'success'
      return
    }

    status.value = 'loading'

    const result = await getTagAlbumsPage(tag, text.value, 0, PAGE_SIZE)
    if (token !== requestRef.current) {
      return
    }

    if (!result.ok) {
      status.value = 'error'
      errorKind.value = classifyError(result.error)
      return
    }

    albums.value = result.value.albums
    hasMore.value = result.value.hasMore
    status.value = 'success'
  }

  // Paging runs over Discogs candidates, not over the albums that survived the
  // server's availability filter, so the next offset is the candidate count —
  // not `albums.value.length`.
  const candidateOffsetRef = { current: 0 }

  const loadMore = async (): Promise<void> => {
    const tag = tagId.value
    if (tag === undefined || isLoadingMore.value || !hasMore.value || status.value !== 'success') {
      return
    }

    const token = requestRef.current
    const offset = candidateOffsetRef.current + PAGE_SIZE

    isLoadingMore.value = true
    const result = await getTagAlbumsPage(tag, text.value, offset, PAGE_SIZE)
    if (token !== requestRef.current) {
      return
    }

    isLoadingMore.value = false

    if (!result.ok) {
      return
    }

    candidateOffsetRef.current = offset
    albums.value = [...albums.value, ...result.value.albums]
    hasMore.value = result.value.hasMore
  }

  const navigateLocal = (album: TagAlbum): void => {
    if (album.albumId === undefined) {
      return
    }
    void router.push({ name: 'album-detail', params: { albumId: album.albumId } })
  }

  const navigateTidal = async (album: TagAlbum, key: string): Promise<void> => {
    if (resolvingKey.value !== null) {
      return
    }

    resolvingKey.value = key
    const result = await resolveAlbum(album.title, album.artist)
    resolvingKey.value = null

    const resolvedId = result.ok ? result.value.albumId : null
    // One candidate LMS cannot resolve stays a dead card; it must not take the
    // rest of the list down with it.
    if (resolvedId === null) {
      return
    }

    void router.push({
      name: 'album-detail',
      params: { albumId: resolvedId },
      state: {
        tidalTitle: album.title,
        tidalArtist: album.artist,
        tidalCoverArtUrl: album.coverArtUrl,
      },
    })
  }

  const handleAlbumClick = async (album: TagAlbum, key: string): Promise<void> => {
    if (album.source === 'local') {
      navigateLocal(album)
      return
    }

    await navigateTidal(album, key)
  }

  watch(
    [tagId, text],
    () => {
      candidateOffsetRef.current = 0
      void loadFirstPage()
    },
    { immediate: true },
  )

  return {
    status,
    errorKind,
    albums,
    hasMore,
    isLoadingMore,
    resolvingKey,
    loadMore,
    handleAlbumClick,
  }
}

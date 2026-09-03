import { onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import {
  getTidalPlaylistTracks,
  listTidalPlaylists,
  playTidalPlaylist,
} from '@/platform/api/tidalPlaylistsApi'
import type { TidalPlaylist, TidalPlaylistTrack } from '@/platform/api/tidalPlaylistsApi'
import { useQueueStore } from '@/domains/queue/shell/useQueueStore'

type UseTidalPlaylistsResult = {
  readonly playlists: Ref<readonly TidalPlaylist[]>
  readonly isLoading: Ref<boolean>
  readonly error: Ref<boolean>
  readonly playingId: Ref<string | undefined>
  readonly expandedId: Ref<string | undefined>
  readonly tracks: Ref<readonly TidalPlaylistTrack[]>
  readonly trackCount: Ref<number | undefined>
  readonly isTracksLoading: Ref<boolean>
  readonly hasMoreTracks: Ref<boolean>
  readonly fetchList: () => Promise<void>
  readonly play: (id: string) => Promise<void>
  readonly toggleTracks: (id: string) => Promise<void>
  readonly loadMoreTracks: () => Promise<void>
}

const TRACKS_PAGE_SIZE = 250

export const useTidalPlaylists = (): UseTidalPlaylistsResult => {
  const playlists = ref<readonly TidalPlaylist[]>([])
  const isLoading = ref(false)
  const error = ref(false)
  const playingId = ref<string | undefined>(undefined)
  const expandedId = ref<string | undefined>(undefined)
  const tracks = ref<readonly TidalPlaylistTrack[]>([])
  const trackCount = ref<number | undefined>(undefined)
  const isTracksLoading = ref(false)
  const hasMoreTracks = ref(false)

  const queueStore = useQueueStore()

  const fetchList = async (): Promise<void> => {
    isLoading.value = true
    try {
      playlists.value = await listTidalPlaylists()
    } catch {
      error.value = true
    } finally {
      isLoading.value = false
    }
  }

  const play = async (id: string): Promise<void> => {
    if (playingId.value !== undefined) {
      return
    }

    error.value = false
    playingId.value = id
    try {
      const started = await playTidalPlaylist(id)
      if (!started) {
        error.value = true
        return
      }
      await queueStore.fetchQueue()
    } catch {
      error.value = true
    } finally {
      playingId.value = undefined
    }
  }

  const collapseTracks = (): void => {
    expandedId.value = undefined
    tracks.value = []
    trackCount.value = undefined
    hasMoreTracks.value = false
  }

  const fetchTracksPage = async (
    id: string,
    limit: number,
    offset: number,
  ): Promise<readonly TidalPlaylistTrack[] | undefined> => {
    isTracksLoading.value = true
    try {
      const page = await getTidalPlaylistTracks(id, limit, offset)
      if (expandedId.value !== id) {
        return undefined
      }
      if (!page) {
        error.value = true
        return undefined
      }
      hasMoreTracks.value = page.hasMore
      trackCount.value = page.totalCount
      return page.tracks
    } catch {
      if (expandedId.value === id) {
        error.value = true
      }
      return undefined
    } finally {
      isTracksLoading.value = false
    }
  }

  const toggleTracks = async (id: string): Promise<void> => {
    if (expandedId.value === id) {
      collapseTracks()
      return
    }

    error.value = false
    collapseTracks()
    expandedId.value = id

    const page = await fetchTracksPage(id, TRACKS_PAGE_SIZE, 0)
    if (expandedId.value !== id) {
      return
    }
    if (!page) {
      collapseTracks()
      return
    }
    tracks.value = page
  }

  const loadMoreTracks = async (): Promise<void> => {
    const id = expandedId.value
    if (id === undefined || !hasMoreTracks.value || isTracksLoading.value) {
      return
    }

    error.value = false
    const page = await fetchTracksPage(id, TRACKS_PAGE_SIZE, tracks.value.length)
    if (!page || expandedId.value !== id) {
      return
    }
    tracks.value = [...tracks.value, ...page]
  }

  onMounted(() => {
    void fetchList()
  })

  return {
    playlists,
    isLoading,
    error,
    playingId,
    expandedId,
    tracks,
    trackCount,
    isTracksLoading,
    hasMoreTracks,
    fetchList,
    play,
    toggleTracks,
    loadMoreTracks,
  }
}

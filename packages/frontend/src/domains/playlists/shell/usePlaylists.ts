import { computed, onMounted, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import {
  deletePlaylist,
  getPlaylistTracks,
  listPlaylists,
  loadPlaylist,
  removePlaylistTrack,
  renamePlaylist,
  savePlaylist,
} from '@/platform/api/playlistsApi'
import type { PlaylistTrack, PlaylistWriteResult, SavedPlaylist } from '@/platform/api/playlistsApi'
import { useQueueStore } from '@/domains/queue/shell/useQueueStore'

type UsePlaylistsResult = {
  readonly playlists: Ref<readonly SavedPlaylist[]>
  readonly isLoading: Ref<boolean>
  readonly isSaving: Ref<boolean>
  readonly error: ComputedRef<boolean>
  readonly playlistDirMissing: ComputedRef<boolean>
  readonly expandedId: Ref<string | undefined>
  readonly tracks: Ref<readonly PlaylistTrack[]>
  readonly isTracksLoading: Ref<boolean>
  readonly isRemovingTrack: Ref<boolean>
  readonly hasMoreTracks: Ref<boolean>
  readonly fetchList: () => Promise<void>
  readonly save: (name: string) => Promise<void>
  readonly load: (id: string) => Promise<void>
  readonly remove: (id: string) => Promise<void>
  readonly rename: (id: string, name: string) => Promise<void>
  readonly toggleTracks: (id: string) => Promise<void>
  readonly loadMoreTracks: () => Promise<void>
  readonly removeTrack: (index: number) => Promise<void>
}

const TRACKS_PAGE_SIZE = 250
// The route caps `limit` at 999, so a reload can never re-request more than
// that in one go — beyond it the user pages forward again.
const TRACKS_MAX_LIMIT = 999

// One source of truth: "there is an error" and "which error" can never drift
// apart, and clearing one clears the other.
type PlaylistsErrorKind = 'generic' | 'no-playlist-dir'

export const usePlaylists = (): UsePlaylistsResult => {
  const playlists = ref<readonly SavedPlaylist[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const errorKind = ref<PlaylistsErrorKind | undefined>(undefined)
  const error = computed(() => errorKind.value !== undefined)
  const playlistDirMissing = computed(() => errorKind.value === 'no-playlist-dir')
  const expandedId = ref<string | undefined>(undefined)
  const tracks = ref<readonly PlaylistTrack[]>([])
  const isTracksLoading = ref(false)
  const isRemovingTrack = ref(false)
  const hasMoreTracks = ref(false)

  const queueStore = useQueueStore()

  const fail = (): void => {
    errorKind.value = 'generic'
  }

  const clearError = (): void => {
    errorKind.value = undefined
  }

  const failFromWrite = (result: PlaylistWriteResult): void => {
    errorKind.value = result === 'no-playlist-dir' ? 'no-playlist-dir' : 'generic'
  }

  const fetchList = async (): Promise<void> => {
    isLoading.value = true
    try {
      playlists.value = await listPlaylists()
    } catch {
      fail()
    } finally {
      isLoading.value = false
    }
  }

  const save = async (name: string): Promise<void> => {
    if (name.trim().length === 0) {
      return
    }

    clearError()
    isSaving.value = true
    try {
      const saved = await savePlaylist(name)
      if (saved === 'ok') {
        await fetchList()
      } else {
        failFromWrite(saved)
      }
    } catch {
      fail()
    } finally {
      isSaving.value = false
    }
  }

  const load = async (id: string): Promise<void> => {
    clearError()
    try {
      const loaded = await loadPlaylist(id)
      if (loaded) {
        await queueStore.fetchQueue()
      } else {
        fail()
      }
    } catch {
      fail()
    }
  }

  const remove = async (id: string): Promise<void> => {
    clearError()
    try {
      const removed = await deletePlaylist(id)
      if (removed === 'ok') {
        await fetchList()
      } else {
        failFromWrite(removed)
      }
    } catch {
      fail()
    }
  }

  const rename = async (id: string, name: string): Promise<void> => {
    if (name.trim().length === 0) {
      return
    }

    clearError()
    try {
      const renamed = await renamePlaylist(id, name)
      if (renamed === 'ok') {
        await fetchList()
      } else {
        failFromWrite(renamed)
      }
    } catch {
      fail()
    }
  }

  const collapseTracks = (): void => {
    expandedId.value = undefined
    tracks.value = []
    hasMoreTracks.value = false
  }

  const fetchTracksPage = async (
    id: string,
    limit: number,
    offset: number,
  ): Promise<readonly PlaylistTrack[] | undefined> => {
    isTracksLoading.value = true
    try {
      const page = await getPlaylistTracks(id, limit, offset)
      if (!page) {
        fail()
        return undefined
      }
      hasMoreTracks.value = page.hasMore
      return page.tracks
    } catch {
      fail()
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

    clearError()
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

    clearError()
    const page = await fetchTracksPage(id, TRACKS_PAGE_SIZE, tracks.value.length)
    if (!page || expandedId.value !== id) {
      return
    }
    tracks.value = [...tracks.value, ...page]
  }

  const reloadTracks = async (id: string): Promise<void> => {
    const windowSize = Math.min(TRACKS_MAX_LIMIT, Math.max(TRACKS_PAGE_SIZE, tracks.value.length))
    const page = await fetchTracksPage(id, windowSize, 0)
    if (expandedId.value !== id) {
      return
    }
    if (!page) {
      // Every index after the removed one has shifted, so the list on screen
      // now points at the wrong tracks. Dropping it beats offering a second
      // delete that would hit a neighbour.
      collapseTracks()
      return
    }
    tracks.value = page
  }

  const removeTrack = async (index: number): Promise<void> => {
    const id = expandedId.value
    // A second delete on the pre-removal list would address a shifted track,
    // so only one may be in flight.
    if (id === undefined || isRemovingTrack.value) {
      return
    }

    clearError()
    isRemovingTrack.value = true
    try {
      const removed = await removePlaylistTrack(id, index)
      if (removed !== 'ok') {
        failFromWrite(removed)
        return
      }
      await reloadTracks(id)
    } catch {
      fail()
    } finally {
      isRemovingTrack.value = false
    }
  }

  onMounted(() => {
    void fetchList()
  })

  return {
    playlists,
    isLoading,
    isSaving,
    error,
    playlistDirMissing,
    expandedId,
    tracks,
    isTracksLoading,
    isRemovingTrack,
    hasMoreTracks,
    fetchList,
    save,
    load,
    remove,
    rename,
    toggleTracks,
    loadMoreTracks,
    removeTrack,
  }
}

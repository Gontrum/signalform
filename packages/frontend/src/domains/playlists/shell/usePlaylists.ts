import { onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import {
  deletePlaylist,
  getPlaylistTracks,
  listPlaylists,
  loadPlaylist,
  removePlaylistTrack,
  renamePlaylist,
  savePlaylist,
} from '@/platform/api/playlistsApi'
import type { PlaylistTrack, SavedPlaylist } from '@/platform/api/playlistsApi'
import { useQueueStore } from '@/domains/queue/shell/useQueueStore'

type UsePlaylistsResult = {
  readonly playlists: Ref<readonly SavedPlaylist[]>
  readonly isLoading: Ref<boolean>
  readonly isSaving: Ref<boolean>
  readonly error: Ref<boolean>
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

export const usePlaylists = (): UsePlaylistsResult => {
  const playlists = ref<readonly SavedPlaylist[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref(false)
  const expandedId = ref<string | undefined>(undefined)
  const tracks = ref<readonly PlaylistTrack[]>([])
  const isTracksLoading = ref(false)
  const isRemovingTrack = ref(false)
  const hasMoreTracks = ref(false)

  const queueStore = useQueueStore()

  const fetchList = async (): Promise<void> => {
    isLoading.value = true
    try {
      playlists.value = await listPlaylists()
    } catch {
      error.value = true
    } finally {
      isLoading.value = false
    }
  }

  const save = async (name: string): Promise<void> => {
    if (name.trim().length === 0) {
      return
    }

    error.value = false
    isSaving.value = true
    try {
      const saved = await savePlaylist(name)
      if (saved) {
        await fetchList()
      } else {
        error.value = true
      }
    } catch {
      error.value = true
    } finally {
      isSaving.value = false
    }
  }

  const load = async (id: string): Promise<void> => {
    error.value = false
    try {
      const loaded = await loadPlaylist(id)
      if (loaded) {
        await queueStore.fetchQueue()
      } else {
        error.value = true
      }
    } catch {
      error.value = true
    }
  }

  const remove = async (id: string): Promise<void> => {
    error.value = false
    try {
      const removed = await deletePlaylist(id)
      if (removed) {
        await fetchList()
      } else {
        error.value = true
      }
    } catch {
      error.value = true
    }
  }

  const rename = async (id: string, name: string): Promise<void> => {
    if (name.trim().length === 0) {
      return
    }

    error.value = false
    try {
      const renamed = await renamePlaylist(id, name)
      if (renamed) {
        await fetchList()
      } else {
        error.value = true
      }
    } catch {
      error.value = true
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
        error.value = true
        return undefined
      }
      hasMoreTracks.value = page.hasMore
      return page.tracks
    } catch {
      error.value = true
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

    error.value = false
    isRemovingTrack.value = true
    try {
      const removed = await removePlaylistTrack(id, index)
      if (!removed) {
        error.value = true
        return
      }
      await reloadTracks(id)
    } catch {
      error.value = true
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

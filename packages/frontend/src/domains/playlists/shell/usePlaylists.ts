import { onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { listPlaylists, loadPlaylist, savePlaylist } from '@/platform/api/playlistsApi'
import type { SavedPlaylist } from '@/platform/api/playlistsApi'
import { useQueueStore } from '@/domains/queue/shell/useQueueStore'

type UsePlaylistsResult = {
  readonly playlists: Ref<readonly SavedPlaylist[]>
  readonly isLoading: Ref<boolean>
  readonly isSaving: Ref<boolean>
  readonly error: Ref<boolean>
  readonly fetchList: () => Promise<void>
  readonly save: (name: string) => Promise<void>
  readonly load: (id: string) => Promise<void>
}

export const usePlaylists = (): UsePlaylistsResult => {
  const playlists = ref<readonly SavedPlaylist[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref(false)

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

  onMounted(() => {
    void fetchList()
  })

  return {
    playlists,
    isLoading,
    isSaving,
    error,
    fetchList,
    save,
    load,
  }
}

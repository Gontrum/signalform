import { ref, watch, onMounted } from 'vue'
import type { Ref } from 'vue'
import { usePlaybackStore } from './usePlaybackStore'
import { loveTrack, unloveTrack } from '@/platform/api/lastFmLoveApi'
import { getConfig } from '@/platform/api/configApi'

type UseLoveTrackResult = {
  readonly hasLastFmSession: Ref<boolean>
  readonly isLoved: Ref<boolean>
  readonly isLoving: Ref<boolean>
  readonly toggleLove: () => Promise<void>
}

export const useLoveTrack = (): UseLoveTrackResult => {
  const playbackStore = usePlaybackStore()
  const isLoved = ref(false)
  const isLoving = ref(false)
  const hasLastFmSession = ref(false)

  onMounted(async () => {
    const result = await getConfig()
    if (result.ok) {
      hasLastFmSession.value = result.value.hasLastFmSession ?? false
    }
  })

  watch(
    () => playbackStore.currentTrack?.id,
    () => {
      isLoved.value = false
    },
  )

  const toggleLove = async (): Promise<void> => {
    const currentTrack = playbackStore.currentTrack
    if (currentTrack === null || currentTrack === undefined || isLoving.value) {
      return
    }

    isLoving.value = true
    const prevLoved = isLoved.value
    isLoved.value = !prevLoved

    const success = isLoved.value
      ? await loveTrack(currentTrack.artist, currentTrack.title)
      : await unloveTrack(currentTrack.artist, currentTrack.title)

    if (!success) {
      isLoved.value = prevLoved
    }

    isLoving.value = false
  }

  return {
    hasLastFmSession,
    isLoved,
    isLoving,
    toggleLove,
  }
}

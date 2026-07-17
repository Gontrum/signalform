<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { getConfig } from '@/platform/api/configApi'
import { wakeLms } from '@/platform/api/lmsWakeApi'
import { shouldTriggerWake } from '@/domains/lms/core/service'
import { useI18nStore } from '@/app/i18nStore'
import { useUserStore } from '@/domains/user/shell/useUserStore'
import UserSelectDialog from '@/domains/user/ui/UserSelectDialog.vue'

const router = useRouter()
const i18nStore = useI18nStore()
const userStore = useUserStore()

onMounted(() => {
  void userStore.load()
})

// Wake-on-LAN: nudge a sleeping LMS server when the app is opened or comes
// back into view, throttled so tab switching does not spam wake packets.
let lastWakeAt = 0
const triggerLmsWake = (): void => {
  const now = Date.now()
  if (!shouldTriggerWake(lastWakeAt, now)) return
  lastWakeAt = now
  void wakeLms()
}

const handleVisibilityChange = (): void => {
  if (document.visibilityState === 'visible') {
    triggerLmsWake()
  }
}

onMounted(() => {
  triggerLmsWake()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

// Redirect to setup wizard if app has never been configured
onMounted(async () => {
  // Skip check if already on setup page
  if (router.currentRoute.value.name === 'setup') return

  const result = await getConfig()
  if (result.ok) {
    i18nStore.initLanguageFromConfig(result.value.language)

    if (!result.value.isConfigured) {
      void router.push({ name: 'setup' })
    }
  }
  // If request fails (backend unreachable), let the app load normally
})

const handleKeydown = (e: KeyboardEvent): void => {
  // Skip setup page — no shortcuts there
  if (router.currentRoute.value.name === 'setup') return

  if (!(e.target instanceof HTMLElement)) {
    return
  }
  const target = e.target
  const isEditable =
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    void router.push({ name: 'home' })
    return
  }

  if (e.key === '/' && !isEditable && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault()
    void router.push({ name: 'home' })
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="h-dvh min-h-0 w-full overflow-hidden bg-neutral-50">
    <RouterView />
    <UserSelectDialog v-if="userStore.needsSelection" />
  </div>
</template>

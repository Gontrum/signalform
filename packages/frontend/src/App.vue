<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import { getConfig } from '@/platform/api/configApi'
import { wakeLms } from '@/platform/api/lmsWakeApi'
import { shouldTriggerWake } from '@/domains/lms/core/service'
import { useLmsHealth } from '@/domains/lms/shell/useLmsHealth'
import { useI18nStore } from '@/app/i18nStore'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'
import { useUserStore } from '@/domains/user/shell/useUserStore'
import UserSelectDialog from '@/domains/user/ui/UserSelectDialog.vue'
import LmsDownBanner from '@/domains/lms/ui/LmsDownBanner.vue'
import BottomNavBar from '@/app/BottomNavBar.vue'
import MiniPlayer from '@/domains/playback/ui/MiniPlayer.vue'

const router = useRouter()
const route = useRoute()

// The global mini-player sits above the bottom nav on every page, except where
// it would be redundant (Now Playing) or out of place (the setup wizard). Its
// track/phone visibility is owned by the MiniPlayer component itself.
const isMiniPlayerRouteAllowed = computed(
  () => route.name !== 'now-playing' && route.name !== 'setup',
)
const i18nStore = useI18nStore()
const userStore = useUserStore()

const { isLmsDown } = useLmsHealth()
const { isPhone } = useResponsiveLayout()

onMounted(() => {
  void userStore.load()
})

// iOS standalone PWA only: on the very first paint the bottom nav sits a few px
// too low (measured: its bottom settles from the shell edge up to the visible
// edge only after the first route change), which clips the tab icons against
// the home indicator. Nudge a reflow once the content has painted so the layout
// settles up front instead of after the first navigation. Gated to standalone
// so the browser (and tests) are unaffected.
onMounted(() => {
  if (!window.matchMedia('(display-mode: standalone)').matches) return
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'))
      void document.body.getBoundingClientRect()
    })
  })
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

// When the LMS transitions from reachable to down, nudge it awake once so the
// banner's "trying to wake it…" message actually reflects an attempt.
watch(isLmsDown, (down, wasDown) => {
  if (down && !wasDown) {
    triggerLmsWake()
  }
})

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
  <div class="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-neutral-50">
    <LmsDownBanner v-if="isLmsDown" />
    <div
      data-testid="app-content"
      class="min-h-0 flex-1 overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]"
    >
      <RouterView />
    </div>
    <MiniPlayer v-if="isMiniPlayerRouteAllowed" />
    <BottomNavBar v-if="isPhone" />
    <UserSelectDialog v-if="userStore.needsSelection" />
  </div>
</template>

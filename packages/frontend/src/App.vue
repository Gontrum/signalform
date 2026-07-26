<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import { getConfig } from '@/platform/api/configApi'
import { wakeLms } from '@/platform/api/lmsWakeApi'
import { shouldTriggerWake } from '@/domains/lms/core/service'
import { useLmsHealth } from '@/domains/lms/shell/useLmsHealth'
import { useI18nStore } from '@/app/i18nStore'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'
import { getTransitionName } from '@/app/pageTransition'
import { useUserStore } from '@/domains/user/shell/useUserStore'
import UserSelectDialog from '@/domains/user/ui/UserSelectDialog.vue'
import LmsDownBanner from '@/domains/lms/ui/LmsDownBanner.vue'
import BottomNavBar from '@/app/BottomNavBar.vue'
import MiniPlayer from '@/domains/playback/ui/MiniPlayer.vue'
import MainNavBar from '@/app/MainNavBar.vue'
import AppLayout from '@/layouts/AppLayout.vue'
import NowPlayingPanel from '@/domains/playback/ui/NowPlayingPanel.vue'

const router = useRouter()
const route = useRoute()

// Drives the push/pop page-transition CSS (see src/assets/main.css): set on
// every navigation by comparing the route "depth" meta of the from/to routes.
const transitionName = ref('')
router.afterEach((to, from) => {
  transitionName.value = getTransitionName(from.meta.depth, to.meta.depth)
})

// Now Playing and the setup wizard are immersive, full-screen views: they hide
// both the global mini-player (redundant/out of place there) and the bottom tab
// bar, so their own chrome (back button, floating queue toggle) can own the
// screen — like Apple Music / Spotify's now-playing screen. The mini-player's
// track/phone visibility is still owned by the MiniPlayer component itself.
const isImmersiveRoute = computed(() => route.name === 'now-playing' || route.name === 'setup')
const i18nStore = useI18nStore()
const userStore = useUserStore()

const { isLmsDown } = useLmsHealth()
const { isPhone } = useResponsiveLayout()

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
    <MainNavBar v-if="!isImmersiveRoute && !isPhone" />
    <div data-testid="app-content" class="relative min-h-0 flex-1 overflow-hidden">
      <RouterView v-slot="{ Component }">
        <Transition :name="transitionName">
          <!-- Non-immersive routes are wrapped in the global 60/40 AppLayout
               split, with Now Playing always in the right column on
               tablet/desktop (AppLayout itself hides that column on phone).
               Immersive routes (now-playing, setup) bypass AppLayout entirely
               and render full-screen, exactly as before. AppLayout itself is
               NOT keyed by route.path (unlike the v-else branch below): a
               Vue <Transition> only reacts to its own *direct* slot child
               changing identity — a key change nested further down (e.g. on
               the routed component inside #left) does not bubble up and
               retrigger this outer Transition. Keying AppLayout here would
               force a full unmount/remount of the whole subtree on every
               non-immersive navigation, including NowPlayingPanel in #right,
               which is exactly the persistent-chrome bug this avoids
               (NowPlayingPanel would otherwise refetch playback/sleep-timer
               state and lose any open popover state on every nav). -->
          <AppLayout v-if="!isImmersiveRoute" class="h-full">
            <template #left>
              <!-- Nested Transition, scoped to just the routed left-panel
                   content: this is what actually plays the push/pop slide
                   for navigations between two non-immersive routes (e.g. a
                   depth-1 -> depth-2 drill-down like Library -> Album
                   Detail), since the outer Transition above no longer sees a
                   direct-child identity change for those. AppLayout and
                   NowPlayingPanel in #right are untouched by this. -->
              <Transition :name="transitionName">
                <component :is="Component" :key="route.path" />
              </Transition>
            </template>
            <template #right>
              <NowPlayingPanel />
            </template>
          </AppLayout>
          <component :is="Component" v-else :key="route.path" />
        </Transition>
      </RouterView>
    </div>
    <MiniPlayer v-if="!isImmersiveRoute" />
    <BottomNavBar v-if="isPhone && !isImmersiveRoute" />
    <UserSelectDialog v-if="userStore.needsSelection" />
  </div>
</template>

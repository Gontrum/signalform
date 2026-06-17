<script setup lang="ts">
import MainNavBar from '@/app/MainNavBar.vue'
import { useSettingsView } from '../shell/useSettingsView'

const {
  lmsHost,
  lmsPort,
  playerId,
  lastFmApiKey,
  fanartApiKey,
  language,
  hasLastFmKey,
  hasFanartKey,
  discovering,
  discoveredServers,
  discoverError,
  showServerDropdown,
  loadingPlayers,
  players,
  playersError,
  showPlayerDropdown,
  saving,
  saveSuccess,
  saveError,
  loading,
  loadError,
  lastFmAuthStep,
  lastFmAuthError,
  lastFmUsername,
  hasLastFmSession,
  personalRadioEnabled,
  scrobblingEnabled,
  personalRadioDiscovery,
  t,
  discover,
  selectServer,
  listPlayers,
  selectPlayer,
  save,
  runSetupWizard,
  handleLastFmConnect,
  handleLastFmConfirm,
  handleLastFmDisconnect,
  handleDiscoveryChange,
  handlePersonalRadioToggle,
  handleScrobblingToggle,
} = useSettingsView()
</script>

<template>
  <div class="p-6" data-testid="settings-view">
    <MainNavBar />

    <div class="mx-auto max-w-xl">
      <h1 class="mb-6 text-2xl font-bold text-neutral-900">{{ t('settings.title') }}</h1>

      <div v-if="loading" class="flex justify-center py-8" data-testid="settings-loading">
        <div
          class="h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-transparent"
        />
      </div>

      <p v-else-if="loadError" data-testid="settings-load-error" class="text-sm text-red-600">
        {{ t('settings.error.loadFailed') }}
      </p>

      <form v-else data-testid="settings-form" class="space-y-6" @submit.prevent="save">
        <section>
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {{ t('settings.section.integration') }}
          </h2>

          <div class="space-y-3">
            <div class="flex items-end gap-2">
              <div class="flex-1">
                <label class="mb-1.5 block text-xs font-medium text-neutral-700" for="lms-host">
                  {{ t('settings.hostLabel') }}
                </label>
                <input
                  id="lms-host"
                  v-model="lmsHost"
                  type="text"
                  data-testid="lms-host-input"
                  placeholder="192.168.1.100"
                  class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
                />
              </div>
              <div class="w-24">
                <label class="mb-1.5 block text-xs font-medium text-neutral-700" for="lms-port">
                  {{ t('settings.portLabel') }}
                </label>
                <input
                  id="lms-port"
                  v-model="lmsPort"
                  type="number"
                  data-testid="lms-port-input"
                  placeholder="9000"
                  class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
                />
              </div>
              <button
                type="button"
                data-testid="discover-button"
                class="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                :disabled="discovering"
                @click="discover"
              >
                <span v-if="discovering">{{ t('settings.discoverScanning') }}</span>
                <span v-else>{{ t('settings.discoverButton') }}</span>
              </button>
            </div>

            <p v-if="discoverError" data-testid="discover-error" class="text-xs text-red-600">
              {{
                discoverError === 'none'
                  ? t('settings.discoverNone')
                  : discoverError === 'failed'
                    ? t('settings.discoverFailed')
                    : discoverError
              }}
            </p>

            <div
              v-if="showServerDropdown && discoveredServers.length > 0"
              class="rounded-lg border border-neutral-200 bg-white shadow-sm"
              data-testid="server-dropdown"
            >
              <button
                v-for="server in discoveredServers"
                :key="`${server.host}:${server.port}`"
                type="button"
                data-testid="server-option"
                class="flex w-full items-start px-3 py-2 text-left text-sm hover:bg-neutral-50"
                @click="selectServer(server)"
              >
                <span class="font-medium text-neutral-900">{{ server.name }}</span>
                <span class="ml-2 text-neutral-500">{{ server.host }}:{{ server.port }}</span>
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {{ t('settings.section.experience') }}
          </h2>

          <div class="space-y-3">
            <div class="flex items-end gap-2">
              <div class="flex-1">
                <label class="mb-1.5 block text-xs font-medium text-neutral-700" for="player-id">
                  {{ t('settings.playerIdLabel') }}
                </label>
                <input
                  id="player-id"
                  v-model="playerId"
                  type="text"
                  data-testid="player-id-input"
                  placeholder="aa:bb:cc:dd:ee:ff"
                  class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-mono focus:border-neutral-900 focus:outline-none"
                />
              </div>
              <button
                type="button"
                data-testid="list-players-button"
                class="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                :disabled="loadingPlayers || !lmsHost.trim()"
                @click="listPlayers"
              >
                <span v-if="loadingPlayers">{{ t('home.loading') }}</span>
                <span v-else>{{ t('settings.playersButton') }}</span>
              </button>
            </div>

            <p v-if="playersError" data-testid="players-error" class="text-xs text-red-600">
              {{
                playersError === 'none'
                  ? t('settings.playersNone')
                  : playersError.startsWith('failed:')
                    ? t('settings.playersFailed')
                        .replace('{host}', playersError.split(':')[1] ?? '')
                        .replace('{port}', playersError.split(':')[2] ?? '')
                    : playersError
              }}
            </p>

            <div
              v-if="showPlayerDropdown && players.length > 0"
              class="rounded-lg border border-neutral-200 bg-white shadow-sm"
              data-testid="player-dropdown"
            >
              <button
                v-for="player in players"
                :key="player.id"
                type="button"
                data-testid="player-option"
                class="flex w-full items-start px-3 py-2 text-left text-sm hover:bg-neutral-50"
                @click="selectPlayer(player)"
              >
                <span class="font-medium text-neutral-900">{{ player.name }}</span>
                <span class="ml-2 text-neutral-500">{{ player.model }}</span>
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {{ t('settings.languageSection') }}
          </h2>

          <div class="space-y-3">
            <div class="flex flex-col gap-2">
              <label class="text-xs font-medium text-neutral-700" for="language-select">
                {{ t('settings.languageLabel') }}
              </label>
              <select
                id="language-select"
                v-model="language"
                data-testid="language-select"
                class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              >
                <option value="en">{{ t('settings.languageEnglish') }}</option>
                <option value="de">{{ t('settings.languageGerman') }}</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            API Keys
          </h2>

          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-xs font-medium text-neutral-700" for="lastfm-key">
                Last.fm API Key
                <span v-if="hasLastFmKey" class="ml-1 text-green-600">✓ configured</span>
              </label>
              <input
                id="lastfm-key"
                v-model="lastFmApiKey"
                type="text"
                data-testid="lastfm-key-input"
                :placeholder="
                  hasLastFmKey
                    ? t('settings.lastfmPlaceholderConfigured')
                    : t('settings.lastfmPlaceholderEmpty')
                "
                class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              />
            </div>

            <div>
              <label class="mb-1.5 block text-xs font-medium text-neutral-700" for="fanart-key">
                Fanart.tv API Key
                <span v-if="hasFanartKey" class="ml-1 text-green-600">✓ configured</span>
              </label>
              <input
                id="fanart-key"
                v-model="fanartApiKey"
                type="text"
                data-testid="fanart-key-input"
                :placeholder="
                  hasFanartKey
                    ? t('settings.fanartPlaceholderConfigured')
                    : t('settings.fanartPlaceholderEmpty')
                "
                class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              />
            </div>
          </div>
        </section>

        <!-- Last.fm section -->
        <section data-testid="lastfm-section">
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {{ t('settings.lastFm') }}
          </h2>

          <div class="space-y-4">
            <!-- Username display (read-only) -->
            <div v-if="lastFmUsername">
              <label class="mb-1.5 block text-xs font-medium text-neutral-700">
                {{ t('settings.lastFmUsername') }}
              </label>
              <p data-testid="lastfm-username-display" class="text-sm text-neutral-900">
                {{ lastFmUsername }}
              </p>
            </div>

            <!-- Connection status row -->
            <div class="flex flex-col gap-2">
              <!-- Idle: show Connect button -->
              <div v-if="lastFmAuthStep === 'idle'" class="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="lastfm-connect-button"
                  class="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  @click="handleLastFmConnect"
                >
                  {{ t('settings.lastFmConnect') }}
                </button>
              </div>

              <!-- Pending user confirmation -->
              <div
                v-else-if="lastFmAuthStep === 'pending-user'"
                class="flex flex-col gap-2"
                data-testid="lastfm-pending-prompt"
              >
                <p class="text-sm text-neutral-700">{{ t('settings.lastFmOpenPrompt') }}</p>
                <button
                  type="button"
                  data-testid="lastfm-confirm-button"
                  class="w-fit rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                  @click="handleLastFmConfirm"
                >
                  {{ t('settings.lastFmConfirm') }}
                </button>
              </div>

              <!-- Connected -->
              <div
                v-else-if="lastFmAuthStep === 'done' && hasLastFmSession"
                class="flex items-center gap-3"
                data-testid="lastfm-connected-row"
              >
                <span class="text-sm text-neutral-900" data-testid="lastfm-connected-label">
                  {{ t('settings.lastFmConnected').replace('{username}', lastFmUsername) }}
                </span>
                <button
                  type="button"
                  data-testid="lastfm-disconnect-button"
                  class="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  @click="handleLastFmDisconnect"
                >
                  {{ t('settings.lastFmDisconnect') }}
                </button>
              </div>
            </div>

            <!-- Auth error -->
            <p v-if="lastFmAuthError" data-testid="lastfm-auth-error" class="text-sm text-red-600">
              {{ t('settings.lastFmAuthError') }}
            </p>

            <!-- Personal Radio toggle -->
            <div class="flex items-start justify-between gap-4" data-testid="personal-radio-row">
              <div>
                <p class="text-sm font-medium text-neutral-900">
                  {{ t('settings.personalRadio') }}
                </p>
                <p class="text-xs text-neutral-500">{{ t('settings.personalRadioHint') }}</p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="personalRadioEnabled"
                data-testid="personal-radio-toggle"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none"
                :class="personalRadioEnabled ? 'bg-neutral-900' : 'bg-neutral-200'"
                @click="handlePersonalRadioToggle(!personalRadioEnabled)"
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                  :class="personalRadioEnabled ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
            </div>

            <!-- Discovery slider (only when personal radio enabled) -->
            <div
              v-if="personalRadioEnabled"
              class="space-y-2"
              data-testid="discovery-slider-section"
            >
              <label class="text-xs font-medium text-neutral-700">
                {{ t('settings.discoverySlider') }}
              </label>
              <div class="flex items-center gap-2">
                <span class="text-xs text-neutral-500">{{ t('settings.discoveryComfort') }}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  :value="personalRadioDiscovery"
                  data-testid="discovery-slider"
                  class="flex-1"
                  @change="handleDiscoveryChange(Number(($event.target as HTMLInputElement).value))"
                />
                <span class="text-xs text-neutral-500">{{ t('settings.discoveryNew') }}</span>
              </div>
            </div>

            <!-- Scrobbling toggle -->
            <div
              class="flex items-start justify-between gap-4"
              :class="!hasLastFmSession ? 'opacity-50' : ''"
              data-testid="scrobbling-row"
            >
              <div>
                <p class="text-sm font-medium text-neutral-900">
                  {{ t('settings.scrobbling') }}
                </p>
                <p class="text-xs text-neutral-500">{{ t('settings.scrobblingHint') }}</p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="scrobblingEnabled"
                :disabled="!hasLastFmSession"
                data-testid="scrobbling-toggle"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:cursor-not-allowed"
                :class="scrobblingEnabled ? 'bg-neutral-900' : 'bg-neutral-200'"
                @click="handleScrobblingToggle(!scrobblingEnabled)"
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                  :class="scrobblingEnabled ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
            </div>
          </div>
        </section>

        <p
          v-if="saveSuccess"
          data-testid="save-success"
          class="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700"
        >
          {{ t('settings.saveSuccess') }}
        </p>
        <p
          v-if="saveError"
          data-testid="save-error"
          class="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {{ t('settings.error.saveFailed') }}
        </p>

        <div class="flex items-center justify-between">
          <button
            type="submit"
            data-testid="save-button"
            class="rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            :disabled="saving"
          >
            <span v-if="saving">{{ t('settings.saving') }}</span>
            <span v-else>{{ t('settings.saveButton') }}</span>
          </button>

          <button
            type="button"
            data-testid="run-setup-button"
            class="text-sm text-neutral-500 underline hover:text-neutral-900"
            @click="runSetupWizard"
          >
            {{ t('settings.runSetupAgain') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

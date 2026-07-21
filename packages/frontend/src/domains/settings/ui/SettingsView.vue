<script setup lang="ts">
import MainNavBar from '@/app/MainNavBar.vue'
import PageHeader from '@/ui/PageHeader.vue'
import { useResponsiveLayout } from '@/app/useResponsiveLayout'
import { useSettingsView } from '../shell/useSettingsView'

const {
  lmsHost,
  lmsPort,
  lmsMacAddress,
  playerId,
  lastFmApiKey,
  lastFmSharedSecret,
  fanartApiKey,
  language,
  hasLastFmKey,
  hasLastFmSharedSecret,
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
  users,
  selectedUserId,
  scrobbleTargetName,
  newUserName,
  userActionError,
  renamingUserId,
  renameValue,
  lastFmAuthStep,
  lastFmAuthError,
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
  addUser,
  startRename,
  cancelRename,
  confirmRename,
  removeUser,
  selectUser,
  handleLastFmConnect,
  handleLastFmConfirm,
  handleLastFmDisconnect,
  handleDiscoveryChange,
  handlePersonalRadioToggle,
  handleScrobblingToggle,
} = useSettingsView()

const { isPhone } = useResponsiveLayout()

// Injected at build time via Vite `define` (see vite.config.ts).
const appVersion = __APP_VERSION__
</script>

<template>
  <div class="h-full overflow-y-auto" data-testid="settings-view">
    <MainNavBar v-if="!isPhone" />
    <PageHeader v-if="isPhone" :title="t('settings.title')" />
    <h1 v-else class="sr-only">{{ t('settings.title') }}</h1>

    <div class="mx-auto max-w-xl px-4 py-4 sm:px-6">
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
              <div class="min-w-0 flex-1">
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
                class="flex w-full flex-wrap items-start px-3 py-2 text-left text-sm hover:bg-neutral-50"
                @click="selectServer(server)"
              >
                <span class="font-medium text-neutral-900">{{ server.name }}</span>
                <span class="ml-2 text-neutral-500">{{ server.host }}:{{ server.port }}</span>
              </button>
            </div>

            <div>
              <label class="mb-1.5 block text-xs font-medium text-neutral-700" for="lms-mac">
                {{ t('settings.lmsMacAddress') }}
              </label>
              <input
                id="lms-mac"
                v-model="lmsMacAddress"
                type="text"
                data-testid="lms-mac-input"
                placeholder="aa:bb:cc:dd:ee:ff"
                class="w-full rounded-lg border border-neutral-200 px-3 py-2 font-mono text-sm focus:border-neutral-900 focus:outline-none"
              />
              <p class="mt-1 text-xs text-neutral-500">{{ t('settings.lmsMacAddressHint') }}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {{ t('settings.section.experience') }}
          </h2>

          <div class="space-y-3">
            <div class="flex items-end gap-2">
              <div class="min-w-0 flex-1">
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
                class="flex w-full flex-wrap items-start px-3 py-2 text-left text-sm hover:bg-neutral-50"
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
              <label class="mb-1.5 block text-xs font-medium text-neutral-700" for="lastfm-secret">
                Last.fm Shared Secret
                <span v-if="hasLastFmSharedSecret" class="ml-1 text-green-600">✓ configured</span>
              </label>
              <input
                id="lastfm-secret"
                v-model="lastFmSharedSecret"
                type="password"
                data-testid="lastfm-secret-input"
                :placeholder="
                  hasLastFmSharedSecret
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

        <!-- Users section -->
        <section data-testid="users-section">
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {{ t('settings.usersSection') }}
          </h2>

          <div class="space-y-4">
            <!-- User list -->
            <ul class="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
              <li
                v-for="user in users"
                :key="user.id"
                class="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center"
                data-testid="user-row"
              >
                <template v-if="renamingUserId === user.id">
                  <input
                    v-model="renameValue"
                    type="text"
                    data-testid="user-rename-input"
                    class="w-full min-w-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none sm:flex-1"
                  />
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="user-rename-save"
                      class="shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                      @click="confirmRename"
                    >
                      {{ t('settings.userRenameSave') }}
                    </button>
                    <button
                      type="button"
                      data-testid="user-rename-cancel"
                      class="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                      @click="cancelRename"
                    >
                      {{ t('settings.userRenameCancel') }}
                    </button>
                  </div>
                </template>
                <template v-else>
                  <div class="min-w-0 sm:flex-1">
                    <p
                      class="truncate text-sm font-medium text-neutral-900"
                      data-testid="user-name"
                    >
                      {{ user.name }}
                    </p>
                    <p class="truncate text-xs text-neutral-500" data-testid="user-lastfm-status">
                      {{
                        user.hasLastFmSession
                          ? t('settings.lastFmConnected').replace(
                              '{username}',
                              user.lastFmUsername ?? '',
                            )
                          : t('settings.userNotConnected')
                      }}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-if="selectedUserId === user.id"
                      data-testid="this-is-me-marker"
                      class="shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
                    >
                      ✓ {{ t('settings.userThisIsMe') }}
                    </span>
                    <button
                      v-else
                      type="button"
                      data-testid="this-is-me-button"
                      class="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                      @click="selectUser(user.id)"
                    >
                      {{ t('settings.userThisIsMe') }}
                    </button>
                    <button
                      v-if="user.hasLastFmSession"
                      type="button"
                      data-testid="lastfm-disconnect-button"
                      class="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      @click="handleLastFmDisconnect(user.id)"
                    >
                      {{ t('settings.lastFmDisconnect') }}
                    </button>
                    <button
                      v-else
                      type="button"
                      data-testid="lastfm-connect-button"
                      class="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                      @click="handleLastFmConnect(user.id)"
                    >
                      {{ t('settings.lastFmConnect') }}
                    </button>
                    <button
                      type="button"
                      data-testid="user-rename-button"
                      class="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                      @click="startRename(user.id, user.name)"
                    >
                      {{ t('settings.userRename') }}
                    </button>
                    <button
                      type="button"
                      data-testid="user-delete-button"
                      class="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      @click="removeUser(user.id)"
                    >
                      {{ t('settings.userDelete') }}
                    </button>
                  </div>
                </template>
              </li>
            </ul>

            <!-- Pending Last.fm confirmation -->
            <div
              v-if="lastFmAuthStep === 'pending-user'"
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

            <!-- Auth error -->
            <p v-if="lastFmAuthError" data-testid="lastfm-auth-error" class="text-sm text-red-600">
              {{ t('settings.lastFmAuthError') }}
            </p>

            <!-- User action error -->
            <p v-if="userActionError" data-testid="user-action-error" class="text-sm text-red-600">
              {{ t('settings.userActionError') }}
            </p>

            <!-- Add user -->
            <div class="flex items-end gap-2">
              <div class="min-w-0 flex-1">
                <label
                  class="mb-1.5 block text-xs font-medium text-neutral-700"
                  for="new-user-name"
                >
                  {{ t('settings.userAddLabel') }}
                </label>
                <input
                  id="new-user-name"
                  v-model="newUserName"
                  type="text"
                  data-testid="new-user-input"
                  class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
                />
              </div>
              <button
                type="button"
                data-testid="add-user-button"
                class="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                @click="addUser"
              >
                {{ t('settings.userAddButton') }}
              </button>
            </div>

            <!-- Scrobble target (read-only) -->
            <p
              v-if="scrobbleTargetName !== undefined"
              data-testid="scrobble-target"
              class="text-xs text-neutral-500"
            >
              {{ t('settings.scrobbleTarget') }}:
              <span class="font-medium text-neutral-700">{{ scrobbleTargetName }}</span>
            </p>
          </div>
        </section>

        <!-- Last.fm section -->
        <section data-testid="lastfm-section">
          <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {{ t('settings.lastFm') }}
          </h2>

          <div class="space-y-4">
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
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors hover:opacity-90 focus:outline-none"
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
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors hover:opacity-90 focus:outline-none disabled:cursor-not-allowed"
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

      <p data-testid="app-version" class="mt-8 text-center text-xs text-neutral-400">
        Signalform v{{ appVersion }}
      </p>
    </div>
  </div>
</template>

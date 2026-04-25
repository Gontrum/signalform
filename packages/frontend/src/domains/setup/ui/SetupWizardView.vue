<script setup lang="ts">
import { setupSteps } from '../core/service'
import { useSetupWizard } from '../shell/useSetupWizard'

const {
  step,
  scanning,
  discoveredServers,
  scanError,
  manualHost,
  manualPort,
  selectedHost,
  players,
  playersError,
  loadingPlayers,
  selectedPlayerId,
  selectedPlayerName,
  lastFmApiKey,
  fanartApiKey,
  saving,
  saveError,
  scan,
  selectServer,
  proceedToPlayer,
  selectPlayer,
  proceedToKeys,
  saveAndFinish,
  skipKeys,
  goBackToServer,
  finish,
  t,
} = useSetupWizard()
</script>

<template>
  <div
    class="flex min-h-screen items-center justify-center bg-neutral-50 p-6"
    data-testid="setup-wizard"
  >
    <div class="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
      <div class="mb-8 flex items-center gap-2" data-testid="step-indicator">
        <div
          v-for="(setupStepName, index) in setupSteps"
          :key="setupStepName"
          class="h-2 flex-1 rounded-full transition-colors"
          :class="setupSteps.indexOf(step) >= index ? 'bg-neutral-900' : 'bg-neutral-200'"
        />
      </div>

      <div v-if="step === 'server'" data-testid="step-server">
        <h1 class="mb-2 text-2xl font-bold text-neutral-900">{{ t('setup.title') }}</h1>
        <p class="mb-6 text-sm text-neutral-500">
          {{ t('setup.hint.connection') }}
        </p>

        <button
          type="button"
          data-testid="scan-button"
          class="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          :disabled="scanning"
          @click="scan"
        >
          <span v-if="scanning">{{ t('queue.loading') }}</span>
          <span v-else>{{ t('setup.next') }}</span>
        </button>

        <div
          v-if="discoveredServers.length > 0"
          class="mb-4 space-y-2"
          data-testid="discovered-servers"
        >
          <button
            v-for="server in discoveredServers"
            :key="`${server.host}:${server.port}`"
            type="button"
            data-testid="discovered-server-item"
            class="flex w-full items-start rounded-lg border p-3 text-left hover:bg-neutral-50"
            :class="selectedHost === server.host ? 'border-neutral-900' : 'border-neutral-200'"
            @click="selectServer(server.host, server.port)"
          >
            <div>
              <p class="text-sm font-medium text-neutral-900">{{ server.name }}</p>
              <p class="text-xs text-neutral-500">
                {{ server.host }}:{{ server.port }} · v{{ server.version }}
              </p>
            </div>
          </button>
        </div>

        <p v-if="scanError" data-testid="scan-error" class="mb-4 text-sm text-neutral-500">
          {{ scanError }}
        </p>

        <div class="mb-6 space-y-3" data-testid="manual-entry">
          <p class="text-xs font-medium uppercase tracking-wide text-neutral-400">
            {{ t('settings.section.advanced') }}
          </p>
          <div class="flex gap-2">
            <input
              v-model="manualHost"
              type="text"
              placeholder="192.168.1.100"
              data-testid="manual-host-input"
              class="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <input
              v-model="manualPort"
              type="number"
              placeholder="9000"
              data-testid="manual-port-input"
              class="w-24 rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="button"
          data-testid="proceed-to-player-button"
          class="w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          :disabled="!selectedHost && !manualHost.trim()"
          @click="proceedToPlayer"
        >
          {{ t('setup.next') }}
        </button>
      </div>

      <div v-else-if="step === 'player'" data-testid="step-player">
        <h1 class="mb-2 text-2xl font-bold text-neutral-900">{{ t('setup.next') }}</h1>
        <p class="mb-6 text-sm text-neutral-500">
          {{ t('setup.hint.connection') }}
        </p>

        <div v-if="loadingPlayers" class="flex justify-center py-8" data-testid="players-loading">
          <div
            class="h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-transparent"
          />
        </div>

        <p v-else-if="playersError" data-testid="players-error" class="mb-4 text-sm text-red-600">
          {{ playersError }}
        </p>

        <div v-else class="mb-6 space-y-2" data-testid="player-list">
          <button
            v-for="player in players"
            :key="player.id"
            type="button"
            data-testid="player-item"
            class="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-neutral-50"
            :class="selectedPlayerId === player.id ? 'border-neutral-900' : 'border-neutral-200'"
            @click="selectPlayer(player)"
          >
            <div>
              <p class="text-sm font-medium text-neutral-900">{{ player.name }}</p>
              <p class="text-xs text-neutral-500">{{ player.model }}</p>
            </div>
            <span
              v-if="player.connected"
              class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
              >online</span
            >
          </button>
        </div>

        <div class="flex gap-3">
          <button
            type="button"
            class="rounded-lg border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            @click="goBackToServer"
          >
            {{ t('setup.back') }}
          </button>
          <button
            type="button"
            data-testid="proceed-to-keys-button"
            class="flex-1 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            :disabled="!selectedPlayerId"
            @click="proceedToKeys"
          >
            {{ t('setup.next') }}
          </button>
        </div>
      </div>

      <div v-else-if="step === 'keys'" data-testid="step-keys">
        <h1 class="mb-2 text-2xl font-bold text-neutral-900">{{ t('setup.save') }}</h1>
        <p class="mb-6 text-sm text-neutral-500">
          {{ t('setup.hint.keys') }}
        </p>

        <div class="mb-6 space-y-6">
          <div>
            <label class="mb-1.5 block text-xs font-medium text-neutral-700">Last.fm API key</label>
            <input
              v-model="lastFmApiKey"
              type="text"
              data-testid="lastfm-key-input"
              placeholder="Optional — enables artist enrichment"
              class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <p class="mt-1.5 text-xs text-neutral-400">
              {{ t('setup.hint.lastfm') }}
              <a
                href="https://www.last.fm/api/account/create"
                target="_blank"
                rel="noopener noreferrer"
                class="underline hover:text-neutral-600"
                >last.fm/api/account/create</a
              >.
            </p>
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-medium text-neutral-700"
              >Fanart.tv API key</label
            >
            <input
              v-model="fanartApiKey"
              type="text"
              data-testid="fanart-key-input"
              placeholder="Optional — enables artist hero images"
              class="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <p class="mt-1.5 text-xs text-neutral-400">
              {{ t('setup.hint.fanart') }}
              <a
                href="https://fanart.tv/profile/"
                target="_blank"
                rel="noopener noreferrer"
                class="underline hover:text-neutral-600"
                >fanart.tv/profile</a
              >.
            </p>
          </div>
        </div>

        <p v-if="saveError" data-testid="save-error" class="mb-4 text-sm text-red-600">
          {{ saveError }}
        </p>

        <div class="flex gap-3">
          <button
            type="button"
            data-testid="skip-keys-button"
            class="rounded-lg border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            :disabled="saving"
            @click="skipKeys"
          >
            {{ t('setup.skip') }}
          </button>
          <button
            type="button"
            data-testid="save-button"
            class="flex-1 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            :disabled="saving"
            @click="saveAndFinish"
          >
            <span v-if="saving">{{ t('settings.saving') }}</span>
            <span v-else>{{ t('setup.save') }}</span>
          </button>
        </div>
      </div>

      <div v-else-if="step === 'done'" data-testid="step-done" class="text-center">
        <div class="mb-4 text-5xl">🎵</div>
        <h1 class="mb-2 text-2xl font-bold text-neutral-900">{{ t('queue.backToNowPlaying') }}</h1>
        <p class="mb-8 text-sm text-neutral-500">
          Signalform is connected to {{ selectedHost }} · {{ selectedPlayerName }}.
        </p>
        <button
          type="button"
          data-testid="finish-button"
          class="w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-700"
          @click="finish"
        >
          {{ t('setup.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

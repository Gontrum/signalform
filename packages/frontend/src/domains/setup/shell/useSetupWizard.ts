import { ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { updateConfig } from '@/platform/api/configApi'
import { useI18nStore } from '@/app/i18nStore'
import type { MessageKey } from '@/i18n'
import { createSetupConfigUpdate, resolveSetupServer, type SetupStep } from '../core/service'
import {
  discoverServers,
  getPlayers,
  type DiscoveredServer,
  type LmsPlayer,
} from '@/platform/api/setupApi'

type UseSetupWizardResult = {
  readonly step: Ref<SetupStep>
  readonly scanning: Ref<boolean>
  readonly discoveredServers: Ref<readonly DiscoveredServer[]>
  readonly scanError: Ref<string>
  readonly manualHost: Ref<string>
  readonly manualPort: Ref<string>
  readonly selectedHost: Ref<string>
  readonly selectedPort: Ref<number>
  readonly loadingPlayers: Ref<boolean>
  readonly players: Ref<readonly LmsPlayer[]>
  readonly playersError: Ref<string>
  readonly selectedPlayerId: Ref<string>
  readonly selectedPlayerName: Ref<string>
  readonly lastFmApiKey: Ref<string>
  readonly fanartApiKey: Ref<string>
  readonly saving: Ref<boolean>
  readonly saveError: Ref<string>
  readonly scan: () => Promise<void>
  readonly selectServer: (host: string, port: number) => void
  readonly proceedToPlayer: () => Promise<void>
  readonly selectPlayer: (player: LmsPlayer) => void
  readonly proceedToKeys: () => void
  readonly saveAndFinish: () => Promise<void>
  readonly skipKeys: () => Promise<void>
  readonly goBackToServer: () => void
  readonly finish: () => void
  readonly t: (key: MessageKey) => string
}

export const useSetupWizard = (): UseSetupWizardResult => {
  const router = useRouter()
  const i18nStore = useI18nStore()

  const t = (key: MessageKey): string => i18nStore.t(key)

  const step = ref<SetupStep>('server')

  const scanning = ref(false)
  const discoveredServers = ref<readonly DiscoveredServer[]>([])
  const scanError = ref('')
  const manualHost = ref('')
  const manualPort = ref('9000')
  const selectedHost = ref('')
  const selectedPort = ref(9000)

  const loadingPlayers = ref(false)
  const players = ref<readonly LmsPlayer[]>([])
  const playersError = ref('')
  const selectedPlayerId = ref('')
  const selectedPlayerName = ref('')

  const lastFmApiKey = ref('')
  const fanartApiKey = ref('')
  const saving = ref(false)
  const saveError = ref('')

  const scan = async (): Promise<void> => {
    scanning.value = true
    scanError.value = ''

    const result = await discoverServers()

    scanning.value = false

    if (result.ok) {
      discoveredServers.value = result.value
      if (result.value.length === 0) {
        scanError.value = t('setup.error.loadFailed')
      }
      return
    }

    scanError.value = t('setup.error.loadFailed')
  }

  const selectServer = (host: string, port: number): void => {
    selectedHost.value = host
    selectedPort.value = port
  }

  const proceedToPlayer = async (): Promise<void> => {
    const resolvedServer = resolveSetupServer({
      selectedHost: selectedHost.value,
      selectedPort: selectedPort.value,
      manualHost: manualHost.value,
      manualPort: manualPort.value,
    })

    if (!resolvedServer) {
      return
    }

    selectedHost.value = resolvedServer.host
    selectedPort.value = resolvedServer.port
    step.value = 'player'
    loadingPlayers.value = true
    playersError.value = ''

    const result = await getPlayers(resolvedServer.host, resolvedServer.port)

    loadingPlayers.value = false

    if (result.ok) {
      players.value = result.value
      if (result.value.length === 0) {
        playersError.value = t('setup.hint.connection')
      }
      return
    }

    playersError.value = t('setup.error.loadFailed')
  }

  const selectPlayer = (player: LmsPlayer): void => {
    selectedPlayerId.value = player.id
    selectedPlayerName.value = player.name
  }

  const proceedToKeys = (): void => {
    if (!selectedPlayerId.value) {
      return
    }

    step.value = 'keys'
  }

  const saveSetup = async (includeApiKeys: boolean): Promise<void> => {
    saving.value = true
    saveError.value = ''

    const result = await updateConfig(
      createSetupConfigUpdate({
        host: selectedHost.value,
        port: selectedPort.value,
        playerId: selectedPlayerId.value,
        lastFmApiKey: includeApiKeys ? lastFmApiKey.value : '',
        fanartApiKey: includeApiKeys ? fanartApiKey.value : '',
      }),
    )

    saving.value = false

    if (result.ok) {
      step.value = 'done'
      return
    }

    saveError.value = t('setup.error.saveFailed')
  }

  const saveAndFinish = async (): Promise<void> => {
    await saveSetup(true)
  }

  const skipKeys = async (): Promise<void> => {
    await saveSetup(false)
  }

  const goBackToServer = (): void => {
    step.value = 'server'
  }

  const finish = (): void => {
    void router.push({ name: 'home' })
  }

  return {
    step,
    scanning,
    discoveredServers,
    scanError,
    manualHost,
    manualPort,
    selectedHost,
    selectedPort,
    loadingPlayers,
    players,
    playersError,
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
  }
}

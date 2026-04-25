import { onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/app/i18nStore'
import {
  getConfig,
  updateConfig,
  type ConfigApiError,
  type MaskedConfig,
} from '@/platform/api/configApi'
import {
  discoverServers,
  getPlayers,
  type DiscoveredServer,
  type LmsPlayer,
} from '@/platform/api/setupApi'
import type { Language } from '@/types/i18n'
import {
  createSettingsConfigUpdate,
  parseSettingsPort,
  resolveSettingsLanguage,
} from '../core/service'

type UseSettingsViewResult = {
  readonly lmsHost: Ref<string>
  readonly lmsPort: Ref<string>
  readonly playerId: Ref<string>
  readonly lastFmApiKey: Ref<string>
  readonly fanartApiKey: Ref<string>
  readonly language: Ref<Language>
  readonly hasLastFmKey: Ref<boolean>
  readonly hasFanartKey: Ref<boolean>
  readonly discovering: Ref<boolean>
  readonly discoveredServers: Ref<readonly DiscoveredServer[]>
  readonly discoverError: Ref<string>
  readonly showServerDropdown: Ref<boolean>
  readonly loadingPlayers: Ref<boolean>
  readonly players: Ref<readonly LmsPlayer[]>
  readonly playersError: Ref<string>
  readonly showPlayerDropdown: Ref<boolean>
  readonly saving: Ref<boolean>
  readonly saveSuccess: Ref<boolean>
  readonly saveError: Ref<string>
  readonly loading: Ref<boolean>
  readonly loadError: Ref<string>
  readonly t: (key: import('@/i18n').MessageKey) => string
  readonly goBack: () => void
  readonly discover: () => Promise<void>
  readonly selectServer: (server: DiscoveredServer) => void
  readonly listPlayers: () => Promise<void>
  readonly selectPlayer: (player: LmsPlayer) => void
  readonly save: () => Promise<void>
  readonly runSetupWizard: () => void
}

const getLoadErrorKey = (result: {
  readonly ok: false
  readonly error: ConfigApiError
}): string => {
  return result.error.type === 'NETWORK_ERROR' ||
    result.error.type === 'SERVER_ERROR' ||
    result.error.type === 'PARSE_ERROR'
    ? 'settings.error.loadFailed'
    : 'settings.error.loadFailed'
}

const applyLoadedConfig = (
  config: MaskedConfig,
  fallbackLanguage: Language,
  state: {
    readonly lmsHost: Ref<string>
    readonly lmsPort: Ref<string>
    readonly playerId: Ref<string>
    readonly hasLastFmKey: Ref<boolean>
    readonly hasFanartKey: Ref<boolean>
    readonly language: Ref<Language>
  },
): Language => {
  const resolvedLanguage = resolveSettingsLanguage(config.language, fallbackLanguage)
  state.lmsHost.value = config.lmsHost
  state.lmsPort.value = String(config.lmsPort)
  state.playerId.value = config.playerId
  state.hasLastFmKey.value = config.hasLastFmKey
  state.hasFanartKey.value = config.hasFanartKey
  state.language.value = resolvedLanguage
  return resolvedLanguage
}

export const useSettingsView = (): UseSettingsViewResult => {
  const router = useRouter()
  const i18nStore = useI18nStore()
  const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

  const lmsHost = ref('')
  const lmsPort = ref('9000')
  const playerId = ref('')
  const lastFmApiKey = ref('')
  const fanartApiKey = ref('')
  const language = ref<Language>('en')

  const hasLastFmKey = ref(false)
  const hasFanartKey = ref(false)

  const discovering = ref(false)
  const discoveredServers = ref<readonly DiscoveredServer[]>([])
  const discoverError = ref('')
  const showServerDropdown = ref(false)

  const loadingPlayers = ref(false)
  const players = ref<readonly LmsPlayer[]>([])
  const playersError = ref('')
  const showPlayerDropdown = ref(false)

  const saving = ref(false)
  const saveSuccess = ref(false)
  const saveError = ref('')

  const loading = ref(true)
  const loadError = ref('')

  onMounted(async () => {
    loading.value = true
    loadError.value = ''

    const result = await getConfig()
    loading.value = false

    if (!result.ok) {
      loadError.value = getLoadErrorKey(result)
      return
    }

    const loadedLanguage = applyLoadedConfig(result.value, i18nStore.currentLanguage, {
      lmsHost,
      lmsPort,
      playerId,
      hasLastFmKey,
      hasFanartKey,
      language,
    })

    i18nStore.initLanguageFromConfig(loadedLanguage)
  })

  const goBack = (): void => {
    void router.push({ name: 'home' })
  }

  const discover = async (): Promise<void> => {
    discovering.value = true
    discoverError.value = ''
    showServerDropdown.value = false

    const result = await discoverServers()
    discovering.value = false

    if (!result.ok) {
      discoverError.value = 'failed'
      return
    }

    discoveredServers.value = result.value
    if (result.value.length === 0) {
      discoverError.value = 'none'
      return
    }

    showServerDropdown.value = true
  }

  const selectServer = (server: DiscoveredServer): void => {
    lmsHost.value = server.host
    lmsPort.value = String(server.port)
    showServerDropdown.value = false
  }

  const listPlayers = async (): Promise<void> => {
    const host = lmsHost.value.trim()
    if (host === '') {
      return
    }

    const port = parseSettingsPort(lmsPort.value)
    loadingPlayers.value = true
    playersError.value = ''
    showPlayerDropdown.value = false

    const result = await getPlayers(host, port)
    loadingPlayers.value = false

    if (!result.ok) {
      playersError.value = `failed:${host}:${port}`
      return
    }

    players.value = result.value
    if (result.value.length === 0) {
      playersError.value = 'none'
      return
    }

    showPlayerDropdown.value = true
  }

  const selectPlayer = (player: LmsPlayer): void => {
    playerId.value = player.id
    showPlayerDropdown.value = false
  }

  const save = async (): Promise<void> => {
    saving.value = true
    saveSuccess.value = false
    saveError.value = ''

    const result = await updateConfig(
      createSettingsConfigUpdate({
        lmsHost: lmsHost.value,
        lmsPort: lmsPort.value,
        playerId: playerId.value,
        language: language.value,
        lastFmApiKey: lastFmApiKey.value,
        fanartApiKey: fanartApiKey.value,
      }),
    )

    saving.value = false

    if (!result.ok) {
      saveError.value = 'settings.error.saveFailed'
      return
    }

    saveSuccess.value = true
    hasLastFmKey.value = result.value.hasLastFmKey
    hasFanartKey.value = result.value.hasFanartKey
    i18nStore.setLanguage(language.value)
    lastFmApiKey.value = ''
    fanartApiKey.value = ''
  }

  const runSetupWizard = (): void => {
    void router.push({ name: 'setup' })
  }

  return {
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
    t,
    goBack,
    discover,
    selectServer,
    listPlayers,
    selectPlayer,
    save,
    runSetupWizard,
  }
}

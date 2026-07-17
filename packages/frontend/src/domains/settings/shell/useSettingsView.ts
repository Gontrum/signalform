import { computed, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
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
import {
  requestLastFmAuth,
  completeLastFmAuth,
  disconnectLastFm,
} from '@/platform/api/lastFmAuthApi'
import { createUser, renameUser, deleteUser, type ApiUser } from '@/platform/api/usersApi'
import { useUserStore } from '@/domains/user/shell/useUserStore'
import type { Language } from '@/types/i18n'
import {
  createSettingsConfigUpdate,
  parseSettingsPort,
  resolveSettingsLanguage,
} from '../core/service'

type UseSettingsViewResult = {
  readonly lmsHost: Ref<string>
  readonly lmsPort: Ref<string>
  readonly lmsMacAddress: Ref<string>
  readonly playerId: Ref<string>
  readonly lastFmApiKey: Ref<string>
  readonly lastFmSharedSecret: Ref<string>
  readonly fanartApiKey: Ref<string>
  readonly language: Ref<Language>
  readonly hasLastFmKey: Ref<boolean>
  readonly hasLastFmSharedSecret: Ref<boolean>
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
  readonly users: Ref<readonly ApiUser[]>
  readonly selectedUserId: Ref<string | undefined>
  readonly scrobbleTargetName: Ref<string | undefined>
  readonly newUserName: Ref<string>
  readonly userActionError: Ref<boolean>
  readonly renamingUserId: Ref<string | undefined>
  readonly renameValue: Ref<string>
  readonly lastFmAuthStep: Ref<'idle' | 'pending-user'>
  readonly lastFmAuthUserId: Ref<string | undefined>
  readonly lastFmToken: Ref<string>
  readonly lastFmAuthError: Ref<boolean>
  readonly hasLastFmSession: Ref<boolean>
  readonly personalRadioEnabled: Ref<boolean>
  readonly scrobblingEnabled: Ref<boolean>
  readonly personalRadioDiscovery: Ref<number>
  readonly t: (key: import('@/i18n').MessageKey) => string
  readonly goBack: () => void
  readonly discover: () => Promise<void>
  readonly selectServer: (server: DiscoveredServer) => void
  readonly listPlayers: () => Promise<void>
  readonly selectPlayer: (player: LmsPlayer) => void
  readonly save: () => Promise<void>
  readonly runSetupWizard: () => void
  readonly addUser: () => Promise<void>
  readonly startRename: (userId: string, currentName: string) => void
  readonly cancelRename: () => void
  readonly confirmRename: () => Promise<void>
  readonly removeUser: (userId: string) => Promise<void>
  readonly selectUser: (userId: string) => void
  readonly handleLastFmConnect: (userId: string) => Promise<void>
  readonly handleLastFmConfirm: () => Promise<void>
  readonly handleLastFmDisconnect: (userId: string) => Promise<void>
  readonly handleDiscoveryChange: (value: number) => Promise<void>
  readonly handlePersonalRadioToggle: (value: boolean) => Promise<void>
  readonly handleScrobblingToggle: (value: boolean) => Promise<void>
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
    readonly lmsMacAddress: Ref<string>
    readonly playerId: Ref<string>
    readonly hasLastFmKey: Ref<boolean>
    readonly hasLastFmSharedSecret: Ref<boolean>
    readonly hasFanartKey: Ref<boolean>
    readonly language: Ref<Language>
    readonly personalRadioEnabled: Ref<boolean>
    readonly scrobblingEnabled: Ref<boolean>
    readonly personalRadioDiscovery: Ref<number>
  },
): Language => {
  const resolvedLanguage = resolveSettingsLanguage(config.language, fallbackLanguage)
  state.lmsHost.value = config.lmsHost
  state.lmsPort.value = String(config.lmsPort)
  state.lmsMacAddress.value = config.lmsMacAddress ?? ''
  state.playerId.value = config.playerId
  state.hasLastFmKey.value = config.hasLastFmKey
  state.hasLastFmSharedSecret.value = config.hasLastFmSharedSecret
  state.hasFanartKey.value = config.hasFanartKey
  state.language.value = resolvedLanguage
  state.personalRadioEnabled.value = config.personalRadioEnabled ?? false
  state.scrobblingEnabled.value = config.scrobblingEnabled ?? false
  state.personalRadioDiscovery.value = config.personalRadioDiscovery ?? 50
  return resolvedLanguage
}

export const useSettingsView = (): UseSettingsViewResult => {
  const router = useRouter()
  const i18nStore = useI18nStore()
  const userStore = useUserStore()
  const { users, selectedUserId, activeListenerId } = storeToRefs(userStore)
  const t = (key: import('@/i18n').MessageKey): string => i18nStore.t(key)

  const lmsHost = ref('')
  const lmsPort = ref('9000')
  const lmsMacAddress = ref('')
  const playerId = ref('')
  const lastFmApiKey = ref('')
  const lastFmSharedSecret = ref('')
  const fanartApiKey = ref('')
  const language = ref<Language>('en')

  const hasLastFmKey = ref(false)
  const hasLastFmSharedSecret = ref(false)
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

  // User management
  const newUserName = ref('')
  const userActionError = ref(false)
  const renamingUserId = ref<string | undefined>(undefined)
  const renameValue = ref('')

  // Last.fm auth flow (per user)
  const lastFmAuthStep = ref<'idle' | 'pending-user'>('idle')
  const lastFmAuthUserId = ref<string | undefined>(undefined)
  const lastFmToken = ref('')
  const lastFmAuthError = ref(false)
  const hasLastFmSession = computed(() => userStore.hasLastFmSession)

  // Read-only scrobble target: the active listener, mirroring the backend
  // fallback (resolveActiveUser → users[0]). Only shown with multiple users.
  const scrobbleTargetName = computed<string | undefined>(() => {
    if (users.value.length < 2) {
      return undefined
    }

    const target = users.value.find((user) => user.id === activeListenerId.value) ?? users.value[0]
    return target?.name
  })

  // Personal Radio settings
  const personalRadioEnabled = ref(false)
  const scrobblingEnabled = ref(false)
  const personalRadioDiscovery = ref(50)

  onMounted(async () => {
    loading.value = true
    loadError.value = ''

    const [result] = await Promise.all([getConfig(), userStore.load()])
    loading.value = false

    if (!result.ok) {
      loadError.value = getLoadErrorKey(result)
      return
    }

    const loadedLanguage = applyLoadedConfig(result.value, i18nStore.currentLanguage, {
      lmsHost,
      lmsPort,
      lmsMacAddress,
      playerId,
      hasLastFmKey,
      hasLastFmSharedSecret,
      hasFanartKey,
      language,
      personalRadioEnabled,
      scrobblingEnabled,
      personalRadioDiscovery,
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
        lmsMacAddress: lmsMacAddress.value,
        playerId: playerId.value,
        language: language.value,
        lastFmApiKey: lastFmApiKey.value,
        lastFmSharedSecret: lastFmSharedSecret.value,
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
    hasLastFmSharedSecret.value = result.value.hasLastFmSharedSecret
    hasFanartKey.value = result.value.hasFanartKey
    i18nStore.setLanguage(language.value)
    lastFmApiKey.value = ''
    lastFmSharedSecret.value = ''
    fanartApiKey.value = ''
  }

  const runSetupWizard = (): void => {
    void router.push({ name: 'setup' })
  }

  const addUser = async (): Promise<void> => {
    const name = newUserName.value.trim()
    if (name === '') {
      return
    }

    userActionError.value = false
    const result = await createUser(name)
    if (!result.ok) {
      userActionError.value = true
      return
    }

    newUserName.value = ''
    await userStore.load()
  }

  const startRename = (userId: string, currentName: string): void => {
    renamingUserId.value = userId
    renameValue.value = currentName
  }

  const cancelRename = (): void => {
    renamingUserId.value = undefined
    renameValue.value = ''
  }

  const confirmRename = async (): Promise<void> => {
    const userId = renamingUserId.value
    const name = renameValue.value.trim()
    if (userId === undefined || name === '') {
      return
    }

    userActionError.value = false
    const result = await renameUser(userId, name)
    if (!result.ok) {
      userActionError.value = true
      return
    }

    cancelRename()
    await userStore.load()
  }

  const removeUser = async (userId: string): Promise<void> => {
    userActionError.value = false
    const result = await deleteUser(userId)
    if (!result.ok) {
      userActionError.value = true
      return
    }

    await userStore.load()
  }

  const selectUser = (userId: string): void => {
    userStore.selectUser(userId)
  }

  const handleLastFmConnect = async (userId: string): Promise<void> => {
    lastFmAuthError.value = false
    const result = await requestLastFmAuth()
    if (!result) {
      lastFmAuthError.value = true
      return
    }
    lastFmToken.value = result.token
    lastFmAuthUserId.value = userId
    window.open(result.authUrl, '_blank')
    lastFmAuthStep.value = 'pending-user'
  }

  const handleLastFmConfirm = async (): Promise<void> => {
    const userId = lastFmAuthUserId.value
    if (userId === undefined) {
      return
    }

    lastFmAuthError.value = false
    const result = await completeLastFmAuth(lastFmToken.value, userId)
    if (!result) {
      lastFmAuthError.value = true
      return
    }

    lastFmToken.value = ''
    lastFmAuthUserId.value = undefined
    lastFmAuthStep.value = 'idle'
    await userStore.load()
  }

  const handleLastFmDisconnect = async (userId: string): Promise<void> => {
    const success = await disconnectLastFm(userId)
    if (!success) {
      return
    }

    await userStore.load()
  }

  const handlePersonalRadioToggle = async (value: boolean): Promise<void> => {
    personalRadioEnabled.value = value
    await updateConfig({ personalRadioEnabled: value })
  }

  const handleScrobblingToggle = async (value: boolean): Promise<void> => {
    scrobblingEnabled.value = value
    await updateConfig({ scrobblingEnabled: value })
  }

  const handleDiscoveryChange = async (value: number): Promise<void> => {
    personalRadioDiscovery.value = value
    await updateConfig({ personalRadioDiscovery: value })
  }

  return {
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
    lastFmAuthUserId,
    lastFmToken,
    lastFmAuthError,
    hasLastFmSession,
    personalRadioEnabled,
    scrobblingEnabled,
    personalRadioDiscovery,
    t,
    goBack,
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
  }
}

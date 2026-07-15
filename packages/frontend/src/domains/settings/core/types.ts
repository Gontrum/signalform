export type ConfigUpdate = {
  readonly lmsHost?: string
  readonly lmsPort?: number
  readonly playerId?: string
  readonly lastFmApiKey?: string
  readonly fanartApiKey?: string
  readonly language?: 'en' | 'de'
  readonly lastFmSharedSecret?: string
  readonly personalRadioEnabled?: boolean
  readonly scrobblingEnabled?: boolean
  readonly personalRadioDiscovery?: number
}

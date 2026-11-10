/**
 * Wire contract of the Deployments public update-configuration document.
 *
 * The document is read by the desktop main process before every update check. It
 * is deliberately a small, versioned mirror of
 * `deploy_download_update` + its installer, and it never carries a secret: the
 * feed URL, the channel and the update flags are the only facts the client acts
 * on. `schemaVersion` is an exact match: a document from a newer deployment
 * contract is refused, and the client falls back to its packaged feed.
 */

/** Version token the client accepts; bump together with the server constant. */
export const UPDATE_CONFIG_SCHEMA_VERSION = '2026-11-10.sdkwork-download-update-config.v1'

export type UpdateProvider = 'deployments' | 'generic' | 'github' | 'none'

export type UpdateChannel = 'nightly' | 'stable'

/** The update facts one installer publishes for desktop clients. */
export interface PublicUpdateConfig {
  enabled: boolean
  provider: UpdateProvider
  /** Feed directory for `deployments`; external feed URL for `generic`. */
  feedUrl: string
  githubOwner: string
  githubRepo: string
  channel: UpdateChannel
  channelFile: string
  allowedChannels: readonly UpdateChannel[]
  allowPrerelease: boolean
  allowDowngrade: boolean
  /** Empty string means "no floor". */
  minimumSupportedVersion: string
  checkIntervalMinutes: number
  rolloutPercentage: number
  releaseNotesUrl: string
}

/** One installer's published update configuration. */
export interface UpdateConfigDocument {
  schemaVersion: string
  catalogKey: string
  itemKey: string
  productKey: string
  platform: string
  architecture: string
  version?: string
  /** Opaque revision token used for cache ETag comparison and diagnostics. */
  revision: string
  update: PublicUpdateConfig
}

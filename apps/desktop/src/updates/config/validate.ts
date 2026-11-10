/**
 * Runtime validation of the update-configuration document.
 *
 * The main process trusts nothing it receives: every field the resolver later
 * acts on is checked here, and an unexpected shape returns `undefined` so the
 * caller can fall back instead of propagating `any` into the updater.
 */

import {
  UPDATE_CONFIG_SCHEMA_VERSION,
  type PublicUpdateConfig,
  type UpdateChannel,
  type UpdateConfigDocument,
  type UpdateProvider,
} from './contract.ts'

const PROVIDERS: readonly UpdateProvider[] = ['deployments', 'generic', 'github', 'none']
const CHANNELS: readonly UpdateChannel[] = ['nightly', 'stable']

/** Largest document the client will consider; the server stays far below it. */
export const MAX_UPDATE_CONFIG_BYTES = 256 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function channelOf(value: unknown): UpdateChannel | undefined {
  return CHANNELS.find(channel => channel === value)
}

function providerOf(value: unknown): UpdateProvider | undefined {
  return PROVIDERS.find(provider => provider === value)
}

function publicUpdate(value: unknown): PublicUpdateConfig | undefined {
  if (!isRecord(value)) return undefined
  const provider = providerOf(value.provider)
  const channel = channelOf(value.channel)
  if (provider === undefined || channel === undefined) return undefined
  const allowed = Array.isArray(value.allowedChannels)
    ? value.allowedChannels.filter((entry): entry is UpdateChannel => channelOf(entry) !== undefined)
    : []
  const rollout = num(value.rolloutPercentage, 100)
  const interval = num(value.checkIntervalMinutes, 10)
  return {
    enabled: bool(value.enabled, true),
    provider,
    feedUrl: text(value.feedUrl),
    githubOwner: text(value.githubOwner),
    githubRepo: text(value.githubRepo),
    channel,
    channelFile: text(value.channelFile),
    allowedChannels: allowed.length > 0 ? allowed : [channel],
    allowPrerelease: bool(value.allowPrerelease, true),
    allowDowngrade: bool(value.allowDowngrade, false),
    minimumSupportedVersion: text(value.minimumSupportedVersion),
    checkIntervalMinutes: Math.min(1440, Math.max(1, Math.round(interval))),
    rolloutPercentage: Math.min(100, Math.max(0, Math.round(rollout))),
    releaseNotesUrl: text(value.releaseNotesUrl),
  }
}

/**
 * Validates one document received from the Deployments API.
 * @param value - Parsed JSON body.
 * @returns The typed document, or `undefined` when the client must not use it.
 */
export function parseUpdateConfigDocument(value: unknown): UpdateConfigDocument | undefined {
  if (!isRecord(value)) return undefined
  if (value.schemaVersion !== UPDATE_CONFIG_SCHEMA_VERSION) return undefined
  const update = publicUpdate(value.update)
  if (update === undefined) return undefined
  const revision = text(value.revision)
  const productKey = text(value.productKey)
  const platform = text(value.platform)
  const architecture = text(value.architecture)
  if (revision === '' || productKey === '' || platform === '' || architecture === '') {
    return undefined
  }
  return {
    schemaVersion: UPDATE_CONFIG_SCHEMA_VERSION,
    catalogKey: text(value.catalogKey),
    itemKey: text(value.itemKey),
    productKey,
    platform,
    architecture,
    ...(typeof value.version === 'string' && value.version !== '' ? { version: value.version } : {}),
    revision,
    update,
  }
}

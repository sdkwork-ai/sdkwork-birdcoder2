/**
 * The resolved feed the coordinator applies to electron-updater.
 *
 * `applyFeed` is the only place that calls `setFeedURL`: electron-updater's
 * channel setter re-enables downgrades, so the channel and the flags have to be
 * written together, in this order, every time a check starts.
 */

import type { AppUpdater } from 'electron-updater'

import type { UpdateChannel } from './contract.ts'

/** One feed the client can check, independent of where it came from. */
export interface ResolvedUpdateFeed {
  readonly provider: 'generic' | 'github'
  /** Absolute feed directory ending in `/` for `generic`. */
  readonly url?: string
  readonly owner?: string
  readonly repo?: string
  readonly channel: UpdateChannel
  readonly channelFile?: string
  readonly allowPrerelease: boolean
  readonly allowDowngrade: boolean
  readonly checkIntervalMinutes: number
  readonly rolloutPercentage: number
  readonly minimumSupportedVersion?: string
  readonly releaseNotesUrl?: string
  /** Document revision, used for diagnostics and cache comparison. */
  readonly revision: string
}

/** What a check should do with the published configuration. */
export type UpdateFeedResolution =
  | {
    readonly kind: 'remote'
    readonly feed: ResolvedUpdateFeed
    readonly provenance: 'network' | 'cache'
  }
  | { readonly kind: 'disabled'; readonly reason: 'operator-disabled' | 'rollout-excluded' }
  | { readonly kind: 'packaged' }

/**
 * Applies one feed to the process-wide updater.
 * @param updater - electron-updater instance owned by the coordinator.
 * @param feed - Feed resolved from Deployments or from the packaged manifest.
 */
export function applyFeed(updater: AppUpdater, feed: ResolvedUpdateFeed): void {
  if (feed.provider === 'github') {
    updater.setFeedURL({ provider: 'github', owner: feed.owner ?? '', repo: feed.repo ?? '' })
  } else {
    updater.setFeedURL({ provider: 'generic', url: feed.url ?? '' })
  }
  // The library's channel setter enables downgrades; always re-assert the
  // operator's flags after it.
  updater.channel = feed.channel
  updater.allowDowngrade = feed.allowDowngrade
  updater.allowPrerelease = feed.allowPrerelease
}

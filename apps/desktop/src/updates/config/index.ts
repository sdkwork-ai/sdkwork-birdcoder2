/** Deployments-published update configuration: validation, cache and feed application. */

export { UPDATE_CONFIG_SCHEMA_VERSION } from './contract.ts'
export type { PublicUpdateConfig, UpdateChannel, UpdateConfigDocument, UpdateProvider } from './contract.ts'
export { applyFeed } from './feed.ts'
export type { ResolvedUpdateFeed, UpdateFeedResolution } from './feed.ts'
export { isInRollout, stableBucket } from './rollout.ts'
export {
  createUpdateConfigSource,
  DEFAULT_CONFIG_TTL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from './source.ts'
export type { UpdateConfigSource, UpdateConfigSourceOptions } from './source.ts'
export { MAX_UPDATE_CONFIG_BYTES, parseUpdateConfigDocument } from './validate.ts'

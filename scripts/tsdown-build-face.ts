/** Resolve the active tsdown build face from CLI flags and workspace metadata. */

import type { UserConfig } from 'tsdown'

/** tsdown inline config and workspace metadata passed to package-local configs. */
export interface TsdownBuildFaceContext {
  env?: Record<string, unknown>
}

/** Workspace package config callback metadata from tsdown. */
export interface TsdownBuildFaceMeta {
  rootConfig?: TsdownBuildFaceContext
}

/**
 * Read `DSH_BUILD_FACE` from the inline config, merged root config, or process env.
 * Nested workspace configs on CI may receive an empty inline `env`; the merged
 * root config still carries `--env.DSH_BUILD_FACE`.
 * @param options - tsdown inline config for the current package.
 * @param meta - workspace metadata, including the merged root config when present.
 * @returns `host`, `client`, or `undefined` when unset.
 */
export function readBuildFace(
  options: TsdownBuildFaceContext = {},
  meta: TsdownBuildFaceMeta = {},
): 'host' | 'client' | undefined {
  const raw = options.env?.DSH_BUILD_FACE
    ?? meta.rootConfig?.env?.DSH_BUILD_FACE
    ?? process.env.DSH_BUILD_FACE
  if (raw === undefined || raw === 'host') return raw === 'host' ? 'host' : undefined
  if (raw === 'client') return 'client'
  throw new Error(`tsdown: --env.DSH_BUILD_FACE must be host or client, received ${String(raw)}`)
}

/**
 * Whether the current tsdown invocation is the Client lib pass.
 * @param options - tsdown inline config for the current package.
 * @param meta - workspace metadata, including the merged root config when present.
 * @returns `true` during `tsdown --env.DSH_BUILD_FACE client`.
 */
export function isClientBuildFace(
  options: TsdownBuildFaceContext = {},
  meta: TsdownBuildFaceMeta = {},
): boolean {
  return readBuildFace(options, meta) === 'client'
}

/**
 * Skip a host-only package during the Client tsdown pass. Host-only packages
 * compile under `tsconfig.host.json` only; rerunning their library tsdown
 * configs in the Client pass fails once `lib/types` is absent on Linux CI.
 */
export const HOST_ONLY_CLIENT_PASS_SKIP: UserConfig = { entry: '' }

/**
 * Return host-only library tsdown configs for the Host pass, or a skip marker
 * for the Client pass.
 * @param hostConfigs - one or more Host-pass tsdown configs for the package.
 * @param options - tsdown inline config for the current package.
 * @param meta - workspace metadata, including the merged root config when present.
 */
export function hostOnlyTsdownConfig(
  hostConfigs: UserConfig | readonly UserConfig[],
  options: TsdownBuildFaceContext = {},
  meta: TsdownBuildFaceMeta = {},
): UserConfig | UserConfig[] {
  if (readBuildFace(options, meta) === 'client') return HOST_ONLY_CLIENT_PASS_SKIP
  return hostConfigs as UserConfig | UserConfig[]
}

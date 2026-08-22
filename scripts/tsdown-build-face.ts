/** Resolve the active tsdown build face from CLI flags and workspace metadata. */

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

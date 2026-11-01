/** Locate the packaged SDKWork release environment the Desktop Host applies. */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Environment variable naming the packaged release environment file. The Host
 * reads the file itself, before it resolves the SDKWork deployment, because an
 * installed application has no source checkout to materialize a token from.
 */
export const DESKTOP_SDKWORK_RELEASE_ENV_FILE_VARIABLE = 'DSH_DESKTOP_SDKWORK_RELEASE_ENV_FILE'

/** Basename of the release environment the packaging lane writes into `resources/`. */
export const DESKTOP_SDKWORK_RELEASE_ENV_RESOURCE = 'sdkwork-release.env'

/** Options for {@link resolveSdkworkReleaseEnvFile}. */
export interface ResolveSdkworkReleaseEnvFileOptions {
  /** Whether this launch is an installed application. */
  readonly packaged: boolean
  /** Electron's application resources directory. */
  readonly resourcesPath: string
  /** The launch environment; an explicit path always wins. */
  readonly environment: NodeJS.ProcessEnv
}

/**
 * Resolve the packaged release environment this launch should hand to the Host.
 * An explicit {@link DESKTOP_SDKWORK_RELEASE_ENV_FILE_VARIABLE} value always
 * wins, so a development launch can exercise a built artifact and an operator
 * can point an installation at a different deployment file. An installed
 * application otherwise uses the resource the packaging lane wrote; a source
 * launch has none and resolves its checkout's overlay instead.
 * @param options - packaging state, resources directory, and launch environment.
 * @returns the absolute file path, or undefined when this launch carries none.
 */
export function resolveSdkworkReleaseEnvFile(options: ResolveSdkworkReleaseEnvFileOptions): string | undefined {
  const configured = options.environment[DESKTOP_SDKWORK_RELEASE_ENV_FILE_VARIABLE]?.trim()
  if (configured !== undefined && configured !== '') return configured
  if (!options.packaged) return undefined
  const path = join(options.resourcesPath, DESKTOP_SDKWORK_RELEASE_ENV_RESOURCE)
  return existsSync(path) ? path : undefined
}

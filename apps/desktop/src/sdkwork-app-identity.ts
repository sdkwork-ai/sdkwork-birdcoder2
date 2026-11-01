/**
 * The SDKWork application an installed build belongs to.
 *
 * `IAM_APPLICATION_BOOTSTRAP_SPEC.md` section 5.4.1 stores bootstrap credentials
 * under `~/.sdkwork/<application-code>/credentials/`, so every launch has to name
 * the same code. A source checkout reads it from `agent.app.config.json`, and a
 * packaged Host runs from a profile directory (`<home>/profiles/desktop`) whose
 * name identifies no application at all. The packaging lane therefore records the
 * checkout's manifest code in `resources/sdkwork-app.json`, and the shell declares
 * it to the Host before the launch environment is resolved.
 * @module sdkwork-app-identity
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Launch-environment key declaring the credential-store application code. */
export const SDKWORK_APPLICATION_CODE_VARIABLE = 'SDKWORK_APPLICATION_CODE'

/** Basename of the packaged identity resource the packaging lane writes. */
export const SDKWORK_APP_IDENTITY_RESOURCE = 'sdkwork-app.json'

/** The application identity a packaged build carries. */
export interface SdkworkAppIdentity {
  /** Document format; {@link parseSdkworkAppIdentity} accepts only this version. */
  readonly schemaVersion: 1
  /** Credential-store application code; the directory name under `~/.sdkwork/`. */
  readonly applicationCode: string
}

/** Options for {@link resolveSdkworkApplicationCode}. */
export interface ResolveSdkworkApplicationCodeOptions {
  /** Whether this launch is an installed application. */
  readonly packaged: boolean
  /** Electron's application resources directory. */
  readonly resourcesPath: string
  /** The launch environment; an explicit declaration always wins. */
  readonly environment: NodeJS.ProcessEnv
}

/**
 * Serialize the identity resource the packaging lane ships beside the executable.
 * @param applicationCode - the checkout's manifest `app.key` with its vendor prefix removed.
 * @returns the document text, newline-terminated so a diff reads as one line.
 */
export function renderSdkworkAppIdentity(applicationCode: string): string {
  const identity: SdkworkAppIdentity = { schemaVersion: 1, applicationCode }
  return `${JSON.stringify(identity, null, 2)}\n`
}

/**
 * Read one identity document.
 * @param text - the resource contents.
 * @returns the identity, or undefined when the document is another format or carries no code.
 */
export function parseSdkworkAppIdentity(text: string): SdkworkAppIdentity | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as { schemaVersion?: unknown; applicationCode?: unknown }
  if (record.schemaVersion !== 1) return undefined
  const applicationCode = typeof record.applicationCode === 'string' ? record.applicationCode.trim() : ''
  return applicationCode === '' ? undefined : { schemaVersion: 1, applicationCode }
}

/**
 * Resolve the application code this launch must name.
 *
 * An explicit environment value wins, so an operator can point an installation at
 * another application's credential store. An installed application otherwise reads
 * the packaged identity; a source launch declares the code from its checkout and
 * resolves nothing here.
 * @param options - packaging state, resources directory, and launch environment.
 * @returns the declared code, or undefined when this launch names none.
 */
export function resolveSdkworkApplicationCode(
  options: ResolveSdkworkApplicationCodeOptions,
): string | undefined {
  const configured = options.environment[SDKWORK_APPLICATION_CODE_VARIABLE]?.trim()
  if (configured !== undefined && configured !== '') return configured
  if (!options.packaged) return undefined
  const path = join(options.resourcesPath, SDKWORK_APP_IDENTITY_RESOURCE)
  if (!existsSync(path)) return undefined
  try {
    return parseSdkworkAppIdentity(readFileSync(path, 'utf8'))?.applicationCode
  } catch {
    return undefined
  }
}

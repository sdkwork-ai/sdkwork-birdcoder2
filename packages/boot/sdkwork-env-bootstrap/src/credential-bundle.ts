/**
 * User-private bootstrap credential bundle.
 *
 * `IAM_APPLICATION_BOOTSTRAP_SPEC.md` section 5.4.1 puts the reusable bootstrap
 * token outside every checkout:
 *
 * ```text
 * ~/.sdkwork/<application-code>/credentials/<profile-id>.json
 * ```
 *
 * `ENVIRONMENT_SPEC.md` section 5.1.7 retires every composed env-file overlay
 * (`.env.<profile>.<environment>.bootstrap.local` and friends), so a repository
 * file never carries a credential again. The bundle is a JSON object with
 * `accessToken` plus non-secret metadata, written with owner-only permissions
 * through a temporary file and an atomic rename so a reader never observes a
 * partially written token.
 *
 * @module
 */
// env-naming:allow-file — this module names retired env-file spellings in its rejection diagnostics.

import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

/** One issued bootstrap credential for a single profile id. */
export interface SdkworkCredentialBundle {
  /** The bearer token sent as `Access-Token`. */
  accessToken: string
  /** Canonical lifecycle environment of the issuing scope. */
  environment: string
  /** Deployment profile, `standalone` or `cloud`. */
  deploymentProfile: string
  /** Backend origin the token was issued for. */
  backend?: string
  /** Runtime application id the token belongs to. */
  appId?: string
  /** ISO-8601 issue time, when the token claims carry one. */
  issuedAt?: string
  /** ISO-8601 expiry time, when the token claims carry one. */
  expiresAt?: string
  /** How the token was obtained, e.g. `iam-application-bootstrap`. */
  source?: string
}

/** Name of the user-private store directory under the home directory. */
export const CREDENTIAL_STORE_DIRECTORY = '.sdkwork'

/** Sub-directory of the store that holds the bundles. */
export const CREDENTIAL_BUNDLE_DIRECTORY = 'credentials'

/**
 * Normalize an application code for use as a directory name.
 *
 * The manifest `app.key` carries a vendor prefix (`sdkwork-birdcoder2`); the
 * store path uses the bare application code (`birdcoder2`), matching the
 * `~/.sdkwork/<application-code>/credentials/...` shape of the spec.
 * @param value - manifest `app.key` or any operator-supplied code.
 * @returns a lower-case, path-safe application code.
 */
export function normalizeApplicationCode(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/^sdkwork[-_]/u, '')
  const sanitized = trimmed.replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '')
  return sanitized === '' ? 'application' : sanitized
}

/**
 * The user-private store root.
 * @param homeDir - home directory; defaults to the current user's.
 * @returns the absolute store root.
 */
export function credentialStoreRoot(homeDir: string = homedir()): string {
  return resolve(homeDir, CREDENTIAL_STORE_DIRECTORY)
}

/**
 * The credential bundle path of one profile id.
 * @param options - home directory, application code, and exact profile id.
 * @returns the absolute bundle path.
 */
export function credentialBundlePath(options: {
  applicationCode: string
  profileId: string
  homeDir?: string
}): string {
  return resolve(
    credentialStoreRoot(options.homeDir),
    normalizeApplicationCode(options.applicationCode),
    CREDENTIAL_BUNDLE_DIRECTORY,
    `${options.profileId}.json`,
  )
}

/**
 * Read a bundle from disk.
 * @param path - absolute bundle path.
 * @returns the bundle, or `undefined` when the file is absent or unreadable.
 */
export function readCredentialBundle(path: string): SdkworkCredentialBundle | undefined {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const record = parsed as Record<string, unknown>
  const token = typeof record.accessToken === 'string' ? record.accessToken.trim() : ''
  if (token === '') return undefined
  const readOptional = (value: unknown): string | undefined => {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    return trimmed === '' ? undefined : trimmed
  }
  const bundle: SdkworkCredentialBundle = {
    accessToken: token,
    environment: readOptional(record.environment) ?? '',
    deploymentProfile: readOptional(record.deploymentProfile) ?? '',
  }
  for (const key of ['backend', 'appId', 'issuedAt', 'expiresAt', 'source'] as const) {
    const value = readOptional(record[key])
    if (value !== undefined) bundle[key] = value
  }
  return bundle
}

/**
 * Write a bundle with owner-only permissions through a temporary file and an
 * atomic rename (`IAM_APPLICATION_BOOTSTRAP_SPEC.md` section 5.4.1).
 * @param path - absolute bundle path.
 * @param bundle - the credential to persist.
 */
export function writeCredentialBundle(path: string, bundle: SdkworkCredentialBundle): void {
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const body = `${JSON.stringify(bundle, null, 2)}\n`
  writeFileSync(temporary, body, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(temporary, 0o600)
  } catch {
    // Windows has no POSIX mode bits; the ACL of the user profile applies.
  }
  renameSync(temporary, path)
}

/**
 * Decode the `iat`/`exp` claims of a JWT into ISO-8601 timestamps.
 * @param token - the bearer token.
 * @returns the timestamps that were present, as ISO strings.
 */
export function readTokenTimestamps(token: string): { issuedAt?: string; expiresAt?: string } {
  const parts = token.split('.')
  if (parts.length < 2) return {}
  try {
    const payload = JSON.parse(
      Buffer.from((parts[1] ?? '').replace(/-/gu, '+').replace(/_/gu, '/'), 'base64').toString('utf8'),
    ) as { iat?: unknown; exp?: unknown }
    const iso = (value: unknown): string | undefined =>
      typeof value === 'number' && Number.isFinite(value)
        ? new Date(value * 1000).toISOString()
        : undefined
    const issuedAt = iso(payload.iat)
    const expiresAt = iso(payload.exp)
    return {
      ...issuedAt === undefined ? {} : { issuedAt },
      ...expiresAt === undefined ? {} : { expiresAt },
    }
  } catch {
    return {}
  }
}

/**
 * Durable login session and account-provisioning marker files.
 *
 * The desktop shell mirrors the committed SDKWork IAM session into
 * `<DSH_HOME>/iam/session.json`. The provisioning marker sits beside it and
 * records which credential and provider profile this plugin wrote, so a later
 * sign-out can remove exactly its own writes and leave a user's API key and
 * edited profile alone. The marker carries a SHA-256 digest of the relayed
 * token, never the token itself.
 *
 * @module @deepseek-ai/dsh-birdcoder-account/session
 */

import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Read one member of a parsed JSON object without treating it as `any`.
 * @param value - narrowed plain object.
 * @param key - member name.
 * @returns the member value, typed as unknown for validation.
 */
function readMember(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key]
}

/** What the session file currently says. */
export type SessionRead =
  /** No session file: the user is signed out (or has never signed in). */
  | { readonly kind: 'absent' }
  /**
   * The file exists but is not a usable session. Treating this as a sign-out
   * would drop a live credential during a transient write, so the caller keeps
   * its previous answer.
   */
  | { readonly kind: 'invalid' }
  /** The complete session's `authToken`, the value the BirdCoder relay accepts as its API key. */
  | { readonly kind: 'token'; readonly token: string }

/** A provider/model selection this plugin switched away from. */
export interface SelectionSnapshot {
  /** Provider route key. */
  readonly provider: string
  /** Provider-owned model id. */
  readonly model: string
  /** Adapter reasoning effort, when the selection named one. */
  readonly reasoningEffort?: string
}

/** Durable record of the writes this plugin owns. */
export interface AccountMarker {
  /** Schema version of the marker. */
  readonly version: 1
  /** Credential reference the mirrored token was stored under. */
  readonly ref: string
  /** SHA-256 digest of the last token this plugin stored, when it stored one. */
  readonly tokenHash?: string
  /**
   * Ownership of the `llm-pi-ai` BirdCoder profile: `provisioned` means this
   * plugin created it and may remove it again; `foreign` means it already
   * existed and is never touched.
   */
  readonly profile: 'none' | 'provisioned' | 'foreign'
  /** The default-model switch this plugin made, for restoring it on sign-out. */
  readonly switchedDefault?: {
    readonly previous: SelectionSnapshot
    readonly next: SelectionSnapshot
  }
}

/** Size bound for both files; a session or marker beyond this is not ours. */
const MAX_FILE_BYTES = 1024 * 1024

/** The empty marker for a reference. */
export function emptyMarker(ref: string): AccountMarker {
  return { version: 1, ref, profile: 'none' }
}

/**
 * Read the mirrored IAM session.
 *
 * Both a missing file and a file without a usable `authToken` are answered
 * explicitly: the caller distinguishes a sign-out from a transient unreadable
 * record. The session file is written atomically by the desktop shell, so a
 * short or malformed record is a foreign file rather than a partial write this
 * module could wait out.
 * @param path - absolute session file path.
 * @returns the session observation.
 */
export function readSessionFile(path: string): SessionRead {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error: unknown) {
    return isMissingFile(error) ? { kind: 'absent' } : { kind: 'invalid' }
  }
  if (text.length > MAX_FILE_BYTES) return { kind: 'invalid' }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { kind: 'invalid' }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { kind: 'invalid' }
  const token = readMember(value, 'authToken')
  if (typeof token !== 'string' || token.trim() === '') return { kind: 'invalid' }
  return { kind: 'token', token }
}

/**
 * Read the provisioning marker.
 * @param path - absolute marker path.
 * @param ref - credential reference the marker must belong to.
 * @returns the stored marker, or the empty marker when absent, unreadable, or for another reference.
 */
export function readMarkerFile(path: string, ref: string): AccountMarker {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return emptyMarker(ref)
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return emptyMarker(ref)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return emptyMarker(ref)
  if (readMember(value, 'version') !== 1 || readMember(value, 'ref') !== ref) return emptyMarker(ref)
  const tokenHash = readMember(value, 'tokenHash')
  const profile = readMember(value, 'profile')
  const switched = readMember(value, 'switchedDefault')
  const marker: AccountMarker = {
    version: 1,
    ref,
    profile: profile === 'provisioned' || profile === 'foreign' ? profile : 'none',
    ...typeof tokenHash === 'string' && /^[0-9a-f]{64}$/u.test(tokenHash) ? { tokenHash } : {},
    ...isSwitch(switched) ? { switchedDefault: { previous: switched.previous, next: switched.next } } : {},
  }
  return marker
}

/**
 * Write the provisioning marker atomically with owner-only permissions.
 * @param path - absolute marker path.
 * @param marker - marker to persist.
 */
export function writeMarkerFile(path: string, marker: AccountMarker): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(temporary, 0o600)
  } catch {
    // Windows has no POSIX mode bits; the ACL of the user profile applies.
  }
  renameSync(temporary, path)
}

/**
 * Remove the marker; removing an absent file is a no-op.
 * @param path - absolute marker path.
 */
export function removeMarkerFile(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // A marker that cannot be removed still reads through its old contents; the
    // next successful reconciliation rewrites it, and a read-only home cannot
    // lose the ownership record it needs for sign-out.
  }
}

/** Whether an error is ENOENT. */
function isMissingFile(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

/** SHA-256 digest of a secret, as lower-case hex. */
export function digestSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Whether a parsed value is a complete default-model switch record. */
function isSwitch(value: unknown): value is { previous: SelectionSnapshot; next: SelectionSnapshot } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  return isSelection(Reflect.get(value, 'previous')) && isSelection(Reflect.get(value, 'next'))
}

/** Whether a parsed value is one selection snapshot. */
function isSelection(value: unknown): value is SelectionSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const provider = readMember(value, 'provider')
  const model = readMember(value, 'model')
  const reasoning = readMember(value, 'reasoningEffort')
  return typeof provider === 'string' && provider.length > 0
    && typeof model === 'string' && model.length > 0
    && (reasoning === undefined || typeof reasoning === 'string')
}

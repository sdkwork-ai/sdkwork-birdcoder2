/**
 * Durable SDKWork IAM session under the Harness home.
 *
 * The browser keeps the live session in `localStorage`, which belongs to the
 * Electron web profile — not to the product's data directory. A headless
 * launch, the CLI, or a Host-side caller has no access to that profile, so the
 * committed IAM session is mirrored into `<DSH_HOME>/iam/session.json`:
 *
 * ```text
 * <DSH_HOME>/iam/session.json
 * ```
 *
 * The file carries the complete dual-token session — `authToken`,
 * `accessToken`, the rotating `refreshToken`, `sessionId`, and the returned
 * user plus `AppContext` — because a partially stored session can neither be
 * validated nor refreshed later. When the operating system exposes a secret
 * store (Electron `safeStorage`: DPAPI, Keychain, libsecret), the JSON payload
 * is encrypted with it, so another local process cannot read the tokens from
 * the file; plaintext remains only where no secret service is available.
 * External readers (Host/CLI) go through the app's IPC bridge rather than the
 * file. Writes go through a temporary file and an atomic rename with
 * owner-only permissions, so a reader never observes a half-written session.
 */

import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { dirname, join } from 'node:path'
import { IAM_SESSION_BRIDGE, IAM_SESSION_VERSION, type IamSessionRecord } from './iam-session-protocol.ts'

export { IAM_SESSION_BRIDGE, IAM_SESSION_VERSION, type IamSessionRecord } from './iam-session-protocol.ts'

/** Directory segment of the session file under the Harness home. */
export const IAM_SESSION_DIRECTORY = 'iam'
/** File name of the durable IAM session. */
export const IAM_SESSION_FILENAME = 'session.json'

/**
 * Absolute path of the durable session file.
 * @param home - the resolved Harness home (`DSH_HOME`).
 * @returns `<home>/iam/session.json`.
 */
export function iamSessionPath(home: string): string {
  return join(home, IAM_SESSION_DIRECTORY, IAM_SESSION_FILENAME)
}

/** Optional OS-backed secret storage used to encrypt the durable session file. */
export interface IamSessionSecretStorage {
  /** Whether the operating-system secret store is usable right now. */
  isAvailable(): boolean
  /** Encrypt one UTF-8 JSON payload and return a base64 string. */
  encrypt(plainText: string): string
  /** Decrypt one base64 payload produced by {@link encrypt}. */
  decrypt(payload: string): string
}

interface IamSessionEncryptedEnvelope {
  readonly encrypted: true
  readonly payload: string
}

function readEncryptedEnvelope(value: unknown): IamSessionEncryptedEnvelope | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.encrypted !== true || typeof record.payload !== 'string' || record.payload === '') {
    return undefined
  }
  return { encrypted: true, payload: record.payload }
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Validate and normalize a session record written by the renderer.
 *
 * Both tokens are mandatory: `authToken` identifies the session and
 * `accessToken` authorizes it, and a record missing either is not a login a
 * later launch could restore. Unknown fields are dropped, so the file keeps
 * exactly the fields this module documents.
 * @param value - candidate record (already parsed from JSON or IPC payload).
 * @param now - ISO-8601 write time; defaults to the current time.
 * @returns the normalized record, or undefined when it is not a complete session.
 */
export function normalizeIamSession(value: unknown, now: () => string = () => new Date().toISOString()): IamSessionRecord | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const authToken = readOptionalString(record.authToken)
  const accessToken = readOptionalString(record.accessToken)
  if (authToken === undefined || accessToken === undefined) return undefined
  const refreshToken = readOptionalString(record.refreshToken)
  const sessionId = readOptionalString(record.sessionId)
  const expiresAt = typeof record.expiresAt === 'number' || typeof record.expiresAt === 'string'
    ? record.expiresAt
    : undefined
  const savedAt = readOptionalString(record.savedAt) ?? now()
  return {
    version: IAM_SESSION_VERSION,
    authToken,
    accessToken,
    savedAt,
    ...refreshToken === undefined ? {} : { refreshToken },
    ...sessionId === undefined ? {} : { sessionId },
    ...expiresAt === undefined ? {} : { expiresAt },
    ...record.user === undefined || record.user === null ? {} : { user: record.user },
    ...record.context === undefined || record.context === null ? {} : { context: record.context },
  }
}

/**
 * Read the durable session.
 * @param path - absolute session file path.
 * @param secretStorage - OS-backed storage that can decrypt an encrypted file.
 * @returns the stored record, or undefined when the file is absent, unreadable, encrypted without a usable secret store, or incomplete.
 */
export function readIamSessionFile(
  path: string,
  secretStorage?: IamSessionSecretStorage,
): IamSessionRecord | undefined {
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
    // A corrupted record is no session; the next commit replaces it.
    return undefined
  }
  const encrypted = readEncryptedEnvelope(parsed)
  if (encrypted !== undefined) {
    if (secretStorage?.isAvailable() !== true) return undefined
    try {
      return normalizeIamSession(JSON.parse(secretStorage.decrypt(encrypted.payload)))
    } catch {
      return undefined
    }
  }
  return normalizeIamSession(parsed)
}

/**
 * Write the durable session atomically with owner-only permissions.
 *
 * When the operating-system secret store is available the JSON payload is
 * encrypted with it; the plaintext fallback only applies where the platform
 * offers no usable secret service.
 * @param path - absolute session file path.
 * @param record - complete session record.
 * @param secretStorage - OS-backed storage used to encrypt the payload.
 */
export function writeIamSessionFile(
  path: string,
  record: IamSessionRecord,
  secretStorage?: IamSessionSecretStorage,
): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const serialized = JSON.stringify(record)
  const body = secretStorage?.isAvailable()
    ? JSON.stringify({
      encrypted: true,
      payload: secretStorage.encrypt(serialized),
    })
    : JSON.stringify(record, null, 2)
  writeFileSync(temporary, `${body}\n`, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(temporary, 0o600)
  } catch {
    // Windows has no POSIX mode bits; the ACL of the user profile applies.
  }
  renameSync(temporary, path)
}

/**
 * Remove the durable session; removing an absent file is a no-op.
 * @param path - absolute session file path.
 */
export function clearIamSessionFile(path: string): void {
  rmSync(path, { force: true })
}

/** Electron surface the session bridge needs. */
export interface IamSessionBridgeOptions {
  /** Resolved Harness home (`DSH_HOME`). */
  home: string
  ipcMain: Pick<IpcMain, 'handle'> & Partial<Pick<IpcMain, 'removeHandler'>>
  /** Reject a call from a frame this application does not own. */
  assertSender: (event: IpcMainInvokeEvent) => void
  /** OS-backed secret storage used to encrypt the durable file at rest. */
  secretStorage?: IamSessionSecretStorage
}

/** One installed session bridge. */
export interface IamSessionBridge {
  /** Absolute session file path. */
  path: string
  /** Read the stored record without crossing the IPC boundary. */
  read(): IamSessionRecord | undefined
  dispose(): void
}

/**
 * Install the renderer-facing durable-session bridge.
 * @param options - home, IPC surface, and the sender guard.
 * @returns the bridge handle used for teardown.
 */
export function createIamSessionBridge(options: IamSessionBridgeOptions): IamSessionBridge {
  const path = iamSessionPath(options.home)
  const { ipcMain } = options

  ipcMain.handle(IAM_SESSION_BRIDGE.read, (event) => {
    options.assertSender(event)
    return readIamSessionFile(path, options.secretStorage) ?? null
  })
  ipcMain.handle(IAM_SESSION_BRIDGE.save, (event, value: unknown) => {
    options.assertSender(event)
    const record = normalizeIamSession(value)
    if (record === undefined) {
      throw new Error('sdkwork iamSession requires a complete authToken + accessToken session')
    }
    writeIamSessionFile(path, record, options.secretStorage)
    return record
  })
  ipcMain.handle(IAM_SESSION_BRIDGE.clear, (event) => {
    options.assertSender(event)
    clearIamSessionFile(path)
  })

  return {
    path,
    read: () => readIamSessionFile(path, options.secretStorage),
    dispose: () => {
      ipcMain.removeHandler?.(IAM_SESSION_BRIDGE.read)
      ipcMain.removeHandler?.(IAM_SESSION_BRIDGE.save)
      ipcMain.removeHandler?.(IAM_SESSION_BRIDGE.clear)
    },
  }
}

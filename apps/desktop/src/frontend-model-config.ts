/**
 * Host-readable projection of the operator's front-end model configuration.
 *
 * The Host's relay catalog is a projection of the operator-authored surface
 * document (which models the `llm` surface exposes). Reading that document from
 * the app API needs the IAM session's `Auth-Token` + `Access-Token`, which the
 * desktop shell holds but a Host child process deliberately cannot read (the
 * durable session is encrypted with the OS secret store, and the plaintext
 * relay projection carries only the inference token).
 *
 * This module closes that gap without widening the Host's credential surface:
 * the shell, which already has both tokens, fetches the document and writes it
 * to `<DSH_HOME>/iam/frontend-model-config.json` with owner-only permissions and
 * an atomic rename. The Host's `birdcoder-account` loader reads that file, so
 * the operator's enable/disable takes effect without any token leaving the
 * shell. A failed fetch leaves the previous document in place.
 *
 * @module @sdkwork-birdcoder2-desktop/frontend-model-config
 */

import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { IamSessionRecord } from './iam-session-protocol.ts'

/** File name of the Host-readable front-end model configuration projection. */
export const IAM_FRONTEND_MODEL_CONFIG_FILENAME = 'frontend-model-config.json'

/** Schema version the projection accepts from the app API. */
export const IAM_FRONTEND_MODEL_CONFIG_VERSION = 1

/** Default app-api path of the front-end model configuration. */
export const DEFAULT_FRONTEND_MODEL_CONFIG_URL = 'https://api.birdcoder.com/app/v3/api/ai/frontend_config'

/** Size bound for the projected document. */
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024

/** Absolute path of the projection beside the durable session. */
export function iamFrontendModelConfigPath(sessionPath: string): string {
  return join(dirname(sessionPath), IAM_FRONTEND_MODEL_CONFIG_FILENAME)
}

/** Options for one projection refresh. */
export interface FrontendModelConfigProjectionOptions {
  /** Absolute app-api URL; empty disables the projection. */
  endpoint: string
  /** Per-request timeout. */
  timeoutMs?: number
  /** HTTP implementation, for tests. */
  fetch?: typeof fetch
  /** Clock, for tests. */
  now?: () => Date
  /** File writer, for tests. */
  writeFile?: (path: string, body: string) => void
}

/** Whether one value is an acceptable configuration document. */
function isFrontendModelConfigDocument(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const channels = (value as Record<string, unknown>).channels
  return Array.isArray(channels)
}

/**
 * Write one private file atomically with owner-only permissions.
 * @param path - absolute destination path.
 * @param body - complete file content.
 */
function writePrivateFile(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  writeFileSync(temporary, body, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(temporary, 0o600)
  } catch {
    // Windows has no POSIX mode bits; the user profile ACL applies.
  }
  renameSync(temporary, path)
}

/**
 * Fetch the front-end model configuration with the signed-in session and
 * project it for the Host.
 *
 * Best-effort by construction: a renderer-driven sign-in can race an offline
 * gateway, and the previous projection keeps the last known surface. The
 * returned promise resolves `true` when a document was written.
 * @param sessionPath - durable session file path the projection sits beside.
 * @param session - complete IAM session carrying both tokens.
 * @param options - endpoint, clock, timeouts, and injectable I/O.
 * @returns whether a projection was written.
 */
export async function writeFrontendModelConfigProjection(
  sessionPath: string,
  session: IamSessionRecord,
  options: FrontendModelConfigProjectionOptions,
): Promise<boolean> {
  if (options.endpoint === '') return false
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? 10_000
  const timer = setTimeout(() =>{  controller.abort() }, timeoutMs)
  timer.unref?.()
  try {
    const response = await (options.fetch ?? fetch)(options.endpoint, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${session.authToken}`,
        'access-token': session.accessToken,
      },
      signal: controller.signal,
    })
    if (!response.ok) return false
    const declared = Number(response.headers.get('content-length') ?? Number.NaN)
    if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) return false
    const body = await response.text()
    if (body.length > MAX_DOCUMENT_BYTES) return false
    let document: unknown
    try {
      document = JSON.parse(body)
    } catch {
      return false
    }
    if (!isFrontendModelConfigDocument(document)) return false
    const projected = {
      version: IAM_FRONTEND_MODEL_CONFIG_VERSION,
      savedAt: (options.now ?? (() => new Date()))().toISOString(),
      source: options.endpoint,
      document,
    }
    const write = options.writeFile ?? writePrivateFile
    write(iamFrontendModelConfigPath(sessionPath), `${JSON.stringify(projected, null, 2)}\n`)
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

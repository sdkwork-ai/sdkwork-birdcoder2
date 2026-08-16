/**
 * TEMP-DIAG: file-backed telemetry for the packaged freeze investigation.
 * The hidden console host reroutes stdout/stderr into the invisible console,
 * so diagnostics append to a file under the user-data directory instead.
 * @module @deepseek-ai/dsh-desktop/diag
 */

import { appendFileSync } from 'node:fs'

let logPath: string | undefined

/** Point the diag log at a writable path (called once at boot). */
export function setDiagLogPath(path: string): void {
  logPath = path
}

/** Append one diag line; never throws — diagnostics must not fail the app. */
export function diagLog(message: string): void {
  if (logPath === undefined) return
  try {
    appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`)
  } catch {
    // The log file is best-effort; a locked path must not disturb the app.
  }
}

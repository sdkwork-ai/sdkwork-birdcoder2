/**
 * Plaintext credential copies the embedded SDKWork packages leave in
 * `localStorage`.
 *
 * Those packages keep their own session snapshot next to the host IAM session:
 * the Agents PC store writes `sdkwork-agents-pc:session:v1`, and the shared
 * core keeps its token entries under `sdkwork.core.pc-react.*`. The host
 * sign-out does not clear them, so a session that ended — or a different
 * account that signs in next in the same Electron profile — could still read
 * the previous account's tokens.
 *
 * The sweep removes exactly those two credential families. It never calls
 * `localStorage.clear()`: device preferences (`sdkwork.core.pc-react.preferences`,
 * theme, language, layout) describe this browser rather than an account and
 * must survive a sign-out.
 */

/** Session key the embedded Agents PC store writes its token snapshot to. */
export const SDKWORK_AGENTS_SESSION_STORAGE_KEY = 'sdkwork-agents-pc:session:v1'

/** Prefix of the shared core library's own token entries. */
export const SDKWORK_CORE_CREDENTIAL_STORAGE_PREFIX = 'sdkwork.core.pc-react.'

/**
 * Entries under the core prefix that are device preferences, not credentials.
 * Kept in one place so a future preference key has an obvious home.
 */
const CORE_DEVICE_PREFERENCE_KEYS: ReadonlySet<string> = new Set([
  'sdkwork.core.pc-react.preferences',
])

/** Minimal storage face the sweep needs (localStorage, or a map in tests). */
export interface IamCredentialStorage {
  readonly length: number
  key(index: number): string | null
  removeItem(key: string): void
}

/**
 * @returns the page's localStorage, or undefined when storage is blocked.
 */
function defaultCredentialStorage(): IamCredentialStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    // A page whose storage throws has no copies this sweep could remove.
    return undefined
  }
}

/**
 * Whether one storage key holds an embedded package's plaintext credentials.
 * @param key - the localStorage key to classify.
 * @returns true for the Agents PC session blob and the core token entries.
 */
export function isEmbeddedSdkworkCredentialKey(key: string): boolean {
  if (key === SDKWORK_AGENTS_SESSION_STORAGE_KEY) return true
  return key.startsWith(SDKWORK_CORE_CREDENTIAL_STORAGE_PREFIX)
    && !CORE_DEVICE_PREFERENCE_KEYS.has(key)
}

/**
 * Remove the embedded packages' plaintext credential copies.
 *
 * Called where the host IAM session ends or changes hands (sign-out, and a
 * browser login that redeems a different account): both are points where the
 * embedded packages' own copies would otherwise outlive the host session.
 * @param storage - storage to sweep; defaults to the page's localStorage.
 * @returns the removed keys, for tests and diagnostics.
 */
export function clearEmbeddedSdkworkCredentials(
  storage: IamCredentialStorage | undefined = defaultCredentialStorage(),
): string[] {
  if (storage === undefined) return []
  // Snapshot the keys first: removing while indexing shifts the live list.
  const keys: string[] = []
  try {
    const length = storage.length
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index)
      if (key !== null) keys.push(key)
    }
  } catch {
    return keys
  }
  const removed: string[] = []
  for (const key of keys) {
    if (!isEmbeddedSdkworkCredentialKey(key)) continue
    try {
      storage.removeItem(key)
      removed.push(key)
    } catch {
      // A refused removal must not abort the remaining keys.
    }
  }
  return removed
}

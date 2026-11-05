/**
 * Durable IAM session store.
 *
 * Two storage modes, one session:
 *
 * - Desktop: the host port (the shell's `sdkworkDesktop.iamSession` bridge) is
 *   authoritative. It writes the OS-encrypted copy under the Harness home
 *   (`<DSH_HOME>/iam/session.json`), and the token payload is deliberately not
 *   mirrored into plaintext `localStorage`. A legacy local session is migrated
 *   once and removed.
 * - Browser: `localStorage` is the only copy, because a plain web page has no
 *   OS secret store.
 *
 * A complete session round-trips through the active store; boot restores from
 * the host copy when the browser has none. Reads and writes keep the token-sync
 * hook in step so the global token manager always carries the stored session.
 */

/** The durable subset of an IAM session the auth runtime persists. */
export interface IamStoredSession {
  accessToken?: string
  authToken?: string
  expiresAt?: number | string
  refreshToken?: string
  sessionId?: string
  context?: unknown
  /**
   * Cached identity for immediate UI restore between boots. The desktop
   * browser login fills it from the account profile, so the name, e-mail, and
   * initials a surface renders survive the next launch without another read.
   */
  user?: {
    avatar?: unknown
    displayName?: string
    email?: string
    firstName?: string
    id?: string
    initials?: string
    lastName?: string
    nickname?: string
    username?: string
  }
}

/** Renderer-facing durable session port the desktop shell exposes. */
export interface IamSessionHostPort {
  /** Read the durable session record (unvalidated transport payload). */
  read(): Promise<unknown>
  /** Persist one complete session. */
  save(session: IamStoredSession): Promise<void>
  /** Remove the durable session. */
  clear(): Promise<void>
}

/** Minimal synchronous storage face (localStorage in the browser, a map in tests). */
export interface IamStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Token persistence face the runtime adapter exposes to the auth stack. */
export interface IamTokenStore {
  /** Read the stored session (undefined-shaped record when absent or unreadable). */
  get(): Promise<IamStoredSession>
  /** Persist a session snapshot. */
  set(session: IamStoredSession): Promise<void>
  /** Remove the stored session. */
  clear(): Promise<void>
}

export interface CreateIamTokenStoreOptions {
  /** localStorage key owning the session blob. */
  storageKey: string
  /** The backing storage (defaults to the global localStorage). */
  storage?: IamStorageLike
  /**
   * Durable host copy under the Harness home. Present only in the desktop
   * shell; a plain browser page keeps the localStorage copy alone.
   */
  host?: IamSessionHostPort
  /**
   * Token-sync hook invoked with every session the store reads or writes;
   * the runtime adapter uses it to update the generated client's
   * credential state before authenticated calls.
   */
  onTokens?(session: IamStoredSession): void
}

function defaultStorage(): IamStorageLike {
  const storage = globalThis.localStorage
  if (storage === undefined) {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }
  }
  return storage
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : value
}

/**
 * Whether a session carries the complete dual-token pair.
 * @param session - candidate session.
 * @returns true when both `authToken` and `accessToken` are present.
 */
export function hasIamSessionTokens(session: IamStoredSession): boolean {
  return nonEmptyString(session.authToken) !== undefined
    && nonEmptyString(session.accessToken) !== undefined
}

/**
 * Normalize a durable host record into the stored-session shape.
 * Unknown fields (the record's `version`, `savedAt`) are dropped so the two
 * copies keep the same shape.
 * @param value - parsed host record.
 * @returns the stored session, or undefined when it is not a complete session.
 */
export function normalizeHostIamSession(value: unknown): IamStoredSession | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const session: IamStoredSession = {}
  if (nonEmptyString(record.authToken) !== undefined) session.authToken = record.authToken as string
  if (nonEmptyString(record.accessToken) !== undefined) session.accessToken = record.accessToken as string
  if (!hasIamSessionTokens(session)) return undefined
  if (nonEmptyString(record.refreshToken) !== undefined) session.refreshToken = record.refreshToken as string
  if (nonEmptyString(record.sessionId) !== undefined) session.sessionId = record.sessionId as string
  if (typeof record.expiresAt === 'number' || typeof record.expiresAt === 'string') session.expiresAt = record.expiresAt
  if (typeof record.user === 'object' && record.user !== null) session.user = record.user as IamStoredSession['user']
  if (record.context !== undefined && record.context !== null) session.context = record.context
  return session
}

function parseStoredSession(raw: string | null): IamStoredSession {
  if (raw === null) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return {}
    return value
  } catch {
    // A corrupted blob means no usable session; the next write replaces it.
    return {}
  }
}

/**
 * Create the durable IAM session store.
 * @param options - storage key, backing storage, optional durable host port, and the token-sync hook.
 * @returns the token store face.
 */
export function createIamTokenStore(options: CreateIamTokenStoreOptions): IamTokenStore {
  const storage = options.storage ?? defaultStorage()
  const host = options.host

  async function readHostSession(): Promise<IamStoredSession | undefined> {
    if (host === undefined) return undefined
    let value: unknown
    try {
      value = await host.read()
    } catch {
      // The durable copy is a recovery source, not a gate: an absent bridge or
      // an unreadable file leaves the browser-local session in charge.
      return undefined
    }
    return normalizeHostIamSession(value)
  }

  /** The record a write replaces, from the authoritative copy of the mode in use. */
  async function readPrevious(): Promise<IamStoredSession | undefined> {
    const restored = await readHostSession()
    if (restored !== undefined) return restored
    const local = parseStoredSession(storage.getItem(options.storageKey))
    return hasIamSessionTokens(local) ? local : undefined
  }

  return {
    async get(): Promise<IamStoredSession> {
      // The desktop host copy is the authoritative store: it is encrypted with
      // the OS secret store when available, so the renderer's localStorage is
      // not used for tokens there. A legacy browser-local session is migrated
      // once and removed.
      if (host !== undefined) {
        const restored = await readHostSession()
        if (restored !== undefined) {
          storage.removeItem(options.storageKey)
          options.onTokens?.(restored)
          return restored
        }
        const legacy = parseStoredSession(storage.getItem(options.storageKey))
        if (hasIamSessionTokens(legacy)) {
          try {
            await host.save(legacy)
            storage.removeItem(options.storageKey)
          } catch {
            // Keep the legacy copy when the host cannot persist it yet.
          }
          options.onTokens?.(legacy)
          return legacy
        }
        options.onTokens?.(legacy)
        return legacy
      }
      const local = parseStoredSession(storage.getItem(options.storageKey))
      if (hasIamSessionTokens(local)) {
        options.onTokens?.(local)
        return local
      }
      const restored = await readHostSession()
      if (restored !== undefined) {
        storage.setItem(options.storageKey, JSON.stringify(restored))
        options.onTokens?.(restored)
        return restored
      }
      options.onTokens?.(local)
      return local
    },
    async set(session: IamStoredSession): Promise<void> {
      // A token rotation writes only tokens. The cached identity and the
      // AppContext cannot be restated from a refresh response, so forgetting
      // them would blank the account row after the next launch — a session
      // write therefore merges over the record it replaces.
      const previous = await readPrevious()
      const merged: IamStoredSession = {
        ...session,
        ...session.context === undefined && previous?.context !== undefined ? { context: previous.context } : {},
        ...session.sessionId === undefined && previous?.sessionId !== undefined ? { sessionId: previous.sessionId } : {},
        ...session.user === undefined && previous?.user !== undefined ? { user: previous.user } : {},
      }
      // The durable copy is the promise the product makes about the login, so
      // it is written first: a failed host write rejects the commit without
      // leaving a browser-local copy that only this profile can see. When the
      // host exists, the token payload is not mirrored into plaintext
      // localStorage at all.
      if (host !== undefined) {
        await host.save(merged)
        storage.removeItem(options.storageKey)
      } else {
        storage.setItem(options.storageKey, JSON.stringify(merged))
      }
      options.onTokens?.(merged)
    },
    async clear(): Promise<void> {
      storage.removeItem(options.storageKey)
      if (host !== undefined) await host.clear()
      // Announce the sign-out through the same hook every read and write uses,
      // so a holder of the last observed session drops it instead of publishing
      // cleared credentials to the shared transport.
      options.onTokens?.({})
    },
  }
}

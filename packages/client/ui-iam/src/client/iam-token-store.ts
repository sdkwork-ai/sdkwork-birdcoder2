/**
 * Browser-local IAM token store: the durable session the sdkwork auth stack
 * persists between boots (localStorage) plus the token-sync hook that keeps
 * the generated app client's credential state in step. The runtime adapter
 * wraps this store so every read/write path (bootstrap restore, login
 * commit, sign-out clear) also updates the client's auth headers.
 */

/** The durable subset of an IAM session the auth runtime persists. */
export interface IamStoredSession {
  accessToken?: string
  authToken?: string
  expiresAt?: number | string
  refreshToken?: string
  sessionId?: string
  context?: unknown
  /** Cached identity for immediate UI restore between boots. */
  user?: {
    avatar?: unknown
    displayName?: string
    email?: string
    id?: string
    nickname?: string
    username?: string
  }
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
 * Create the browser-local IAM token store.
 * @param options - storage key, backing storage, and the token-sync hook.
 * @returns the token store face.
 */
export function createIamTokenStore(options: CreateIamTokenStoreOptions): IamTokenStore {
  const storage = options.storage ?? defaultStorage()

  return {
    get(): Promise<IamStoredSession> {
      const session = parseStoredSession(storage.getItem(options.storageKey))
      options.onTokens?.(session)
      return Promise.resolve(session)
    },
    set(session: IamStoredSession): Promise<void> {
      storage.setItem(options.storageKey, JSON.stringify(session))
      options.onTokens?.(session)
      return Promise.resolve()
    },
    clear(): Promise<void> {
      storage.removeItem(options.storageKey)
      return Promise.resolve()
    },
  }
}

/**
 * The message-center service: owns the notification page, the unread badge,
 * polling, and the acknowledge write. It reads the active deployment's
 * app-api origin from the shared environment profile and the signed-in
 * credentials from the IAM service (falling back to the profile's static
 * access token), so the rail badge and the center read one authoritative
 * snapshot.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-message-center/client/message-service
 */
import {
  readMessagePage,
  type MessageItem,
} from './message-contract.ts'
import {
  classifyMessageFailure,
  createMessageCenterTransport,
  type MessageCenterCredentials,
  type MessageCenterTransport,
  type MessageLoadFailure,
} from './message-transport.ts'

/** Notification page state the rail badge and the center render. */
export type MessageCenterStatus = 'unconfigured' | 'signed-out' | 'loading' | 'ready' | 'error'

/** One stable snapshot of the message-center facts. */
export interface MessageCenterSnapshot {
  /** Current lifecycle state. */
  readonly status: MessageCenterStatus
  /** Supported notifications, newest first; empty while signed out or unconfigured. */
  readonly items: readonly MessageItem[]
  /** Notifications the current page reports as unread. */
  readonly unreadCount: number
  /** Whether the server has another page. */
  readonly hasMore: boolean
  /** The last failure, kept beside cached items for an inline retry row. */
  readonly failure: MessageLoadFailure | null
}

/** The environment profile members this service reads. */
export interface MessageCenterEnvLike {
  /** @returns whether the active profile carries a usable gateway origin. */
  isConfigured(): boolean
  /** @returns the active profile's app-api gateway origin. */
  apiBaseUrl(): string
  /** @returns the profile's static access token; empty falls back to the IAM session. */
  accessToken(): string
  /** Observe environment or profile changes. */
  subscribe(listener: () => void): () => void
}

/** The IAM session token triple the service reads. */
export interface MessageCenterIamTokens {
  /** Tenant-isolation access token. */
  accessToken?: string
  /** Login token. */
  authToken?: string
  /** Rotating refresh token; unused by this service. */
  refreshToken?: string
}

/**
 * The IAM service face this package consumes. Declared structurally so the
 * package composes through the Cordis service instead of importing the IAM
 * bundle; every member is optional except the credential reader.
 */
export interface MessageCenterIamLike {
  /** @returns the authoritative current credential triple. */
  sessionTokens?(): MessageCenterIamTokens
  /** Observe credential writes, including a rotated token. */
  onAuthToken?(listener: () => void): () => void
  /** Raise the in-app sign-in surface and resolve once a session exists. */
  requestSignInInPlace?(): Promise<boolean>
  /** @returns whether a session is currently held. */
  isSignedIn?(): boolean
}

/** Construction facts for the service. */
export interface MessageCenterServiceOptions {
  /** Active deployment profile. */
  readonly env: MessageCenterEnvLike
  /** Mounted IAM service, when the composition provides one. */
  readonly iam: MessageCenterIamLike | undefined
  /** Unread-badge polling interval in milliseconds. */
  readonly pollIntervalMs: () => number
  /** Notifications requested per page. */
  readonly pageSize: () => number
  /** Transport builder; tests substitute a scripted transport. */
  readonly transportFactory?: (
    baseUrl: string,
    credentials: () => MessageCenterCredentials,
  ) => MessageCenterTransport
}

/** Shared empty page, so a repeated no-data state keeps one snapshot reference. */
const NO_ITEMS: readonly MessageItem[] = Object.freeze([])

/** Snapshots compared by reference, so an unchanged poll publishes nothing. */
function sameSnapshot(left: MessageCenterSnapshot, right: MessageCenterSnapshot): boolean {
  return left.status === right.status
    && left.items === right.items
    && left.unreadCount === right.unreadCount
    && left.hasMore === right.hasMore
    && left.failure === right.failure
}

/**
 * @param items - notifications after a read or acknowledge.
 * @returns how many the current page reports unread.
 */
function countUnread(items: readonly MessageItem[]): number {
  let unread = 0
  for (const item of items) if (!item.read) unread += 1
  return unread
}

/**
 * Message-center service: one snapshot source over the notification API.
 */
export class MessageCenterService {
  private readonly options: MessageCenterServiceOptions
  private current: MessageCenterSnapshot = {
    status: 'loading',
    items: NO_ITEMS,
    unreadCount: 0,
    hasMore: false,
    failure: null,
  }
  private readonly listeners = new Set<() => void>()
  private transport: MessageCenterTransport | undefined
  private transportBaseUrl: string | undefined
  private page = 1
  private inflight: Promise<void> | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private disposed = false
  private started = false

  /**
   * @param options - environment, IAM face, runtime settings, and transport builder.
   */
  constructor(options: MessageCenterServiceOptions) {
    this.options = options
  }

  /**
   * Read the current snapshot reference.
   * @returns the current snapshot; the same reference until a fact moves.
   */
  snapshot(): MessageCenterSnapshot {
    return this.current
  }

  /**
   * Observe snapshot changes.
   * @param listener - change listener.
   * @returns the disposer removing the listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Begin polling and load the first page. Credential writes (login, sign-out,
   * token rotation, environment switch) trigger one immediate re-read.
   * @returns the disposer that stops polling and drops the subscriptions.
   */
  start(): () => void {
    if (this.started || this.disposed) return () => {}
    this.started = true
    const reread = (): void => {
      if (this.disposed) return
      this.reschedule()
      void this.refresh()
    }
    const offIam = this.options.iam?.onAuthToken?.(reread)
    const offEnv = this.options.env.subscribe(reread)
    this.reschedule()
    void this.refresh()
    return () => {
      this.stop()
      this.started = false
      offIam?.()
      offEnv()
    }
  }

  /**
   * Stop polling and drop every listener. The instance is unusable afterwards.
   */
  dispose(): void {
    this.disposed = true
    this.stop()
    this.listeners.clear()
  }

  /**
   * Read the disposed fact through a call, so an asynchronous settle after
   * {@link dispose} is not narrowed away by control-flow analysis.
   * @returns whether the service was disposed.
   */
  private isDisposed(): boolean {
    return this.disposed
  }

  /**
   * Re-read the first page.
   * @returns a promise settling when this read (or the read already in flight) finishes.
   */
  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (!this.options.env.isConfigured()) {
      this.page = 1
      this.publish({
        status: 'unconfigured',
        items: NO_ITEMS,
        unreadCount: 0,
        hasMore: false,
        failure: null,
      })
      return Promise.resolve()
    }
    if (this.inflight !== undefined) return this.inflight
    if (!this.hasCredentials()) {
      this.page = 1
      this.publishSignedOut()
      return Promise.resolve()
    }
    return this.track(this.loadPage(1, true))
  }

  /**
   * Append the next page when the server reports one.
   * @returns a promise settling when the append finishes; a no-op otherwise.
   */
  async loadMore(): Promise<void> {
    if (this.disposed || this.inflight !== undefined) return
    if (this.current.status !== 'ready' || !this.current.hasMore) return
    await this.track(this.loadPage(this.page + 1, false))
  }

  /**
   * Mark one notification consumed: publish the optimistic state, then write
   * it; a refused write reconciles on the next read.
   * @param id - server notification id.
   */
  async acknowledge(id: string): Promise<void> {
    if (this.disposed) return
    const item = this.current.items.find(entry => entry.id === id)
    if (item === undefined || item.read) return
    const items = this.current.items.map(entry => entry.id === id ? { ...entry, read: true } : entry)
    this.publish({ ...this.current, items, unreadCount: countUnread(items) })
    try {
      await this.readTransport().acknowledge(id)
    } catch (error) {
      if (this.isDisposed()) return
      const failure = classifyMessageFailure(error)
      if (failure === 'unauthorized') {
        this.publishSignedOut()
        return
      }
      this.publish({ ...this.current, failure })
    }
  }

  /**
   * Raise the in-app sign-in surface and re-read once a session exists.
   * @returns a promise settling when the sign-in answer (and the follow-up read) finishes.
   */
  async signIn(): Promise<void> {
    const iam = this.options.iam
    if (iam?.requestSignInInPlace === undefined || this.isDisposed()) return
    const signedIn = await iam.requestSignInInPlace()
    if (signedIn && !this.isDisposed()) await this.refresh()
  }

  /**
   * @param page - page to load.
   * @param replace - whether this page replaces the loaded set.
   */
  private async loadPage(page: number, replace: boolean): Promise<void> {
    const previous = this.current
    this.publish(replace && previous.items.length === 0
      ? { ...previous, status: 'loading', failure: null }
      : { ...previous, failure: null })
    try {
      const payload = await this.readTransport().list(page, this.options.pageSize())
      if (this.disposed) return
      const parsed = readMessagePage(payload)
      const items = replace ? parsed.items : [...previous.items, ...parsed.items]
      this.page = page
      this.publish({
        status: 'ready',
        items,
        unreadCount: countUnread(items),
        hasMore: parsed.hasMore,
        failure: null,
      })
    } catch (error) {
      if (this.disposed) return
      const failure = classifyMessageFailure(error)
      if (failure === 'unauthorized') {
        this.publishSignedOut()
        return
      }
      this.publish({
        status: previous.items.length === 0 ? 'error' : 'ready',
        items: previous.items,
        unreadCount: previous.unreadCount,
        hasMore: previous.hasMore,
        failure,
      })
    }
  }

  /**
   * Track one read as the single in-flight operation.
   * @param run - the read to track.
   */
  private track(run: Promise<void>): Promise<void> {
    // Callers hold the single-operation invariant (they only start a read while
    // `inflight` is empty), so the settle below always clears its own read.
    this.inflight = run.finally(() => { this.inflight = undefined })
    return this.inflight
  }

  /** (Re)schedule the badge poll from the current interval setting. */
  private reschedule(): void {
    this.stop()
    const interval = Math.max(1_000, this.options.pollIntervalMs())
    this.timer = setInterval(() => { void this.refresh() }, interval)
  }

  /** Clear the poll timer. */
  private stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  /** @returns the credential pair the next request must send. */
  private credentials(): MessageCenterCredentials {
    const session = this.options.iam?.sessionTokens?.() ?? {}
    const sessionAccess = session.accessToken?.trim() ?? ''
    const staticAccess = this.options.env.accessToken().trim()
    const accessToken = sessionAccess === '' ? staticAccess : sessionAccess
    const authToken = session.authToken?.trim() ?? ''
    return {
      ...(accessToken === '' ? {} : { accessToken }),
      ...(authToken === '' ? {} : { authToken }),
    }
  }

  /** @returns whether any credential can authenticate an app-api request. */
  private hasCredentials(): boolean {
    const credentials = this.credentials()
    return credentials.accessToken !== undefined || credentials.authToken !== undefined
  }

  /** @returns the transport for the active gateway origin. */
  private readTransport(): MessageCenterTransport {
    const baseUrl = this.options.env.apiBaseUrl()
    if (this.transport === undefined || this.transportBaseUrl !== baseUrl) {
      const build = this.options.transportFactory
        ?? ((origin: string, credentials: () => MessageCenterCredentials) =>
          createMessageCenterTransport({ baseUrl: origin, credentials }))
      this.transportBaseUrl = baseUrl
      this.transport = build(baseUrl, () => this.credentials())
    }
    return this.transport
  }

  /** Publish the signed-out state and clear the badge. */
  private publishSignedOut(): void {
    this.publish({ status: 'signed-out', items: NO_ITEMS, unreadCount: 0, hasMore: false, failure: null })
  }

  /**
   * Publish a snapshot when it differs from the current one.
   * @param next - the next snapshot.
   */
  private publish(next: MessageCenterSnapshot): void {
    if (sameSnapshot(this.current, next)) return
    this.current = next
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        // A subscriber must not break the badge every other surface reads.
        console.error('ui-sdkwork-message-center: snapshot listener failed', error)
      }
    }
  }
}

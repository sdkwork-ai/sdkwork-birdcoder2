/**
 * The `ctx.im` service: loads the SDKWork IM embed bundle the deployment serves
 * and mounts one of its surfaces into a host container.
 *
 * The IM product UI, its transport, and its styles stay inside that bundle, so
 * the BirdCoder client compiles no IM sources and declares no IM dependencies.
 * This service owns only the host facts the bundle cannot read itself — the
 * gateway origin, the IAM session, the frame's language — plus the frame-level
 * consequences of IM events (unread total, opening a conversation in the chat
 * mode).
 */
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { IamService } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'

/** Failure surfaces the host pages translate into their own copy. */
export type ImErrorCode = 'unconfigured' | 'load-failed' | 'mount-failed' | 'init-failed'

/** The IM surface a host page mounts. */
export type ImSurfaceKind = 'conversation-list' | 'conversation' | 'contacts'

/** Mount progress reported back to the page that owns the container. */
export interface ImMountStatus {
  /** Loading while the embed bundle downloads, ready after the surface mounts. */
  phase: 'loading' | 'ready' | 'error'
  /** Failure code when `phase` is `error`. */
  error: ImErrorCode | null
}

/** One transient failure the pages surface as a toast. */
export interface ImNotice {
  /** Increments per failure so the same code can notify again later. */
  id: number
  /** Failure code the notice describes. */
  code: ImErrorCode
}

/** Observable IM facts the rail entry and pages read. */
export interface ImSnapshot {
  /** Conversation the chat page currently shows. */
  selectedConversationId: string | null
  /** Unread messages across the inbox, as reported by the mounted surface. */
  totalUnread: number
  /** Last failure, when a surface could not be loaded or mounted. */
  error: ImErrorCode | null
  /** Latest transient failure to announce; the UI keeps rendering underneath. */
  notice: ImNotice | null
}

/** Host facts and callbacks for one mounted surface. */
export interface ImSurfaceMountRequest {
  /** Which surface to mount. */
  kind: ImSurfaceKind
  /** Conversation the conversation surface renders. */
  conversationId?: string
  /** Conversation the list marks as selected. */
  selectedConversationId?: string
  /** Called when the user selects a conversation in the list. */
  onConversationSelect?: (conversationId: string) => void
  /** Called when the user asks to open a conversation from the contacts surface. */
  onConversationOpen?: (conversationId: string) => void
  /** Reports load and mount progress. */
  onStatus?: (status: ImMountStatus) => void
}

/** Session envelope handed to the embed bundle. */
interface ImEmbedSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
  sessionId?: string
  user?: unknown
  context?: unknown
}

/** Options the embed bundle's `mountSurface` accepts. */
interface ImEmbedMountOptions extends ImSurfaceMountRequest {
  apiBaseUrl: string
  session: ImEmbedSession | null
  colorScheme?: 'light' | 'dark'
  locale?: 'zh-CN' | 'en-US'
  onUnreadChange?: (totalUnread: number) => void
  /** Reports a degraded runtime the bundle still mounted. */
  onError?: (error: unknown) => void
}

/** Handle the embed bundle returns for one mounted surface. */
interface ImEmbedSurfaceHandle {
  update(options: ImEmbedMountOptions): void
  unmount(): void
}

/** Public surface of the embed bundle. */
interface ImEmbedModule {
  /** Host contract version; must equal {@link EMBED_CONTRACT_VERSION}. */
  version: number
  mountSurface(container: HTMLElement, options: ImEmbedMountOptions): ImEmbedSurfaceHandle
}

/**
 * Host contract version this client understands. The embed bundle is deployed
 * and upgraded independently from BirdCoder, so the two sides state the
 * contract they implement instead of assuming they match.
 */
const EMBED_CONTRACT_VERSION = 1

/** Schemes a deployment may serve the embed bundle from. */
function isEmbedScheme(protocol: string): boolean {
  return protocol === 'http:'
    || protocol === 'https:'
    || protocol === 'app:'
    || /^[a-z][a-z0-9+.-]*-app:$/u.test(protocol)
}

/**
 * Resolve and validate the deployment-provided embed URL.
 *
 * The URL identifies executable code that runs with the BirdCoder page's
 * privileges, so only HTTP(S) and application origins are accepted; a
 * root-relative path resolves against the page (the same-origin deployment
 * route), and credentials in the URL are rejected because they would leak
 * through logs and cache keys.
 * @param raw - configured embed URL.
 * @param base - page base URL used to resolve a relative path.
 * @returns the absolute URL to load.
 */
export function resolveEmbedUrl(raw: string, base: string = document.baseURI): string {
  let url: URL
  try {
    url = new URL(raw, base)
  } catch {
    throw new Error(`SDKWork IM embed URL is not a valid URL: ${raw}`)
  }
  if (!isEmbedScheme(url.protocol)) {
    throw new Error(`SDKWork IM embed URL must use http(s) or an application origin; received ${raw}`)
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('SDKWork IM embed URL must not carry credentials')
  }
  return url.href
}

/**
 * Validate the value a script published as the embed module.
 * @param value - candidate global value.
 * @returns the module when it exposes the expected contract version and mount API.
 * @throws {Error} when the value is not a compatible embed module.
 */
function validateEmbedModule(value: unknown): ImEmbedModule {
  if (
    typeof value !== 'object'
    || value === null
    || typeof (value as { mountSurface?: unknown }).mountSurface !== 'function'
  ) {
    throw new Error('SDKWork IM embed bundle did not publish its mount API.')
  }
  const version = (value as { version?: unknown }).version
  // The initial bundle API predates the version field; absence therefore means
  // contract version 1. An explicit other version is a genuine mismatch.
  if (version !== undefined && version !== EMBED_CONTRACT_VERSION) {
    throw new Error(
      `SDKWork IM embed bundle publishes host contract version ${String(version)}; `
      + `this client requires ${String(EMBED_CONTRACT_VERSION)}. Rebuild and redeploy the embed bundle.`,
    )
  }
  return value as ImEmbedModule
}

/** Name the embed bundle publishes on the host page. */
const EMBED_GLOBAL = 'SdkworkImEmbed'

/** One inbox change listener. */
type Listener = () => void

const INITIAL_SNAPSHOT: ImSnapshot = { selectedConversationId: null, totalUnread: 0, error: null, notice: null }

/** Cached embed bundle loader state, one bundle per page. */
let embedModule: ImEmbedModule | null = null
let embedModuleUrl = ''
let embedModulePromise: Promise<ImEmbedModule> | null = null

/**
 * Read the embed module from the page global, when a compatible script already
 * published it. An incompatible global is treated as absent so a newly loaded
 * script gets a chance to replace it.
 * @returns the module, or undefined before a compatible script runs.
 */
function readEmbedGlobal(): ImEmbedModule | undefined {
  const candidate = (globalThis as Record<string, unknown>)[EMBED_GLOBAL]
  try {
    return validateEmbedModule(candidate)
  } catch {
    return undefined
  }
}

/**
 * Load the embed bundle once per URL through a script tag.
 *
 * A script tag (rather than a dynamic import) keeps the load working inside the
 * client-module closure factory, which has no importing context of its own.
 * @param url absolute URL of the bundle.
 * @returns the loaded module.
 */
function loadEmbedModule(url: string): Promise<ImEmbedModule> {
  if (embedModule !== null && embedModuleUrl === url) {
    return Promise.resolve(embedModule)
  }
  /* v8 ignore next 3 -- concurrent mounts race for one in-flight script; the pages
     mount sequentially, so this arm has no deterministic fixture. */
  if (embedModulePromise !== null && embedModuleUrl === url) {
    return embedModulePromise
  }
  embedModuleUrl = url
  embedModulePromise = new Promise<ImEmbedModule>((resolve, reject) => {
    const existing = readEmbedGlobal()
    if (existing !== undefined) {
      embedModule = existing
      resolve(existing)
      return
    }
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onload = () => {
      try {
        const loaded = validateEmbedModule((globalThis as Record<string, unknown>)[EMBED_GLOBAL])
        embedModule = loaded
        resolve(loaded)
      } catch (error) {
        embedModulePromise = null
        reject(error)
      }
    }
    script.onerror = () => {
      embedModulePromise = null
      reject(new Error(`SDKWork IM embed bundle failed to load from ${url}.`))
    }
    document.head.appendChild(script)
  })
  return embedModulePromise
}

/**
 * Read the IAM session as the IM embed session envelope.
 * @param iam - the BirdCoder IAM service.
 * @returns the session, or null when signed out.
 */
function readEmbedSession(iam: IamService): ImEmbedSession | null {
  const session = iam.controller.getState().session
  if (session === null) {
    return null
  }
  const accessToken = session.accessToken?.trim()
  const authToken = session.authToken?.trim()
  if (!accessToken || !authToken) {
    return null
  }
  return {
    accessToken,
    authToken,
    ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
    ...(session.sessionId ? { sessionId: session.sessionId } : {}),
    ...(session.context ? { context: session.context } : {}),
    ...(session.user ? { user: session.user } : {}),
  }
}

/** Handle a page keeps for one mounted surface. */
export interface ImSurfaceHandle {
  /** Re-render the surface with new selection or callbacks. */
  update(request: ImSurfaceMountRequest): void
  /** Unmount the surface; safe to call before the bundle finishes loading. */
  dispose(): void
}

/**
 * Map a bundle initialization failure to a page-level code.
 * @param error - error the bundle reported.
 * @returns the code the pages translate.
 */
function embedErrorCode(error: unknown): ImErrorCode {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
  switch (code) {
    case 'im-embed-invalid-api-base-url':
      return 'unconfigured'
    case 'im-embed-invalid-websocket-base-url':
    case 'im-embed-invalid-session':
      return 'mount-failed'
    default:
      return 'init-failed'
  }
}

/** Host adapter over the deployed SDKWork IM embed bundle. */
export class ImService {
  private readonly listeners = new Set<Listener>()
  private snapshot: ImSnapshot = INITIAL_SNAPSHOT
  private noticeSeq = 0
  private offEnvironment: (() => void) | null = null
  private offSession: (() => void) | null = null

  /**
   * @param environment - active BirdCoder deployment environment (gateway + embed URL).
   * @param iam - BirdCoder IAM session provider.
   * @param layout - frame navigation, used to open the chat page from elsewhere.
   * @param locale - frame language, forwarded to the embed bundle.
   */
  constructor(
    private readonly environment: EnvService,
    private readonly iam: IamService,
    private readonly layout: ILayout,
    private readonly locale: LocaleRuntime,
  ) {}

  /**
   * Follow the environment and session so a stale failure clears when either moves.
   * @returns the disposer for those subscriptions.
   */
  start(): () => void {
    this.offEnvironment = this.environment.subscribe(() => { this.patch({ error: null }) })
    this.offSession = this.iam.controller.subscribe(() => { this.patch({ totalUnread: 0 }) })
    return () => {
      this.offEnvironment?.()
      this.offSession?.()
      this.offEnvironment = null
      this.offSession = null
    }
  }

  /** @returns the current IM snapshot (stable between changes). */
  getSnapshot = (): ImSnapshot => this.snapshot

  /**
   * Observe snapshot changes.
   * @param listener - called after each published change.
   * @returns the unsubscribe function.
   */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Select the conversation the chat page shows.
   * @param conversationId - conversation id, or null to clear the selection.
   */
  selectConversation(conversationId: string | null): void {
    this.patch({ selectedConversationId: conversationId })
  }

  /**
   * Open a conversation and switch the frame to the chat page.
   * @param conversationId - conversation to show.
   */
  openConversation(conversationId: string): void {
    this.patch({ selectedConversationId: conversationId })
    this.layout.setMode('chat')
  }

  /**
   * Mount one IM surface into a host container.
   *
   * Reports `loading` synchronously, then `ready` or `error` through
   * {@link ImSurfaceMountRequest.onStatus}. The returned handle is safe to use
   * before the bundle finishes loading: an early `dispose` cancels the mount,
   * and an early `update` replaces the options the surface mounts with.
   * @param container - host element the surface fills.
   * @param request - surface kind, selection, and callbacks.
   * @returns the handle that updates or unmounts the surface.
   */
  mountSurface(container: HTMLElement, request: ImSurfaceMountRequest): ImSurfaceHandle {
    let currentRequest = request
    let disposed = false
    let handle: ImEmbedSurfaceHandle | null = null
    let mountOptions: ImEmbedMountOptions | null = null

    const announce = (code: ImErrorCode): void => {
      this.noticeSeq += 1
      this.patch({ error: code, notice: { id: this.noticeSeq, code } })
    }

    const fail = (code: ImErrorCode): void => {
      announce(code)
      currentRequest.onStatus?.({ phase: 'error', error: code })
    }

    const configuredUrl = this.environment.profile().imEmbedUrl.trim()
    if (configuredUrl === '') {
      // A missing deployment URL is a configuration state, not a runtime
      // failure: the page keeps its product shell and the toast names the gap.
      console.warn(
        `ui-sdkwork-im: the ${this.environment.currentEnvironment()} environment profile has no imEmbedUrl; `
        + 'set SDKWORK_IM_EMBED_URL (or the settings document field) to the deployed embed bundle.',
      )
      fail('unconfigured')
      return { update: () => {}, dispose: () => { disposed = true } }
    }
    let url: string
    try {
      url = resolveEmbedUrl(configuredUrl)
    } catch (error) {
      console.warn(
        `ui-sdkwork-im: ignoring the configured imEmbedUrl ("${configuredUrl}") because it is not a trusted `
        + 'http(s) or application URL.',
        error,
      )
      fail('unconfigured')
      return { update: () => {}, dispose: () => { disposed = true } }
    }

    // The gateway this page must call: the profile's IM gateway for the active
    // environment, in every carrier. The desktop shell is a registered
    // first-party CORS origin, so its pages reach the gateway directly and the
    // bundle derives its own realtime origin from the same base.
    // A missing gateway keeps the surface mounted with a same-origin base: the
    // product shell stays visible and the SDK failure is announced as a notice.
    const apiBaseUrl = this.environment.imApiBaseUrl().trim()
    if (apiBaseUrl === '') {
      console.warn(
        `ui-sdkwork-im: the ${this.environment.currentEnvironment()} environment profile has no imApiBaseUrl or `
        + 'apiBaseUrl, so the IM SDK cannot resolve its gateway; set SDKWORK_IM_API_BASE_URL for this profile.',
      )
      announce('unconfigured')
    }

    const session = readEmbedSession(this.iam)
    if (session === null) {
      console.warn('ui-sdkwork-im: the IAM session carries no dual tokens, so the IM SDK cannot authenticate.')
      announce('mount-failed')
    }

    const buildOptions = (next: ImSurfaceMountRequest): ImEmbedMountOptions => ({
      ...next,
      apiBaseUrl,
      session,
      locale: this.locale.getSnapshot().active === 'en' ? 'en-US' : 'zh-CN',
      onUnreadChange: (totalUnread: number) => { this.patch({ totalUnread }) },
      onError: (error: unknown) => {
        const code = embedErrorCode(error)
        console.error(`ui-sdkwork-im: the IM runtime reported a degraded connection against ${apiBaseUrl}.`, error)
        announce(code)
      },
    })

    currentRequest.onStatus?.({ phase: 'loading', error: null })
    mountOptions = buildOptions(currentRequest)

    void loadEmbedModule(url)
      .then((module) => {
        if (disposed || mountOptions === null) {
          return
        }
        try {
          handle = module.mountSurface(container, mountOptions)
        } catch (error) {
          // The bundle contains its own crash fallback, so a throw here is a
          // programming failure; announce it and keep the page shell visible.
          console.error(
            `ui-sdkwork-im: the IM surface could not mount against ${apiBaseUrl} (bundle ${url}).`,
            error,
          )
          fail('init-failed')
          return
        }
        currentRequest.onStatus?.({ phase: 'ready', error: null })
      })
      .catch((error: unknown) => {
        if (disposed) {
          return
        }
        console.error(`ui-sdkwork-im: the IM embed bundle failed to load from ${url}.`, error)
        fail('load-failed')
      })

    return {
      update: (next: ImSurfaceMountRequest): void => {
        currentRequest = next
        mountOptions = buildOptions(next)
        handle?.update(mountOptions)
      },
      dispose: (): void => {
        disposed = true
        handle?.unmount()
        handle = null
      },
    }
  }

  /**
   * Publish a partial snapshot when it changes.
   * @param partial - fields to merge into the current snapshot.
   */
  private patch(partial: Partial<ImSnapshot>): void {
    const next = { ...this.snapshot, ...partial }
    if (
      next.selectedConversationId === this.snapshot.selectedConversationId
      && next.totalUnread === this.snapshot.totalUnread
      && next.error === this.snapshot.error
      && next.notice?.id === this.snapshot.notice?.id
    ) {
      return
    }
    this.snapshot = next
    for (const listener of this.listeners) {
      listener()
    }
  }
}

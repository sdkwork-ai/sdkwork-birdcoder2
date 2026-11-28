/**
 * BirdCoder host adapter for the SDKWork App Store market pages.
 *
 * The adapter maps the shared ui-sdkwork-env, ui-sdkwork-iam, and locale services to
 * the embeddable `AppstoreMarketsSurface` inputs. Environment changes remount
 * the App Store runtime; IAM and locale changes propagate through host props.
 *
 * Every cloud catalog reads the SDKWork app-api, and an app-api call needs the
 * application Access-Token the environment provides — the generated app SDK
 * cannot dispatch without one. The adapter therefore owns the sign-in face both
 * ends of that edge need: the snapshot says whether the surface holds
 * credentials ({@link MarketsHostRenderSnapshot.authenticated}), and the runtime
 * hands the surface's sign-in gesture back to this application's own login entry
 * ({@link MarketsHostRuntime.requestSignIn}).
 */
import { createElement, Fragment, useState, useSyncExternalStore, type FC, type ReactNode } from 'react'
import type { HostObservable, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { SdkworkHostThemeSurface, type HostThemeBridge } from './sdkworkHostThemeSurface.tsx'
import { MarketsAuthSurface } from './MarketsAuthSurface.tsx'
import { MarketsEmptySurface } from './MarketsEmptySurface.tsx'
import '../../../../../../sdkwork-appstore/apps/sdkwork-appstore-pc/src/index.css'
import {
  AppstoreMarketsSurface,
  type AppstoreMarketsPage,
  type AppstoreMarketsSurfaceProps,
  type AppstoreMarketsSurfaceSession,
} from '@sdkwork/appstore-pc-embed'
import { getSdkworkGlobalTokenManager } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import type { PluginArtifactSource, PluginRecord, SdkworkPluginsAppClient } from '@sdkwork/plugins-app-sdk'
import { createPluginsAppClient } from '@sdkwork/plugins-app-sdk'
import { MarketplacePage, type MarketplaceInstallationState } from '@sdkwork/plugins-pc-marketplace'
import type { SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk'
import { createDriveAppClient } from '@sdkwork/drive-app-sdk'
import type { SdkworkSkillsAppClient } from '@sdkwork/skills-app-sdk'
import { createSkillsAppClient } from '@sdkwork/skills-app-sdk'
import { syncSdkworkGlobalTokenManager } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import { parsePluginSource, pluginSourceSpec, parsePluginSourceSpec } from '@deepseek-ai/dsh-plugin-manager/source'
import type { PluginStore } from './pluginStore.ts'
import type { MarketsKey } from './locales.ts'
import { SkillsCatalogPage, type SkillsCatalogActions } from './SkillsCatalogPage.tsx'
import {
  ExpertsCatalogPage,
  type ExpertRecord,
  type ExpertsCatalogActions,
  type ExpertTeamRecord,
} from './ExpertsCatalogPage.tsx'
import {
  catalogPackageName, catalogVersion, findInstallation, installTargetOf,
  type MarketplaceInstallation,
} from './pluginInstallation.ts'
import css from './MarketsPage.module.css'

/* jscpd:ignore-start -- the SDKWork host adapter is one deliberate template
   shared with ui-sdkwork-appstore's appstoreHost.ts and the other SDKWork
   surface packages: cross-package value imports are forbidden by the
   client-bundle purity gate, so each SDKWork surface package owns a copy of
   the session/port adaptation. */
/** Session data supplied to the SDKWork App Store runtime. */
export type MarketsHostSessionSnapshot = AppstoreMarketsSurfaceSession

/** Environment values consumed by the SDKWork host adapter. */
export interface MarketsHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal IAM controller state consumed by the adapter. */
export interface MarketsHostIam {
  controller: {
    /** @returns the current session, when authenticated. */
    getState(): { session: MarketsHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/**
 * This application's sign-in entry, as the market catalogs' gate needs it: one
 * call that raises the product login surface the settings menu uses, modal or
 * full page per its presentation setting, so no market surface grows a second
 * login form.
 */
export interface MarketsHostSignIn {
  /** Open this application's own sign-in surface. */
  openSignIn(): void
}

/** The complete IAM face the market host adapter reads. */
export type MarketsHostIamFace = MarketsHostIam & MarketsHostSignIn

/** Minimal locale runtime consumed by the adapter. */
export interface MarketsHostLocale {
  /** @returns the active BirdCoder locale id. */
  getSnapshot(): { active: string }
  /** Observe active-locale changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal theme runtime consumed by the adapter. */
export interface MarketsHostTheme {
  /** @returns the resolved host color scheme for the embedded market page. */
  getColorScheme(): 'light' | 'dark'
  /** Observe resolved color-scheme changes. */
  subscribe(listener: () => void): () => void
}

/** IAM session fields accepted by the SDKWork App Store session bridge. */
export interface MarketsHostSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
  sessionId?: string
  user?: unknown
  /** Signed-in identity context the host derives the remount key from. */
  context?: {
    tenantId?: string
    userId?: string
    organizationId?: string | null
    sessionId?: string
    appId?: string
    environment?: string
    deploymentMode?: string
    authLevel?: string
    dataScope?: string[]
    permissionScope?: string[]
    actorId?: string
    actorKind?: string
    deviceId?: string
  }
}

/** Dependencies used to configure the SDKWork surface. */
export interface ConfigureMarketsHostOptions {
  env: MarketsHostEnvironment
  /** The IAM controller plus the sign-in entry the catalogs' gate raises. */
  iam: MarketsHostIamFace
  locale: MarketsHostLocale
  theme: MarketsHostTheme
}

function readHostUserId(session: MarketsHostSession | null | undefined): string | undefined {
  if (typeof session?.user !== 'object' || session.user === null || !('id' in session.user)) return undefined
  return typeof session.user.id === 'string' ? session.user.id.trim() : undefined
}

function stableJson(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value)
}

function hostSessionsEqual(
  left: MarketsHostSessionSnapshot | null,
  right: MarketsHostSessionSnapshot | null,
): boolean {
  if (left === right) return true
  if (left === null || right === null) return false
  return left.accessToken === right.accessToken
    && left.authToken === right.authToken
    && left.refreshToken === right.refreshToken
    && left.sessionId === right.sessionId
    && stableJson(left.user) === stableJson(right.user)
}

/**
 * @param session - current host IAM session, or null when signed out.
 * @returns the signed-in identity (`tenant:user`), or an empty string when the
 * session names neither a tenant nor a user.
 */
function hostIdentityKey(session: MarketsHostSession | null | undefined): string {
  const tenantId = session?.context?.tenantId?.trim() ?? ''
  const userId = (session?.context?.userId ?? readHostUserId(session) ?? '').trim()
  return tenantId === '' || userId === '' ? '' : `${tenantId}:${userId}`
}

/** Snapshot consumed by the embedded market page renderer. */
export interface MarketsHostRenderSnapshot {
  environmentRevision: number
  /** Signed-in identity the surface was mounted for; an account switch remounts it. */
  identityKey: string
  apiBaseUrl: string
  accessToken: string
  locale: string
  /**
   * The application's resolved light/dark scheme. Embedded surfaces are separate
   * documents, so this is what makes a framed panel follow the running theme
   * instead of the operating system's preference.
   */
  colorScheme: 'light' | 'dark'
  session: MarketsHostSessionSnapshot | null
  /**
   * Whether the embedded surface holds credentials to call app-api: an IAM
   * session or the environment's static access token. False means the
   * generated app SDK has no application credential to dispatch an app-api
   * call with, so the surface renders its sign-in face instead of a catalog
   * that cannot load.
   */
  authenticated: boolean
}

/** SDKWork app client and install callback bound to the active host account. */
export interface PluginsMarketplaceHost {
  readonly client: Pick<SdkworkPluginsAppClient, 'plugins'>
  readonly canInstall: boolean
  install(plugin: PluginRecord, store: PluginStore): Promise<void>
  /** Install the catalog version over the installed one. */
  update(plugin: PluginRecord, installation: MarketplaceInstallation, store: PluginStore): Promise<void>
  /** Uninstall the profile dependency this catalog record installed. */
  remove(plugin: PluginRecord, installation: MarketplaceInstallation, store: PluginStore): Promise<void>
}

/** Why a catalog record cannot be installed from this surface, as a locale key. */
export type MarketInstallProblem = 'no-target'

/** A refused install whose cause the surface can word in its own language. */
export class MarketInstallError extends Error {
  constructor(readonly problem: MarketInstallProblem, detail?: string) {
    super(detail ?? problem)
    this.name = 'MarketInstallError'
  }
}

/**
 * A Host mutation that succeeded but whose catalog record could not be
 * persisted. The local operation already happened, so this is reported apart
 * from a failed mutation and never changes the Host result.
 */
export class MarketSyncError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'MarketSyncError'
  }
}

/**
 * Stable identifier for the Host a catalog mutation came from. The IAM
 * context's device id is the installation identity; a browser session without
 * one falls back to the signed-in `tenant:user`, so the same person on the
 * same build keeps one installation history.
 * @param session - current host IAM session, or null when none exists.
 * @returns a 1–128 character Host id accepted by the Plugins API.
 */
export function marketHostId(session: MarketsHostSession | null | undefined): string {
  const deviceId = session?.context?.deviceId?.trim()
  if (deviceId !== undefined && deviceId !== '' && deviceId.length <= 128) return deviceId
  const identity = hostIdentityKey(session)
  return identity === '' ? 'web-anonymous' : `web-${identity}`
}

/** The source metadata imported from the dsh-market catalog. */
interface DshMarketMetadata {
  readonly provider?: unknown
  readonly catalogUrl?: unknown
  readonly pageUrl?: unknown
  readonly url?: unknown
  readonly npmPackage?: unknown
  readonly tarballUrl?: unknown
  readonly repositoryUrl?: unknown
  readonly repositoryPath?: unknown
  readonly repositoryRef?: unknown
  readonly npm?: unknown
  readonly tarball?: unknown
  readonly git?: unknown
  readonly version?: unknown
  readonly releaseManifest?: unknown
}

/** A PluginRecord with the optional marketplace projection added by SDKWork. */
type MarketplacePluginRecord = PluginRecord & { marketplaceMetadata?: unknown }

const NPM_PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9._~-]*\/)?[a-z0-9-~][a-z0-9._~-]*$/iu
const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u

function dshMarketMetadata(plugin: PluginRecord): DshMarketMetadata | undefined {
  const value = (plugin as MarketplacePluginRecord).marketplaceMetadata
  if (typeof value !== 'object' || value === null) return undefined
  const metadata = value as DshMarketMetadata
  return metadata.provider === 'dsh-market' ? metadata : undefined
}

function githubSourceFromCatalogUrl(value: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com'
    || parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') return undefined
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 2) return undefined
  const repository = `https://github.com/${parts[0]}/${parts[1]}`
  if (parts.length === 2) return repository
  if (parts[2] !== 'tree' || parts.length < 4) return undefined
  const ref = parts[3]
  const directory = parts.slice(4).join('/')
  if (directory === '') return `${repository}#${ref}`
  return `${repository}#${ref}&path:/${directory}`
}

function githubReleaseArchiveBelongsToRepository(archive: string, repository: unknown): boolean {
  if (typeof repository !== 'string') return false
  try {
    const archiveUrl = new URL(archive)
    const repositoryUrl = new URL(repository)
    if (archiveUrl.protocol !== 'https:' || repositoryUrl.protocol !== 'https:') return false
    if (archiveUrl.hostname.toLowerCase() !== 'github.com' || repositoryUrl.hostname.toLowerCase() !== 'github.com') return false
    const repositoryPath = repositoryUrl.pathname.replace(/\.git$/iu, '').replace(/\/$/u, '')
    return archiveUrl.pathname.startsWith(`${repositoryPath}/releases/`)
  } catch {
    return false
  }
}

/**
 * Map an imported dsh-market entry to the one source vocabulary accepted by
 * the Harness plugin manager. The catalog's `install` text is intentionally
 * ignored because it is display data rather than a trusted target.
 *
 * @param plugin - SDKWork catalog record carrying marketplace metadata.
 * @returns a validated Harness install spec, or undefined when no supported
 * source was imported.
 */
export function marketplaceInstallSpec(plugin: PluginRecord): string | undefined {
  const metadata = dshMarketMetadata(plugin)
  if (metadata === undefined) return undefined

  const npmPackage = typeof metadata.npmPackage === 'string' ? metadata.npmPackage : metadata.npm
  if (typeof npmPackage === 'string' && NPM_PACKAGE_NAME.test(npmPackage)) {
    const version = typeof metadata.version === 'string' && RELEASE_VERSION.test(metadata.version)
      ? metadata.version
      : undefined
    return `${npmPackage}${version === undefined ? '' : `@${version}`}`
  }

  const releaseManifest = typeof metadata.releaseManifest === 'object' && metadata.releaseManifest !== null
    ? metadata.releaseManifest as { tarball?: unknown }
    : undefined
  const tarball = typeof metadata.tarballUrl === 'string' ? metadata.tarballUrl : metadata.tarball
  const archive = typeof tarball === 'string' && tarball.trim() !== ''
    ? tarball
    : typeof releaseManifest?.tarball === 'string' && releaseManifest.tarball.trim() !== ''
      ? releaseManifest.tarball
      : undefined
  if (archive !== undefined && githubReleaseArchiveBelongsToRepository(archive, metadata.repositoryUrl)) {
    try {
      return pluginSourceSpec(parsePluginSource({ kind: 'archive', url: archive }))
    } catch {
      // A malformed optional release asset must not hide a valid repository
      // target. Continue with the same source precedence used by the catalog
      // importer and let the Harness inspector validate the repository.
    }
  }

  const repositoryUrl = typeof metadata.repositoryUrl === 'string' ? metadata.repositoryUrl : metadata.git
  const repositoryPath = typeof metadata.repositoryPath === 'string' && metadata.repositoryPath !== '.'
    ? metadata.repositoryPath
    : undefined
  const repositoryRef = typeof metadata.repositoryRef === 'string' && metadata.repositoryRef.trim() !== ''
    ? metadata.repositoryRef.trim()
    : undefined
  const git = typeof repositoryUrl === 'string' && repositoryUrl.trim() !== ''
    ? repositoryUrl.replace(/^git\+/iu, '')
    : typeof metadata.url === 'string'
      ? githubSourceFromCatalogUrl(metadata.url)
      : typeof metadata.catalogUrl === 'string'
        ? githubSourceFromCatalogUrl(metadata.catalogUrl)
        : typeof metadata.pageUrl === 'string' ? githubSourceFromCatalogUrl(metadata.pageUrl) : undefined
  if (git === undefined) return undefined
  const separator = git.indexOf('#')
  const url = separator === -1 ? git : git.slice(0, separator)
  const fragment = separator === -1 ? '' : git.slice(separator + 1)
  const [fragmentRef, path] = fragment.split('&path:/')
  const ref = fragmentRef === '' ? repositoryRef ?? '' : fragmentRef
  try {
    return pluginSourceSpec(parsePluginSource({
      kind: 'git',
      url,
      ...(ref === '' ? {} : { ref }),
      ...(path === undefined || path === '' ? repositoryPath === undefined ? {} : { directory: repositoryPath } : { directory: path }),
    }))
  } catch {
    return undefined
  }
}

/**
 * Resolve a GitHub ref to the commit that dsh-market pins before installing.
 *
 * The pinned spec keeps the source's own directory: re-deriving it from
 * catalog metadata used to drop a curated subdirectory and install the
 * repository root instead. An unreachable API leaves the spec unpinned rather
 * than refusing a target the Host can fetch itself.
 *
 * @param plugin - SDKWork catalog record carrying marketplace metadata.
 * @param spec - the install spec the catalog resolved.
 * @returns the pinned spec when a commit could be read, else the spec unchanged.
 */
export async function pinMarketplaceGitSpec(plugin: PluginRecord, spec: string): Promise<string> {
  let source
  try {
    source = parsePluginSourceSpec(spec)
  } catch {
    return spec
  }
  if (source?.kind !== 'git') return spec
  let parsed: URL
  try { parsed = new URL(source.url) } catch { return spec }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') return spec
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 2) return spec
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/iu, '')
  const ref = source.ref ?? 'HEAD'
  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`,
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BirdCoder-plugin-market' } },
    )
    if (!response.ok) return spec
    const payload: unknown = await response.json()
    const sha = typeof payload === 'object' && payload !== null && 'sha' in payload
      ? (payload as { sha?: unknown }).sha
      : undefined
    if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/iu.test(sha)) return spec
    return pluginSourceSpec({
      kind: 'git',
      url: source.url,
      ref: sha,
      ...(source.directory === undefined ? {} : { directory: source.directory }),
    })
  } catch {
    return spec
  }
}

/**
 * Convert the host IAM state into SDKWork's session format.
 * The host forwards credentials only; the embedded surface derives identity
 * from JWT claims and lets session tokens supersede env bootstrap.
 * @param session - current host IAM session, or null when signed out.
 * @param staticAccessToken - ui-sdkwork-env access token used by non-interactive deployments.
 * @returns a credential snapshot, or null when no tokens are available.
 */
export function toMarketsSession(
  session: MarketsHostSession | null,
  staticAccessToken: string,
): MarketsHostSessionSnapshot | null {
  const staticToken = staticAccessToken.trim()
  const iamAccessToken = session?.accessToken?.trim()
  const authToken = session?.authToken?.trim()
  const refreshToken = session?.refreshToken?.trim()
  const accessToken = iamAccessToken || staticToken
  if (!accessToken && !authToken && !refreshToken) return null

  const userId = readHostUserId(session)
  const user = userId === undefined
    ? session?.user
    : (typeof session?.user === 'object' && session.user !== null && 'id' in session.user
      ? session.user
      : { id: userId })

  return {
    ...(authToken ? { authToken } : {}),
    ...(accessToken ? { accessToken } : {}),
    ...(refreshToken ? { refreshToken } : {}),
    ...(session?.sessionId === undefined ? {} : { sessionId: session.sessionId }),
    ...(user === undefined ? {} : { user }),
  }
}

/** Stable callbacks and live data supplied to the Markets page. */
export interface MarketsHostAdapter {
  /** Host environment, identity, locale, and authentication snapshot. */
  readonly hooks: { readonly hostSnapshot: HostObservable<MarketsHostRenderSnapshot> }
  /** Skills API calls; the SDK client is created only when a call runs. */
  readonly skillsCatalog: SkillsCatalogActions
  /** Open the application's own sign-in surface from a catalog's gate. */
  requestSignIn(): void
  /** Dispose environment, IAM, and locale subscriptions. */
  dispose(): void
}

/** Observable host-adapter operations used by focused integration tests. */
export interface MarketsHostRuntime extends MarketsHostAdapter {
  /** Start environment and IAM subscriptions. */
  start(): () => void
  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void
  /** @returns the revision used to remount after an environment switch. */
  getEnvironmentRevision(): number
  /**
   * @returns the signed-in identity (`tenant:user`) used to remount the surface
   * after an account switch, so the previous account's catalog and drafts are
   * not kept on screen.
   */
  getIdentityKey(): string
  /** @returns the current host session for the SDKWork session store. */
  readHostSession(): MarketsHostSessionSnapshot | null
  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string
  /** @returns the render snapshot for the embedded host component. */
  getHostSnapshot(): MarketsHostRenderSnapshot
  /** @returns the cached Skills SDK client bound to shared IAM credentials. */
  getSkillsCatalogClient(): SdkworkSkillsAppClient
  getPluginsMarketplaceHost(): PluginsMarketplaceHost
}

/** Host adapter implementation and SDKWork host prop owner. */
class MarketsHostRuntimeImpl implements MarketsHostRuntime {
  private readonly listeners = new Set<() => void>()
  private environmentRevision = 0
  private cachedSnapshot: MarketsHostRenderSnapshot | undefined
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private offLocale: (() => void) | undefined
  private offTheme: (() => void) | undefined
  private disposed = false
  private pluginsClient: SdkworkPluginsAppClient | undefined
  private pluginsClientBaseUrl: string | undefined
  private skillsClient: SdkworkSkillsAppClient | undefined
  private skillsClientBaseUrl: string | undefined
  private driveClient: SdkworkDriveAppClient | undefined
  private driveClientBaseUrl: string | undefined

  readonly hooks: MarketsHostAdapter['hooks'] = {
    hostSnapshot: {
      getSnapshot: () => this.getHostSnapshot(),
      subscribe: listener => this.subscribe(listener),
    },
  }

  readonly skillsCatalog: SkillsCatalogActions = {
    listMarketplace: (...args) => this.getSkillsCatalogClient().skills.marketplace.list(...args),
    listCategories: (...args) => this.getSkillsCatalogClient().skills.skillCategories.list(...args),
    listInstallations: (...args) => this.getSkillsCatalogClient().skills.skillInstallations.list(...args),
    listArtifacts: (...args) => this.getSkillsCatalogClient().skills.skillPackages.artifacts.list(...args),
    createInstallation: (...args) => this.getSkillsCatalogClient().skills.skillPackages.installations.create(...args),
    listFeaturedShelves: (...args) => this.getSkillsCatalogClient().skills.featuredShelves.list(...args),
  }

  constructor(private readonly options: ConfigureMarketsHostOptions) {}

  /** Start subscriptions and return the disposer for the plugin effect. */
  start(): () => void {
    this.offEnvironment = this.options.env.subscribe(() => {
      this.environmentRevision += 1
      this.publish()
    })
    this.offIam = this.options.iam.controller.subscribe(() => { this.publish() })
    this.offLocale = this.options.locale.subscribe(() => { this.publish() })
    this.offTheme = this.options.theme.subscribe(() => { this.publish() })
    return () => { this.dispose() }
  }

  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @returns the revision used to remount after an environment switch. */
  getEnvironmentRevision(): number {
    return this.environmentRevision
  }

  /** @returns `tenant:user` of the signed-in host session, or an empty string. */
  getIdentityKey(): string {
    return hostIdentityKey(this.options.iam.controller.getState().session)
  }

  /** @returns the current host session for the SDKWork session store. */
  readHostSession(): MarketsHostSessionSnapshot | null {
    return toMarketsSession(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )
  }

  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string {
    return this.options.locale.getSnapshot().active === 'zh' ? 'zh-CN' : 'en-US'
  }

  /** @returns the render snapshot for the embedded host component. */
  getHostSnapshot(): MarketsHostRenderSnapshot {
    const apiBaseUrl = this.options.env.apiBaseUrl().trim()
    const staticAccessToken = this.options.env.accessToken().trim()
    const iamSession = this.options.iam.controller.getState().session
    const session = this.readHostSession()
    const accessToken = iamSession?.accessToken?.trim() ? '' : staticAccessToken
    const locale = this.resolveHostLanguage()
    const colorScheme = this.options.theme.getColorScheme()
    const identityKey = this.getIdentityKey()
    const cached = this.cachedSnapshot
    if (
      cached !== undefined
      && cached.environmentRevision === this.environmentRevision
      && cached.identityKey === identityKey
      && cached.apiBaseUrl === apiBaseUrl
      && cached.accessToken === accessToken
      && cached.locale === locale
      && cached.colorScheme === colorScheme
      && hostSessionsEqual(cached.session, session)
    ) {
      return cached
    }
    this.cachedSnapshot = {
      environmentRevision: this.environmentRevision,
      identityKey,
      apiBaseUrl,
      accessToken,
      locale,
      colorScheme,
      session,
      authenticated: session !== null,
    }
    return this.cachedSnapshot
  }

  /** Build or reuse the generated Skills client for this host. */
  getSkillsCatalogClient(): SdkworkSkillsAppClient {
    const baseUrl = this.options.env.apiBaseUrl().trim()
    const session = this.options.iam.controller.getState().session
    syncSdkworkGlobalTokenManager(session, this.options.env.accessToken())
    if (baseUrl === '') throw new Error('ui-sdkwork-markets: SDKWork base URL is not configured')
    if (this.skillsClient === undefined || this.skillsClientBaseUrl !== baseUrl) {
      this.skillsClientBaseUrl = baseUrl
      this.skillsClient = createSkillsAppClient({
        baseUrl,
        authMode: 'dual-token',
        tokenManager: getSdkworkGlobalTokenManager(),
      })
    }
    return this.skillsClient
  }

  /** Build or reuse the generated Plugins and Drive clients for this host. */
  getPluginsMarketplaceHost(): PluginsMarketplaceHost {
    const baseUrl = this.options.env.apiBaseUrl().trim()
    const session = this.options.iam.controller.getState().session
    const staticAccessToken = this.options.env.accessToken()
    syncSdkworkGlobalTokenManager(session, staticAccessToken)
    if (baseUrl === '') throw new Error('ui-sdkwork-markets: SDKWork base URL is not configured')
    if (this.pluginsClient === undefined || this.pluginsClientBaseUrl !== baseUrl) {
      this.pluginsClientBaseUrl = baseUrl
      this.pluginsClient = createPluginsAppClient({
        baseUrl,
        authMode: 'dual-token',
        tokenManager: getSdkworkGlobalTokenManager(),
      })
    }
    if (this.driveClient === undefined || this.driveClientBaseUrl !== baseUrl) {
      this.driveClientBaseUrl = baseUrl
      this.driveClient = createDriveAppClient({
        baseUrl,
        authMode: 'dual-token',
        tokenManager: getSdkworkGlobalTokenManager(),
      })
    }
    const client = this.pluginsClient
    const driveClient = this.driveClient
    const canInstall = this.options.iam.controller.getState().session !== null || staticAccessToken.trim() !== ''
    return {
      client,
      canInstall,
      install: async (plugin, store) => {
        if (!canInstall) {
          this.requestSignIn()
          return
        }
        const spec = await this.resolveInstallSpec(plugin, client, driveClient)
        const pinned = await pinMarketplaceGitSpec(plugin, spec)
        store.openInstall(pinned)
        await store.runInstall()
        const settled = store.getSnapshot().install
        if (settled?.phase !== 'done') return
        await store.refresh().catch(() => {})
        const catalogInstallation = this.installedCatalogRecord(plugin, store)
        const target = installTargetOf(plugin)
        const packageName = catalogInstallation?.packageName ?? catalogPackageName(plugin) ?? target?.packageName ?? undefined
        const version = catalogInstallation?.installedVersion ?? catalogVersion(plugin) ?? target?.packageVersion ?? undefined
        await this.syncInstallation(client, 'installed', plugin, {
          ...(packageName === undefined ? {} : { packageName }),
          ...(version === undefined ? {} : { version }),
          installSpec: pinned,
        })
      },
      update: async (plugin, installation, store) => {
        if (!canInstall) {
          this.requestSignIn()
          return
        }
        const version = installation.version
        if (version === undefined) throw new MarketInstallError('no-target', 'the catalog declares no version')
        await store.updatePlugin(installation.packageName, version)
        await store.refresh().catch(() => {})
        const catalogInstallation = this.installedCatalogRecord(plugin, store)
        const installSpec = installTargetOf(plugin)?.spec ?? marketplaceInstallSpec(plugin)
        const installedVersion = catalogInstallation?.installedVersion ?? version
        await this.syncInstallation(client, 'updated', plugin, {
          packageName: installation.packageName,
          ...(installedVersion === undefined ? {} : { version: installedVersion }),
          ...(installSpec === undefined ? {} : { installSpec }),
        })
      },
      remove: async (plugin, installation, store) => {
        if (!canInstall) {
          this.requestSignIn()
          return
        }
        await store.removePlugin(installation.packageName)
        await store.refresh().catch(() => {})
        await this.syncInstallation(client, 'removed', plugin, {
          packageName: installation.packageName,
          ...(installation.installedVersion === undefined ? {} : { version: installation.installedVersion }),
        })
      },
    }
  }

  /** Join the catalog record with the bundle roster of the last Host read. */
  private installedCatalogRecord(
    plugin: PluginRecord,
    store: PluginStore,
  ): MarketplaceInstallation | undefined {
    const state = store.getSnapshot()
    return state.read.status === 'ready'
      ? findInstallation(plugin, state.read.snapshot.bundles)
      : undefined
  }

  /**
   * Persist one confirmed Host mutation with its catalog snapshot. Only called
   * after the Host reported success; a database refusal is reported as
   * {@link MarketSyncError} so it cannot be mistaken for a failed install.
   */
  private async syncInstallation(
    client: SdkworkPluginsAppClient,
    action: 'installed' | 'updated' | 'removed',
    plugin: PluginRecord,
    facts: { packageName?: string; version?: string; installSpec?: string },
  ): Promise<void> {
    const pluginKey = plugin.pluginKey.trim()
    if (pluginKey === '') throw new MarketSyncError('the catalog record has no plugin key')
    try {
      await client.plugins.syncInstallation(
        marketHostId(this.options.iam.controller.getState().session),
        {
          pluginKey,
          action,
          ...(facts.packageName === undefined ? {} : { packageName: facts.packageName }),
          ...(facts.version === undefined ? {} : { version: facts.version }),
          ...(facts.installSpec === undefined ? {} : { installSpec: facts.installSpec }),
        },
      )
    } catch (error) {
      throw new MarketSyncError(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Resolve the one target installation uses: the catalog record's own target,
   * or the imported catalog projection for a record from a catalog revision
   * that predates the target.
   *
   * Installation is a local Host action, so the server exposes the target as
   * record data rather than an endpoint this client has to call.
   */
  private async resolveInstallSpec(
    plugin: PluginRecord,
    _client: SdkworkPluginsAppClient,
    driveClient: SdkworkDriveAppClient,
  ): Promise<string> {
    if (plugin.source != null) return pluginsInstallSpec(plugin.source, driveClient)
    const target = installTargetOf(plugin)
    if (target !== undefined) return target.spec
    const spec = marketplaceInstallSpec(plugin)
    if (spec === undefined) throw new MarketInstallError('no-target')
    return spec
  }

  /** @returns the host theme bridge for the embedded market page. */
  readThemeBridge(): HostThemeBridge {
    return this.options.theme
  }

  /**
   * Hand the catalog's sign-in gesture to this application's login entry. The
   * IAM service owns the presentation (modal overlay or full-page account
   * mode) and the methods it offers, so the market never re-implements either.
   */
  requestSignIn(): void {
    this.options.iam.openSignIn()
  }

  /** Dispose subscriptions and prevent later adapter notifications. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.offEnvironment?.()
    this.offIam?.()
    this.offLocale?.()
    this.offTheme?.()
    this.offEnvironment = undefined
    this.offIam = undefined
    this.offLocale = undefined
    this.offTheme = undefined
    this.pluginsClient = undefined
    this.pluginsClientBaseUrl = undefined
    this.skillsClient = undefined
    this.skillsClientBaseUrl = undefined
    this.driveClient = undefined
    this.driveClientBaseUrl = undefined
    this.listeners.clear()
    if (activeAdapter === this) activeAdapter = undefined
  }

  private publish(): void {
    /* v8 ignore next 2 -- disposed guard: dispose() unsubscribes all
       sources first, so no callback can reach publish after disposal. */
    if (this.disposed) return
    this.cachedSnapshot = undefined
    for (const listener of this.listeners) listener()
  }
}

/** Convert the app API artifact descriptor into the Host plugin-manager spec. */
export async function pluginsInstallSpec(source: PluginArtifactSource, driveClient: SdkworkDriveAppClient): Promise<string> {
  if (source.kind === 'git') {
    return pluginSourceSpec(parsePluginSource({
      kind: 'git',
      url: source.repositoryUrl,
      ...(source.gitRef == null ? {} : { ref: source.gitRef }),
      ...(source.repositoryPath === '.' ? {} : { directory: source.repositoryPath }),
    }))
  }
  const driveUri = source.driveUri
  const parts = /^drive:\/\/spaces\/([^/]+)\/nodes\/([^/]+)$/.exec(driveUri)
  if (parts === null) throw new Error('Plugin Drive source is invalid')
  const [, , nodeId] = parts
  let downloadUrl: string
  if (source.kind === 'drive_file') {
    if (!/^[a-f0-9]{64}$/i.test(source.checksumSha256)) {
      throw new Error('Plugin artifact checksum is invalid')
    }
    downloadUrl = (await driveClient.drive.nodes.downloadUrls.retrieve(nodeId)).signedSourceUrl
  } else {
    const packageResponse = await driveClient.drive.downloadPackages.create({
      nodeIds: [nodeId],
      packageName: 'sdkwork-plugin.zip',
    })
    downloadUrl = packageResponse.signedSourceUrl
  }
  const archive = parsePluginSource({
    kind: 'archive',
    url: downloadUrl,
    ...(source.kind === 'drive_file' ? { sha256: source.checksumSha256 } : {}),
  })
  return pluginSourceSpec(archive)
}

let activeAdapter: MarketsHostRuntimeImpl | undefined

/** Configure the global SDKWork host adapter for the embedded market pages. */
export function configureMarketsHost(options: ConfigureMarketsHostOptions): MarketsHostAdapter {
  activeAdapter?.dispose()
  const adapter = new MarketsHostRuntimeImpl(options)
  activeAdapter = adapter
  adapter.start()
  return adapter
}

/** Build an unconfigured adapter for focused host-bridge tests. */
export function createMarketsHostRuntime(
  options: ConfigureMarketsHostOptions,
): MarketsHostRuntime {
  return new MarketsHostRuntimeImpl(options)
}

/** Props for the embedded market page renderer. */
export interface MarketsAppProps {
  /** The market page this surface instance renders. */
  page: AppstoreMarketsPage
  /**
   * The page header's search query, forwarded as the embedded catalog's
   * controlled text filter: the header field is the one search, and the
   * storefront page renders no local search input of its own.
   */
  searchQuery?: string
  /** Markets namespace translate seat for the no-data surface. */
  t: TranslateNS<'markets'>
}

/**
 * Render one SDKWork market page through the configured host adapter.
 * With no configured gateway the adapter mounts no SDKWork runtime and the
 * unconfigured status panel keeps the tab panel a complete themed surface.
 * With no credentials the panel states the sign-in requirement and hands the
 * gesture to this application's login entry: the generated app SDK cannot
 * dispatch an app-api call without an application Access-Token, and would
 * surface its own transport error instead of a market.
 * @param props - the market page id, the header query, and the Markets locale seat.
 * @returns the market page element tree.
 */
export function MarketsApp(props: MarketsAppProps): ReactNode {
  const { page, searchQuery, t } = props
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-sdkwork-markets: SDKWork host runtime is not configured')
  }
  const readSnapshot = (): MarketsHostRenderSnapshot => adapter.getHostSnapshot()
  const snapshot = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    readSnapshot,
    readSnapshot,
  )
  if (snapshot.apiBaseUrl === '') {
    return createElement(MarketsEmptySurface, { t })
  }
  if (!snapshot.authenticated) {
    return createElement(MarketsAuthSurface, {
      t,
      onSignIn: () => { adapter.requestSignIn() },
    })
  }
  return createElement(
    SdkworkHostThemeSurface,
    { theme: adapter.readThemeBridge(), surface: `markets-${page}` },
    createElement(AppstoreMarketsSurface as FC<AppstoreMarketsSurfaceProps>, {
      // Remount on identity changes too: a signed-in token swap must not keep
      // the previous account's catalog, workspace, and drafts on screen.
      key: `${snapshot.environmentRevision}:${snapshot.identityKey}`,
      page,
      ...(searchQuery === undefined ? {} : { searchQuery }),
      apiBaseUrl: snapshot.apiBaseUrl,
      ...(snapshot.accessToken === '' ? {} : { accessToken: snapshot.accessToken }),
      locale: snapshot.locale,
      ...(snapshot.session === null ? { session: null } : { session: snapshot.session }),
      // The embedded surface binds the shared global manager so every SDKWork
      // client in the app uses exactly one TokenManager instance.
      tokenManager: getSdkworkGlobalTokenManager(),
      resolveHostColorScheme: () => adapter.readThemeBridge().getColorScheme(),
      subscribeHostColorScheme: (listener: (scheme: 'light' | 'dark') => void) => {
        return adapter.readThemeBridge().subscribe(() => { listener(adapter.readThemeBridge().getColorScheme()) })
      },
    }),
  )
}

/** Props for the BirdCoder cloud Skills catalog. */
export interface SkillsCatalogSurfaceProps {
  snapshot: MarketsHostRenderSnapshot
  actions: SkillsCatalogActions
  requestSignIn: () => void
  onClearSearch?: () => void
  onAdded: (name: string) => void
  onAddFailed: () => void
  searchQuery?: string
  /** The page header's installed filter, which the catalog obeys. */
  installedOnly: boolean
  /** Toggle that filter from the catalog's empty state. */
  onInstalledOnlyChange: (value: boolean) => void
  /** Publish the installed count the header chip shows. */
  onInstalledCountChange: (count: number) => void
  t: TranslateNS<'markets'>
}

/** Render the cloud Skills catalog from its framework-bound host snapshot. */
export function SkillsCatalogSurface({
  snapshot,
  actions,
  requestSignIn,
  onClearSearch,
  onAdded,
  onAddFailed,
  searchQuery,
  installedOnly,
  onInstalledOnlyChange,
  onInstalledCountChange,
  t,
}: SkillsCatalogSurfaceProps): ReactNode {
  if (snapshot.apiBaseUrl === '') return createElement(MarketsEmptySurface, { t })
  if (!snapshot.authenticated) return createElement(MarketsAuthSurface, { t, onSignIn: requestSignIn })
  return createElement(SkillsCatalogPage, {
    key: `${snapshot.environmentRevision}:${snapshot.identityKey}`,
    actions,
    ...(searchQuery === undefined ? {} : { searchQuery }),
    locale: snapshot.locale,
    t,
    ...(onClearSearch === undefined ? {} : { onClearSearch }),
    installedOnly,
    onInstalledOnlyChange,
    onInstalledCountChange,
    onAdded,
    onAddFailed,
  })
}

/** Props for the BirdCoder cloud expert catalog. */
export interface ExpertsCatalogSurfaceProps {
  snapshot: MarketsHostRenderSnapshot
  actions: ExpertsCatalogActions
  requestSignIn: () => void
  onClearSearch?: () => void
  /** Hand one catalog expert to the conversation, enabling it first. */
  onUseExpert: (expert: ExpertRecord) => void
  /** Assemble one catalog team in a fresh conversation. */
  onUseTeam: (team: ExpertTeamRecord) => void
  searchQuery?: string
  t: TranslateNS<'markets'>
}

/**
 * Render the cloud expert catalog from its framework-bound host snapshot.
 *
 * The Experts tab has one view, so this is the whole tab: no sub-tab decides
 * between a cloud shelf and a local roster, and the sign-in and unconfigured
 * gates are the same ones every other cloud catalog in this page uses.
 */
export function ExpertsCatalogSurface({
  snapshot,
  actions,
  requestSignIn,
  onClearSearch,
  onUseExpert,
  onUseTeam,
  searchQuery,
  t,
}: ExpertsCatalogSurfaceProps): ReactNode {
  if (snapshot.apiBaseUrl === '') return createElement(MarketsEmptySurface, { t })
  if (!snapshot.authenticated) return createElement(MarketsAuthSurface, { t, onSignIn: requestSignIn })
  return createElement(ExpertsCatalogPage, {
    key: `${snapshot.environmentRevision}:${snapshot.identityKey}`,
    actions,
    ...(searchQuery === undefined ? {} : { searchQuery }),
    locale: snapshot.locale,
    t,
    ...(onClearSearch === undefined ? {} : { onClearSearch }),
    onUseExpert,
    onUseTeam,
  })
}

/** Props for the SDKWork Plugins marketplace hosted in the Plugins tab. */
export interface SdkworkPluginsMarketplaceProps {
  t: TranslateNS<'markets'>
  store: PluginStore
  managementAvailable: boolean
  installBusy: boolean
  /** Installed state of one catalog record, joined from the local profile. */
  installationOf: (plugin: PluginRecord) => MarketplaceInstallation | undefined
  /**
   * The catalog query. The page's header row owns the search field, so it owns
   * this text; the catalog renders its categories and cards only.
   */
  searchQuery: string
  /** Hand the next query back to the page. */
  onSearchChange: (value: string) => void
  onManage: () => void
  onAdd: () => void
  onSectionChange: (section: 'plugins' | 'skills' | 'partners') => void
}

/**
 * Render the SDKWork Plugins marketplace with the active BirdCoder credentials,
 * theme and locale. Marketplace artifacts use the Host's existing installer.
 */
export function SdkworkPluginsMarketplace({
  t, store, managementAvailable, installBusy, installationOf, searchQuery, onSearchChange,
  onManage, onAdd, onSectionChange,
}: SdkworkPluginsMarketplaceProps): ReactNode {
  const [installFailure, setInstallFailure] = useState<{ readonly key: MarketsKey; readonly detail?: string } | undefined>()
  const [installingKey, setInstallingKey] = useState<string | undefined>()
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-sdkwork-markets: SDKWork host runtime is not configured')
  }
  const readSnapshot = (): MarketsHostRenderSnapshot => adapter.getHostSnapshot()
  const snapshot = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    readSnapshot,
    readSnapshot,
  )
  if (snapshot.apiBaseUrl === '') return createElement(MarketsEmptySurface, { t })
  if (!snapshot.authenticated) {
    return createElement(MarketsAuthSurface, { t, onSignIn: () => { adapter.requestSignIn() } })
  }

  const host = adapter.getPluginsMarketplaceHost()
  const canInstall = host.canInstall && managementAvailable && !installBusy
  const translate = t as (key: MarketsKey, params?: Record<string, string>) => string
  const fail = (error: unknown): void => {
    if (error instanceof MarketSyncError) {
      setInstallFailure({ key: 'market.sync.failed', detail: error.message })
      return
    }
    if (error instanceof MarketInstallError) {
      setInstallFailure({
        key: `market.install.problem.${error.problem}` as MarketsKey,
        ...(error.message === error.problem ? {} : { detail: error.message }),
      })
      return
    }
    setInstallFailure({ key: 'install.failed', detail: error instanceof Error ? error.message : String(error) })
  }
  const install = (plugin: PluginRecord): void => {
    setInstallFailure(undefined)
    setInstallingKey(plugin.pluginKey)
    void host.install(plugin, store).catch(fail).finally(() => { setInstallingKey(undefined) })
  }
  const update = (plugin: PluginRecord, _installation: MarketplaceInstallationState): void => {
    const installed = installationOf(plugin)
    if (installed === undefined) return
    setInstallFailure(undefined)
    setInstallingKey(plugin.pluginKey)
    void host.update(plugin, installed, store).catch(fail).finally(() => { setInstallingKey(undefined) })
  }
  const remove = (plugin: PluginRecord, _installation: MarketplaceInstallationState): void => {
    const installed = installationOf(plugin)
    if (installed === undefined) return
    setInstallFailure(undefined)
    void host.remove(plugin, installed, store).catch(fail)
  }
  const disabledReason = (plugin: PluginRecord): string | undefined => {
    if (!managementAvailable) return t('market.install.disabled.management')
    if (installBusy) return t('market.install.disabled.busy')
    if (!host.canInstall) return t('market.install.disabled.signIn')
    if (installTargetOf(plugin) === undefined && plugin.source == null && marketplaceInstallSpec(plugin) === undefined) {
      return t('market.install.disabled.noSource')
    }
    return undefined
  }
  return createElement(
    SdkworkHostThemeSurface,
    { theme: adapter.readThemeBridge(), surface: 'markets-plugins', className: css.pluginMarketplace },
    createElement(
      Fragment,
      null,
      createElement(MarketplacePage, {
        appClient: host.client,
        locale: snapshot.locale === 'zh-CN' ? 'zh-CN' : 'en-US',
        showSectionNavigation: false,
        // The host's category row carries the search and the action pair, so the
        // catalog drops its own header and takes the query from above.
        hideToolbar: true,
        searchValue: searchQuery,
        onSearchValueChange: onSearchChange,
        canInstall,
        onManage,
        onAdd,
        onInstall: install,
        onUpdate: update,
        onRemove: remove,
        installationOf,
        installDisabledReason: disabledReason,
        installingKeys: new Set(installingKey === undefined ? [] : [installingKey]),
        onSectionChange,
      }),
      installFailure === undefined ? null : createElement(
        'p',
        { role: 'alert', className: css.marketInstallError },
        installFailure.detail === undefined
          ? translate(installFailure.key)
          : translate(installFailure.key, { detail: installFailure.detail }),
      ),
    ),
  )
}
/* jscpd:ignore-end */

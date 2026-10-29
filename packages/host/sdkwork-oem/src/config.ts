/**
 * OEM profile: one deployment-owned JSON file that names the DeepSeek
 * platform, inference, and helper endpoints plus the display brand. The
 * official DeepSeek login flow (PKCE paths, auth endpoints, headers) is never
 * reconfigured here — only the origins it runs against, so an OEM deployment
 * that implements the same contract behind its own domain keeps the official
 * verification flow byte for byte.
 *
 * @module @deepseek-ai/dsh-sdkwork-oem/config
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Environment variable naming an OEM profile file outside the Harness home. */
export const OEM_CONFIG_ENV = 'DSH_OEM_CONFIG'
/** File name of the OEM profile inside the Harness home. */
export const OEM_CONFIG_FILENAME = 'oem.json'
/** Page global carrying the browser-visible OEM projection. */
export const OEM_BOOT_GLOBAL = '__DSH_OEM__'
/** Brand shipped without an OEM profile. */
export const DEFAULT_BRAND_NAME = 'BirdCoder'
/** Company shipped without an OEM profile. */
export const DEFAULT_COMPANY_NAME = 'SDKWork'
/** Official browser login origin a deployment can explicitly restore; the shipped profile uses BirdCoder. */
export const OFFICIAL_PLATFORM_ORIGIN = 'https://platform.deepseek.com'
/** Official model, file, and model-listing origin a deployment can explicitly restore. */
export const OFFICIAL_INFERENCE_ORIGIN = 'https://api.deepseek.com'
/** Deployment lifecycle whose domains the shipped profile follows. */
export type OemEnvironment = 'development' | 'testing' | 'staging' | 'production'

/** Login and account origin shipped for production. */
export const DEFAULT_PLATFORM_ORIGIN = 'https://platform.birdcoder.com'
/** Account-route inference origin shipped for production. */
export const DEFAULT_INFERENCE_ORIGIN = 'https://api.birdcoder.com'
/** Application origin shipped without an OEM profile: the fork's product domain. */
export const DEFAULT_APPLICATION_ORIGINS: readonly string[] = Object.freeze(['https://birdcoder.com'])
/** SDKWork IAM app-api origin shipped by this fork (PC login paths; env profile follows the tier). */
export const DEFAULT_IAM_BASE_URL = 'https://api.birdcoder.com'
/** Hosted SDKWork IAM authorization origin shipped for production. */
export const DEFAULT_IAM_AUTHORIZE_BASE_URL = 'https://platform.birdcoder.com'
/** OAuth client the desktop browser login presents; the tenant IAM application registers it. */
export const DEFAULT_IAM_CLIENT_ID = 'birdcoder'
/**
 * Deep-link callback the hosted SDKWork IAM login returns through. Its scheme is
 * the desktop application's registered URL scheme (`desktop.protocol` in the
 * brand manifest), so a brand declares the handler and this URI names the path.
 */
export const DEFAULT_IAM_REDIRECT_URI = 'birdcoder://auth/callback'

/** Service domains per SDKWork lifecycle. */
const ENVIRONMENT_ORIGINS: Readonly<Record<OemEnvironment, {
  readonly platform: string
  readonly inference: string
  readonly iamAuthorize: string
}>> = Object.freeze({
  development: Object.freeze({
    platform: 'http://platform-dev.birdcoder.com',
    inference: 'http://api-dev.birdcoder.com',
    iamAuthorize: 'http://platform-dev.birdcoder.com',
  }),
  testing: Object.freeze({
    platform: 'https://platform-test.birdcoder.com',
    inference: 'https://api-test.birdcoder.com',
    iamAuthorize: 'https://platform-test.birdcoder.com',
  }),
  staging: Object.freeze({
    platform: 'https://platform-staging.birdcoder.com',
    inference: 'https://api-staging.birdcoder.com',
    iamAuthorize: 'https://platform-staging.birdcoder.com',
  }),
  production: Object.freeze({
    platform: DEFAULT_PLATFORM_ORIGIN,
    inference: DEFAULT_INFERENCE_ORIGIN,
    iamAuthorize: DEFAULT_IAM_AUTHORIZE_BASE_URL,
  }),
})

function normalizedEnvironment(value: string | undefined): OemEnvironment | undefined {
  switch (value?.trim().toLowerCase()) {
    case 'development':
    case 'dev':
      return 'development'
    case 'testing':
    case 'test':
      return 'testing'
    case 'staging':
    case 'stage':
      return 'staging'
    case 'production':
    case 'prod':
      return 'production'
    default:
      return undefined
  }
}

/**
 * Resolve the launch lifecycle from the SDKWork identity keys, falling back to
 * the source/dev application flags and finally production.
 * @param env - launch environment (the Host and Desktop share it).
 * @returns the lifecycle whose domains the defaults follow.
 */
export function resolveOemEnvironment(env: Readonly<Record<string, string | undefined>> = process.env): OemEnvironment {
  const profile = env.SDKWORK_BIRDCODER_PROFILE_ID ?? env.SDKWORK_PROFILE_ID
  const fromProfile = profile?.split('.')[1]
  const declared = normalizedEnvironment(fromProfile)
    ?? normalizedEnvironment(env.SDKWORK_BIRDCODER_ENVIRONMENT ?? env.SDKWORK_ENVIRONMENT)
  if (declared !== undefined) return declared
  if (env.NODE_ENV === 'development' || env.DSH_DESKTOP_DEV_APP === '1') return 'development'
  return 'production'
}

/** SDKWork deployment services one OEM can repoint. */
export interface OemSdkworkConfig {
  /**
   * SDKWork IAM app-api origin. The generated client appends its PC login
   * paths (`/app/v3/api/auth/...`, `X-Platform: pc`) unchanged; only this
   * domain moves.
   */
  readonly iamBaseUrl: string
  /**
   * Hosted IAM authorization origin for the desktop browser-login flow. The
   * app appends `/iam/v3/oauth/authorize`; the hosted login pages keep their
   * `/auth/...` paths and deep-link completion.
   */
  readonly iamAuthorizeBaseUrl: string
  /**
   * OAuth client id the hosted authorization receives. The tenant IAM
   * application registers it together with {@link iamRedirectUri}; it is
   * independent of the `ui-sdkwork-env` app id, which stays the API tenant key.
   */
  readonly iamClientId: string
  /**
   * Registered deep-link callback the hosted login returns through, e.g.
   * `birdcoder://auth/callback`. The scheme is the desktop application's URL
   * scheme from the brand manifest.
   */
  readonly iamRedirectUri: string
}

/** Display identity an OEM deployment publishes. */
export interface OemBrandConfig {
  /** Product name every display surface renders in place of `BirdCoder`. */
  readonly name: string
  /** Vendor or company name for surfaces that need it. */
  readonly companyName: string
}

/** The deployment's own hosted application surface. */
export interface OemApplicationConfig {
  /**
   * Public origins the Web application is served from. The account login uses
   * them as allowed callback origins, so a hosted deployment on its own domain
   * completes the official browser flow without a loopback redirect.
   */
  readonly origins: readonly string[]
}

/** DeepSeek endpoints one deployment runs its login and inference against. */
export interface OemDeepSeekConfig {
  /** Browser sign-in and account origin; must expose the official `/dsh` auth paths. */
  readonly platformOrigin: string
  /** Model and file request origin; receives the stored account grant. */
  readonly inferenceOrigin: string
  /** Allow loopback HTTP for the origins above (development only). */
  readonly allowLoopbackHttp: boolean
  /** Allow non-loopback HTTP service origins in a development launch. */
  readonly allowInsecureHttp: boolean
  /** Map Platform browser pages onto `platformOrigin` for a reverse proxy. */
  readonly rewriteBrowserOrigin: boolean
  /** Messages endpoint base; empty keeps the provider default or `DEEPSEEK_BASE_URL`. */
  readonly messagesBaseUrl: string
  /** Anthropic-compatible search endpoint base; empty keeps the provider default. */
  readonly webSearchBaseUrl: string
  /** Search and Fetch API base; empty keeps the provider default. */
  readonly webApiBaseUrl: string
}

/** Resolved OEM configuration. */
export interface OemConfig {
  readonly environment: OemEnvironment
  readonly brand: OemBrandConfig
  readonly application: OemApplicationConfig
  readonly sdkwork: OemSdkworkConfig
  readonly deepseek: OemDeepSeekConfig
}

/** Browser-visible subset injected into the page bootstrap: the display brand, IAM origins, OAuth client, and lifecycle. */
export interface OemBootConfig {
  readonly environment: OemEnvironment
  readonly brand: OemBrandConfig
  readonly sdkwork: OemSdkworkConfig
}

/** Raw OEM fields one environment can override; every field is optional. */
export interface OemEnvironmentOverride {
  readonly brand?: { readonly name?: unknown; readonly companyName?: unknown }
  readonly application?: { readonly origins?: unknown }
  readonly sdkwork?: {
    readonly iamBaseUrl?: unknown
    readonly iamAuthorizeBaseUrl?: unknown
    readonly iamClientId?: unknown
    readonly iamRedirectUri?: unknown
  }
  readonly deepseek?: {
    readonly platformOrigin?: unknown
    readonly inferenceOrigin?: unknown
    readonly allowLoopbackHttp?: unknown
    readonly allowInsecureHttp?: unknown
    readonly rewriteBrowserOrigin?: unknown
    readonly messagesBaseUrl?: unknown
    readonly webSearchBaseUrl?: unknown
    readonly webApiBaseUrl?: unknown
  }
}

/** Raw OEM file fields; every field is optional and absent fields keep the shipped default. */
export interface OemConfigFile extends OemEnvironmentOverride {
  /** Per-lifecycle overrides layered over the root fields for the active tier. */
  readonly environments?: Partial<Record<OemEnvironment, OemEnvironmentOverride>>
}

/**
 * Create a detached copy of the shipped profile for one lifecycle.
 * @param environment - SDKWork lifecycle whose service domains the defaults follow.
 * @returns a fresh copy of the shipped OEM defaults.
 */
export function defaultOemConfig(environment: OemEnvironment = 'production'): OemConfig {
  const origins = ENVIRONMENT_ORIGINS[environment]
  return {
    environment,
    brand: { name: DEFAULT_BRAND_NAME, companyName: DEFAULT_COMPANY_NAME },
    application: { origins: [...DEFAULT_APPLICATION_ORIGINS] },
    sdkwork: {
      iamBaseUrl: DEFAULT_IAM_BASE_URL,
      iamAuthorizeBaseUrl: origins.iamAuthorize,
      iamClientId: DEFAULT_IAM_CLIENT_ID,
      iamRedirectUri: DEFAULT_IAM_REDIRECT_URI,
    },
    deepseek: {
      platformOrigin: origins.platform,
      inferenceOrigin: origins.inference,
      allowLoopbackHttp: false,
      allowInsecureHttp: environment === 'development',
      rewriteBrowserOrigin: false,
      messagesBaseUrl: `${origins.inference}/anthropic`,
      webSearchBaseUrl: `${origins.inference}/anthropic/v1`,
      webApiBaseUrl: `${origins.inference}/v1/tools`,
    },
  }
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`oem: ${where} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

function optionalRecord(value: unknown, where: string): Record<string, unknown> {
  return value === undefined ? {} : record(value, where)
}

function optionalString(source: Record<string, unknown>, key: string, where: string): string | undefined {
  const value = source[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`oem: ${where} must be a string`)
  return value
}

function optionalBoolean(source: Record<string, unknown>, key: string, where: string): boolean | undefined {
  const value = source[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`oem: ${where} must be a boolean`)
  return value
}

function brandText(value: string | undefined, where: string, fallback: string): string {
  const text = (value ?? fallback).trim()
  if (text === '') throw new Error(`oem: ${where} must not be empty`)
  if (text.length > 64) throw new Error(`oem: ${where} must be at most 64 characters`)
  // Control characters would corrupt native window titles and locale copy.
  if (/[\u0000-\u001f\u007f]/u.test(text)) throw new Error(`oem: ${where} must not contain control characters`)
  return text
}

function isLoopback(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

function origin(value: string, where: string, allowLoopbackHttp: boolean, allowInsecureHttp = false): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`oem: ${where} must be an absolute URL`)
  }
  const loopback = isLoopback(url.hostname)
  const allowedProtocol = url.protocol === 'https:'
    || (allowInsecureHttp && url.protocol === 'http:')
    || (allowLoopbackHttp && loopback && url.protocol === 'http:')
  if (!allowedProtocol || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `oem: ${where} must be an HTTPS origin without credentials, path, query, or fragment`
      + ' (HTTP is allowed only for a development launch or explicitly enabled loopback)',
    )
  }
  return url.origin
}

function baseUrl(value: string, where: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`oem: ${where} must be an absolute URL`)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`oem: ${where} must be an HTTP(S) URL without credentials, query, or fragment`)
  }
  return url.href.replace(/\/+$/u, '')
}

function explicitOrDefault(
  source: Record<string, unknown>,
  key: string,
  where: string,
  derived: string,
): string {
  const declared = optionalString(source, key, where)?.trim()
  if (declared === undefined || declared === '') return derived
  return baseUrl(declared, where)
}

/** OAuth public-client ids are lower-case keys in the IAM console, so the profile rejects casing drift at load. */
const IAM_CLIENT_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/u

/**
 * Resolve the OAuth client id the desktop login presents.
 *
 * The id is deliberately not derived from the API tenant app id: the hosted
 * IAM registers its own public OAuth client, and a deployment repoints it
 * here without touching the tenant identity the API headers carry.
 * @param value - declared profile value, or undefined for the shipped default.
 * @param where - field path named in validation errors.
 * @returns the validated client id.
 * @throws Error when the value is not a usable lower-case client id.
 */
function iamClientId(value: string | undefined, where: string): string {
  const text = (value ?? DEFAULT_IAM_CLIENT_ID).trim()
  if (!IAM_CLIENT_ID_PATTERN.test(text)) {
    throw new Error(`oem: ${where} must be a lower-case OAuth client id of at most 64 characters`)
  }
  return text
}

/**
 * Resolve the deep-link redirect the hosted login returns through.
 *
 * It must be a custom-scheme absolute URI with an authority: the desktop shell
 * only receives URLs its operating-system protocol handler delivers, and an
 * HTTP(S) redirect would never reach the app. The scheme itself is build-time
 * identity — it must equal `desktop.protocol` in the selected brand manifest.
 * @param value - declared profile value, or undefined for the shipped default.
 * @param where - field path named in validation errors.
 * @returns the validated redirect URI, trimmed but otherwise unchanged.
 * @throws Error when the value is not a custom-scheme absolute URI.
 */
function iamRedirectUri(value: string | undefined, where: string): string {
  const text = (value ?? DEFAULT_IAM_REDIRECT_URI).trim()
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error(`oem: ${where} must be an absolute URI such as birdcoder://auth/callback`)
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    throw new Error(`oem: ${where} must use the desktop application's custom URL scheme, not HTTP(S)`)
  }
  if (url.host === '' || url.username || url.password || url.search || url.hash) {
    throw new Error(`oem: ${where} must be scheme://authority/path without credentials, query, or fragment`)
  }
  return text
}

function originList(value: unknown, where: string, allowLoopbackHttp: boolean, allowInsecureHttp: boolean): string[] {
  if (value === undefined) return [...DEFAULT_APPLICATION_ORIGINS]
  if (!Array.isArray(value)) throw new Error(`oem: ${where} must be an array of origins`)
  const origins = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') throw new Error(`oem: ${where} entries must be strings`)
    origins.add(origin(entry, where, allowLoopbackHttp, allowInsecureHttp))
  }
  return [...origins]
}

/**
 * Resolve one OEM profile value.
 *
 * A deployment login portal may issue its own grants for the official API, so
 * a custom platform origin with the official inference origin is allowed and
 * keeps the endpoint bases on their defaults. The reverse — an official
 * account grant sent to a deployment inference endpoint — is rejected instead
 * of silently forwarding credentials to a third party.
 *
 * @param raw - parsed JSON value, or undefined for the shipped defaults.
 * @param source - file or label named in validation errors.
 * @param environment - SDKWork lifecycle whose defaults and `environments` override apply.
 * @returns the validated profile.
 * @throws Error when a field is malformed or the origin pairing is unsafe.
 */
export function resolveOemConfig(
  raw: unknown,
  source = 'oem profile',
  environment: OemEnvironment = 'production',
): OemConfig {
  const defaults = defaultOemConfig(environment)
  const root = raw === undefined ? {} : record(raw, source)
  const environments = optionalRecord(root.environments, 'environments')
  for (const key of Object.keys(environments)) {
    if (!Object.hasOwn(ENVIRONMENT_ORIGINS, key)) throw new Error(`oem: environments.${key} is not a supported lifecycle`)
  }
  const override = optionalRecord(environments[environment], `environments.${environment}`)
  const section = (key: 'brand' | 'application' | 'sdkwork' | 'deepseek'): Record<string, unknown> => ({
    ...optionalRecord(root[key], key),
    ...optionalRecord(override[key], `environments.${environment}.${key}`),
  })
  const brand = section('brand')
  const application = section('application')
  const sdkwork = section('sdkwork')
  const deepseek = section('deepseek')
  const allowLoopbackHttp = optionalBoolean(deepseek, 'allowLoopbackHttp', 'deepseek.allowLoopbackHttp') ?? false
  // Plain HTTP service origins are a development-tier affordance only; a
  // production/staging profile cannot opt back into them.
  const allowInsecureHttp = environment === 'development'
    && (optionalBoolean(deepseek, 'allowInsecureHttp', 'deepseek.allowInsecureHttp') ?? true)
  const declaredPlatform = optionalString(deepseek, 'platformOrigin', 'deepseek.platformOrigin')
  const declaredInference = optionalString(deepseek, 'inferenceOrigin', 'deepseek.inferenceOrigin')
  const declaredAuthorize = optionalString(sdkwork, 'iamAuthorizeBaseUrl', 'sdkwork.iamAuthorizeBaseUrl')
  const declaredIamBase = optionalString(sdkwork, 'iamBaseUrl', 'sdkwork.iamBaseUrl')
  if (environment !== 'production') {
    const productionEndpoint = (value: string | undefined, field: string): void => {
      if (value === undefined) return
      let origin: string | undefined
      try { origin = new URL(value).origin } catch { return }
      if ([DEFAULT_PLATFORM_ORIGIN, DEFAULT_INFERENCE_ORIGIN, DEFAULT_IAM_BASE_URL,
        DEFAULT_IAM_AUTHORIZE_BASE_URL].includes(origin)) {
        throw new Error(
          `oem: ${field} cannot target a production BirdCoder endpoint in a ${environment} launch;`
          + ' move that value under environments.production',
        )
      }
    }
    productionEndpoint(declaredPlatform, 'deepseek.platformOrigin')
    productionEndpoint(declaredInference, 'deepseek.inferenceOrigin')
    productionEndpoint(declaredAuthorize, 'sdkwork.iamAuthorizeBaseUrl')
    productionEndpoint(declaredIamBase, 'sdkwork.iamBaseUrl')
  }
  const platformOrigin = origin(
    declaredPlatform ?? defaults.deepseek.platformOrigin,
    'deepseek.platformOrigin',
    allowLoopbackHttp,
    allowInsecureHttp,
  )
  const inferenceOrigin = origin(
    declaredInference ?? defaults.deepseek.inferenceOrigin,
    'deepseek.inferenceOrigin',
    allowLoopbackHttp,
    allowInsecureHttp,
  )
  const platformIsOfficial = platformOrigin === OFFICIAL_PLATFORM_ORIGIN
  const inferenceIsOfficial = inferenceOrigin === OFFICIAL_INFERENCE_ORIGIN
  if (platformIsOfficial && !inferenceIsOfficial) {
    throw new Error(
      'oem: a customized deepseek.inferenceOrigin also requires a customized deepseek.platformOrigin;'
      + ' otherwise an official account grant would be forwarded to the deployment inference endpoint',
    )
  }
  const messagesBaseUrl = explicitOrDefault(
    deepseek, 'messagesBaseUrl', 'deepseek.messagesBaseUrl', inferenceIsOfficial ? '' : `${inferenceOrigin}/anthropic`,
  )
  if (messagesBaseUrl !== '' && new URL(messagesBaseUrl).origin !== new URL(inferenceOrigin).origin) {
    throw new Error('oem: deepseek.messagesBaseUrl must share the origin of deepseek.inferenceOrigin')
  }
  const webSearchBaseUrl = explicitOrDefault(
    deepseek, 'webSearchBaseUrl', 'deepseek.webSearchBaseUrl', inferenceIsOfficial ? '' : `${inferenceOrigin}/anthropic/v1`,
  )
  const webApiBaseUrl = explicitOrDefault(
    deepseek, 'webApiBaseUrl', 'deepseek.webApiBaseUrl', inferenceIsOfficial ? '' : `${inferenceOrigin}/v1/tools`,
  )
  return {
    environment,
    brand: {
      name: brandText(optionalString(brand, 'name', 'brand.name'), 'brand.name', DEFAULT_BRAND_NAME),
      companyName: brandText(
        optionalString(brand, 'companyName', 'brand.companyName'), 'brand.companyName', DEFAULT_COMPANY_NAME,
      ),
    },
    application: {
      origins: originList(application.origins, 'application.origins', allowLoopbackHttp, allowInsecureHttp),
    },
    sdkwork: {
      iamBaseUrl: origin(
        optionalString(sdkwork, 'iamBaseUrl', 'sdkwork.iamBaseUrl') ?? defaults.sdkwork.iamBaseUrl,
        'sdkwork.iamBaseUrl',
        allowLoopbackHttp,
        allowInsecureHttp,
      ),
      iamAuthorizeBaseUrl: origin(
        optionalString(sdkwork, 'iamAuthorizeBaseUrl', 'sdkwork.iamAuthorizeBaseUrl')
          ?? defaults.sdkwork.iamAuthorizeBaseUrl,
        'sdkwork.iamAuthorizeBaseUrl',
        allowLoopbackHttp,
        allowInsecureHttp,
      ),
      iamClientId: iamClientId(
        optionalString(sdkwork, 'iamClientId', 'sdkwork.iamClientId'),
        'sdkwork.iamClientId',
      ),
      iamRedirectUri: iamRedirectUri(
        optionalString(sdkwork, 'iamRedirectUri', 'sdkwork.iamRedirectUri'),
        'sdkwork.iamRedirectUri',
      ),
    },
    deepseek: {
      platformOrigin,
      inferenceOrigin,
      allowLoopbackHttp,
      allowInsecureHttp,
      rewriteBrowserOrigin: optionalBoolean(deepseek, 'rewriteBrowserOrigin', 'deepseek.rewriteBrowserOrigin') ?? false,
      messagesBaseUrl,
      webSearchBaseUrl,
      webApiBaseUrl,
    },
  }
}

/**
 * Read one OEM profile file. A missing file keeps every shipped default, which
 * is what makes the fork's own builds OEM-free; an unreadable or malformed file
 * fails loud so a typo cannot silently fall back to the official endpoints.
 * @param filename - absolute profile path, or undefined for the defaults.
 * @param environment - SDKWork lifecycle whose defaults and `environments` override apply.
 * @returns the validated profile.
 * @throws Error when the file exists but cannot be read, parsed, or validated.
 */
export function readOemConfig(filename: string | undefined, environment: OemEnvironment = 'production'): OemConfig {
  if (filename === undefined || filename.trim() === '') return defaultOemConfig(environment)
  let text: string
  try {
    text = readFileSync(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultOemConfig(environment)
    throw new Error(`oem: cannot read ${filename}: ${String(error)}`, { cause: error })
  }
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/u, ''))
  } catch (error) {
    throw new Error(`oem: ${filename} is not valid JSON`, { cause: error })
  }
  return resolveOemConfig(raw, filename, environment)
}

/**
 * Resolve the profile path from `DSH_OEM_CONFIG`, then the Harness home.
 * @param env - launch environment carrying an optional override.
 * @param dshHome - the Harness home directory.
 * @returns an absolute profile path.
 */
export function oemConfigPath(env: Readonly<Record<string, string | undefined>>, dshHome: string): string {
  const override = env[OEM_CONFIG_ENV]?.trim()
  return override === undefined || override === '' ? join(dshHome, OEM_CONFIG_FILENAME) : resolve(override)
}

/**
 * Project the browser-visible subset: the resolved lifecycle, display brand,
 * and IAM origins the browser client dispatches against. Host-only DeepSeek
 * endpoints stay out of the page bootstrap.
 * @param config - resolved profile.
 * @returns the page-bootstrap value.
 */
export function oemBootConfig(config: OemConfig): OemBootConfig {
  return {
    environment: config.environment,
    brand: { ...config.brand },
    sdkwork: { ...config.sdkwork },
  }
}

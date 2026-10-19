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
/** Login and account origin shipped by this fork. */
export const DEFAULT_PLATFORM_ORIGIN = 'https://platform.birdcoder.com'
/** Account-route inference origin shipped by this fork. */
export const DEFAULT_INFERENCE_ORIGIN = 'https://api.birdcoder.com'
const DEFAULT_MESSAGES_BASE_URL = `${DEFAULT_INFERENCE_ORIGIN}/anthropic`
const DEFAULT_WEB_SEARCH_BASE_URL = `${DEFAULT_INFERENCE_ORIGIN}/anthropic/v1`
const DEFAULT_WEB_API_BASE_URL = `${DEFAULT_INFERENCE_ORIGIN}/v1/tools`
/** Application origin shipped without an OEM profile: the fork's product domain. */
export const DEFAULT_APPLICATION_ORIGINS: readonly string[] = Object.freeze(['https://birdcoder.com'])
/** SDKWork IAM app-api origin shipped by this fork (PC login paths). */
export const DEFAULT_IAM_BASE_URL = 'https://api.birdcoder.com'
/** Hosted SDKWork IAM authorization (platform) origin shipped by this fork. */
export const DEFAULT_IAM_AUTHORIZE_BASE_URL = 'https://platform.birdcoder.com'

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
  readonly brand: OemBrandConfig
  readonly application: OemApplicationConfig
  readonly sdkwork: OemSdkworkConfig
  readonly deepseek: OemDeepSeekConfig
}

/** Browser-visible subset injected into the page bootstrap: the display brand and the IAM origin. */
export interface OemBootConfig {
  readonly brand: OemBrandConfig
  readonly sdkwork: OemSdkworkConfig
}

/** Raw OEM file fields; every field is optional and absent fields keep the shipped default. */
export interface OemConfigFile {
  readonly brand?: { readonly name?: unknown; readonly companyName?: unknown }
  readonly application?: { readonly origins?: unknown }
  readonly sdkwork?: { readonly iamBaseUrl?: unknown; readonly iamAuthorizeBaseUrl?: unknown }
  readonly deepseek?: {
    readonly platformOrigin?: unknown
    readonly inferenceOrigin?: unknown
    readonly allowLoopbackHttp?: unknown
    readonly rewriteBrowserOrigin?: unknown
    readonly messagesBaseUrl?: unknown
    readonly webSearchBaseUrl?: unknown
    readonly webApiBaseUrl?: unknown
  }
}

const DEFAULT_CONFIG: OemConfig = Object.freeze({
  brand: Object.freeze({ name: DEFAULT_BRAND_NAME, companyName: DEFAULT_COMPANY_NAME }),
  application: Object.freeze({ origins: DEFAULT_APPLICATION_ORIGINS }),
  sdkwork: Object.freeze({ iamBaseUrl: DEFAULT_IAM_BASE_URL, iamAuthorizeBaseUrl: DEFAULT_IAM_AUTHORIZE_BASE_URL }),
  deepseek: Object.freeze({
    platformOrigin: DEFAULT_PLATFORM_ORIGIN,
    inferenceOrigin: DEFAULT_INFERENCE_ORIGIN,
    allowLoopbackHttp: false,
    rewriteBrowserOrigin: false,
    messagesBaseUrl: DEFAULT_MESSAGES_BASE_URL,
    webSearchBaseUrl: DEFAULT_WEB_SEARCH_BASE_URL,
    webApiBaseUrl: DEFAULT_WEB_API_BASE_URL,
  }),
})

/**
 * Create a detached copy of the shipped profile.
 * @returns a fresh copy of the shipped OEM defaults.
 */
export function defaultOemConfig(): OemConfig {
  return {
    brand: { ...DEFAULT_CONFIG.brand },
    application: { origins: [...DEFAULT_APPLICATION_ORIGINS] },
    sdkwork: { ...DEFAULT_CONFIG.sdkwork },
    deepseek: { ...DEFAULT_CONFIG.deepseek },
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

function origin(value: string, where: string, allowLoopbackHttp: boolean): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`oem: ${where} must be an absolute URL`)
  }
  const loopback = isLoopback(url.hostname)
  const allowedProtocol = url.protocol === 'https:' || (allowLoopbackHttp && loopback && url.protocol === 'http:')
  if (!allowedProtocol || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `oem: ${where} must be an HTTPS origin without credentials, path, query, or fragment`
      + ' (loopback HTTP only with deepseek.allowLoopbackHttp)',
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

function originList(value: unknown, where: string, allowLoopbackHttp: boolean): string[] {
  if (value === undefined) return [...DEFAULT_APPLICATION_ORIGINS]
  if (!Array.isArray(value)) throw new Error(`oem: ${where} must be an array of origins`)
  const origins = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') throw new Error(`oem: ${where} entries must be strings`)
    origins.add(origin(entry, where, allowLoopbackHttp))
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
 * @returns the validated profile.
 * @throws Error when a field is malformed or the origin pairing is unsafe.
 */
export function resolveOemConfig(raw: unknown, source = 'oem profile'): OemConfig {
  const root = raw === undefined ? {} : record(raw, source)
  const brand = optionalRecord(root.brand, 'brand')
  const application = optionalRecord(root.application, 'application')
  const sdkwork = optionalRecord(root.sdkwork, 'sdkwork')
  const deepseek = optionalRecord(root.deepseek, 'deepseek')
  const allowLoopbackHttp = optionalBoolean(deepseek, 'allowLoopbackHttp', 'deepseek.allowLoopbackHttp') ?? false
  const platformOrigin = origin(
    optionalString(deepseek, 'platformOrigin', 'deepseek.platformOrigin') ?? DEFAULT_PLATFORM_ORIGIN,
    'deepseek.platformOrigin',
    allowLoopbackHttp,
  )
  const inferenceOrigin = origin(
    optionalString(deepseek, 'inferenceOrigin', 'deepseek.inferenceOrigin') ?? DEFAULT_INFERENCE_ORIGIN,
    'deepseek.inferenceOrigin',
    allowLoopbackHttp,
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
    brand: {
      name: brandText(optionalString(brand, 'name', 'brand.name'), 'brand.name', DEFAULT_BRAND_NAME),
      companyName: brandText(
        optionalString(brand, 'companyName', 'brand.companyName'), 'brand.companyName', DEFAULT_COMPANY_NAME,
      ),
    },
    application: {
      origins: originList(application.origins, 'application.origins', allowLoopbackHttp),
    },
    sdkwork: {
      iamBaseUrl: origin(
        optionalString(sdkwork, 'iamBaseUrl', 'sdkwork.iamBaseUrl') ?? DEFAULT_IAM_BASE_URL,
        'sdkwork.iamBaseUrl',
        allowLoopbackHttp,
      ),
      iamAuthorizeBaseUrl: origin(
        optionalString(sdkwork, 'iamAuthorizeBaseUrl', 'sdkwork.iamAuthorizeBaseUrl') ?? DEFAULT_IAM_AUTHORIZE_BASE_URL,
        'sdkwork.iamAuthorizeBaseUrl',
        allowLoopbackHttp,
      ),
    },
    deepseek: {
      platformOrigin,
      inferenceOrigin,
      allowLoopbackHttp,
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
 * @returns the validated profile.
 * @throws Error when the file exists but cannot be read, parsed, or validated.
 */
export function readOemConfig(filename: string | undefined): OemConfig {
  if (filename === undefined || filename.trim() === '') return defaultOemConfig()
  let text: string
  try {
    text = readFileSync(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultOemConfig()
    throw new Error(`oem: cannot read ${filename}: ${String(error)}`, { cause: error })
  }
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/u, ''))
  } catch (error) {
    throw new Error(`oem: ${filename} is not valid JSON`, { cause: error })
  }
  return resolveOemConfig(raw, filename)
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
 * Project the browser-visible subset: the display brand and the IAM origin the
 * browser client dispatches its PC login paths against. Host-only DeepSeek
 * endpoints stay out of the page bootstrap.
 * @param config - resolved profile.
 * @returns the page-bootstrap value.
 */
export function oemBootConfig(config: OemConfig): OemBootConfig {
  return {
    brand: { ...config.brand },
    sdkwork: { ...config.sdkwork },
  }
}

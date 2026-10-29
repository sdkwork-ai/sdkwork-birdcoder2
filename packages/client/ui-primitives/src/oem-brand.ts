/**
 * Page-bootstrap OEM values shared by every fork surface: the display brand and
 * the SDKWork IAM app-api origin. The Host's OEM profile plugin publishes them
 * through the Web index injection; a page without that injection (tests,
 * upstream builds, an OEM-free deployment) keeps the shipped defaults. This is
 * immutable page-init data, not shared mutable state.
 *
 * @module @deepseek-ai/dsh-client-ui-primitives/oem-brand
 */

/** Page global carrying the Host-published OEM display brand. */
export const OEM_BOOT_GLOBAL = '__DSH_OEM__'
/** Brand rendered when the page carries no OEM projection. */
export const DEFAULT_BRAND_NAME = 'BirdCoder'
/** SDKWork IAM app-api origin shipped when the page carries no OEM projection. */
export const DEFAULT_IAM_BASE_URL = 'https://api.birdcoder.com'
/** Hosted SDKWork IAM authorization origin shipped when the page carries no OEM projection. */
export const DEFAULT_IAM_AUTHORIZE_BASE_URL = 'https://platform.birdcoder.com'
/** OAuth client the desktop browser login presents when the page carries no OEM projection. */
export const DEFAULT_IAM_CLIENT_ID = 'birdcoder'
/** Deep-link callback the hosted IAM login returns through when the page carries no OEM projection. */
export const DEFAULT_IAM_REDIRECT_URI = 'birdcoder://auth/callback'

/** Lower-case OAuth public-client ids; mirrors the Host profile validator. */
const IAM_CLIENT_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/u

/** Lifecycle the page projection carries. */
export type OemPageEnvironment = 'development' | 'testing' | 'staging' | 'production'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the brand name from one page projection.
 * @param source - projection value; defaults to the page global.
 * @returns the validated brand name, or the shipped default.
 */
export function readOemBrandName(source: unknown = (globalThis as Record<string, unknown>)[OEM_BOOT_GLOBAL]): string {
  if (!record(source)) return DEFAULT_BRAND_NAME
  const brand = source.brand
  if (!record(brand)) return DEFAULT_BRAND_NAME
  const name = brand.name
  if (typeof name !== 'string') return DEFAULT_BRAND_NAME
  const text = name.trim()
  if (text === '' || text.length > 64 || /[\u0000-\u001f\u007f]/u.test(text)) return DEFAULT_BRAND_NAME
  return text
}

/**
 * Read the SDKWork IAM app-api origin from one page projection.
 * @param source - projection value; defaults to the page global.
 * @returns the validated origin, or undefined when the page carries none.
 */
export function readOemIamBaseUrl(source: unknown = (globalThis as Record<string, unknown>)[OEM_BOOT_GLOBAL]): string | undefined {
  return readOemSdkworkOrigin(source, 'iamBaseUrl')
}

/**
 * Read the hosted SDKWork IAM authorization origin from one page projection.
 * @param source - projection value; defaults to the page global.
 * @returns the validated origin, or undefined when the page carries none.
 */
export function readOemIamAuthorizeBaseUrl(source: unknown = (globalThis as Record<string, unknown>)[OEM_BOOT_GLOBAL]): string | undefined {
  return readOemSdkworkOrigin(source, 'iamAuthorizeBaseUrl')
}

/**
 * Read the OAuth client id the desktop browser login presents.
 * @param source - projection value; defaults to the page global.
 * @returns the validated client id, or undefined when the page carries none.
 */
export function readOemIamClientId(source: unknown = (globalThis as Record<string, unknown>)[OEM_BOOT_GLOBAL]): string | undefined {
  if (!record(source)) return undefined
  const sdkwork = source.sdkwork
  if (!record(sdkwork)) return undefined
  const value = sdkwork.iamClientId
  return typeof value === 'string' && IAM_CLIENT_ID_PATTERN.test(value.trim()) ? value.trim() : undefined
}

/**
 * Read the registered deep-link callback the hosted IAM login returns through.
 * @param source - projection value; defaults to the page global.
 * @returns the validated custom-scheme URI, or undefined when the page carries none.
 */
export function readOemIamRedirectUri(source: unknown = (globalThis as Record<string, unknown>)[OEM_BOOT_GLOBAL]): string | undefined {
  if (!record(source)) return undefined
  const sdkwork = source.sdkwork
  if (!record(sdkwork)) return undefined
  const value = sdkwork.iamRedirectUri
  if (typeof value !== 'string') return undefined
  let url: URL
  try { url = new URL(value.trim()) } catch { return undefined }
  const text = value.trim()
  if (url.protocol === 'http:' || url.protocol === 'https:') return undefined
  if (url.host === '' || url.username || url.password || url.search || url.hash) return undefined
  return text
}

/**
 * Read the resolved lifecycle from one page projection.
 * @param source - projection value; defaults to the page global.
 * @returns the validated lifecycle, or undefined when the page carries none.
 */
export function readOemEnvironment(
  source: unknown = (globalThis as Record<string, unknown>)[OEM_BOOT_GLOBAL],
): OemPageEnvironment | undefined {
  if (!record(source)) return undefined
  const value = source.environment
  return value === 'development' || value === 'testing' || value === 'staging' || value === 'production'
    ? value
    : undefined
}

function readOemSdkworkOrigin(source: unknown, field: 'iamBaseUrl' | 'iamAuthorizeBaseUrl'): string | undefined {
  if (!record(source)) return undefined
  const sdkwork = source.sdkwork
  if (!record(sdkwork)) return undefined
  const value = sdkwork[field]
  if (typeof value !== 'string') return undefined
  let url: URL
  try { url = new URL(value) } catch { return undefined }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) return undefined
  return url.origin
}

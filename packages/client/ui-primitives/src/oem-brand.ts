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

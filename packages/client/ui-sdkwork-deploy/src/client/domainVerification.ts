/**
 * The platform catalog for domain-ownership verification files.
 *
 * Mirrors the server's single source
 * (`sdkwork-deployments/.../verification_file_catalog.rs`): each platform issues
 * a file with a fixed shape, so the dialog can prefill the name the platform
 * will actually fetch instead of registering one it never will.
 */

export type DomainVerificationPlatform =
  | 'WECHAT_OFFICIAL_ACCOUNT'
  | 'WECHAT_MINI_PROGRAM'
  | 'ALIPAY'
  | 'BYTEDANCE'
  | 'APPLE'
  | 'GOOGLE'
  | 'CUSTOM'

export type DomainVerificationExtension = 'txt' | 'html' | 'xml'

export interface DomainVerificationPlatformSpec {
  platform: DomainVerificationPlatform
  /** File name the platform issues, e.g. `MP_verify_<token>.txt`. */
  fileNameHint: string
  fixedFileName?: string
  tokenPrefix?: string
  extension: DomainVerificationExtension
  /** Locale key naming where the operator obtains the file. */
  issuedByKey: string
}

export const DOMAIN_VERIFICATION_PLATFORMS: readonly DomainVerificationPlatformSpec[] = [
  {
    platform: 'WECHAT_OFFICIAL_ACCOUNT',
    fileNameHint: 'MP_verify_<token>.txt',
    tokenPrefix: 'MP_verify_',
    extension: 'txt',
    issuedByKey: 'domain.issuedBy.WECHAT_OFFICIAL_ACCOUNT',
  },
  {
    platform: 'WECHAT_MINI_PROGRAM',
    fileNameHint: 'MP_verify_<token>.txt',
    tokenPrefix: 'MP_verify_',
    extension: 'txt',
    issuedByKey: 'domain.issuedBy.WECHAT_MINI_PROGRAM',
  },
  {
    platform: 'ALIPAY',
    fileNameHint: '<token>.txt',
    extension: 'txt',
    issuedByKey: 'domain.issuedBy.ALIPAY',
  },
  {
    platform: 'BYTEDANCE',
    fileNameHint: '<token>.txt',
    extension: 'txt',
    issuedByKey: 'domain.issuedBy.BYTEDANCE',
  },
  {
    platform: 'APPLE',
    fileNameHint: 'apple-developer-domain-association.txt',
    fixedFileName: 'apple-developer-domain-association.txt',
    extension: 'txt',
    issuedByKey: 'domain.issuedBy.APPLE',
  },
  {
    platform: 'GOOGLE',
    fileNameHint: '<token>.html',
    extension: 'html',
    issuedByKey: 'domain.issuedBy.GOOGLE',
  },
  {
    platform: 'CUSTOM',
    fileNameHint: '<file>.txt | <file>.html | <file>.xml',
    extension: 'txt',
    issuedByKey: 'domain.issuedBy.CUSTOM',
  },
]

export const DOMAIN_VERIFICATION_EXTENSIONS: readonly DomainVerificationExtension[] = [
  'txt',
  'html',
  'xml',
]

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(txt|html|xml)$/

export function domainVerificationPlatform(
  code: string,
): DomainVerificationPlatformSpec | undefined {
  return DOMAIN_VERIFICATION_PLATFORMS.find(spec => spec.platform === code)
}

/** Whether the edge will serve `fileName` (single ASCII segment, known extension). */
export function isServableVerificationFileName(fileName: string): boolean {
  const trimmed = fileName.trim()
  return NAME_PATTERN.test(trimmed) && trimmed.length <= 128
}

export function verificationFileExtension(fileName: string): string {
  const trimmed = fileName.trim()
  const dot = trimmed.lastIndexOf('.')
  return dot < 0 ? '' : trimmed.slice(dot + 1).toLowerCase()
}

/** Whether the platform's own file can have `extension`. */
export function platformAcceptsVerificationExtension(platform: string, extension: string): boolean {
  const spec = domainVerificationPlatform(platform)
  if (spec === undefined) return false
  if (spec.platform === 'CUSTOM') {
    return (DOMAIN_VERIFICATION_EXTENSIONS as readonly string[]).includes(extension)
  }
  return spec.extension === extension
}

/** The file name the platform will fetch for the token it issued. */
export function suggestVerificationFileName(
  platform: string,
  token: string,
): string | undefined {
  const spec = domainVerificationPlatform(platform)
  if (spec === undefined) return undefined
  if (spec.fixedFileName !== undefined) return spec.fixedFileName
  const trimmed = token.trim()
  if (trimmed === '') return undefined
  const extension = verificationFileExtension(trimmed)
  if (isServableVerificationFileName(trimmed)
    && platformAcceptsVerificationExtension(platform, extension)) {
    return trimmed
  }
  const stem = spec.tokenPrefix !== undefined ? `${spec.tokenPrefix}${trimmed}` : trimmed
  return `${stem}.${spec.extension}`
}

/** The public URL the platform (or a browser) fetches the file from. */
export function verificationFilePublicUrl(apexHostname: string, fileName: string): string {
  return `https://${apexHostname}/${fileName}`
}

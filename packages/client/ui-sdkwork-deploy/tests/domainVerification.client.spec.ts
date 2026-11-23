import { describe, expect, it } from 'vitest'

import {
  DOMAIN_VERIFICATION_PLATFORMS,
  domainVerificationPlatform,
  isServableVerificationFileName,
  platformAcceptsVerificationExtension,
  suggestVerificationFileName,
  verificationFileExtension,
  verificationFilePublicUrl,
} from '../src/client/domainVerification.ts'

/**
 * The plugin's platform catalog mirrors the server's one source
 * (`sdkwork-deploy-contract/src/verification_file_catalog.rs`). A code that
 * exists here and not there is an option the server refuses; a shape that
 * differs here prefills a file name the platform never fetches.
 */
describe('domain verification platform catalog', () => {
  it('is the closed set the control plane accepts', () => {
    expect(DOMAIN_VERIFICATION_PLATFORMS.map(spec => spec.platform)).toEqual([
      'WECHAT_OFFICIAL_ACCOUNT',
      'WECHAT_MINI_PROGRAM',
      'ALIPAY',
      'BYTEDANCE',
      'APPLE',
      'GOOGLE',
      'CUSTOM',
    ])
    expect(domainVerificationPlatform('DOUYIN')).toBeUndefined()
    for (const spec of DOMAIN_VERIFICATION_PLATFORMS) {
      expect(spec.fileNameHint.toLowerCase()).toContain(`.${spec.extension}`)
    }
  })

  it('derives the file name each platform will fetch', () => {
    expect(suggestVerificationFileName('WECHAT_OFFICIAL_ACCOUNT', 'abc123')).toBe('MP_verify_abc123.txt')
    expect(suggestVerificationFileName('ALIPAY', 'token')).toBe('token.txt')
    expect(suggestVerificationFileName('BYTEDANCE', 'token')).toBe('token.txt')
    expect(suggestVerificationFileName('APPLE', 'ignored')).toBe('apple-developer-domain-association.txt')
    expect(suggestVerificationFileName('GOOGLE', 'google123')).toBe('google123.html')
    expect(suggestVerificationFileName('GOOGLE', 'google123.html')).toBe('google123.html')
    expect(suggestVerificationFileName('WECHAT_MINI_PROGRAM', '   ')).toBeUndefined()
  })

  it('keeps a platform to its own extension', () => {
    expect(platformAcceptsVerificationExtension('WECHAT_OFFICIAL_ACCOUNT', 'txt')).toBe(true)
    expect(platformAcceptsVerificationExtension('WECHAT_OFFICIAL_ACCOUNT', 'html')).toBe(false)
    expect(platformAcceptsVerificationExtension('GOOGLE', 'html')).toBe(true)
    expect(platformAcceptsVerificationExtension('GOOGLE', 'txt')).toBe(false)
    expect(platformAcceptsVerificationExtension('CUSTOM', 'xml')).toBe(true)
    expect(platformAcceptsVerificationExtension('CUSTOM', 'js')).toBe(false)
  })

  it('recognises only names the edge serves', () => {
    expect(isServableVerificationFileName('MP_verify_abc.txt')).toBe(true)
    expect(isServableVerificationFileName('SiteAuth.xml')).toBe(true)
    expect(isServableVerificationFileName('dir/MP_verify_abc.txt')).toBe(false)
    expect(isServableVerificationFileName('app.js')).toBe(false)
    expect(verificationFileExtension('SiteAuth.xml')).toBe('xml')
    expect(verificationFileExtension('no-extension')).toBe('')
  })

  it('builds the public URL the platform fetches', () => {
    expect(verificationFilePublicUrl('example.com', 'MP_verify_abc.txt')).toBe(
      'https://example.com/MP_verify_abc.txt',
    )
  })
})

import { describe, expect, it } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import {
  WELCOME_TERMS_URL,
  WELCOME_NETWORK_PROXY_URL,
  WELCOME_NETWORK_PROXY_URL_EN,
  WELCOME_PRIVACY_URL,
  isWelcomeFooterHref,
  welcomeFooterLinks,
} from '../src/welcome-links.ts'

describe('welcome footer links', () => {
  it.each([
    ['zh-CN', WELCOME_NETWORK_PROXY_URL],
    ['en', WELCOME_NETWORK_PROXY_URL_EN],
    ['ja', WELCOME_NETWORK_PROXY_URL_EN],
  ] as const)('composes the %s landing footer in product order', (language, guide) => {
    const locale = resolveDesktopLocale(language)
    expect(welcomeFooterLinks(locale.messages, locale.id)).toEqual([
      { label: locale.messages.welcomeFooterPrivacy, href: WELCOME_PRIVACY_URL },
      { label: locale.messages.welcomeFooterTerms, href: WELCOME_TERMS_URL },
      { label: locale.messages.welcomeFooterNetwork, href: guide },
    ])
  })

  it('opens only the shipped product links', () => {
    for (const url of [WELCOME_PRIVACY_URL, WELCOME_TERMS_URL, WELCOME_NETWORK_PROXY_URL, WELCOME_NETWORK_PROXY_URL_EN]) {
      expect(isWelcomeFooterHref(url)).toBe(true)
    }
    for (const url of [
      '', 'javascript:alert(1)', 'https://sdkwork.com/privacy/', 'https://example.test/privacy',
      'https://docs.sdkwork.com/guide/other', 'file:///etc/passwd', `${WELCOME_PRIVACY_URL}?x=1`,
    ]) {
      expect(isWelcomeFooterHref(url)).toBe(false)
    }
  })
})

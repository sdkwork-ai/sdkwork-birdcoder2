import { describe, expect, it } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import {
  isWelcomeFooterHref,
  SHIPPED_WELCOME_LINKS,
  welcomeFooterLinks,
  welcomeLinkDestinations,
  type WelcomeLinkDestinations,
} from '../src/welcome-links.ts'

const OEM_LINKS: WelcomeLinkDestinations = {
  privacy: 'https://acme.example/privacy',
  terms: 'https://acme.example/terms',
  docs: 'https://docs.acme.example',
}

describe('welcome link destinations', () => {
  it('falls back to the shipped pages for a manifest that names none', () => {
    expect(welcomeLinkDestinations(undefined)).toEqual(SHIPPED_WELCOME_LINKS)
    expect(welcomeLinkDestinations({})).toEqual(SHIPPED_WELCOME_LINKS)
    expect(welcomeLinkDestinations({ links: {} })).toEqual(SHIPPED_WELCOME_LINKS)
  })

  it('takes the deployment links and fills a partial section', () => {
    expect(welcomeLinkDestinations({ links: OEM_LINKS })).toEqual(OEM_LINKS)
    expect(welcomeLinkDestinations({ links: { privacy: OEM_LINKS.privacy } })).toEqual({
      privacy: OEM_LINKS.privacy,
      terms: SHIPPED_WELCOME_LINKS.terms,
      docs: SHIPPED_WELCOME_LINKS.docs,
    })
  })
})

describe('welcome footer links', () => {
  it.each([
    ['zh-CN', '/guide/network-proxy'],
    ['en', '/en/guide/network-proxy'],
    ['ja', '/en/guide/network-proxy'],
  ] as const)('composes the %s landing footer in product order', (language, guide) => {
    const locale = resolveDesktopLocale(language)
    // The shipped destinations are the default and match the shipped manifest.
    expect(welcomeFooterLinks(locale.messages, locale.id, SHIPPED_WELCOME_LINKS)).toEqual([
      { label: locale.messages.welcomeFooterPrivacy, href: SHIPPED_WELCOME_LINKS.privacy },
      { label: locale.messages.welcomeFooterTerms, href: SHIPPED_WELCOME_LINKS.terms },
      { label: locale.messages.welcomeFooterNetwork, href: `${SHIPPED_WELCOME_LINKS.docs}${guide}` },
    ])
  })

  it('renders an OEM deployment its own pages', () => {
    const locale = resolveDesktopLocale('en')
    expect(welcomeFooterLinks(locale.messages, locale.id, OEM_LINKS)).toEqual([
      { label: locale.messages.welcomeFooterPrivacy, href: OEM_LINKS.privacy },
      { label: locale.messages.welcomeFooterTerms, href: OEM_LINKS.terms },
      { label: locale.messages.welcomeFooterNetwork, href: `${OEM_LINKS.docs}/en/guide/network-proxy` },
    ])
  })
})

describe('welcome footer href admission', () => {
  it('admits the shipped product links only', () => {
    for (const url of [
      SHIPPED_WELCOME_LINKS.privacy,
      SHIPPED_WELCOME_LINKS.terms,
      `${SHIPPED_WELCOME_LINKS.docs}/guide/network-proxy`,
      `${SHIPPED_WELCOME_LINKS.docs}/en/guide/network-proxy`,
    ]) {
      expect(isWelcomeFooterHref(url, SHIPPED_WELCOME_LINKS)).toBe(true)
    }
    for (const url of [
      '', 'javascript:alert(1)', 'https://sdkwork.com/privacy/', 'https://example.test/privacy',
      'https://docs.sdkwork.com/guide/other', 'file:///etc/passwd', `${SHIPPED_WELCOME_LINKS.privacy}?x=1`,
    ]) {
      expect(isWelcomeFooterHref(url, SHIPPED_WELCOME_LINKS)).toBe(false)
    }
  })

  it('admits the deployment links and nothing from another brand', () => {
    for (const url of [
      OEM_LINKS.privacy,
      OEM_LINKS.terms,
      `${OEM_LINKS.docs}/guide/network-proxy`,
      `${OEM_LINKS.docs}/en/guide/network-proxy`,
    ]) {
      expect(isWelcomeFooterHref(url, OEM_LINKS)).toBe(true)
    }
    // The shipped pages are not this deployment's pages.
    for (const url of [
      SHIPPED_WELCOME_LINKS.privacy,
      SHIPPED_WELCOME_LINKS.terms,
      `${SHIPPED_WELCOME_LINKS.docs}/guide/network-proxy`,
      'https://other.example/privacy',
    ]) {
      expect(isWelcomeFooterHref(url, OEM_LINKS)).toBe(false)
    }
  })
})

/**
 * Product links the signed-out landing offers.
 *
 * The welcome window is a sandboxed renderer with no navigation of its own, so
 * every footer link is a shipped constant the main process validates before the
 * system browser opens it. Keeping the URLs here — not in the renderer bundle —
 * is what makes that allowlist one list instead of two.
 */

import type { DesktopLocale, DesktopMessages } from './locale.ts'

/** Shipped product privacy policy. */
export const WELCOME_PRIVACY_URL = 'https://sdkwork.com/privacy'
/** Shipped product terms of service. */
export const WELCOME_TERMS_URL = 'https://sdkwork.com/terms'
/** Network-proxy guide: how to launch the product behind a proxy. */
export const WELCOME_NETWORK_PROXY_URL = 'https://docs.sdkwork.com/guide/network-proxy'
/** The same guide on the documentation site's English pages. */
export const WELCOME_NETWORK_PROXY_URL_EN = 'https://docs.sdkwork.com/en/guide/network-proxy'

/** One footer link the landing renders and the window may open. */
export interface WelcomeFooterLink {
  /** Localized link text. */
  readonly label: string
  /** Destination handed to the system browser. */
  readonly href: string
}

/**
 * Compose the landing footer for one locale.
 * @param messages - the window's localized copy.
 * @param id - resolved window locale, which selects the guide's language.
 * @returns privacy, terms, and network-proxy links in display order.
 */
export function welcomeFooterLinks(
  messages: DesktopMessages,
  id: DesktopLocale['id'],
): readonly WelcomeFooterLink[] {
  return [
    { label: messages.welcomeFooterPrivacy, href: WELCOME_PRIVACY_URL },
    { label: messages.welcomeFooterTerms, href: WELCOME_TERMS_URL },
    {
      label: messages.welcomeFooterNetwork,
      href: id === 'zh-CN' ? WELCOME_NETWORK_PROXY_URL : WELCOME_NETWORK_PROXY_URL_EN,
    },
  ]
}

/**
 * Whether the welcome window may hand one URL to the system browser.
 * @param href - candidate destination reported by the renderer.
 * @returns true only for the shipped footer links.
 */
export function isWelcomeFooterHref(href: string): boolean {
  return href === WELCOME_PRIVACY_URL
    || href === WELCOME_TERMS_URL
    || href === WELCOME_NETWORK_PROXY_URL
    || href === WELCOME_NETWORK_PROXY_URL_EN
}

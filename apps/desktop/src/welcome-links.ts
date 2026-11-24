/**
 * Product links the signed-out landing offers.
 *
 * The welcome window is a sandboxed renderer with no navigation of its own, so
 * every footer link is a destination the main process validates before the
 * system browser opens it. The destinations belong to the deployment, not to this
 * source file: the brand manifest names them (`links`), an OEM manifest names its
 * own site, and a manifest that names none keeps the shipped product's pages.
 * Keeping the list here — not in the renderer bundle — is what makes that
 * allowlist one list instead of two.
 */

import type { DesktopLocale, DesktopMessages } from './locale.ts'

/** Destinations the signed-out landing may open. */
export interface WelcomeLinkDestinations {
  /** Product privacy policy. */
  readonly privacy: string
  /** Product terms of service. */
  readonly terms: string
  /** Documentation origin (no trailing slash) that serves the network-proxy guide. */
  readonly docs: string
}

/**
 * The shipped brand's destinations.
 *
 * They mirror `brands/birdcoder.json` and exist for the manifests that predate
 * the `links` section, so an older packaged build still opens real pages.
 */
export const SHIPPED_WELCOME_LINKS: WelcomeLinkDestinations = Object.freeze({
  privacy: 'https://sdkwork.com/privacy',
  terms: 'https://sdkwork.com/terms',
  docs: 'https://docs.sdkwork.com',
})

/** Network-proxy guide the Chinese landing links to. */
const NETWORK_PROXY_PATH = '/guide/network-proxy'
/** The same guide on the documentation site's English pages. */
const NETWORK_PROXY_PATH_EN = '/en/guide/network-proxy'

/** One footer link the landing renders and the window may open. */
export interface WelcomeFooterLink {
  /** Localized link text. */
  readonly label: string
  /** Destination handed to the system browser. */
  readonly href: string
}

/**
 * Resolve the destinations one launch offers.
 * @param brand - the manifest this launch runs as, or undefined for the shipped brand.
 * @returns the brand's destinations, each falling back to the shipped one.
 */
export function welcomeLinkDestinations(
  brand: { readonly links?: Partial<WelcomeLinkDestinations> } | undefined,
): WelcomeLinkDestinations {
  const links = brand?.links
  return {
    privacy: links?.privacy ?? SHIPPED_WELCOME_LINKS.privacy,
    terms: links?.terms ?? SHIPPED_WELCOME_LINKS.terms,
    docs: links?.docs ?? SHIPPED_WELCOME_LINKS.docs,
  }
}

/**
 * Compose the landing footer for one locale.
 * @param messages - the window's localized copy.
 * @param id - resolved window locale, which selects the guide's language.
 * @param destinations - the deployment's destinations; shipped defaults when omitted.
 * @returns privacy, terms, and network-proxy links in display order.
 */
export function welcomeFooterLinks(
  messages: DesktopMessages,
  id: DesktopLocale['id'],
  destinations: WelcomeLinkDestinations = SHIPPED_WELCOME_LINKS,
): readonly WelcomeFooterLink[] {
  return [
    { label: messages.welcomeFooterPrivacy, href: destinations.privacy },
    { label: messages.welcomeFooterTerms, href: destinations.terms },
    {
      label: messages.welcomeFooterNetwork,
      href: `${destinations.docs}${id === 'zh-CN' ? NETWORK_PROXY_PATH : NETWORK_PROXY_PATH_EN}`,
    },
  ]
}

/**
 * Whether the welcome window may hand one URL to the system browser.
 * @param href - candidate destination reported by the renderer.
 * @param destinations - the deployment's destinations; shipped defaults when omitted.
 * @returns true only for the links this launch offers.
 */
export function isWelcomeFooterHref(
  href: string,
  destinations: WelcomeLinkDestinations = SHIPPED_WELCOME_LINKS,
): boolean {
  return href === destinations.privacy
    || href === destinations.terms
    || href === `${destinations.docs}${NETWORK_PROXY_PATH}`
    || href === `${destinations.docs}${NETWORK_PROXY_PATH_EN}`
}

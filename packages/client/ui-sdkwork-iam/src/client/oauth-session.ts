/**
 * Hosted OAuth session-end endpoints.
 *
 * Desktop sign-in is an OAuth public-client flow: the system browser opens the
 * hosted authorization page on `<iamAuthorizeBaseUrl>` (`/iam/oauth/authorize`),
 * so ending that session is an act of the same OAuth surface — not of a
 * product's own page. This module is the one place those endpoints and their
 * query shape live, so a deployment that moves its OAuth group changes one
 * constant here instead of hunting every call site.
 *
 * The hosted login also serves page-local sessions (the in-app account form of
 * a plain browser page). Those carry no OAuth client binding, so they end on the
 * hosted sign-out page rather than through a client-scoped logout.
 */

/**
 * OAuth logout endpoint: ends the browser session one application's
 * authorization flow created. Scoped by `client_id`, the public-client identity
 * the authorization used.
 */
export const SDKWORK_OAUTH_LOGOUT_PATH = '/oauth/logout'

/** Hosted sign-out page for a page-local account session with no OAuth client binding. */
export const SDKWORK_OAUTH_SIGN_OUT_PATH = '/oauth/sign-out'

/**
 * Trim a host-supplied origin to its bare form.
 * @param origin - configured hosted auth origin.
 * @returns the origin without surrounding space or a trailing slash.
 */
function normalizedOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/u, '')
}

/**
 * Absolute URL of the OAuth logout endpoint for one application.
 *
 * The endpoint ends the session that application's authorization created, so it
 * carries the OAuth client id; standard RP-initiated logout parameters the
 * hosted service does not implement (no `id_token`, no post-logout redirect)
 * are deliberately absent instead of sent empty.
 * @param origin - hosted auth origin the browser login opens.
 * @param clientId - OAuth public-client id the authorization presented.
 * @returns the absolute logout URL.
 */
export function buildOauthLogoutUrl(origin: string, clientId: string): string {
  return `${normalizedOrigin(origin)}${SDKWORK_OAUTH_LOGOUT_PATH}?client_id=${encodeURIComponent(clientId.trim())}`
}

/**
 * Absolute URL of the hosted sign-out page.
 * @param origin - hosted auth origin the browser login opens.
 * @returns the absolute sign-out URL.
 */
export function buildOauthSignOutUrl(origin: string): string {
  return `${normalizedOrigin(origin)}${SDKWORK_OAUTH_SIGN_OUT_PATH}`
}

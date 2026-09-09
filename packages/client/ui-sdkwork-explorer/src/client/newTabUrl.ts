/** The new-tab (+) affordance's URL normalization: raw input to an openable http(s) URL. */

/**
 * Normalize the new-tab input into an absolute http(s) URL.
 * @param raw - the user-typed text (may omit the scheme, carry whitespace).
 * @returns the absolute URL string, or undefined when the input is blank,
 * not parseable, or resolves to a non-http(s) protocol.
 */
export function normalizeNewTabUrl(raw: string): string | undefined {
  const text = raw.trim()
  if (text === '') return undefined
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  return url.toString()
}

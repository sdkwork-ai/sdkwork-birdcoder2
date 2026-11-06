/**
 * Pure value handling for the domain dialog: hostname normalization and
 * validation, numeric parsing, error text, and timestamp formatting. The
 * component owns presentation and locale copy; these helpers own the shapes
 * the SDKWork domain contract accepts, so they can be unit-tested without a
 * rendered tree.
 */

/** A validated single-value input. */
export type ValidatedValue = { ok: true; value: string } | { ok: false }

/** A validated optional-number input (`''` means "not provided"). */
export type ValidatedNumber = { ok: true; value: number | undefined } | { ok: false }

/** One DNS label: letters, digits, and interior hyphens, 1–63 characters. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u

/**
 * Read a user-visible failure message. SDKWork clients reject with an Error
 * carrying the wire `message`; anything else has no message to show.
 * @param error - the rejected value.
 * @returns trimmed message text, or an empty string when there is none.
 */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.trim()
  if (typeof error === 'string') return error.trim()
  return ''
}

/**
 * Normalize a user-typed hostname to ASCII (IDN labels become punycode) and
 * reject anything that is not a bare domain: a scheme, path, port, credentials,
 * query, fragment, or whitespace all disqualify the input.
 * @param raw - user input.
 * @returns the ASCII hostname, or undefined when the input is not a bare host.
 */
export function toAsciiHostname(raw: string): string | undefined {
  const trimmed = raw.trim().replace(/\.+$/u, '').toLowerCase()
  if (trimmed === '' || /\s/u.test(trimmed)) return undefined
  try {
    const url = new URL(`http://${trimmed}`)
    if (
      url.username !== ''
      || url.password !== ''
      || url.port !== ''
      || url.pathname !== '/'
      || url.search !== ''
      || url.hash !== ''
    ) return undefined
    return url.hostname
  } catch {
    return undefined
  }
}

/**
 * Validate a registrable root domain (zone apex): an ASCII hostname of at least
 * two labels, with no wildcard.
 * @param raw - user input.
 * @returns the normalized apex, or a failure for an unregistrable value.
 */
export function normalizeApex(raw: string): ValidatedValue {
  const host = toAsciiHostname(raw)
  if (host === undefined || !host.includes('.') || !host.split('.').every(label => LABEL.test(label))) {
    return { ok: false }
  }
  return { ok: true, value: host }
}

/**
 * Validate a zone-relative hostname (`www`, `api.eu`, `*`, `*.api`). The `*`
 * label is accepted only in the leftmost position; the apex token `@` is
 * rejected because the zone apex is not a subdomain row.
 * @param raw - user input.
 * @returns the normalized relative name, or a failure.
 */
export function normalizeRelativeName(raw: string): ValidatedValue {
  const value = raw.trim().toLowerCase().replace(/\.+$/u, '')
  if (value === '' || value === '@' || value.includes('..')) return { ok: false }
  const labels = value.split('.')
  const wildcard = labels[0] === '*'
  const children = wildcard ? labels.slice(1) : labels
  if (children.length === 0) return { ok: true, value: '*' }
  if (!children.every(label => LABEL.test(label))) return { ok: false }
  return { ok: true, value }
}

/**
 * Validate a resolution record's zone-relative owner name. Unlike a hostname
 * row, a record may target the apex itself (`@`).
 * @param raw - user input.
 * @returns the normalized record host, or a failure.
 */
export function normalizeRecordHost(raw: string): ValidatedValue {
  if (raw.trim() === '@') return { ok: true, value: '@' }
  return normalizeRelativeName(raw)
}

/**
 * Parse an optional TTL in seconds. The accepted range is the conservative
 * window a provider control plane offers (60 s – 7 days); an empty input means
 * "let the provider decide".
 * @param raw - user input.
 * @returns the parsed TTL, `undefined`, or a failure.
 */
export function parseTtl(raw: string): ValidatedNumber {
  const value = raw.trim()
  if (value === '') return { ok: true, value: undefined }
  if (!/^\d+$/u.test(value)) return { ok: false }
  const seconds = Number(value)
  if (seconds < 60 || seconds > 604800) return { ok: false }
  return { ok: true, value: seconds }
}

/**
 * Parse an optional record priority. Only MX (and similar preference-carrying
 * types) publish it; an empty input leaves the field off the request.
 * @param raw - user input.
 * @returns the parsed priority, `undefined`, or a failure.
 */
export function parsePriority(raw: string): ValidatedNumber {
  const value = raw.trim()
  if (value === '') return { ok: true, value: undefined }
  if (!/^\d+$/u.test(value)) return { ok: false }
  const priority = Number(value)
  if (priority > 65535) return { ok: false }
  return { ok: true, value: priority }
}

/**
 * Record types whose wire shape carries a preference value.
 * @param type - the selected record type.
 * @returns whether the form should offer (and require) a priority.
 */
export function recordTypeHasPriority(type: string): boolean {
  return type === 'MX'
}

/**
 * Render an API timestamp in a stable, locale-free minute form so a snapshot
 * does not depend on the viewer's time zone or locale.
 * @param value - the wire timestamp.
 * @returns `YYYY-MM-DD HH:mm` (UTC), or an empty string when absent or invalid.
 */
export function formatTimestamp(value: string | undefined): string {
  if (value === undefined || value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16).replace('T', ' ')
}

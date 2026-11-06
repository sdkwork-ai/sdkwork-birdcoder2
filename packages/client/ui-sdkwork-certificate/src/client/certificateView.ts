/**
 * Pure value handling for the certificate dialog: the verifiable hostname
 * option model, issuance validation, and the display formatting of the ledger
 * rows. The component owns presentation and locale copy; these helpers own the
 * shapes the SDKWork certificate contract accepts, so they can be unit-tested
 * without a rendered tree.
 */
import type { DomainHostnameResponse } from '@sdkwork/deployments-app-sdk'

/** One verified hostname a certificate may cover. */
export interface HostnameOption {
  /** Hostname row id — the `domainIds` member of the issuance request. */
  id: string
  /** Fully-qualified hostname. */
  hostname: string
  /** Whether the row is a wildcard (`WILDCARD`) hostname. */
  wildcard: boolean
  /** The root domain the hostname belongs to, for the grouped picker label. */
  zoneApex: string
}

/** Certificate scope accepted by the issuance request. */
export type CertificateScope = 'SINGLE_DOMAIN' | 'WILDCARD'

/** Why an issuance form cannot be submitted. */
export type IssueProblem =
  | 'invalidName'
  | 'noSelection'
  | 'wildcardNeedsWildcard'
  | 'singleNeedsExact'

/** Validation result of the issuance form. */
export type IssueValidation = { ok: true } | { ok: false; problem: IssueProblem }

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
 * Project one verified hostname row into the picker model.
 * @param hostname - the hostname row.
 * @param zoneApex - the root domain the row belongs to.
 * @returns the option the issuance form renders and submits by id.
 */
export function hostnameOption(hostname: DomainHostnameResponse, zoneApex: string): HostnameOption {
  return {
    id: hostname.id,
    hostname: hostname.hostname,
    wildcard: hostname.hostnameType === 'WILDCARD',
    zoneApex,
  }
}

/**
 * Validate the issuance form before a request is built.
 * @param input - the certificate name, the chosen scope, and the selected options.
 * @returns whether the request may be sent, or the first problem found.
 */
export function validateIssue(input: {
  name: string
  scope: CertificateScope
  selected: readonly HostnameOption[]
}): IssueValidation {
  if (input.name.trim() === '') return { ok: false, problem: 'invalidName' }
  if (input.selected.length === 0) return { ok: false, problem: 'noSelection' }
  if (input.scope === 'WILDCARD') {
    // A wildcard certificate is built around at least one wildcard name; the
    // exact names beside it stay valid SANs.
    return input.selected.some(option => option.wildcard)
      ? { ok: true }
      : { ok: false, problem: 'wildcardNeedsWildcard' }
  }
  return input.selected.every(option => !option.wildcard)
    ? { ok: true }
    : { ok: false, problem: 'singleNeedsExact' }
}

/**
 * Render the identifiers of one certificate as one readable line.
 * @param identifiers - the certificate's covered names.
 * @returns the comma-joined names, or an empty string for none.
 */
export function identifiersText(identifiers: readonly string[]): string {
  return identifiers.join(', ')
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

// @vitest-environment jsdom
/**
 * Certificate value handling: the verified-hostname picker model, issuance
 * validation, identifier rendering, error text, and timestamp formatting.
 */
import { describe, expect, it } from 'vitest'
import type { DomainHostnameResponse } from '@sdkwork/deployments-app-sdk'
import {
  errorText, formatTimestamp, hostnameOption, identifiersText, validateIssue,
} from '../src/client/certificateView.ts'

function hostname(overrides: Partial<DomainHostnameResponse> = {}): DomainHostnameResponse {
  return {
    id: 'h1',
    zoneId: 'z1',
    hostname: 'www.example.com',
    relativeName: 'www',
    hostnameType: 'EXACT',
    verificationStatus: 'VERIFIED',
    status: 'ACTIVE',
    certificateCount: '0',
    bindingCount: '0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    version: '1',
    ...overrides,
  }
}

const exact = hostnameOption(hostname(), 'example.com')
const wildcard = hostnameOption(hostname({ id: 'h2', hostname: '*.example.com', hostnameType: 'WILDCARD' }), 'example.com')

describe('certificateView hostname options', () => {
  it('projects a verified hostname row into the picker model', () => {
    expect(exact).toEqual({ id: 'h1', hostname: 'www.example.com', wildcard: false, zoneApex: 'example.com' })
    expect(wildcard.wildcard).toBe(true)
  })

  it('validates the issuance form field by field', () => {
    expect(validateIssue({ name: '  ', scope: 'SINGLE_DOMAIN', selected: [exact] }))
      .toEqual({ ok: false, problem: 'invalidName' })
    expect(validateIssue({ name: 'cert', scope: 'SINGLE_DOMAIN', selected: [] }))
      .toEqual({ ok: false, problem: 'noSelection' })
    expect(validateIssue({ name: 'cert', scope: 'WILDCARD', selected: [wildcard] })).toEqual({ ok: true })
    expect(validateIssue({ name: 'cert', scope: 'WILDCARD', selected: [wildcard, exact] })).toEqual({ ok: true })
    expect(validateIssue({ name: 'cert', scope: 'SINGLE_DOMAIN', selected: [exact] })).toEqual({ ok: true })
    expect(validateIssue({ name: 'cert', scope: 'WILDCARD', selected: [exact] }))
      .toEqual({ ok: false, problem: 'wildcardNeedsWildcard' })
    expect(validateIssue({ name: 'cert', scope: 'SINGLE_DOMAIN', selected: [wildcard] }))
      .toEqual({ ok: false, problem: 'singleNeedsExact' })
    expect(validateIssue({ name: 'cert', scope: 'SINGLE_DOMAIN', selected: [exact, wildcard] }))
      .toEqual({ ok: false, problem: 'singleNeedsExact' })
  })
})

describe('certificateView display helpers', () => {
  it('joins identifiers and handles the empty list', () => {
    expect(identifiersText(['a.example.com', 'b.example.com'])).toBe('a.example.com, b.example.com')
    expect(identifiersText([])).toBe('')
  })

  it('reads failure text from Errors, strings, and nothing else', () => {
    expect(errorText(new Error('  wire failure  '))).toBe('wire failure')
    expect(errorText('plain')).toBe('plain')
    expect(errorText({ code: 1 })).toBe('')
    expect(errorText(undefined)).toBe('')
  })

  it('formats valid timestamps in UTC minutes and hides invalid ones', () => {
    expect(formatTimestamp('2026-01-02T03:04:05.000Z')).toBe('2026-01-02 03:04')
    expect(formatTimestamp('')).toBe('')
    expect(formatTimestamp(undefined)).toBe('')
    expect(formatTimestamp('not-a-date')).toBe('')
  })
})

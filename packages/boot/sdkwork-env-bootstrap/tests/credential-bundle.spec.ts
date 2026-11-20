import { describe, expect, it } from 'vitest'
import { readTokenTimestamps } from '../src/credential-bundle.ts'

/** Encode one JWT compact segment from a JSON value. */
function segment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

/** Build a public application token carrying the given claims. */
function publicToken(payload: Record<string, unknown>): string {
  return `${segment({ alg: 'none', kid: 'public-app-token', typ: 'JWT' })}.${segment(payload)}.public`
}

describe('readTokenTimestamps', () => {
  it('records no expiry for a permanent public application token', () => {
    // `exp: 0` is the permanent sentinel (APP_ACCESS_TOKEN_SPEC.md §3); reading
    // it as 1970 would report every shipped token as long expired.
    const token = publicToken({ iat: 1_767_225_600, exp: 0 })
    expect(readTokenTimestamps(token)).toEqual({ issuedAt: '2026-01-01T00:00:00.000Z' })
  })

  it('records a concrete rotation deadline', () => {
    const token = publicToken({ iat: 1_767_225_600, exp: 1_800_000_000 })
    expect(readTokenTimestamps(token).expiresAt).toBe(new Date(1_800_000_000_000).toISOString())
  })

  it('returns nothing for a malformed token', () => {
    expect(readTokenTimestamps('not-a-jwt')).toEqual({})
  })
})

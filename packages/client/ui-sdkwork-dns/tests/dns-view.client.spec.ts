// @vitest-environment jsdom
/**
 * DNS value handling: hostname normalization (ASCII/IDN, wildcard rules),
 * record-host rules, numeric parsing, error text, and timestamp formatting.
 */
import { describe, expect, it } from 'vitest'
import {
  errorText, formatTimestamp, normalizeApex, normalizeRecordHost, normalizeRelativeName,
  normalizeVerificationContent, normalizeVerificationFileName, parsePriority, parseTtl,
  recordTypeHasPriority, toAsciiHostname, utf8ByteLength, VERIFICATION_PLATFORMS,
} from '../src/client/dnsView.ts'

describe('dnsView hostname handling', () => {
  it('normalizes a bare ASCII hostname and an IDN input to punycode', () => {
    expect(toAsciiHostname('  Example.COM. ')).toBe('example.com')
    expect(toAsciiHostname('例子.测试')).toBe('xn--fsqu00a.xn--0zwm56d')
  })

  it('rejects inputs that are not a bare hostname', () => {
    expect(toAsciiHostname('')).toBeUndefined()
    expect(toAsciiHostname('   ')).toBeUndefined()
    expect(toAsciiHostname('example.com/path')).toBeUndefined()
    expect(toAsciiHostname('example.com:8443')).toBeUndefined()
    expect(toAsciiHostname('user@example.com')).toBeUndefined()
    expect(toAsciiHostname('example.com?x=1')).toBeUndefined()
    expect(toAsciiHostname('example.com#frag')).toBeUndefined()
    expect(toAsciiHostname('exa mple.com')).toBeUndefined()
    expect(toAsciiHostname('http://')).toBeUndefined()
    expect(toAsciiHostname('%')).toBeUndefined()
  })

  it('accepts a registrable apex and rejects single-label, wildcard, and malformed names', () => {
    expect(normalizeApex('example.com')).toEqual({ ok: true, value: 'example.com' })
    expect(normalizeApex('example.co.uk')).toEqual({ ok: true, value: 'example.co.uk' })
    expect(normalizeApex('localhost').ok).toBe(false)
    expect(normalizeApex('*.example.com').ok).toBe(false)
    expect(normalizeApex('-bad.example.com').ok).toBe(false)
    expect(normalizeApex('bad_.example.com').ok).toBe(false)
    expect(normalizeApex('').ok).toBe(false)
  })

  it('normalizes zone-relative names, allowing one leftmost wildcard label', () => {
    expect(normalizeRelativeName('www')).toEqual({ ok: true, value: 'www' })
    expect(normalizeRelativeName('API.EU.')).toEqual({ ok: true, value: 'api.eu' })
    expect(normalizeRelativeName('*')).toEqual({ ok: true, value: '*' })
    expect(normalizeRelativeName('*.api')).toEqual({ ok: true, value: '*.api' })
    expect(normalizeRelativeName('@').ok).toBe(false)
    expect(normalizeRelativeName('www.*').ok).toBe(false)
    expect(normalizeRelativeName('a..b').ok).toBe(false)
    expect(normalizeRelativeName('').ok).toBe(false)
  })

  it('lets a resolution record target the apex with @', () => {
    expect(normalizeRecordHost(' @ ')).toEqual({ ok: true, value: '@' })
    expect(normalizeRecordHost('www')).toEqual({ ok: true, value: 'www' })
    expect(normalizeRecordHost('bad_').ok).toBe(false)
  })
})

describe('dnsView numeric and formatting helpers', () => {
  it('parses optional TTLs inside the provider window', () => {
    expect(parseTtl('')).toEqual({ ok: true, value: undefined })
    expect(parseTtl('600')).toEqual({ ok: true, value: 600 })
    expect(parseTtl('59').ok).toBe(false)
    expect(parseTtl('604801').ok).toBe(false)
    expect(parseTtl('12.5').ok).toBe(false)
    expect(parseTtl('-1').ok).toBe(false)
  })

  it('parses optional priorities up to the 16-bit ceiling', () => {
    expect(parsePriority('')).toEqual({ ok: true, value: undefined })
    expect(parsePriority('10')).toEqual({ ok: true, value: 10 })
    expect(parsePriority('65536').ok).toBe(false)
    expect(parsePriority('abc').ok).toBe(false)
  })

  it('marks only MX as a priority-carrying type', () => {
    expect(recordTypeHasPriority('MX')).toBe(true)
    expect(recordTypeHasPriority('TXT')).toBe(false)
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

describe('dnsView verification-file handling', () => {
  it('carries the server platform set in the order the picker renders it', () => {
    expect([...VERIFICATION_PLATFORMS]).toEqual([
      'WECHAT_OFFICIAL_ACCOUNT',
      'WECHAT_MINI_PROGRAM',
      'ALIPAY',
      'BYTEDANCE',
      'APPLE',
      'GOOGLE',
      'CUSTOM',
    ])
  })

  it('accepts the shipped platform file shapes and rejects the rest', () => {
    expect(normalizeVerificationFileName(' MP_verify_aB123.txt ')).toEqual({
      ok: true,
      value: 'MP_verify_aB123.txt',
    })
    expect(normalizeVerificationFileName('google1a2b3c.html')).toEqual({
      ok: true,
      value: 'google1a2b3c.html',
    })
    expect(normalizeVerificationFileName('BingSiteAuth.xml').ok).toBe(true)
    for (const bad of [
      '',
      'no-extension',
      '.txt',
      'a.TXT',
      'a.txt.exe',
      'spaces in name.txt',
      '中文.txt',
      'a/b.txt',
      '-leading.txt',
      `${'a'.repeat(126)}.txt`,
    ]) {
      expect(normalizeVerificationFileName(bad).ok, bad).toBe(false)
    }
  })

  it('bounds content by UTF-8 bytes and keeps the bytes verbatim', () => {
    expect(normalizeVerificationContent('token\n')).toEqual({ ok: true, value: 'token\n' })
    expect(normalizeVerificationContent('x'.repeat(4096)).ok).toBe(true)
    expect(normalizeVerificationContent('x'.repeat(4097)).ok).toBe(false)
    expect(normalizeVerificationContent('').ok).toBe(false)
    expect(normalizeVerificationContent('ok\u0000bad').ok).toBe(false)
    expect(normalizeVerificationContent('ok\u007Fbad').ok).toBe(false)
    expect(normalizeVerificationContent('ok\t\ntab and newline').ok).toBe(true)
    // 2049 four-byte characters exceed the byte ceiling though not the char count.
    expect(normalizeVerificationContent('𠀀'.repeat(1025)).ok).toBe(false)
    expect(utf8ByteLength('a')).toBe(1)
    expect(utf8ByteLength('测')).toBe(3)
  })
})

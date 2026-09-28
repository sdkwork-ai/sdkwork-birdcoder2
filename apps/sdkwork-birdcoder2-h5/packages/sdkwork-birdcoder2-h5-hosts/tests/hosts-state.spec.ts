import { describe, expect, it } from 'vitest'

import { BirdCoder2ApiError } from '@sdkwork/birdcoder2-h5-core'

import { BIRDCODER2_H5_HOSTS_PACKAGE, BIRDCODER2_H5_HOSTS_ROUTE_CONTRIBUTIONS } from '../src/routes/appRouteContributions'
import {
  resolveHostsLanguage,
  resolveHostsMessages,
  type HostsLanguage,
} from '../src/messages/hostsMessages'
import { toHostsFailure } from '../src/state/hostsState'

describe('toHostsFailure', () => {
  it('separates an expired credential from a broken call', () => {
    expect(toHostsFailure(new BirdCoder2ApiError('nope', { status: 401 })).code).toBe('authentication')
    expect(toHostsFailure(new BirdCoder2ApiError('nope', { status: 403 })).code).toBe('authentication')
    expect(toHostsFailure(new BirdCoder2ApiError('boom', { status: 500 })).code).toBe('unknown')
  })

  it('appends the trace id so a support report can be matched to a request', () => {
    const failure = toHostsFailure(new BirdCoder2ApiError('boom', { status: 500, traceId: 'tr-9' }))
    expect(failure.message).toBe('boom (trace tr-9)')
  })

  it('leaves the message alone when the platform sent no trace id', () => {
    expect(toHostsFailure(new BirdCoder2ApiError('boom', { status: 500 })).message).toBe('boom')
  })

  it('normalizes a plain error and a thrown non-error', () => {
    expect(toHostsFailure(new Error('offline'))).toEqual({ code: 'unknown', message: 'offline' })
    expect(toHostsFailure('offline')).toEqual({ code: 'unknown', message: 'offline' })
  })
})

describe('resolveHostsLanguage', () => {
  it('routes every Chinese variant to the right script', () => {
    const expectations: readonly (readonly [string, HostsLanguage])[] = [
      ['zh', 'zh-Hans'],
      ['zh-CN', 'zh-Hans'],
      ['zh-SG', 'zh-Hans'],
      ['zh-Hant', 'zh-Hant'],
      ['zh-TW', 'zh-Hant'],
      ['zh-HK', 'zh-Hant'],
      ['zh-MO', 'zh-Hant'],
    ]
    for (const [tag, expected] of expectations) {
      expect(resolveHostsLanguage(tag), tag).toBe(expected)
    }
  })

  it('falls back to English for a non-Chinese tag', () => {
    expect(resolveHostsLanguage('en-US')).toBe('en')
    expect(resolveHostsLanguage('de')).toBe('en')
  })

  it('resolves a language even when the caller passes nothing', () => {
    const language = resolveHostsLanguage()
    expect(['en', 'zh-Hans', 'zh-Hant']).toContain(language)
  })
})

describe('host fleet catalog', () => {
  // A key present in one language and missing from another renders as a blank
  // label on a phone, which no test of a single language would catch.
  it('carries the same keys in every language', () => {
    const languages: readonly HostsLanguage[] = ['en', 'zh-Hans', 'zh-Hant']
    const keySets = languages.map(language => Object.keys(resolveHostsMessages(language)).sort())
    expect(keySets[1]).toEqual(keySets[0])
    expect(keySets[2]).toEqual(keySets[0])
    expect(keySets[0]?.length ?? 0).toBeGreaterThan(0)
  })

  it('never leaves a message empty', () => {
    for (const language of ['en', 'zh-Hans', 'zh-Hant'] as const) {
      for (const [key, value] of Object.entries(resolveHostsMessages(language))) {
        expect(value.trim(), `${language}.${key}`).not.toBe('')
      }
    }
  })
})

describe('host fleet route contributions', () => {
  it('declares the fleet tab and the enrollment screen on the app surface', () => {
    expect(BIRDCODER2_H5_HOSTS_ROUTE_CONTRIBUTIONS.map(route => route.id)).toEqual([
      'app.host.fleet.index',
      'app.host.fleet.enroll',
    ])
    expect(BIRDCODER2_H5_HOSTS_ROUTE_CONTRIBUTIONS.map(route => route.path)).toEqual([
      '/hosts',
      '/hosts/enroll',
    ])
  })

  it('labels the tab, because the shell renders a tab through its label key', () => {
    const tab = BIRDCODER2_H5_HOSTS_ROUTE_CONTRIBUTIONS.find(route => route.presentation === 'tab')
    expect(tab?.tabLabelKey).toBeDefined()
    expect(tab?.titleKey).toBeDefined()
  })

  it('attributes every contribution to this package', () => {
    expect(BIRDCODER2_H5_HOSTS_PACKAGE).toBe('@sdkwork/birdcoder2-h5-hosts')
  })
})

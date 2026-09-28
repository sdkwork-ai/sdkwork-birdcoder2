import { describe, expect, it } from 'vitest'

import {
  BirdCoder2RouteRegistryError,
  createRouteRegistry,
  routeIdOf,
  type BirdCoder2H5RouteContribution,
  type BirdCoder2H5RoutePresentation,
} from '../src/index'

interface ContributionOverrides {
  readonly id?: string
  readonly path?: string
  readonly presentation?: BirdCoder2H5RoutePresentation
}

/** A contribution the registry accepts. */
function contribution(overrides: ContributionOverrides = {}): BirdCoder2H5RouteContribution {
  return {
    id: routeIdOf('agent', 'chat', 'index'),
    path: '/',
    component: 'ChatPage',
    auth: 'required',
    presentation: 'tab',
    titleKey: 'route.chat',
    tabLabelKey: 'route.chat',
    iconKey: 'agent-chat',
    ...overrides,
  }
}

/**
 * The same contribution with `tabLabelKey` left out entirely.
 *
 * A separate fixture rather than `contribution({ tabLabelKey: undefined })`,
 * because under `exactOptionalPropertyTypes` an absent key and a key assigned
 * `undefined` are different types — and the registry's "a tab must declare a
 * label" rule is about the key being absent. Writing the key out here keeps that
 * distinction visible at the call site instead of burying it in a cast.
 */
function contributionWithoutTabLabel(overrides: ContributionOverrides = {}): BirdCoder2H5RouteContribution {
  return {
    id: overrides.id ?? routeIdOf('agent', 'chat', 'index'),
    path: overrides.path ?? '/',
    component: 'ChatPage',
    auth: 'required',
    presentation: overrides.presentation ?? 'tab',
    titleKey: 'route.chat',
  }
}

/**
 * The same contribution with `iconKey` left out.
 *
 * Split from `contributionWithoutTabLabel` for the same reason that one is split
 * from `contribution`: the label rule and the icon rule are separate rules, and
 * one fixture missing both would let either rule's failure mask the other's.
 */
function contributionWithoutIcon(overrides: ContributionOverrides = {}): BirdCoder2H5RouteContribution {
  return {
    id: overrides.id ?? routeIdOf('agent', 'chat', 'index'),
    path: overrides.path ?? '/',
    component: 'ChatPage',
    auth: 'required',
    presentation: overrides.presentation ?? 'tab',
    titleKey: 'route.chat',
    tabLabelKey: 'route.chat',
  }
}

describe('routeIdOf', () => {
  it('builds the four-segment identity the registry requires', () => {
    expect(routeIdOf('host', 'fleet', 'enroll')).toBe('app.host.fleet.enroll')
  })

  it('lets a non-app surface build its own identity', () => {
    expect(routeIdOf('host', 'fleet', 'enroll', 'console')).toBe('console.host.fleet.enroll')
  })
})

describe('createRouteRegistry', () => {
  it('freezes contributions and indexes them by identity and path', () => {
    const registry = createRouteRegistry([['@sdkwork/fixture', [contribution()]]])
    expect(registry.routes).toHaveLength(1)
    expect(registry.tabs).toHaveLength(1)
    expect(registry.findById('app.agent.chat.index')?.component).toBe('ChatPage')
    expect(registry.findByPath('/')?.id).toBe('app.agent.chat.index')
  })

  it('normalizes a path without a leading slash and a trailing slash', () => {
    const registry = createRouteRegistry([
      ['@sdkwork/fixture', [contributionWithoutTabLabel({ path: 'hosts/', presentation: 'screen' })]],
    ])
    expect(registry.findByPath('/hosts')?.id).toBe('app.agent.chat.index')
  })

  it('rejects an identity that is not four segments', () => {
    expect(() =>
      createRouteRegistry([['@sdkwork/fixture', [contribution({ id: 'app.chat' })]]]),
    ).toThrowError(BirdCoder2RouteRegistryError)
  })

  it('rejects an identity on another surface', () => {
    expect(() =>
      createRouteRegistry([['@sdkwork/fixture', [contribution({ id: 'web.agent.chat.index' })]]]),
    ).toThrowError(/must start with "app\."/u)
  })

  it('names both packages when an identity is declared twice', () => {
    const route = contribution()
    expect(() =>
      createRouteRegistry([
        ['@sdkwork/first', [route]],
        ['@sdkwork/second', [route]],
      ]),
    ).toThrowError(/declared by both @sdkwork\/first and @sdkwork\/second/u)
  })

  it('rejects two routes claiming one path', () => {
    expect(() =>
      createRouteRegistry([
        ['@sdkwork/fixture', [contribution(), contribution({ id: routeIdOf('host', 'fleet', 'index') })]],
      ]),
    ).toThrowError(/path "\/" is claimed by both/u)
  })

  it('rejects a tab without a navigation label', () => {
    expect(() =>
      createRouteRegistry([['@sdkwork/fixture', [contributionWithoutTabLabel()]]]),
    ).toThrowError(/must declare tabLabelKey/u)
  })

  it('accepts a screen route without a navigation label', () => {
    const registry = createRouteRegistry([
      ['@sdkwork/fixture', [contributionWithoutTabLabel({ presentation: 'screen' })]],
    ])
    expect(registry.tabs).toHaveLength(0)
  })

  it('rejects a tab without a navigation icon', () => {
    expect(() =>
      createRouteRegistry([['@sdkwork/fixture', [contributionWithoutIcon()]]]),
    ).toThrowError(/must declare iconKey/u)
  })

  it('accepts a screen route without a navigation icon', () => {
    const registry = createRouteRegistry([
      ['@sdkwork/fixture', [contributionWithoutIcon({ presentation: 'screen' })]],
    ])
    expect(registry.tabs).toHaveLength(0)
  })

  it('returns undefined for an unknown id and path', () => {
    const registry = createRouteRegistry([['@sdkwork/fixture', [contribution()]]])
    expect(registry.findById('app.host.fleet.index')).toBeUndefined()
    expect(registry.findByPath('/hosts')).toBeUndefined()
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearRelayCatalogPolicy,
  relayCatalogPolicy,
  relayCatalogPolicyVersion,
  resetRelayCatalogPoliciesForTest,
  setRelayCatalogPolicy,
  subscribeRelayCatalogPolicy,
} from '../src/relay-catalog-policy.ts'
import { harnessModels } from '../src/relay.ts'
import { catalogModels } from '../src/catalog.ts'

const PROVIDER = 'birdcoder'

beforeEach(() => {
  resetRelayCatalogPoliciesForTest()
})

afterEach(() => {
  resetRelayCatalogPoliciesForTest()
})

/** The build-time seed keys the policy tests narrow. */
function seedKeys(): string[] {
  return [...(harnessModels(PROVIDER)?.keys() ?? [])]
}

describe('relay catalog policy publication', () => {
  it('leaves the seed authoritative until a policy is published', () => {
    const seed = seedKeys()
    expect(seed.length).toBeGreaterThan(1)
    expect(relayCatalogPolicy(PROVIDER)).toBeUndefined()
    expect(seedKeys()).toEqual(seed)
  })

  it('applies the published order and membership to the relay catalog', () => {
    const [first, second] = seedKeys()
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    const changed = setRelayCatalogPolicy(PROVIDER, {
      catalogKeys: [second!, first!],
      revision: 7,
      updatedAt: '2026-11-23T00:00:00Z',
      source: 'test',
    })
    expect(changed).toBe(true)
    expect([...harnessModels(PROVIDER)!.keys()]).toEqual([second, first])
    expect([...catalogModels(PROVIDER).keys()]).toEqual([second, first])
  })

  it('materializes a catalog key the build-time seed does not describe', () => {
    setRelayCatalogPolicy(PROVIDER, {
      catalogKeys: ['vendor/future-model'],
      revision: 8,
      updatedAt: '2026-11-23T00:00:00Z',
      source: 'test',
    })
    const model = harnessModels(PROVIDER)?.get('vendor/future-model')
    expect(model).toBeDefined()
    expect(model?.provider).toBe(PROVIDER)
    expect(model?.id).toBe('vendor/future-model')
    expect(model?.name).toBe('vendor/future-model')
    expect(model?.baseUrl).toContain('birdcoder')
    expect(model?.contextWindow).toBeGreaterThan(0)
  })

  it('treats an empty policy as an explicit empty exposure, not a fallback', () => {
    setRelayCatalogPolicy(PROVIDER, {
      catalogKeys: [],
      revision: 9,
      updatedAt: '2026-11-23T00:00:00Z',
      source: 'test',
    })
    expect(harnessModels(PROVIDER)?.size).toBe(0)
  })

  it('restores the seed after the policy is cleared', () => {
    const seed = seedKeys()
    setRelayCatalogPolicy(PROVIDER, {
      catalogKeys: [seed[0]!],
      revision: 10,
      updatedAt: '2026-11-23T00:00:00Z',
      source: 'test',
    })
    expect(harnessModels(PROVIDER)?.size).toBe(1)
    expect(clearRelayCatalogPolicy(PROVIDER)).toBe(true)
    expect(seedKeys()).toEqual(seed)
  })
})

describe('relay catalog policy identity', () => {
  it('normalizes duplicates and advances the version only on real change', () => {
    const [first] = seedKeys()
    const before = relayCatalogPolicyVersion()
    const policy = {
      catalogKeys: [first!, first!, '  ', 'other/model'],
      revision: 3,
      updatedAt: '2026-11-23T00:00:00Z',
      source: 'test',
    }
    expect(setRelayCatalogPolicy(PROVIDER, policy)).toBe(true)
    const afterFirst = relayCatalogPolicyVersion()
    expect(afterFirst).toBeGreaterThan(before)
    expect(relayCatalogPolicy(PROVIDER)?.catalogKeys).toEqual([first, 'other/model'])
    expect(setRelayCatalogPolicy(PROVIDER, policy)).toBe(false)
    expect(relayCatalogPolicyVersion()).toBe(afterFirst)
  })

  it('notifies subscribers with the changed route', () => {
    const seen: string[] = []
    const dispose = subscribeRelayCatalogPolicy((provider) => { seen.push(provider) })
    setRelayCatalogPolicy(PROVIDER, {
      catalogKeys: ['vendor/model'],
      revision: 1,
      updatedAt: '2026-11-23T00:00:00Z',
      source: 'test',
    })
    clearRelayCatalogPolicy(PROVIDER)
    dispose()
    setRelayCatalogPolicy(PROVIDER, {
      catalogKeys: ['vendor/model'],
      revision: 2,
      updatedAt: '2026-11-23T00:00:00Z',
      source: 'test',
    })
    expect(seen).toEqual([PROVIDER, PROVIDER])
  })
})

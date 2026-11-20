import { describe, expect, it } from 'vitest'
import type { NpmPackageLock, RegistryIndex } from './benchmark-npm-resolution.ts'
import {
  assertDualDshInstallLayout,
  assertResolutionWorkBudget,
  buildDualDshRegistry,
  MAX_RESOLUTION_WORK_UNITS,
} from './verify-npm-install-layout.ts'

function validLayout(): NpmPackageLock {
  return {
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { '@deepseek-ai/dsh': '0.2.0', 'dsh-previous': 'npm:@deepseek-ai/dsh@0.1.0' } },
      'node_modules/@deepseek-ai/cordis': { version: '4.0.1' },
      'node_modules/@deepseek-ai/dsh': {
        version: '0.2.0',
        dependencies: { '@deepseek-ai/dsh-child': '^0.2.0' },
        peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
      },
      'node_modules/@deepseek-ai/dsh-child': {
        version: '0.2.0',
        dependencies: { '@deepseek-ai/dsh-leaf': '^0.2.0' },
      },
      'node_modules/@deepseek-ai/dsh-leaf': { version: '0.2.0' },
      'node_modules/dsh-previous': {
        name: '@deepseek-ai/dsh',
        version: '0.1.0',
        dependencies: { '@deepseek-ai/dsh-child': '^0.1.0' },
        peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
      },
      'node_modules/dsh-previous/node_modules/@deepseek-ai/dsh-child': {
        version: '0.1.0',
        dependencies: { '@deepseek-ai/dsh-leaf': '^0.1.0' },
      },
      'node_modules/dsh-previous/node_modules/@deepseek-ai/dsh-leaf': { version: '0.1.0' },
    },
  }
}

const WORKSPACE_DSH_PACKAGES = new Set([
  '@deepseek-ai/dsh',
  '@deepseek-ai/dsh-child',
  '@deepseek-ai/dsh-leaf',
])

describe('npm install layout verifier', () => {
  it('creates two incompatible versions of every DSH package', () => {
    const index: RegistryIndex = new Map([
      ['@deepseek-ai/dsh', new Map([['0.1.1-rc.2', {
        name: '@deepseek-ai/dsh',
        version: '0.1.1-rc.2',
        dependencies: { '@deepseek-ai/dsh-child': '^0.1.1-rc.2' },
        peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
      }]])],
      ['@deepseek-ai/dsh-child', new Map([['0.1.1-rc.2', {
        name: '@deepseek-ai/dsh-child',
        version: '0.1.1-rc.2',
      }]])],
      ['@deepseek-ai/cordis', new Map([['4.0.1', {
        name: '@deepseek-ai/cordis',
        version: '4.0.1',
      }]])],
    ])

    const dual = buildDualDshRegistry(index, '0.1.1-rc.2')

    expect([...dual.get('@deepseek-ai/dsh')?.keys() ?? []]).toEqual(['0.1.0', '0.2.0'])
    expect(dual.get('@deepseek-ai/dsh')?.get('0.1.0')).toMatchObject({
      version: '0.1.0',
      dependencies: { '@deepseek-ai/dsh-child': '^0.1.0' },
      peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
    })
    expect(dual.get('@deepseek-ai/dsh')?.get('0.2.0')).toMatchObject({
      version: '0.2.0',
      dependencies: { '@deepseek-ai/dsh-child': '^0.2.0' },
    })
    expect(dual.get('@deepseek-ai/cordis')).toBe(index.get('@deepseek-ai/cordis'))
  })

  it('leaves a DSH package that is not a workspace member untouched', () => {
    const index: RegistryIndex = new Map([
      ['@deepseek-ai/dsh', new Map([['0.1.1-rc.2', { name: '@deepseek-ai/dsh', version: '0.1.1-rc.2' }]])],
      ['@deepseek-ai/dsh-invariants', new Map([['0.1.0-rc.8', {
        name: '@deepseek-ai/dsh-invariants',
        version: '0.1.0-rc.8',
      }]])],
    ])

    const dual = buildDualDshRegistry(index, '0.1.1-rc.2')

    expect(dual.get('@deepseek-ai/dsh-invariants')).toBe(index.get('@deepseek-ai/dsh-invariants'))
  })

  it('removes every DSH edge from a glue package and keeps the others', () => {
    const index: RegistryIndex = new Map([
      ['@deepseek-ai/dsh', new Map([['0.1.1-rc.2', { name: '@deepseek-ai/dsh', version: '0.1.1-rc.2' }]])],
      ['@deepseek-ai/dsh-child', new Map([['0.1.1-rc.2', { name: '@deepseek-ai/dsh-child', version: '0.1.1-rc.2' }]])],
      ['@deepseek-ai/dsh-invariants', new Map([['0.1.0-rc.8', {
        name: '@deepseek-ai/dsh-invariants',
        version: '0.1.0-rc.8',
      }]])],
      ['dsh-mcp-connector', new Map([['0.2.117', {
        name: 'dsh-mcp-connector',
        version: '0.2.117',
        dependencies: { '@deepseek-ai/dsh-child': '0.1.1-rc.2', 'left-pad': '^1.3.0' },
        optionalDependencies: { '@deepseek-ai/dsh': '^0.1.1-rc.2' },
        peerDependencies: {
          '@deepseek-ai/dsh': '*',
          '@deepseek-ai/dsh-invariants': '*',
          react: '19.2.8',
        },
      }]])],
    ])

    const dual = buildDualDshRegistry(index, '0.1.1-rc.2')

    // No resolution of these edges is both cheap and honest: an unchanged range
    // has no candidate, a range fitting both releases lets npm choose per
    // placement, and a range bound to the root release makes npm install that
    // release's copies for a shared package. The gate asserts DSH edges only, so
    // it drops them and keeps the glue package's own dependencies.
    expect(dual.get('dsh-mcp-connector')?.get('0.2.117')).toMatchObject({
      dependencies: { 'left-pad': '^1.3.0' },
      peerDependencies: { react: '19.2.8' },
    })
    expect(dual.get('dsh-mcp-connector')?.get('0.2.117')).not.toHaveProperty('optionalDependencies')
  })

  it('leaves a glue package without DSH edges untouched', () => {
    const index: RegistryIndex = new Map([
      ['@deepseek-ai/dsh', new Map([['0.1.1-rc.2', { name: '@deepseek-ai/dsh', version: '0.1.1-rc.2' }]])],
      ['dsh-better-sidebar', new Map([['0.32.1', {
        name: 'dsh-better-sidebar',
        version: '0.32.1',
        peerDependencies: { react: '19.2.8' },
      }]])],
    ])

    const dual = buildDualDshRegistry(index, '0.1.1-rc.2')

    expect(dual.get('dsh-better-sidebar')).toBe(index.get('dsh-better-sidebar'))
  })

  it('ignores a DSH package that is not a workspace member in the layout', () => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      'node_modules/@deepseek-ai/dsh-invariants': { version: '0.1.0-rc.8' },
    }

    expect(assertDualDshInstallLayout({ ...layout, packages }, WORKSPACE_DSH_PACKAGES)).toEqual({
      dshPackagesPerVersion: 3,
      checkedDshEdges: 4,
    })
  })

  it('accepts isolated DSH releases with one shared Cordis installation', () => {
    expect(assertDualDshInstallLayout(validLayout(), WORKSPACE_DSH_PACKAGES)).toEqual({
      dshPackagesPerVersion: 3,
      checkedDshEdges: 4,
    })
  })

  it('accepts one auto-installed react/react-dom peer copy per release-free root', () => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      'node_modules/react': { version: '19.2.8' },
      'node_modules/react-dom': { version: '19.2.8' },
    }
    expect(assertDualDshInstallLayout({ ...layout, packages }, WORKSPACE_DSH_PACKAGES)).toEqual({
      dshPackagesPerVersion: 3,
      checkedDshEdges: 4,
    })
  })

  it('rejects a browser runtime declared by the synthetic consumer itself', () => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      '': { dependencies: { ...layout.packages['']?.dependencies, react: '19.2.8' } },
      'node_modules/react': { version: '19.2.8' },
    }
    expect(() => assertDualDshInstallLayout({ ...layout, packages }, WORKSPACE_DSH_PACKAGES)).toThrow(
      'synthetic consumer declares browser build input react',
    )
  })

  it.each([
    ['dependencies', 'dependencies react is a browser build input'],
    ['optionalDependencies', 'optionalDependencies react is a browser build input'],
  ])('rejects a DSH package reaching react through %s', (field, message) => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      'node_modules/@deepseek-ai/dsh': {
        ...layout.packages['node_modules/@deepseek-ai/dsh'],
        [field]: { react: '19.2.8' },
      },
      'node_modules/react': { version: '19.2.8' },
    }
    expect(() => assertDualDshInstallLayout({ ...layout, packages }, WORKSPACE_DSH_PACKAGES)).toThrow(message)
  })

  it('allows a DSH package to declare react only as a peer', () => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      'node_modules/@deepseek-ai/dsh': {
        ...layout.packages['node_modules/@deepseek-ai/dsh'],
        peerDependencies: { ...layout.packages['node_modules/@deepseek-ai/dsh']?.peerDependencies, react: '19.2.8' },
      },
      'node_modules/react': { version: '19.2.8' },
    }
    expect(assertDualDshInstallLayout({ ...layout, packages }, WORKSPACE_DSH_PACKAGES)).toEqual({
      dshPackagesPerVersion: 3,
      checkedDshEdges: 4,
    })
  })

  it('rejects two installed copies of a browser runtime', () => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      'node_modules/react': { version: '19.2.8' },
      'node_modules/dsh-previous/node_modules/react': { version: '18.3.1' },
    }
    expect(() => assertDualDshInstallLayout({ ...layout, packages }, WORKSPACE_DSH_PACKAGES)).toThrow(
      'react has 2 installed copies, expected one',
    )
  })

  it('rejects an internal edge that crosses release versions', () => {
    const layout = validLayout()
    const packages = { ...layout.packages }
    Reflect.deleteProperty(packages, 'node_modules/dsh-previous/node_modules/@deepseek-ai/dsh-leaf')

    expect(() => assertDualDshInstallLayout({ ...layout, packages }, WORKSPACE_DSH_PACKAGES)).toThrow(
      'node_modules/dsh-previous/node_modules/@deepseek-ai/dsh-child: dependencies '
      + '@deepseek-ai/dsh-leaf resolves to node_modules/@deepseek-ai/dsh-leaf@0.2.0, expected 0.1.0',
    )
  })

  it('rejects a second Cordis installation', () => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      'node_modules/dsh-previous/node_modules/@deepseek-ai/cordis': { version: '4.0.1' },
    }

    expect(() => assertDualDshInstallLayout({ ...layout, packages }, WORKSPACE_DSH_PACKAGES)).toThrow(
      'expected one shared @deepseek-ai/cordis',
    )
  })
})

describe('resolution work budget', () => {
  it.each([
    [277, 2524, 699_148],
    [316, 2780, 878_480],
    [316, 2786, 880_376],
    [317, 2786, 883_162],
    [320, 2836, 907_520],
  ])('accepts the measured dual-release graph with %i packages and %i edges', (packages, edges, units) => {
    expect(assertResolutionWorkBudget({ dshPackagesPerVersion: packages, checkedDshEdges: edges }))
      .toBe(units)
  })

  it('accepts a graph exactly at the budget and rejects one internal edge above it', () => {
    const packages = 320
    const edgesAtBudget = Math.floor(MAX_RESOLUTION_WORK_UNITS / packages)

    const unitsAtBudget = packages * edgesAtBudget
    expect(unitsAtBudget).toBeLessThanOrEqual(MAX_RESOLUTION_WORK_UNITS)
    expect(assertResolutionWorkBudget({ dshPackagesPerVersion: packages, checkedDshEdges: edgesAtBudget }))
      .toBe(unitsAtBudget)
    expect(() => assertResolutionWorkBudget({
      dshPackagesPerVersion: packages,
      checkedDshEdges: edgesAtBudget + 1,
    })).toThrow(`= ${String(unitsAtBudget + packages)} unit(s), budget ${String(MAX_RESOLUTION_WORK_UNITS)} unit(s)`)
  })

  it('accepts the headroom and rejects a runaway graph with its own measured counts', () => {
    expect(assertResolutionWorkBudget({ dshPackagesPerVersion: 300, checkedDshEdges: 2800 }))
      .toBe(840_000)
    // FORK DIVERGENCE: derive the runaway graph from the budget instead of
    // restating either side, so re-measuring `MAX_RESOLUTION_WORK_UNITS`
    // does not also edit this test.
    const runawayPackages = 400
    const runawayEdges = Math.floor(MAX_RESOLUTION_WORK_UNITS / runawayPackages) + 1
    expect(runawayPackages * runawayEdges).toBeGreaterThan(MAX_RESOLUTION_WORK_UNITS)
    expect(() => assertResolutionWorkBudget({
      dshPackagesPerVersion: runawayPackages,
      checkedDshEdges: runawayEdges,
    })).toThrow(`${String(runawayPackages)} package(s) per release x ${String(runawayEdges)} internal edge(s) = ${String(runawayPackages * runawayEdges)} unit(s), budget ${String(MAX_RESOLUTION_WORK_UNITS)} unit(s)`)
  })
})

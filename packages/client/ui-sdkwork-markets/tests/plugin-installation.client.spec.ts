import { describe, expect, it } from 'vitest'
import type { BundleInfo } from '@deepseek-ai/dsh-api-remotes/client'
import {
  catalogPackageName, catalogVersion, findInstallation, gitOriginOf, installTargetOf,
} from '../src/client/pluginInstallation.ts'

function bundle(values: Partial<BundleInfo> & Pick<BundleInfo, 'name'>): BundleInfo {
  return {
    official: false,
    availability: 'profile',
    enabled: true,
    installed: true,
    optional: false,
    removable: true,
    rows: [],
    overrides: [],
    ...values,
  }
}

describe('installTargetOf', () => {
  it('prefers the record target and falls back to the default listed target', () => {
    expect(installTargetOf({
      installTarget: { kind: 'registry', spec: 'demo@1.0.0' },
      installTargets: [{ kind: 'git', spec: 'git+https://example.com/demo.git' }],
    } as never)).toEqual({ kind: 'registry', spec: 'demo@1.0.0' })
    expect(installTargetOf({
      installTargets: [
        { kind: 'git', spec: 'git+https://example.com/demo.git', isDefault: false },
        { kind: 'archive', spec: 'archive+https://example.com/demo.tgz', isDefault: true },
      ],
    } as never)).toEqual({ kind: 'archive', spec: 'archive+https://example.com/demo.tgz', isDefault: true })
    expect(installTargetOf({ pluginKey: 'demo' } as never)).toBeUndefined()
  })
})

describe('catalog facts', () => {
  it('reads the package name and version from the record before the imported projection', () => {
    expect(catalogPackageName({
      installTarget: { kind: 'registry', spec: 'demo@1.2.3', packageName: 'demo' },
      marketplaceMetadata: { provider: 'dsh-market', npmPackage: 'legacy' },
    } as never)).toBe('demo')
    expect(catalogPackageName({ marketplaceMetadata: { provider: 'dsh-market', npmPackage: 'legacy' } } as never)).toBe('legacy')
    expect(catalogVersion({ registryVersion: '2.0.0', installTarget: { kind: 'registry', spec: 'demo@1.0.0' } } as never)).toBe('2.0.0')
    expect(catalogVersion({ installTarget: { kind: 'registry', spec: 'demo@1.0.0', packageVersion: '1.0.0' } } as never)).toBe('1.0.0')
  })
})

describe('gitOriginOf', () => {
  it('normalizes every accepted Git form to host/path', () => {
    expect(gitOriginOf('git+https://github.com/Owner/Repo.git#abc&path:/x')).toBe('github.com/owner/repo')
    expect(gitOriginOf('github:owner/repo')).toBe('github.com/owner/repo')
    expect(gitOriginOf('git@github.com:owner/repo.git')).toBe('github.com/owner/repo')
    expect(gitOriginOf('https://example.com/a/b')).toBe('example.com/a/b')
    expect(gitOriginOf('demo@1.0.0')).toBeUndefined()
  })
})

describe('findInstallation', () => {
  it('matches an installed registry dependency by package name', () => {
    const installation = findInstallation({
      installTarget: { kind: 'registry', spec: 'demo@2.0.0', packageName: 'demo', packageVersion: '2.0.0' },
    } as never, [bundle({ name: 'demo', version: '1.0.0', update: 'registry' })])
    expect(installation).toEqual({
      status: 'update-available', packageName: 'demo', installedVersion: '1.0.0', version: '2.0.0',
    })
  })

  it('reports an installed dependency whose catalog version matches', () => {
    const installation = findInstallation({
      registryVersion: '2.0.0',
      installTarget: { kind: 'registry', spec: 'demo@2.0.0', packageName: 'demo', packageVersion: '2.0.0' },
    } as never, [bundle({ name: 'demo', version: '2.0.0', update: 'registry' })])
    expect(installation?.status).toBe('installed')
  })

  it('matches an installed Git dependency by the repository origin it was saved from', () => {
    const installation = findInstallation({
      repositoryUrl: 'https://github.com/example/plugin',
      installTarget: { kind: 'git', spec: 'git+https://github.com/example/plugin.git#main&path:/packages/plugin' },
    } as never, [bundle({ name: 'some-package-name', version: '0.3.0', source: 'git+https://github.com/example/plugin.git#abcdef&path:/packages/plugin' })])
    expect(installation).toEqual({ status: 'installed', packageName: 'some-package-name', installedVersion: '0.3.0' })
  })

  it('does not claim a record the profile does not hold', () => {
    expect(findInstallation({ pluginKey: 'demo', marketplaceMetadata: { provider: 'dsh-market' } } as never, [
      bundle({ name: 'other', version: '1.0.0' }),
    ])).toBeUndefined()
  })
})

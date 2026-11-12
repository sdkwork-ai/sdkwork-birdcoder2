/** Discovery of the independent app roots under a project's `apps/` tree. */
import { describe, expect, it } from 'vitest'
import {
  appsIndexRoleForDirectory,
  scanTemplateApps,
  type TemplateAppScanPort,
} from '../src/client/templateApps.ts'

interface Tree {
  readonly directories: Readonly<Record<string, readonly string[]>>
  readonly files: Readonly<Record<string, string>>
}

/** Structural port over an in-memory tree. */
function portOf(tree: Tree): TemplateAppScanPort {
  return {
    listDirectory: async (path) => {
      const entries = tree.directories[path]
      if (entries === undefined) return undefined
      return {
        entries: entries.map(name => ({
          name,
          path: `${path}/${name}`,
          hidden: name.startsWith('.'),
        })),
      }
    },
    readTextFile: async path => tree.files[path],
  }
}

const H5_MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: {
    key: 'sdkwork-demo-h5',
    name: 'Demo H5',
    displayName: '演示 H5',
    description: 'Mobile web app',
    appType: 'APP_REACT',
    iconUrl: 'https://cdn.example.com/h5.png',
  },
  runtime: { family: 'mobile', framework: 'react-capacitor' },
  publish: { platforms: ['H5', 'APP_IOS'] },
  metadata: {
    publishing: {
      appIdByTarget: { 'cloud.development': 'app-1' },
      birdcoder: { templateId: 'tpl-1', templateKey: 'sdkwork-demo-h5', templateVersion: '1.2.3' },
    },
  },
})

const PC_MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: { key: 'sdkwork-demo-pc', name: 'Demo PC', appType: 'APP_REACT' },
  runtime: { family: 'web', framework: 'react' },
  publish: { platforms: ['WEB'] },
})

const INDEX = `# apps/

| Directory | Surface role | Runnable | Purpose | Entry |
| --- | --- | --- | --- | --- |
| sdkwork-demo-h5 | h5 | yes | Demo H5 | [README](sdkwork-demo-h5/README.md) |
| sdkwork-demo-pc | pc | yes | Demo PC | [README](sdkwork-demo-pc/README.md) |
| sdkwork-demo-common | common | no | Shared | [README](sdkwork-demo-common/README.md) |
| broken | app | yes | Broken | broken/ |
| missing | app | yes | Missing | missing/ |
`

/** The canonical test project: two apps, one shared family, two bad roots. */
function project(): Tree {
  return {
    directories: {
      '/proj': ['apps', 'packages'],
      '/proj/apps': [
        'sdkwork-demo-h5',
        'sdkwork-demo-pc',
        'sdkwork-demo-common',
        'broken',
        'missing',
        '.hidden-app',
      ],
      '/proj/apps/sdkwork-demo-h5': ['src'],
      '/proj/apps/sdkwork-demo-pc': ['src'],
      '/proj/apps/sdkwork-demo-common': ['packages'],
      '/proj/apps/broken': ['src'],
      '/proj/apps/missing': [],
    },
    files: {
      '/proj/apps/README.md': INDEX,
      '/proj/apps/sdkwork-demo-h5/agent.app.config.json': H5_MANIFEST,
      '/proj/apps/sdkwork-demo-h5/package.json': JSON.stringify({ version: '1.2.3' }),
      '/proj/apps/sdkwork-demo-pc/agent.app.config.json': PC_MANIFEST,
      '/proj/apps/sdkwork-demo-common/agent.app.config.json': PC_MANIFEST,
      '/proj/apps/broken/agent.app.config.json': '{not json',
    },
  }
}

describe('scanTemplateApps', () => {
  it('lists the independent apps, their identity, and why other directories were ignored', async () => {
    const scan = await scanTemplateApps(portOf(project()), '/proj')
    expect(scan.apps.map(app => app.appKey).sort()).toEqual(['sdkwork-demo-h5', 'sdkwork-demo-pc'])
    const h5 = scan.apps.find(app => app.appKey === 'sdkwork-demo-h5')
    expect(h5).toMatchObject({
      name: '演示 H5',
      directoryName: 'sdkwork-demo-h5',
      cardId: 'h5',
      version: '1.2.3',
      platforms: ['H5', 'IOS'],
      linkedAppId: 'app-1',
      linkedTemplateId: 'tpl-1',
      linkedTemplateKey: 'sdkwork-demo-h5',
      linkedTemplateVersion: '1.2.3',
      projectRoot: false,
    })
    expect(h5?.description).toBe('Mobile web app')
    expect(h5?.iconUrl).toBe('https://cdn.example.com/h5.png')
    const pc = scan.apps.find(app => app.appKey === 'sdkwork-demo-pc')
    expect(pc?.cardId).toBe('pc-web')
    expect(pc?.platforms).toEqual(['PC'])
    expect(scan.appsIndexFound).toBe(true)
    expect(scan.ignored).toEqual(expect.arrayContaining([
      { directory: '/proj/apps/sdkwork-demo-common', directoryName: 'sdkwork-demo-common', reason: 'shared-package' },
      { directory: '/proj/apps/broken', directoryName: 'broken', reason: 'invalid-manifest' },
      { directory: '/proj/apps/missing', directoryName: 'missing', reason: 'missing-manifest' },
    ]))
  })

  it('falls back to the project root when apps/ is absent', async () => {
    const tree: Tree = {
      directories: { '/solo': [] },
      files: { '/solo/agent.app.config.json': PC_MANIFEST },
    }
    const scan = await scanTemplateApps(portOf(tree), '/solo')
    expect(scan.fallbackToProjectRoot).toBe(true)
    expect(scan.apps).toHaveLength(1)
    expect(scan.apps[0]).toMatchObject({
      directory: '/solo',
      directoryName: 'solo',
      appKey: 'sdkwork-demo-pc',
      projectRoot: true,
    })
  })

  it('reports a project with neither apps/ nor a root manifest as one ignored directory', async () => {
    const scan = await scanTemplateApps(portOf({ directories: {}, files: {} }), '/empty')
    expect(scan.apps).toEqual([])
    expect(scan.ignored[0]).toMatchObject({ directory: '/empty', reason: 'missing-manifest' })
  })

  it('honors the inspected-directory ceiling', async () => {
    const tree = project()
    const scan = await scanTemplateApps(portOf(tree), '/proj', { maxDirectories: 1 })
    expect(scan.apps.length + scan.ignored.length).toBe(1)
  })

  it('reads a missing README and an unreadable package.json without failing', async () => {
    const tree = project()
    const files = { ...tree.files }
    delete files['/proj/apps/README.md']
    files['/proj/apps/sdkwork-demo-pc/package.json'] = '{broken'
    const scan = await scanTemplateApps(portOf({ ...tree, files }), '/proj')
    expect(scan.appsIndexFound).toBe(false)
    expect(scan.apps.find(app => app.appKey === 'sdkwork-demo-pc')?.version).toBeUndefined()
  })
})

describe('appsIndexRoleForDirectory', () => {
  it('derives the surface role from the architecture suffix, then the card', () => {
    expect(appsIndexRoleForDirectory('sdkwork-demo-h5', 'pc-web')).toBe('h5')
    expect(appsIndexRoleForDirectory('sdkwork-demo-pc')).toBe('pc')
    expect(appsIndexRoleForDirectory('sdkwork-demo-pad')).toBe('pad')
    expect(appsIndexRoleForDirectory('sdkwork-demo-flutter-mobile')).toBe('flutter-mobile')
    expect(appsIndexRoleForDirectory('sdkwork-demo-android-mobile')).toBe('android')
    expect(appsIndexRoleForDirectory('sdkwork-demo-ios-mobile')).toBe('ios')
    expect(appsIndexRoleForDirectory('sdkwork-demo-harmony-mobile')).toBe('harmony')
    expect(appsIndexRoleForDirectory('sdkwork-demo-mini-program')).toBe('mini-program')
    expect(appsIndexRoleForDirectory('custom', 'desktop')).toBe('desktop')
    expect(appsIndexRoleForDirectory('custom', undefined)).toBe('app')
  })
})

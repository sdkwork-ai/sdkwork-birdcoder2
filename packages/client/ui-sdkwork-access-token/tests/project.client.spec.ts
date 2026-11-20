/**
 * Project discovery: which manifest-bearing roots one SDKWork project
 * directory exposes, their identity from `agent.app.config.json`, and the
 * application type inferred from the manifest and the root's markers.
 */

import { describe, expect, it } from 'vitest'
import { describeAccessTokenProject } from '../src/client/project.ts'
import { MemoryFs } from './memory-fs.client.ts'

/** A minimal v3 manifest carrying the fields the initializer reads. */
function manifest(identity: {
  appId?: string
  tenantId?: string
  organizationId?: string
  appType?: string
  framework?: string
  family?: string
  permissionScope?: string[]
  displayName?: string
}): string {
  return JSON.stringify({
    schemaVersion: 3,
    kind: 'agent.app',
    app: {
      key: identity.appId ?? 'app-key',
      displayName: identity.displayName ?? 'Application',
      ...(identity.appType === undefined ? {} : { appType: identity.appType }),
    },
    backend: {
      appId: identity.appId ?? 'app-key',
      tenantId: identity.tenantId ?? '100001',
      organizationId: identity.organizationId ?? '0',
      ...(identity.permissionScope === undefined
        ? {}
        : { accessTokenPermissionScope: identity.permissionScope }),
    },
    runtime: {
      ...(identity.framework === undefined ? {} : { framework: identity.framework }),
      ...(identity.family === undefined ? {} : { family: identity.family }),
    },
  })
}

describe('describeAccessTokenProject', () => {
  it('lists the workspace application roots under apps/ with their identity and format', async () => {
    const fs = new MemoryFs(
      [
        '/repo', '/repo/apps',
        '/repo/apps/sdkwork-im-pc', '/repo/apps/sdkwork-im-flutter', '/repo/apps/sdkwork-im-mp',
        '/repo/apps/not-an-app',
      ],
      {
        '/repo/apps/sdkwork-im-pc/agent.app.config.json': manifest({
          appId: 'sdkwork-im-pc', displayName: 'IM PC', appType: 'APP_REACT', framework: 'react-tauri',
          permissionScope: ['iam:self', 'im:read'],
        }),
        '/repo/apps/sdkwork-im-flutter/agent.app.config.json': manifest({
          appId: 'sdkwork-im-flutter-mobile', appType: 'APP_FLUTTER', framework: 'flutter',
        }),
        '/repo/apps/sdkwork-im-mp/agent.app.config.json': manifest({
          appId: 'sdkwork-im-mini-program', appType: 'APP_UNIAPP', framework: 'weixin-mini-program',
          family: 'mini-program',
        }),
      },
    )
    const project = await describeAccessTokenProject(fs, '/repo')
    expect(project.hasAppsDirectory).toBe(true)
    expect(project.candidates.map(candidate => candidate.rootPath)).toEqual([
      '/repo/apps/sdkwork-im-flutter',
      '/repo/apps/sdkwork-im-mp',
      '/repo/apps/sdkwork-im-pc',
    ])
    const pc = project.candidates.find(candidate => candidate.rootPath.endsWith('sdkwork-im-pc'))!
    expect(pc.displayName).toBe('IM PC')
    expect(pc.identity.appId).toBe('sdkwork-im-pc')
    expect(pc.identity.tenantId).toBe('100001')
    expect(pc.identity.organizationId).toBe('0')
    expect(pc.identity.permissionScope).toEqual(['iam:self', 'im:read'])
    expect(pc.detectedTypeId).toBe('vite')
    expect(pc.isProjectRoot).toBe(false)
    const flutter = project.candidates.find(candidate => candidate.rootPath.endsWith('flutter'))!
    expect(flutter.detectedTypeId).toBe('flutter')
    const miniProgram = project.candidates.find(candidate => candidate.rootPath.endsWith('im-mp'))!
    expect(miniProgram.detectedTypeId).toBe('mini-program')
  })

  it('treats the project directory itself as the application root when it carries a manifest', async () => {
    const fs = new MemoryFs(
      ['/work/sdkwork-im-pc', '/work/sdkwork-im-pc/apps'],
      {
        '/work/sdkwork-im-pc/agent.app.config.json': manifest({ appId: 'sdkwork-im-pc' }),
        '/work/sdkwork-im-pc/vite.config.ts': 'export default {}',
      },
    )
    const project = await describeAccessTokenProject(fs, '/work/sdkwork-im-pc')
    expect(project.candidates).toHaveLength(1)
    expect(project.candidates[0]?.isProjectRoot).toBe(true)
    expect(project.candidates[0]?.detectedTypeId).toBe('vite')
  })

  it('skips a repository-level manifest that delegates to an apps root or names a server family', async () => {
    const delegated = JSON.stringify({
      schemaVersion: 3,
      kind: 'agent.app',
      app: { key: 'umbra', displayName: 'Umbrella' },
      backend: { appId: 'umbra', tenantId: '100001', organizationId: '0' },
      runtime: { family: 'web', framework: 'web' },
      publish: { config: { workspaceRoot: 'apps/umbra-pc' } },
    })
    const server = JSON.stringify({
      schemaVersion: 3,
      kind: 'agent.app',
      app: { key: 'svc', displayName: 'Service' },
      backend: { appId: 'svc', tenantId: '100001', organizationId: '0' },
      runtime: { family: 'server', framework: 'rust-axum' },
    })
    const delegatedFs = new MemoryFs(
      ['/repo', '/repo/apps'],
      { '/repo/agent.app.config.json': delegated },
    )
    expect((await describeAccessTokenProject(delegatedFs, '/repo')).candidates).toEqual([])

    const serverFs = new MemoryFs(
      ['/svc', '/svc/apps'],
      { '/svc/agent.app.config.json': server },
    )
    expect((await describeAccessTokenProject(serverFs, '/svc')).candidates).toEqual([])

    const ownRoot = new MemoryFs(
      ['/single', '/single/apps'],
      {
        '/single/agent.app.config.json': JSON.stringify({
          schemaVersion: 3,
          kind: 'agent.app',
          app: { key: 'single', displayName: 'Single' },
          backend: { appId: 'single', tenantId: '100001', organizationId: '0' },
          runtime: { family: 'web', framework: 'react' },
          publish: { config: { workspaceRoot: '.' } },
        }),
      },
    )
    expect((await describeAccessTokenProject(ownRoot, '/single')).candidates).toHaveLength(1)
  })

  it('answers no candidates for a project without any manifest-bearing root', async () => {
    const fs = new MemoryFs(['/repo', '/repo/apps', '/repo/apps/plain'])
    const project = await describeAccessTokenProject(fs, '/repo')
    expect(project.candidates).toEqual([])
    expect(project.hasAppsDirectory).toBe(true)
  })

  it('does not reject when the project directory or apps/ is unreadable', async () => {
    const fs = new MemoryFs([])
    const project = await describeAccessTokenProject(fs, '/missing')
    expect(project).toEqual({ directory: '/missing', candidates: [], hasAppsDirectory: false })
  })

  it('keeps the manifest identity defaults for a manifest without backend identity', async () => {
    const legacy = JSON.stringify({
      schemaVersion: 3,
      kind: 'agent.app',
      app: { key: 'legacy-app', displayName: 'Legacy App' },
    })
    const fs = new MemoryFs(
      ['/repo', '/repo/apps', '/repo/apps/legacy'],
      { '/repo/apps/legacy/agent.app.config.json': legacy },
    )
    const project = await describeAccessTokenProject(fs, '/repo')
    const candidate = project.candidates[0]
    expect(candidate.identity).toMatchObject({
      displayName: 'Legacy App',
      appId: '',
      tenantId: '',
      organizationId: '',
      permissionScope: ['iam:self'],
    })
    expect(candidate.detectedTypeId).toBe('vite')
  })

})

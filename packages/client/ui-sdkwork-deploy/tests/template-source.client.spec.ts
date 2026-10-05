/** Template platform mapping, git-URL derivation, and the deploy host's
 * directory-parameterized manifest IO behind the publish-as-template flow. */
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { resetSdkworkGlobalTokenManager } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import { describe, expect, it } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import type { DeployPublishService } from '../src/client/index.ts'
import { DeployHost } from '../src/client/deployHost.ts'
import {
  maxBytesForPackageType,
  packageTypeForPlatforms,
  repoKeyFromUrl,
  repoProviderFromUrl,
} from '../src/client/templatePlatforms.ts'

describe('templatePlatforms', () => {
  it('maps a single platform onto its artifact package type and mixed onto generic', () => {
    expect(packageTypeForPlatforms(['H5'])).toBe(1)
    expect(packageTypeForPlatforms(['STATIC_WEB'])).toBe(1)
    expect(packageTypeForPlatforms(['MINIPROGRAM'])).toBe(3)
    expect(packageTypeForPlatforms(['PC'])).toBe(2)
    expect(packageTypeForPlatforms([])).toBe(5)
    expect(packageTypeForPlatforms(['H5', 'PC'])).toBe(5)
  })

  it('derives the byte cap from the package type table', () => {
    expect(maxBytesForPackageType(1)).toBe(512 * 1024 * 1024)
    expect(maxBytesForPackageType(3)).toBe(512 * 1024 * 1024)
    expect(maxBytesForPackageType(2)).toBe(2048 * 1024 * 1024)
    expect(maxBytesForPackageType(999)).toBe(2048 * 1024 * 1024)
  })

  it('derives the repo key and provider from a clone URL', () => {
    expect(repoKeyFromUrl('https://github.com/owner/repo.git')).toBe('repo')
    expect(repoKeyFromUrl('https://gitee.com/owner/repo/')).toBe('repo')
    expect(repoProviderFromUrl('https://github.com/o/r.git')).toBe('GITHUB')
    expect(repoProviderFromUrl('https://gitee.com/o/r.git')).toBe('GITEE')
    expect(repoProviderFromUrl('https://gitlab.com/o/r.git')).toBe('GITLAB')
    expect(repoProviderFromUrl('https://git.example.com/o/r.git')).toBe('SELF_HOSTED')
  })
})

/** Stub env service with a configured origin. */
function stubEnv(apiBaseUrl: string) {
  return { apiBaseUrl: () => apiBaseUrl, accessToken: () => '', subscribe: () => () => {} }
}

/** Stub IAM controller with no session. */
const stubIam = {
  controller: { getState: () => ({ session: null }), subscribe: () => () => {} },
}

describe('DeployHost manifest IO with an explicit directory', () => {
  it('reads and writes the linkage of the directory given, not the session cwd', async () => {
    const manifests = new Map<string, string>()
    const workspace = {
      pickDirectory: () => Promise.resolve(undefined),
      listDirectory: () => Promise.resolve({ path: '/', entries: [] }),
      currentDirectory: () => '/session/project',
      readTextFile: (path: string) => Promise.resolve(manifests.get(path) ?? ''),
      writeTextFile: (path: string, content: string) => {
        manifests.set(path, content)
        return Promise.resolve(path)
      },
    }
    const host = new DeployHost({ env: stubEnv('https://api.example.com'), iam: stubIam, workspace })
    host.mount()
    try {
      // The session project's manifest is NOT the row's manifest.
      expect(await host.readDeployLink()).toBeUndefined()
      expect(await host.writeDeployLink({ appId: 'app-1', templateId: 'tpl-1' }, '/w/alpha')).toBe(true)
      const written = JSON.parse(manifests.get('/w/alpha/sdkwork.app.config.json') ?? '{}')
      expect(written.deploy.appId).toBe('app-1')
      expect(written.deploy.templateId).toBe('tpl-1')
      expect(written.backend.appId).toBe('app-1')
      expect(await host.readDeployLink('/w/alpha')).toMatchObject({ appId: 'app-1' })
      // A git template source rides the same linkage section.
      expect(await host.writeDeployLink({
        templateGitUrl: 'https://github.com/o/r.git',
        templateGitBranch: 'main',
        templateSubDirectory: 'apps/pc',
      }, '/w/alpha')).toBe(true)
      expect(await host.readDeployLink('/w/alpha')).toMatchObject({
        templateGitUrl: 'https://github.com/o/r.git',
        templateGitBranch: 'main',
        templateSubDirectory: 'apps/pc',
      })
      // The session cwd manifest stayed untouched.
      expect(await host.readDeployLink()).toBeUndefined()
    } finally {
      host.dispose()
      resetSdkworkGlobalTokenManager()
    }
  })
})

/** Boot the browser half the way the plugin spec does, over a real slot tree. */
async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.session.header.utilities': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ current: undefined, byId: {} }), subscribe: () => () => {} },
  })
  ctx.provide('uiWorkspace', {
    pickDirectory: () => Promise.resolve(null),
    listDirectory: () => Promise.resolve({ path: '/', entries: [] }),
  })
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  const stubAppBuild = {
    start: async () => ({ ok: false as const, error: { code: 'unavailable', message: 'test stub' } }),
    follow: async function* (): AsyncGenerator<never> {},
    cancel: async () => ({ ok: false as const, error: { code: 'unavailable', message: 'test stub' } }),
  }
  const stubTemplateInstall = {
    writeFile: async () => ({ ok: false as const, error: { code: 'unavailable', message: 'test stub' } }),
  }
  ctx.provide('remote', { $on: () => () => {}, sdkworkAppBuild: stubAppBuild, sdkworkTemplateInstall: stubTemplateInstall } as never)
  ctx.provide('remote.sdkworkAppBuild', stubAppBuild as never)
  ctx.provide('remote.sdkworkTemplateInstall', stubTemplateInstall as never)
  ctx.provide('configForms', { get: () => stubConfigForm().scope } as never)
  ctx.provide('env', stubEnv(''))
  ctx.provide('iam', stubIam)
  ctx.provide('theme', { getTheme: () => ({ active: { colorScheme: 'dark' } }) } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('deployPublish service surface', () => {
  it('exposes openTemplate beside open, and installTemplate, for the row menus and library', async () => {
    const { fiber } = await bench()
    const service = fiber.ctx.get('deployPublish') as DeployPublishService | undefined
    expect(typeof service?.open).toBe('function')
    expect(typeof service?.openTemplate).toBe('function')
    expect(typeof service?.installTemplate).toBe('function')
    expect(typeof service?.close).toBe('function')
    await fiber.dispose()
  })
})

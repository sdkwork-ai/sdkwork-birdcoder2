/**
 * ui-sdkwork-deploy plugin halves: the browser entry's dictionary and
 * header-slot registrations against the real SlotRegistry (with fiber teardown
 * proving removal — HMR safety), the inert node entry, and the invariant
 * companion's ownership reservation. Host services (env / iam / theme) are
 * stubbed so the adapter mounts without a real backend.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { resetSdkworkGlobalTokenManager } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import { apply, inject, sessionCwdOf } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as DeployInvariant from '../src/invariant.ts'
import { DeployHost } from '../src/client/deployHost.ts'
import { en, NS, zh } from '../src/client/locales.ts'

/** Slot ledger reader: entry ids currently registered in the header list. */
function headerEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots
    .entries('conversation.session.header.actions')
    .map(entry => entry.options.id)
}

/** Stub env service: no API origin until the test says otherwise. */
function stubEnv(apiBaseUrl = ''): {
  apiBaseUrl(): string
  accessToken(): string
  subscribe(): () => void
} {
  return {
    apiBaseUrl: () => apiBaseUrl,
    accessToken: () => '',
    subscribe: () => () => {},
  }
}

/** Stub IAM controller with no session. */
const stubIam = {
  controller: {
    getState: () => ({ session: null }),
    subscribe: () => () => {},
  },
}

/** Boot the browser half over a real slot tree that declares the header list. */
async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  ctx.provide('sessions', {
    list: {
      getSnapshot: () => ({ current: undefined, byId: {} }),
      subscribe: () => () => {},
    },
  })
  ctx.provide('uiWorkspace', {
    pickDirectory: () => Promise.resolve(null),
    listDirectory: () => Promise.resolve({ path: '/', home: '/', crumbs: [], entries: [], truncated: false }),
    createDirectory: (path: string) => Promise.resolve(path),
  })
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  ctx.provide('env', stubEnv())
  ctx.provide('iam', stubIam)
  ctx.provide('theme', { getTheme: () => ({ active: { colorScheme: 'dark' } }) } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('ui-sdkwork-deploy browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam', 'theme', 'sessions', 'uiWorkspace'])
  })

  it('registers the publish header action, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await bench()
    expect(headerEntryIds(ctx)).toContain('sdkwork-deploy-publish')
    await fiber.dispose()
    expect(headerEntryIds(ctx)).not.toContain('sdkwork-deploy-publish')
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    expect(translate('publish.aria')).toBe(zh['publish.aria'])
    ctx.locale.setLocale('en')
    expect(translate('publish.aria')).toBe(en['publish.aria'])
    await fiber.dispose()
    expect(translate('publish.aria')).not.toBe(en['publish.aria'])
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('maps the active locale id onto the dialog locale union (regression: the t seat carries no locale field)', async () => {
    const { deploymentsLocale } = await import('../src/client/DeployPublishAction.tsx')
    expect(deploymentsLocale('zh')).toBe('zh-CN')
    expect(deploymentsLocale('zh-CN')).toBe('zh-CN')
    expect(deploymentsLocale('en')).toBe('en-US')
    // The historical bug: DeployPublishAction read `t.locale`, which is always
    // undefined on the bare translate seat, pinning the dialog to English.
    expect(deploymentsLocale(undefined)).toBe('en-US')
  })

  it('resolves the source directory from the CURRENT session row, not the raw id (regression: list.current is a session id)', () => {
    // The historical bug: the workspace port read `snapshot.current?.cwd`,
    // but `current` is a SessionId (string) — the cwd lives on the row under
    // `byId` — so the publish dialog's source directory was always empty.
    const snapshot = {
      byId: {
        's-1': { cwd: 'E:/work/sdkwork-store', updatedAt: 10 },
        's-2': { cwd: 'E:/work/sdkwork-shop', updatedAt: 20 },
      },
      current: 's-2',
    }
    expect(sessionCwdOf(snapshot)).toBe('E:/work/sdkwork-shop')
  })

  it('falls back to the most recently updated cwd-carrying session before a selection exists', () => {
    expect(sessionCwdOf({
      byId: {
        's-1': { cwd: 'E:/work/sdkwork-store', updatedAt: 10 },
        's-2': { cwd: 'E:/work/sdkwork-shop', updatedAt: 20 },
        's-3': { cwd: '', updatedAt: 30 },
        's-4': { updatedAt: 40 },
      },
      current: undefined,
    })).toBe('E:/work/sdkwork-shop')
    // The current row wins even when it carries no cwd: only then does the
    // latest-updated fallback apply.
    expect(sessionCwdOf({
      byId: { 's-1': { cwd: 'E:/work/a', updatedAt: 10 }, 's-2': { updatedAt: 20 } },
      current: 's-2',
    })).toBe('E:/work/a')
  })

  it('resolves no source directory without any cwd-carrying session', () => {
    expect(sessionCwdOf(undefined)).toBeUndefined()
    expect(sessionCwdOf({ byId: {}, current: undefined })).toBeUndefined()
    expect(sessionCwdOf({ byId: { 's-1': { cwd: '   ' } }, current: 's-1' })).toBeUndefined()
  })

  it('exposes the locale service as the reactive locale face of the publish action', async () => {
    const { ctx } = await bench()
    // The injected share hands the locale face through as the action's
    // `locale` prop; its snapshot must publish the active locale id.
    const entry = ctx.slots
      .entries('conversation.session.header.actions')
      .find(row => row.options.id === 'sdkwork-deploy-publish')
    expect(entry).toBeDefined()
    const injected = (entry?.inject as () => {
      locale: { getSnapshot(): { active: string }; subscribe(fn: () => void): () => void }
    })()
    const face = injected.locale
    // Regression (the publish icon never mounted): React's
    // useSyncExternalStore invokes getSnapshot/subscribe UNBOUND, so the
    // injected face must survive `this`-detached calls. The historical
    // injection handed the service's bare methods through and every render
    // crashed with "Cannot read properties of undefined (reading 'snapshot')".
    expect(face.getSnapshot.call(undefined).active).toBe('zh')
    let notified = 0
    const off = face.subscribe.call(undefined, () => { notified += 1 })
    ctx.locale.setLocale('en')
    expect(face.getSnapshot.call(undefined).active).toBe('en')
    expect(notified).toBe(1)
    off()
  })
})

describe('ui-sdkwork-deploy host adapter', () => {
  it('constructs no clients while the API origin is unset', () => {
    const host = new DeployHost({ env: stubEnv(''), iam: stubIam })
    host.mount()
    try {
      expect(() => host.readClients()).toThrow(/base URL is not configured/)
    } finally {
      host.dispose()
      resetSdkworkGlobalTokenManager()
    }
  })

  it('keeps the current directory when no directory picker exists', async () => {
    const host = new DeployHost({ env: stubEnv('https://api.example.com'), iam: stubIam })
    host.mount()
    try {
      // jsdom has no showDirectoryPicker: the guard falls back to the current path.
      expect(await host.pickDirectory('/current/dir')).toBe('/current/dir')
    } finally {
      host.dispose()
      resetSdkworkGlobalTokenManager()
    }
  })

  it('delegates picking, inspection, and the default directory to the workspace port', async () => {
    const listings = new Map<string, { path: string; entries: { name: string; path: string; hidden: boolean }[] }>([
      ['/workspace/store', {
        path: '/workspace/store',
        entries: [
          { name: 'apps', path: '/workspace/store/apps', hidden: false },
          { name: 'deployments', path: '/workspace/store/deployments', hidden: false },
          { name: 'etc', path: '/workspace/store/etc', hidden: false },
          { name: 'specs', path: '/workspace/store/specs', hidden: false },
          { name: '.sdkwork', path: '/workspace/store/.sdkwork', hidden: true },
        ],
      }],
      ['/workspace/store/apps', {
        path: '/workspace/store/apps',
        entries: [
          { name: 'sdkwork-store-pc', path: '/workspace/store/apps/sdkwork-store-pc', hidden: false },
          { name: 'sdkwork-store-h5', path: '/workspace/store/apps/sdkwork-store-h5', hidden: false },
        ],
      }],
      ['/workspace/store/apps/sdkwork-store-pc', {
        path: '/workspace/store/apps/sdkwork-store-pc',
        entries: [
          { name: 'src', path: '/workspace/store/apps/sdkwork-store-pc/src', hidden: false },
          { name: 'dist', path: '/workspace/store/apps/sdkwork-store-pc/dist', hidden: false },
        ],
      }],
      ['/workspace/store/apps/sdkwork-store-h5', {
        path: '/workspace/store/apps/sdkwork-store-h5',
        entries: [
          { name: 'src', path: '/workspace/store/apps/sdkwork-store-h5/src', hidden: false },
          { name: '.output', path: '/workspace/store/apps/sdkwork-store-h5/.output', hidden: true },
        ],
      }],
    ])
    const workspace = {
      pickDirectory: () => Promise.resolve('/workspace/store'),
      listDirectory: (path?: string) => {
        const listing = listings.get(path ?? '')
        return listing === undefined ? Promise.reject(new Error(`missing listing ${path}`)) : Promise.resolve(listing)
      },
      currentDirectory: () => '/workspace/store',
    }
    const host = new DeployHost({ env: stubEnv('https://api.example.com'), iam: stubIam, workspace })
    host.mount()
    try {
      expect(await host.pickDirectory('/current/dir')).toBe('/workspace/store')
      expect(host.readDefaultDirectory()).toBe('/workspace/store')

      const inspection = await host.inspectDirectory('/workspace/store')
      expect(inspection).toBeDefined()
      expect(inspection?.rootPath).toBe('/workspace/store')
      expect(inspection?.childDirectories).toEqual(['apps', 'deployments', 'etc', 'specs', '.sdkwork'])
      expect(inspection?.appsChildDirectories).toEqual(['sdkwork-store-pc', 'sdkwork-store-h5'])
      // v3: third listing level backs the dialog's build-output detection.
      expect(inspection?.surfaceChildDirectories).toEqual({
        'sdkwork-store-pc': ['src', 'dist'],
        'sdkwork-store-h5': ['src', '.output'],
      })
    } finally {
      host.dispose()
      resetSdkworkGlobalTokenManager()
    }
  })

  it('degrades inspection to undefined without a workspace port', async () => {
    const host = new DeployHost({ env: stubEnv('https://api.example.com'), iam: stubIam })
    host.mount()
    try {
      expect(await host.inspectDirectory('/any/dir')).toBeUndefined()
      expect(host.readDefaultDirectory()).toBeUndefined()
    } finally {
      host.dispose()
      resetSdkworkGlobalTokenManager()
    }
  })

  it('projects the current IAM session user for the dialog identity chip', () => {
    const iamWithUser = {
      controller: {
        getState: () => ({
          session: { user: { id: 'u-1', displayName: 'Alice' } },
        }),
        subscribe: () => () => {},
      },
    }
    const host = new DeployHost({ env: stubEnv('https://api.example.com'), iam: iamWithUser })
    host.mount()
    try {
      expect(host.readCurrentUser()).toEqual({ id: 'u-1', displayName: 'Alice' })
    } finally {
      host.dispose()
      resetSdkworkGlobalTokenManager()
    }
  })
})

describe('ui-sdkwork-deploy node half', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })
})

describe('ui-sdkwork-deploy invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(DeployInvariant)
    await fiber.await()
    expect(DeployInvariant.name).toBe('client-ui-sdkwork-deploy-invariant')
    expect(DeployInvariant.inject).toEqual(['invariants'])
    expect(() => {
      Reflect.apply(ctx.emit.bind(ctx), undefined, ['unrelated/event'])
    }).not.toThrow()
    await fiber.dispose()
  })
})

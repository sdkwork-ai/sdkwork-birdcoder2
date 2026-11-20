// @vitest-environment jsdom
/**
 * Registration coverage for the access-token initializer browser half: the
 * service the row menus dispatch into, the dialog overlay entry, the shared
 * workspace context-menu contribution (only for `sdkwork-*` project
 * directories), and fiber teardown.
 *
 * The plugin is mounted over the real slot registry and locale runtime; only
 * the directory bridge and the context-menu service are stand-ins, because the
 * assertions are about what this plugin registers and exposes.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import { ACCESS_TOKEN_CONFIG_FILE_GLOBAL, type SdkworkAccessTokenAccount } from '../src/access-token-settings.ts'
import { AccessTokenDialog } from '../src/client/AccessTokenDialog.tsx'
import type { AccessTokenDialogInjected } from '../src/client/AccessTokenDialog.tsx'
import { createAccessTokenDialogStore } from '../src/client/store.ts'
import { MemoryFs } from './memory-fs.client.ts'

/** A workspace context-menu contribution captured by the stand-in service. */
interface CapturedContribution {
  id: string
  target: string
  order: number
  resolve: (value: { workspaceId: string; path: string; displayTitle: string }) => ReadonlyArray<{
    id: string
    label: string
    run: () => void
  }>
}

/** Call one registration's injected face with its derived store actions. */
function faceOf(entry: StoredEntry, ...args: unknown[]): Record<string, unknown> {
  const face: unknown = entry.inject
  if (typeof face !== 'function') throw new Error('entry has no callable inject face')
  return (face as (...params: unknown[]) => Record<string, unknown>)(...args)
}

/** Mount the browser half over the real registries and stand-in services. */
async function bench(options: {
  withContextMenus?: boolean
  withWorkspace?: boolean
  iam?: { signedIn: boolean; tokens?: Record<string, string> } | undefined
  accounts?: SdkworkAccessTokenAccount[]
  configStatus?: 'ready' | 'loading'
  rejectSet?: boolean
} = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: { 'shell.overlay': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  const contributions: CapturedContribution[] = []
  const disposeMenu = vi.fn()
  if (options.withContextMenus !== false) {
    ctx.provide('contextMenus', {
      register: (contribution: CapturedContribution) => {
        contributions.push(contribution)
        return () => {
          const index = contributions.indexOf(contribution)
          if (index >= 0) contributions.splice(index, 1)
          disposeMenu()
        }
      },
    } as never)
  }
  const fs = new MemoryFs(['/repo'])
  if (options.withWorkspace !== false) ctx.provide('uiWorkspace', fs as never)
  const accounts = options.accounts ?? []
  const configSets: unknown[] = []
  ctx.provide('configForms', {
    get: () => ({
      getSnapshot: () => options.configStatus === 'loading'
        ? { status: 'loading', value: undefined }
        : { status: 'ready', value: { accounts } },
      subscribe: () => () => {},
      set: async (_field: string, value: SdkworkAccessTokenAccount[]) => {
        if (options.rejectSet === true) return false
        accounts.splice(0, accounts.length, ...value)
        configSets.push(value)
        return true
      },
    }),
  } as never)
  ctx.provide('env', {
    apiBaseUrl: () => 'https://api.test',
    accessToken: () => 'bootstrap-token',
    appId: () => 'app',
  } as never)
  ctx.provide('iam', {
    isSignedIn: () => options.iam?.signedIn === true,
    sessionTokens: () => options.iam?.tokens ?? {},
    profileSnapshot: () => ({
      signedIn: options.iam?.signedIn === true,
      accountId: '42',
      username: 'alice',
      displayName: 'Alice',
      tenantId: '100001',
      organizationId: undefined,
    }),
  } as never)
  const plugin = ctx.plugin({ inject: [...inject], apply })
  await plugin.await()
  const entry = slots.entries('shell.overlay').find(candidate => candidate.options.id === 'sdkwork-access-token')
  if (entry === undefined) throw new Error('access-token overlay not registered')
  return { ctx, plugin, slots, entry, contributions, fs, accounts, configSets }
}

/** Store decl carried by the overlay registration. */
function storeOf(entry: StoredEntry): ReturnType<typeof createAccessTokenDialogStore> {
  if (entry.store === undefined) throw new Error('overlay entry carries no store')
  return entry.store as unknown as ReturnType<typeof createAccessTokenDialogStore>
}

afterEach(() => { document.body.innerHTML = '' })

describe('ui-sdkwork-access-token browser half', () => {
  it('declares only the services it consumes directly', () => {
    expect(inject).toEqual(['slots', 'locale', 'configForms'])
  })

  it('provides the initializer service the row menu opens and the dialog it drives', async () => {
    const { ctx, plugin, entry } = await bench()
    const service = ctx.get('accessTokenInitializer')
    expect(service).toBeDefined()
    if (service === undefined) throw new Error('service not provided')
    const instance = storeOf(entry).create()
    expect(instance.getSnapshot()).toEqual({ open: false, target: null })

    service.open({ directory: 'D:\\sdkwork-space\\sdkwork-im\\apps\\sdkwork-im-pc' })
    expect(instance.getSnapshot()).toEqual({
      open: true,
      target: {
        directory: 'D:\\sdkwork-space\\sdkwork-im\\apps\\sdkwork-im-pc',
        displayTitle: 'sdkwork-im-pc',
      },
    })
    const injected = faceOf(entry, instance.actions) as unknown as AccessTokenDialogInjected
    expect(injected.fileSystem()).toBeDefined()
    injected.onClose()
    expect(instance.getSnapshot()).toEqual({ open: false, target: null })
    await plugin.dispose()
  })

  it('contributes the verb to the shared workspace context menu only for sdkwork-* directories', async () => {
    const { plugin, contributions, entry } = await bench()
    expect(contributions).toHaveLength(1)
    const contribution = contributions[0]
    if (contribution === undefined) throw new Error('context-menu contribution not registered')
    expect(contribution).toMatchObject({ id: 'sdkwork.initializeAccessToken', target: 'workspace', order: 250 })
    expect(contribution.resolve({ workspaceId: 'w1', path: '/work/other-app', displayTitle: 'Other' }))
      .toEqual([])
    const actions = contribution.resolve({ workspaceId: 'w2', path: '/work/sdkwork-im', displayTitle: 'IM' })
    expect(actions).toHaveLength(1)
    expect(actions[0]?.label).toBe('初始化 Access Token')
    const instance = storeOf(entry).create()
    actions[0]?.run()
    expect(instance.getSnapshot()).toMatchObject({
      open: true,
      target: { directory: '/work/sdkwork-im', displayTitle: 'IM' },
    })
    await plugin.dispose()
  })

  it('loads without the shared context menu service and without the directory bridge', async () => {
    const { ctx, plugin, slots } = await bench({ withContextMenus: false, withWorkspace: false })
    expect(ctx.get('accessTokenInitializer')).toBeDefined()
    expect(slots.entries('shell.overlay').map(entry => entry.options.id)).toEqual(['sdkwork-access-token'])
    const entry = slots.entries('shell.overlay')[0]
    if (entry === undefined) throw new Error('access-token overlay not registered')
    const injected = faceOf(entry, storeOf(entry).create().actions) as unknown as AccessTokenDialogInjected
    // The bridge is optional at load: the dialog reports the missing bridge.
    expect(injected.fileSystem()).toBeUndefined()
    await plugin.dispose()
  })

  it('tears every contribution down with the fiber (HMR safety)', async () => {
    const { ctx, plugin, slots, contributions } = await bench()
    expect(contributions).toHaveLength(1)
    await plugin.dispose()
    expect(ctx.get('accessTokenInitializer')).toBeUndefined()
    expect(slots.entries('shell.overlay')).toHaveLength(0)
    expect(contributions).toHaveLength(0)
  })

  it('renders the overlay component from the registration', async () => {
    const { plugin, entry } = await bench()
    expect(entry.component).toBe(AccessTokenDialog)
    await plugin.dispose()
  })

  it('wires the mounted IAM session and the environment gateway into the signed flow', async () => {
    const { plugin, entry } = await bench({
      iam: { signedIn: true, tokens: { accessToken: 'session-access', authToken: 'session-auth' } },
    })
    const injected = faceOf(entry, storeOf(entry).create().actions) as unknown as AccessTokenDialogInjected
    const gateway = injected.signed.gateway(undefined)
    expect(gateway).toEqual({ baseUrl: 'https://api.test', bootstrapAccessToken: 'bootstrap-token' })
    const session = await injected.signed.currentSession(gateway)
    expect(session).toMatchObject({
      baseUrl: 'https://api.test',
      accessToken: 'session-access',
      authToken: 'session-auth',
      userId: '42',
      username: 'alice',
      tenantId: '100001',
      source: 'current',
    })
    // A remembered login pins its own gateway over the environment profile.
    const remembered = {
      username: 'alice', password: 'pw', baseUrl: 'https://cfg.test',
      bootstrapAccessToken: 'cfg-token', environment: 'development',
    }
    expect(injected.signed.gateway(remembered))
      .toEqual({ baseUrl: 'https://cfg.test', bootstrapAccessToken: 'cfg-token' })
    await plugin.dispose()
  })

  it('reports no current signing session while signed out', async () => {
    const { plugin, entry } = await bench()
    const injected = faceOf(entry, storeOf(entry).create().actions) as unknown as AccessTokenDialogInjected
    expect(await injected.signed.currentSession({ baseUrl: 'https://api.test', bootstrapAccessToken: 'bootstrap-token' }))
      .toBeUndefined()
    await plugin.dispose()
  })

  it('reads and writes the remembered login through the Host settings section', async () => {
    const path = '/home/.dsh/sdkwork/access-token.config.json'
    ;(globalThis as Record<string, unknown>)[ACCESS_TOKEN_CONFIG_FILE_GLOBAL] = { path }
    try {
      const remembered: SdkworkAccessTokenAccount = {
        project: 'C:\\work\\sdkwork-im',
        username: 'admin',
        password: 'pw',
        baseUrl: 'https://cfg.test',
        bootstrapAccessToken: 'cfg-token',
        environment: 'staging',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }
      const { plugin, entry, accounts, configSets } = await bench({ accounts: [remembered] })
      const injected = faceOf(entry, storeOf(entry).create().actions) as unknown as AccessTokenDialogInjected
      expect(injected.credentials.read('c:/work/sdkwork-im')).toEqual({
        username: 'admin',
        password: 'pw',
        baseUrl: 'https://cfg.test',
        bootstrapAccessToken: 'cfg-token',
        environment: 'staging',
      })
      expect(injected.credentials.read('/work/other')).toBeUndefined()
      expect(injected.credentials.path()).toBe(path)

      const values = {
        username: 'operator', password: 'new-pw', baseUrl: 'https://api.test',
        bootstrapAccessToken: 'bootstrap-token', environment: 'production',
      }
      expect(await injected.credentials.save('/work/new-project', values))
        .toEqual({ path, status: 'written' })
      expect(configSets).toHaveLength(1)
      expect(accounts.find(row => row.project === '/work/new-project')).toMatchObject(values)
      expect(injected.credentials.read('/work/new-project')).toEqual(values)

      // Repeating the same facts reports unchanged and writes nothing.
      expect((await injected.credentials.save('/work/new-project', values)).status).toBe('unchanged')
      expect(configSets).toHaveLength(1)
      await plugin.dispose()
    } finally {
      Reflect.deleteProperty(globalThis, ACCESS_TOKEN_CONFIG_FILE_GLOBAL)
    }
  })

  it('fails closed when the settings section is not ready or the Host refuses the write', async () => {
    const { plugin, entry } = await bench({ configStatus: 'loading' })
    const injected = faceOf(entry, storeOf(entry).create().actions) as unknown as AccessTokenDialogInjected
    expect(injected.credentials.read('/repo')).toBeUndefined()
    await expect(injected.credentials.save('/repo', {
      username: 'admin', password: 'pw', baseUrl: '', bootstrapAccessToken: '', environment: 'development',
    })).rejects.toThrow(/not ready/u)
    expect(injected.credentials.path()).toBe('<DSH_HOME>/sdkwork/access-token.config.json')
    await plugin.dispose()

    const refusing = await bench({ rejectSet: true })
    const refusingEntry = faceOf(refusing.entry, storeOf(refusing.entry).create().actions) as unknown as AccessTokenDialogInjected
    await expect(refusingEntry.credentials.save('/repo', {
      username: 'admin', password: 'pw', baseUrl: '', bootstrapAccessToken: '', environment: 'development',
    })).rejects.toThrow(/refused/u)
    await refusing.plugin.dispose()
  })
})

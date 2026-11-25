// @vitest-environment jsdom
/**
 * Plugin load path for the row-menus browser half's app-build capability.
 *
 * Every other app-build spec drives the pure helpers and the assembled service
 * directly, so none of them ever touches the live service store. These specs
 * boot the real plugin body over a real `Context` so the inject contract and
 * the degraded-resolution path are both under test.
 *
 * The contract these specs pin: only `slots` and `locale` are required. The
 * row actions' services (`workspaces`, `sessionLogDownload`, `deployPublish`)
 * and the dotted `remote.sdkworkAppBuild` namespace are read with `ctx.get` at
 * render time. Declaring them as inject let one unrelated plugin's failure park
 * this plugin and silently remove Open folder / Copy path / Open in terminal
 * from every workspace and session row.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { createAppBuildService } from '../src/client/appBuild/index.ts'
import type { AppBuildCatalog } from '../src/client/appBuild/contract.ts'

const CATALOG: AppBuildCatalog = {
  cwd: '/w/alpha',
  families: [{ id: 'h5', root: 'alpha-h5', rootPath: '/w/alpha/apps/alpha-h5', build: [], package: [] }],
  missing: [],
}

/**
 * The message cordis raises when a dotted Remote namespace is read without its
 * inject entry. Reproduced here rather than imported: the guard under test is
 * this plugin's response to that fault, so the fault has to be injectable.
 */
const GATE_MESSAGE = 'cannot get property "remote.sdkworkAppBuild" without inject'

/**
 * The Remote face, installed the way the gateway installs the real one.
 *
 * Subclassing `Service` is load-bearing, not ceremony: only a `Service` carries
 * a tracker, and cordis's traceable proxy is what turns the nested read
 * `ctx.remote.sdkworkAppBuild` into a *dotted* context read
 * (`ctx['remote.sdkworkAppBuild']`) checked against the consumer's inject list.
 * A plain-object stub hands the property straight back and would let the
 * regression through.
 */
class StubRemoteService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }

  /** Fan-out seat the real face carries; unused here. */
  $on(): () => void {
    return () => {}
  }
}

/** Remote namespace stub answering one fixed catalog. */
function stubNamespace(catalog: AppBuildCatalog = CATALOG) {
  return {
    describe: async () => ({ ok: true as const, value: catalog }),
    start: async () => ({ ok: false as const, error: { code: 'unavailable', message: 'test stub' } }),
    follow: async function* (): AsyncGenerator<never> {},
    cancel: async () => ({ ok: false as const, error: { code: 'unavailable', message: 'test stub' } }),
  }
}

/**
 * Boot the client root services and the plugin's browser half.
 * @param options - inject list override (`apply`'s own by default) and whether
 * the optional action services / Remote namespace are registered.
 */
async function bench(options: {
  inject?: readonly string[]
  services?: boolean
} = {}): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.workspaces.rowMenus': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  // The aggregate Remote face is a root service the locale plugin itself
  // requires; it is not one of the row menus' optional action services.
  new StubRemoteService(ctx)
  if (options.services !== false) {
    ctx.provide('workspaces', {
      list: { getSnapshot: () => ({ current: undefined, byId: {} }), subscribe: () => () => {} },
    } as never)
    ctx.provide('sessionLogDownload', {
      pickDirectory: () => Promise.resolve(null),
    } as never)
    ctx.provide('deployPublish', { open: () => {} } as never)
    // Each namespace is its own service, registered inside its own fiber — the
    // shape `ClientRemoteService.createNamespace` installs. `remote.<ns>` is a
    // literal dotted service name (no JS Proxy in method lookup), so it is
    // provided as its own key rather than nested under the `remote` aggregate.
    const namespace = stubNamespace()
    await ctx.plugin({
      name: 'remote.sdkworkAppBuild',
      apply: (scope: Context) => { scope.provide('remote.sdkworkAppBuild', namespace as never) },
    }).await()
  }
  ctx.provide('configForms', { get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...(options.inject ?? inject)], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('ui-sdkwork-workspace-row-menus app-build wiring', () => {
  it('requires only the slot registry and dictionaries', () => {
    // Every action service is optional and read at render time; requiring one
    // here would park the whole menu on that plugin's health.
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('mounts the row menus when no optional service is registered', async () => {
    const { ctx, fiber } = await bench({ services: false })
    expect(ctx.slots.entries('sidebar.workspaces.rowMenus').map(entry => entry.options.id))
      .toContain('sdkwork-row-menus')
    expect(ctx.get('appBuild')).toBeDefined()
    await fiber.dispose()
  })

  it('probes the mounted Remote namespace', async () => {
    const { ctx, fiber } = await bench()
    const appBuild = ctx.get('appBuild')
    expect(appBuild).toBeDefined()
    if (appBuild === undefined) throw new Error('appBuild service was not registered')
    // Reading through the live dotted service is the assertion that matters:
    // the resolver must find the namespace the remotes assembly mounted.
    await expect(appBuild.describe('/w/alpha')).resolves.toEqual(CATALOG)
    await fiber.dispose()
  })

  it('registers the row-menu renderer into the workspace row-menus hole', async () => {
    const { ctx, fiber } = await bench()
    expect(ctx.slots.entries('sidebar.workspaces.rowMenus').map(entry => entry.options.id))
      .toContain('sdkwork-row-menus')
    await fiber.dispose()
  })

  it('tears the service down with the fiber (HMR safety)', async () => {
    const { ctx, fiber } = await bench()
    await fiber.dispose()
    expect(ctx.get('appBuild')).toBeUndefined()
  })
})

describe('createAppBuildService degrading on an unreadable namespace', () => {
  it('answers undefined instead of rejecting when the resolver throws', async () => {
    // The live resolver is a `ctx.get` lookup; a throwing resolver must degrade
    // the fire-and-forget menu probe instead of surfacing an unhandled
    // rejection.
    const { service, dispose } = createAppBuildService({
      remote: () => { throw new Error(GATE_MESSAGE) },
      locale: { translate: () => (key: string) => key, subscribe: () => () => {} },
    })
    await expect(service.describe('/w/alpha')).resolves.toBeUndefined()
    dispose()
  })

  it('probes the namespace when it is readable', async () => {
    const { service, dispose } = createAppBuildService({
      remote: () => stubNamespace(),
      locale: { translate: () => (key: string) => key, subscribe: () => () => {} },
    })
    await expect(service.describe('/w/alpha')).resolves.toEqual(CATALOG)
    dispose()
  })
})

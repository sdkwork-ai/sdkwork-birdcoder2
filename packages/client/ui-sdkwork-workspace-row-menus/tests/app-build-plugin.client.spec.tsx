// @vitest-environment jsdom
/**
 * Plugin load path for the row-menus browser half's app-build capability.
 *
 * Every other app-build spec drives the pure helpers and the assembled service
 * directly, so none of them ever touches `ctx.remote`. That blind spot is
 * exactly how a shipped regression got through: `apply` reached
 * `ctx.remote.sdkworkAppBuild` while `inject` declared only `'remote'`, and
 * cordis gates every property read on the Remote face against the consumer's
 * inject list — `cannot get property "remote.sdkworkAppBuild" without inject`.
 * These specs boot the real plugin body over a real `Context` so the inject
 * contract and the degraded-resolution path are both under test.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
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
 * @param options - inject list override (`apply`'s own by default).
 */
async function bench(options: {
  inject?: readonly string[]
} = {}): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.workspaces.rowMenus': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('workspaces', {
    list: { getSnapshot: () => ({ current: undefined, byId: {} }), subscribe: () => () => {} },
  } as never)
  ctx.provide('sessionLogDownload', {
    pickDirectory: () => Promise.resolve(null),
  } as never)
  ctx.provide('deployPublish', { open: () => {} } as never)
  new StubRemoteService(ctx)
  // Each namespace is its own service, registered inside its own fiber — the
  // shape `ClientRemoteService.createNamespace` installs. `remote.<ns>` is a
  // literal dotted service name (no JS Proxy in method lookup), so it is
  // provided as its own key rather than nested under the `remote` aggregate.
  const namespace = stubNamespace()
  await ctx.plugin({
    name: 'remote.sdkworkAppBuild',
    apply: (scope: Context) => { scope.provide('remote.sdkworkAppBuild', namespace as never) },
  }).await()
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...(options.inject ?? inject)], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('ui-sdkwork-workspace-row-menus app-build wiring', () => {
  it('declares the dotted Remote namespace it reads', () => {
    // The load-bearing entry: without it cordis refuses the
    // `ctx.remote.sdkworkAppBuild` read inside `apply`'s closure.
    expect(inject).toContain('remote.sdkworkAppBuild')
    expect(inject).toEqual([
      'slots', 'locale', 'workspaces', 'sessionLogDownload', 'deployPublish', 'remote', 'remote.sdkworkAppBuild',
    ])
  })

  it('mounts the plugin half and probes through ctx.remote', async () => {
    const { ctx, fiber } = await bench()
    const appBuild = ctx.get('appBuild')
    expect(appBuild).toBeDefined()
    if (appBuild === undefined) throw new Error('appBuild service was not registered')
    // Reading through the live Remote face is the assertion that matters: a
    // missing inject entry makes this throw rather than answer.
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

  it('reproduces the cordis gate that the dotted inject entry suppresses', async () => {
    // Without this spec the fixture could silently be too permissive: a stub
    // that hands the namespace straight back would let the regression pass and
    // make the inject assertion the only guard. Reading from a fiber that
    // declares only `remote` is the exact position `apply`'s lazy resolver
    // reads from, so the gate must fire here verbatim.
    const reduced = ['slots', 'locale', 'workspaces', 'sessionLogDownload', 'deployPublish', 'remote']
    const { ctx } = await bench({ inject: reduced })
    let read: (() => unknown) | undefined
    await ctx.plugin({
      inject: [...reduced],
      apply: (scope: Context) => {
        read = () => (scope.remote as unknown as { sdkworkAppBuild: unknown }).sdkworkAppBuild
      },
    }).await()
    expect(read).toBeDefined()
    expect(read).toThrow(GATE_MESSAGE)
  })
})

describe('createAppBuildService degrading on an unreadable Remote face', () => {
  it('answers undefined instead of rejecting when the namespace read throws', async () => {
    // Models the shipped fault precisely: the accessor itself throws, which is
    // what the cordis inject gate does. Resolution sits inside the guard, so
    // the fire-and-forget menu probe degrades instead of surfacing as an
    // unhandled rejection.
    const gated = {
      $on: () => () => {},
      get sdkworkAppBuild(): never { throw new Error(GATE_MESSAGE) },
    }
    const { service, dispose } = createAppBuildService({
      remote: () => gated.sdkworkAppBuild,
      locale: { translate: () => (key: string) => key, subscribe: () => () => {} },
    })
    await expect(service.describe('/w/alpha')).resolves.toBeUndefined()
    dispose()
  })

  it('survives a resolver that throws outright', async () => {
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

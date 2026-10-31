/**
 * In-process module arrival: import every roster row's `/client` module (or
 * the plan's replacement) and register each as a pre-arrived factory on a
 * production `ClientModuleSystem`, so neither the Loader's `internal.import`
 * nor a stage-one `prefetch` ever fetches a bundle.
 *
 * Two client-artifact forms reach this loader, because the roster mixes
 * packages this repository builds with third-party plugins it mounts:
 *
 * - a workspace package's `/client` export is an ES module (the repository's
 *   client preset), imported directly;
 * - a third-party plugin ships the official browser-bundle form — a script
 *   whose banner calls `window.__ModuleLoader__.load({ id, factory })` and
 *   whose `require` only resolves the frozen module table. Importing it in
 *   Node returns an empty namespace, so this loader installs the facade the
 *   production page installs, captures that registration and materializes the
 *   factory against the same platform modules the page's table holds.
 * @module @deepseek-ai/dsh-client-test-runtime/src/assembly/modules
 */
import * as cordis from '@deepseek-ai/cordis'
import * as modulesClient from '@deepseek-ai/dsh-client-modules/client'
import { createClientModuleSystem } from '@deepseek-ai/dsh-client-modules/client'
import type { ClientModuleLoader, ClientModuleLoaderTarget, WebBootGraph } from '@deepseek-ai/dsh-client-modules/client'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import * as react from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as reactDom from 'react-dom'
import * as reactDomClient from 'react-dom/client'
import type { AssemblyPlan, ClientPluginModule } from './roster.ts'

/** The bootstrap row: always this process's static namespace, never a dynamic import or a `provide` replacement. */
export const MODULES_PACKAGE = '@deepseek-ai/dsh-client-modules'

/**
 * The module table a captured bundle factory's `require` resolves against:
 * exactly the frozen browser table's keys a third-party client bundle is
 * allowed to externalize (`PLATFORM_MODULES` in `dsh-client-web`).
 */
const PLATFORM_REQUIREMENTS: Readonly<Record<string, object | undefined>> = {
  react,
  'react/jsx-runtime': jsxRuntime,
  'react-dom': reactDom,
  'react-dom/client': reactDomClient,
  '@deepseek-ai/cordis': cordis,
  '@deepseek-ai/dsh-client-ui-primitives': primitives,
}

/** One `window.__ModuleLoader__.load` registration captured from a bundle import. */
interface LoaderRegistration {
  readonly id: string
  readonly factory: (require: (specifier: string) => unknown) => unknown
}

/** Registrations captured during the current `loadPluginModules` run. */
const registrations = new Map<string, LoaderRegistration>()

/** The page's queue facade shape, narrowed to the one method a bundle calls. */
interface LoaderFacade {
  load(registration: { id: string; factory: LoaderRegistration['factory'] }): void
}

/**
 * Install the `window.__ModuleLoader__` queue facade for bundle-style client
 * artifacts, keeping any facade a test already installed.
 */
function installLoaderFacade(): void {
  const scope = globalThis as { window?: { __ModuleLoader__?: LoaderFacade } }
  const host = scope.window
  if (host === undefined || host.__ModuleLoader__ !== undefined) return
  host.__ModuleLoader__ = {
    load(registration) {
      registrations.set(registration.id, registration)
    },
  }
}

/**
 * Materialize a captured bundle factory into the module namespace the Loader
 * expects: call the factory with the platform module table as `require`.
 * @param registration - The bundle's captured registration.
 * @returns The bundle's exported plugin module (`apply` / `inject` / …).
 */
function materialize(registration: LoaderRegistration): ClientPluginModule {
  const require = (specifier: string): unknown => {
    const provided = PLATFORM_REQUIREMENTS[specifier]
    if (provided === undefined) {
      throw new Error(`client-test-runtime: bundle "${registration.id}" requires "${specifier}", which the module table does not provide`)
    }
    return provided
  }
  return registration.factory(require) as ClientPluginModule
}

/**
 * Resolve each roster row to its plugin module: `plan.provide[name]` when
 * present, otherwise a `/client` import resolved by the repository's tsconfig
 * path aliases under Vitest, falling back to the bundle registration the same
 * import captured. The bootstrap row is the statically imported
 * `@deepseek-ai/dsh-client-modules/client` namespace.
 * @param plan - validated plan.
 * @returns package name → module, in roster order.
 * @throws {Error} when an import fails (the package name prefixes the original message) or the bootstrap row is provided.
 */
export async function loadPluginModules(plan: AssemblyPlan): Promise<ReadonlyMap<string, ClientPluginModule>> {
  const modules = new Map<string, ClientPluginModule>()
  installLoaderFacade()
  for (const { name } of plan.roster.rows) {
    const provided = plan.provide?.[name]
    if (name === MODULES_PACKAGE) {
      if (provided !== undefined) {
        throw new Error(`client-test-runtime: ${MODULES_PACKAGE} is the bootstrap module and cannot be provided`)
      }
      modules.set(name, modulesClient)
      continue
    }
    modules.set(name, provided ?? await importClient(name))
  }
  return modules
}

async function importClient(name: string): Promise<ClientPluginModule> {
  let namespace: unknown
  try {
    namespace = await import(/* @vite-ignore */ `${name}/client`)
  } catch (error) {
    throw new Error(`client-test-runtime: cannot import ${name}/client: ${String(error)}`, { cause: error })
  }
  const exported = namespace as ClientPluginModule
  // A bundle-style artifact registers itself and exports nothing; a workspace
  // package's ES module never registers. The registration wins so a bundle id
  // that happens to collide with a namespace key cannot mask it.
  const registration = registrations.get(name)
  if (registration !== undefined) return materialize(registration)
  if (Object.keys(exported).length > 0) return exported
  throw new Error(`client-test-runtime: ${name}/client exported nothing and registered no window.__ModuleLoader__ factory`)
}

/**
 * Build the production module system over queued factories returning the
 * loaded namespaces. The bootstrap row uses `bootstrapModule`; `staticModules`
 * is empty because namespaces already hold their own imports. Missing factories
 * reject through `loadBundle` without fetching.
 * @param graph - raw boot graph from `graphFromRoster`; `createClientModuleSystem` parses it.
 * @param modules - loaded plugin modules keyed by package name.
 * @returns module system to install as `loader.internal`; its `manifest` is the parsed graph.
 */
export function createInProcessModules(
  graph: WebBootGraph,
  modules: ReadonlyMap<string, ClientPluginModule>,
): ClientModuleLoader {
  const target: ClientModuleLoaderTarget = {
    mode: 'queue',
    pendingQueue: [],
    /* v8 ignore next -- construction replaces this sink before draining the prefilled queue. */
    load: () => { throw new Error('client-test-runtime: module facade is not initialized') },
    create: options => createClientModuleSystem(target, { id: MODULES_PACKAGE, exports: modulesClient }, options),
  }
  for (const [id, namespace] of modules) {
    if (id === MODULES_PACKAGE) continue
    target.pendingQueue.push({ id, factory: () => namespace as unknown as Record<string, unknown> })
  }
  return target.create({
    boot: graph,
    staticModules: {},
    loadBundle: url => Promise.reject(new Error(`client-test-runtime: in-process modules never load bundles (${url})`)),
  })
}

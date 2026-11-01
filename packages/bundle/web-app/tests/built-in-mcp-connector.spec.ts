/**
 * The built-in MCP connector integration: `dsh-mcp-connector` is linked into
 * this repository as the `plugins/dsh-mcp-connector` git submodule and composed
 * by this bundle, so a shipped build — and the desktop layer patched over it —
 * offers MCP server setup, cross-connection tool search and connection
 * troubleshooting (and the Connectors tab of `ui-sdkwork-markets`, which embeds
 * that plugin's panel) without an installer step.
 *
 * The submodule contents are not edited by this repository, so the assertions
 * below read the artifacts as shipped rather than pinning source text: the row
 * exists and is enabled, the package resolves with both halves declared and
 * present, the browser half registers the keyed `main` panel the Connectors tab
 * watches for, the Host half serves the panel page that tab frames, and the
 * shipped page still speaks the messages the tab answers. Those last four are
 * the soft contracts between the two packages: `ui-sdkwork-markets` hard-codes
 * the panel key, the panel path, and the message names, so a rename upstream
 * has to fail here instead of leaving a tab that frames nothing or a Prompt
 * button that times out.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

/** Loader row id and npm name of the built-in MCP connector plugin. */
const ROW_ID = 'duhu2000-mcp-connector'
const PACKAGE_NAME = 'dsh-mcp-connector'

/** The keyed `main` panel the Connectors tab embeds (see ui-sdkwork-markets). */
const PANEL_ID = 'mcp-connector'

/** The page the plugin's Host half serves and the tab frames. */
const SURFACE_ROUTE = '/mcp-connector/ui'

/**
 * The frame protocol the two packages share: the page's requests and the host
 * frame's answers. A rename in either shipped half breaks the Connectors tab's
 * workspace scope or its example-Prompt hand-off.
 */
const MESSAGE_TYPES = [
  'mcp-connector:workspace-context-request',
  'mcp-connector:workspace-context',
  'mcp-connector:start-session',
  'mcp-connector:start-session-result',
]

/** The Host services the connector's one plugin row depends on. */
const HOST_SERVICES = ['tools', 'storageDomain', 'loader', 'workspaceRegistry']

/** One shipped file of the linked package, with its source when readable. */
interface Artifact {
  readonly path: string
  readonly exists: boolean
  readonly source?: string
}

const patchPath = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
/** The desktop override layers a shipped desktop build applies over this bundle. */
const desktopLayerPaths = [
  fileURLToPath(new URL('../../sdkwork-desktop-app/cordis.patch.yml', import.meta.url)),
  fileURLToPath(new URL('../../../../apps/desktop-host/config/desktop.cordis.patch.yml', import.meta.url)),
]
const require = createRequire(import.meta.url)

/**
 * Every row a patch list inserts or addresses, in composition order.
 * @param path - the patch file; defaults to this bundle's own patch.
 * @returns the addressed rows.
 */
function rows(path: string = patchPath): EntryOptions[] {
  const parsed = yaml.load(readFileSync(path, 'utf8'), { schema: entryListSchema }) as
    | ({ insert?: EntryOptions[] } & EntryOptions)[]
    | undefined
  return (parsed ?? []).flatMap(patch => patch.insert === undefined ? [patch] : patch.insert)
}

/** The linked package's root, or undefined when it does not resolve. */
function packageRoot(): string | undefined {
  try {
    return dirname(require.resolve(`${PACKAGE_NAME}/package.json`))
  } catch {
    return undefined
  }
}

/** Read one artifact of the linked package. */
function artifact(root: string, relative: string): string {
  return readFileSync(join(root, relative), 'utf8')
}

/**
 * Everything this integration reads out of the linked package.
 * @returns the manifest (when it resolves) and the shipped files it depends on.
 */
function inspect(): { manifest: Record<string, unknown> | undefined; present: Artifact[] } {
  const root = packageRoot()
  if (root === undefined) return { manifest: undefined, present: [] }
  const manifest = JSON.parse(artifact(root, 'package.json')) as Record<string, unknown>
  // The two entry artifacts are the paths the manifest exports; the panel page
  // and the route module are fixed paths the plugin's own panel uses.
  const entryPaths = (['.', './client'] as const)
    .map(key => (manifest.exports as Record<string, unknown> | undefined)?.[key])
    .filter((value): value is string => typeof value === 'string')
  const present = [...entryPaths, 'lib/web.js', 'ui/index.html'].map((relative) => {
    if (!existsSync(join(root, relative))) return { path: relative, exists: false }
    return { path: relative, exists: true, source: artifact(root, relative) }
  })
  return { manifest, present }
}

/**
 * Every way the composed connector integration can be incomplete.
 * @param row - the composed Loader row, or undefined when the patch lost it.
 * @param manifest - the linked package manifest, or undefined when unresolved.
 * @param present - the shipped files, with their source when readable.
 * @returns one message per violation, empty when the integration is complete.
 */
function violations(
  row: EntryOptions | undefined,
  manifest: Record<string, unknown> | undefined,
  present: readonly Artifact[],
): string[] {
  const found: string[] = []
  if (row === undefined) found.push(`the web patch declares no ${ROW_ID} row`)
  else {
    if (row.name !== PACKAGE_NAME) found.push(`${ROW_ID} names ${row.name}, not ${PACKAGE_NAME}`)
    if (row.disabled !== undefined) found.push(`${ROW_ID} is not enabled by default`)
  }
  if (manifest === undefined) {
    found.push(`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/dsh-mcp-connector submodule checked out?)`)
    return found
  }
  const dsh = manifest.dsh
  const client = typeof dsh === 'object' && dsh !== null
    ? (dsh as { client?: { platform?: unknown } }).client
    : undefined
  if (client?.platform !== 'web') found.push(`${PACKAGE_NAME} declares no dsh.client web half`)
  const bundle = typeof dsh === 'object' && dsh !== null
    ? (dsh as { bundle?: { patch?: unknown } }).bundle
    : undefined
  // The package ships its own bundle patch. It must not be the only mount — the
  // profile does not list it, this bundle's row is the single composition — but
  // a package that stopped declaring one at all is worth noticing.
  if (bundle?.patch === undefined) found.push(`${PACKAGE_NAME} declares no dsh.bundle.patch`)
  for (const entry of present) {
    if (!entry.exists) {
      found.push(`${PACKAGE_NAME} is missing its built ${entry.path}`)
      continue
    }
    if (entry.source === undefined) continue
    if (entry.path.endsWith('client.js')) {
      // The Connectors tab watches this key and suppresses the row that carries
      // it; a rename would leave the tab framing nothing and the row doubled.
      if (!source(entry).includes(`key: "${PANEL_ID}"`)) {
        found.push(`${PACKAGE_NAME} registers no ${PANEL_ID} main panel`)
      }
      for (const type of MESSAGE_TYPES) {
        if (!source(entry).includes(type)) found.push(`${PACKAGE_NAME} client half declares no ${type} message`)
      }
    } else if (entry.path.endsWith('index.js')) {
      for (const service of HOST_SERVICES) {
        if (!new RegExp(`inject\\s*=\\s*\\[[^\\]]*'${service}'`).test(source(entry))) {
          found.push(`${PACKAGE_NAME} host half does not inject ${service}`)
        }
      }
    } else if (entry.path.endsWith('web.js')) {
      // The tab frames this exact route; the Host half is what serves it.
      if (!source(entry).includes(`path: '${SURFACE_ROUTE}'`)) {
        found.push(`${PACKAGE_NAME} host half serves no ${SURFACE_ROUTE} panel page`)
      }
    } else if (entry.path.endsWith('index.html')) {
      for (const type of MESSAGE_TYPES) {
        if (!source(entry).includes(type)) found.push(`${PACKAGE_NAME} panel page declares no ${type} message`)
      }
    }
  }
  return found
}

/** The readable source of one present artifact. */
function source(entry: Artifact): string {
  if (entry.source === undefined) throw new Error(`${entry.path} has no source`)
  return entry.source
}

describe('built-in MCP connector', () => {
  it('composes dsh-mcp-connector by default from the linked submodule', () => {
    const { manifest, present } = inspect()
    expect(violations(rows().find(row => row.id === ROW_ID), manifest, present)).toEqual([])
    // Both entry halves must be the shipped artifacts: this repository runs the
    // plugin's committed `lib/` files rather than rebuilding them, and the panel
    // page travels with them.
    expect(present.map(entry => entry.path)).toEqual([
      './lib/index.js', './lib/client.js', 'lib/web.js', 'ui/index.html',
    ])
  })

  it('rejects each way the integration can be incomplete', () => {
    const { manifest, present } = inspect()
    const row = rows().find(candidate => candidate.id === ROW_ID)
    if (row === undefined || manifest === undefined) throw new Error('the integration is already incomplete')

    expect(violations(undefined, manifest, present)).toEqual([`the web patch declares no ${ROW_ID} row`])
    expect(violations({ ...row, name: '@deepseek-ai/dsh-client-ui-theme' }, manifest, present))
      .toEqual([`${ROW_ID} names @deepseek-ai/dsh-client-ui-theme, not ${PACKAGE_NAME}`])
    expect(violations({ ...row, disabled: true }, manifest, present))
      .toEqual([`${ROW_ID} is not enabled by default`])
    expect(violations(row, undefined, present))
      .toEqual([`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/dsh-mcp-connector submodule checked out?)`])
    expect(violations(row, { ...manifest, dsh: {} }, present))
      .toEqual([`${PACKAGE_NAME} declares no dsh.client web half`, `${PACKAGE_NAME} declares no dsh.bundle.patch`])
    expect(violations(row, manifest, present.map(entry => ({ ...entry, exists: false }))))
      .toEqual(present.map(entry => `${PACKAGE_NAME} is missing its built ${entry.path}`))
  })

  it('pins the panel key and frame protocol the Connectors tab reads', () => {
    const { manifest, present } = inspect()
    const row = rows().find(candidate => candidate.id === ROW_ID)
    if (row === undefined || manifest === undefined) throw new Error('the integration is already incomplete')
    const without = (path: string, replacement: string): Artifact[] => present.map(entry => (
      entry.path === path ? { ...entry, source: replacement } : entry
    ))

    // The panel key is what the tab watches for and what the row suppression
    // names: a client artifact that registers nothing must fail here.
    expect(violations(row, manifest, without('./lib/client.js', 'export const apply = () => {}')))
      .toEqual([
        `${PACKAGE_NAME} registers no ${PANEL_ID} main panel`,
        ...MESSAGE_TYPES.map(type => `${PACKAGE_NAME} client half declares no ${type} message`),
      ])

    // The frame protocol is the only wire the two packages share, and both
    // shipped halves must still carry it.
    const clientOnly = `key: "${PANEL_ID}"\n${MESSAGE_TYPES.join('\n')}`
    expect(violations(row, manifest, without('./lib/client.js', clientOnly))).toEqual([])
    expect(violations(row, manifest, without('ui/index.html', '<html></html>')))
      .toEqual(MESSAGE_TYPES.map(type => `${PACKAGE_NAME} panel page declares no ${type} message`))

    // The Host half is the half that makes a connection real: the catalog, the
    // credentials, and the managed mcp-client entries all hang off these
    // services.
    expect(violations(row, manifest, without('./lib/index.js', 'export const inject = [];')))
      .toEqual(HOST_SERVICES.map(service => `${PACKAGE_NAME} host half does not inject ${service}`))
    for (const service of HOST_SERVICES) {
      // One missing service is enough to fail.
      const partial = `export const inject = [${HOST_SERVICES.filter(other => other !== service)
        .map(other => `'${other}'`).join(', ')}];`
      expect(violations(row, manifest, without('./lib/index.js', partial)))
        .toEqual([`${PACKAGE_NAME} host half does not inject ${service}`])
    }

    // The panel page is what the tab frames; without the route there is nothing
    // to frame.
    expect(violations(row, manifest, without('lib/web.js', 'export function mountWebRoutes() {}')))
      .toEqual([`${PACKAGE_NAME} host half serves no ${SURFACE_ROUTE} panel page`])
  })

  it('stays enabled under every desktop layer a shipped build applies', () => {
    // The desktop profile composes this bundle and patches over it, so the row
    // arrives in a desktop build with no second declaration. What could still
    // take the connector away is an override layer disabling it by id; neither
    // the desktop bundle patch nor the desktop host's own override does.
    for (const layer of desktopLayerPaths) {
      const addressed = rows(layer).find(candidate => candidate.id === ROW_ID)
      expect(
        addressed === undefined || addressed.disabled === undefined,
        `${ROW_ID} is disabled by ${layer}`,
      ).toBe(true)
      // A layer that re-points the row at another package is the other way to
      // lose the connector without saying "disabled".
      if (addressed !== undefined) expect(addressed.name).toBe(PACKAGE_NAME)
    }
  })
})

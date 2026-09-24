/**
 * The fork rows the web-app bundle and the desktop launcher overlay must keep
 * mounting, and who owns which.
 *
 * The renderer's data plane (`workspace.list`, `host.describe`, `host.openPath`,
 * …) is the apiproxy domain: the client-runtime speaks the apiproxy wire dialect
 * on every carrier. The two rows that serve it are therefore mounted by the
 * `dsh-web-app` bundle so BOTH surfaces answer them; the desktop launcher
 * overlay (`apps/desktop-host/config/desktop.cordis.patch.yml`) only overrides
 * the apiproxy row with `nativeOpen: true`, because the desktop shell always
 * carries an OS desktop while a web host follows platform detection.
 *
 * These rows are fork-owned insertions over an upstream-owned bundle and an
 * upstream-shaped overlay. When an upstream merge drops one, no other gate goes
 * red: the row's absence surfaces only at runtime, as a 404 from Connection's
 * own not-found branch. That is exactly how `POST /api/host.openPath` came to
 * answer 404 ("not found") instead of reaching the Host's native opener, and
 * why "打开文件夹" and the delivered-file card's reveal gesture both went dead.
 *
 * The overlay must never re-insert a row the bundle already mounts: the boot
 * composes each patch layer's `insert` as independent rows, so re-inserting an
 * existing id would mount the plugin twice.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { describe, expect, it } from 'vitest'

const DESKTOP_OVERLAY = fileURLToPath(
  new URL('../../desktop-host/config/desktop.cordis.patch.yml', import.meta.url))
const DESKTOP_HOST_PACKAGE = fileURLToPath(new URL('../../desktop-host/package.json', import.meta.url))
const CONNECTION_SOURCE = fileURLToPath(
  new URL('../../../packages/client/connection/src/index.ts', import.meta.url))
const WEB_APP_BUNDLE = fileURLToPath(
  new URL('../../../packages/bundle/web-app/cordis.patch.yml', import.meta.url))
const WEB_APP_PACKAGE = fileURLToPath(
  new URL('../../../packages/bundle/web-app/package.json', import.meta.url))
const GATEWAY_PACKAGE = fileURLToPath(
  new URL('../../../packages/host/sdkwork-api-gateway/package.json', import.meta.url))
const APIPROXY_PACKAGE = fileURLToPath(
  new URL('../../../packages/host/apiproxy/package.json', import.meta.url))

/** One raw loader patch row, before `@deepseek-ai/dsh-app-boot` anchors its names. */
interface PatchRow {
  readonly id?: unknown
  readonly name?: unknown
  readonly config?: unknown
  readonly insert?: unknown
}

function parsePatch(path: string): readonly PatchRow[] {
  // The boot's own loader: the bundle patches carry `!!js` expressions that a
  // plain YAML parse rejects.
  return loadOverlayPatches('desktop-host-composition.spec', path) as readonly PatchRow[]
}

const overlayRows = (): readonly PatchRow[] => parsePatch(DESKTOP_OVERLAY)
const webAppRows = (): readonly PatchRow[] => parsePatch(WEB_APP_BUNDLE)

/** Every row the patch's `insert:` lists declare, in patch order. */
function insertedRows(rows: readonly PatchRow[]): readonly PatchRow[] {
  return rows.flatMap(row => Array.isArray(row.insert) ? row.insert as PatchRow[] : [])
}

describe('desktop launcher overlay composition', () => {
  it('overrides the apiproxy row with the desktop nativeOpen fact', () => {
    // The desktop shell always carries an OS desktop; platform detection (the
    // web composition's default) is the wrong answer on this surface.
    const override = overlayRows().find(row => row.id === 'apiproxy')
    expect(override).toEqual({ id: 'apiproxy', config: { nativeOpen: true } })
  })

  it('never re-inserts rows the web-app bundle already mounts', () => {
    // The boot composes each layer's `insert` as independent rows: re-inserting
    // an id the bundle inserted would mount the plugin twice.
    const inserted = insertedRows(overlayRows()).map(row => row.id)
    expect(inserted).not.toContain('sdkwork-api-gateway')
    expect(inserted).not.toContain('apiproxy')
  })

  it('declares both providers as host dependencies so the packaged closure ships them', () => {
    const manifest = JSON.parse(readFileSync(DESKTOP_HOST_PACKAGE, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    // FORK DIVERGENCE: the published dependency policy spells every
    // `@deepseek-ai/dsh`-family workspace dependency `workspace:*`, so the
    // assertion tracks that spelling rather than the older `workspace:^`.
    expect(manifest.dependencies?.['@deepseek-ai/dsh-sdkwork-api-gateway']).toBe('workspace:*')
    expect(manifest.dependencies?.['@deepseek-ai/dsh-host-apiproxy']).toBe('workspace:*')
  })

  it('resolves the mounted names to the workspace packages that publish them', () => {
    const gateway = JSON.parse(readFileSync(GATEWAY_PACKAGE, 'utf8')) as { name?: string }
    const apiproxy = JSON.parse(readFileSync(APIPROXY_PACKAGE, 'utf8')) as { name?: string }
    expect(gateway.name).toBe('@deepseek-ai/dsh-sdkwork-api-gateway')
    expect(apiproxy.name).toBe('@deepseek-ai/dsh-host-apiproxy')
  })

  it('keeps the overlay an override-only layer', () => {
    // Upstream's desktop-web-wrapper refactor moved the directory-picker
    // plumbing into the shared bundle: the fork's `directory-picker` row there
    // resolves the fork's auto backend (native picker on attended hosts, plain
    // browse on headless ones), so the native inserts no longer belong to this
    // layer. The upstream Electron shell likewise owns the app:// carrier, the
    // native window frame, and update prompts — re-adding any of them here
    // would double each up. The overlay therefore carries overrides only.
    expect(insertedRows(overlayRows())).toEqual([])

    // The picker rows the old overlay used to insert must stay mounted through
    // the bundle's auto chooser, or in-app file browsing loses the native
    // backend on the desktop.
    const webAppPatch = readFileSync(WEB_APP_BUNDLE, 'utf8')
    expect(webAppPatch).toContain('id: directory-picker')
    expect(webAppPatch).toContain('dsh-sdkwork-directory-picker-auto')
  })

  it('reads the fallback slot lazily and only after Connection answers non-404', () => {
    // Connection's own exact routes win, and its 404 is the fallback trigger.
    // The dispatcher the desktop launcher once owned inline moved into
    // Connection's shared fetch handler (packages/client/connection
    // src/index.ts), with the slot face in src/sdkwork-gateway-slot.ts — the
    // desktop carrier composes the same handler instead of a private copy.
    const source = readFileSync(CONNECTION_SOURCE, 'utf8')
    expect(source).toMatch(/await sharedFetch\.fetch\(request\)/u)
    expect(source).toMatch(/if \(response\.status !== 404\) return response/u)
    expect(source).toMatch(/webCtx\.get\('sdkworkApiFallback'\)/u)
    expect(source).toMatch(/gateway === undefined \? response : gateway\.fetch\(request\)/u)
    // Every /api request rides that dispatcher, never the raw shared handler.
    expect(source).toMatch(/handler: async \(req, res\) =>/u)
    expect(source).toContain('path: API_PATH')
  })
})

describe('web-app bundle fork /api rows', () => {
  it('mounts both halves of the fork /api fallback so the web surface serves the apiproxy domain', () => {
    // The renderer's data plane rides these: without them the web carrier
    // answers 404 for workspace.list and host.* alike.
    const mounted = insertedRows(webAppRows())
    expect(mounted.find(row => row.id === 'sdkwork-api-gateway')).toEqual({
      id: 'sdkwork-api-gateway',
      name: '@deepseek-ai/dsh-sdkwork-api-gateway',
    })
    expect(mounted.find(row => row.id === 'apiproxy')).toEqual({
      id: 'apiproxy',
      name: '@deepseek-ai/dsh-host-apiproxy',
    })
  })

  it('declares both providers as bundle dependencies so the resolver closure ships them', () => {
    const manifest = JSON.parse(readFileSync(WEB_APP_PACKAGE, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    // FORK DIVERGENCE: the published dependency policy spells every
    // `@deepseek-ai/dsh`-family workspace dependency `workspace:*`, so the
    // assertion tracks that spelling rather than the older `workspace:^`.
    expect(manifest.dependencies?.['@deepseek-ai/dsh-sdkwork-api-gateway']).toBe('workspace:*')
    expect(manifest.dependencies?.['@deepseek-ai/dsh-host-apiproxy']).toBe('workspace:*')
  })
})

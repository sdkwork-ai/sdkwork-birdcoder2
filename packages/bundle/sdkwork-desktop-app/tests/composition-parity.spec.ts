/** Source-only parity checks between the Web and desktop plugin trees. */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { composeEntries, loadOptionalPatches } from '@deepseek-ai/dsh-app-boot'

const BASE_PATCH = fileURLToPath(new URL('../../base/cordis.patch.yml', import.meta.url))
const WEB_PATCH = fileURLToPath(new URL('../../web-app/cordis.patch.yml', import.meta.url))
const DESKTOP_PATCH = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
const DESKTOP_PACKAGE = fileURLToPath(new URL('../package.json', import.meta.url))
// The desktop launcher's own shipped preset root, injected by the shell's
// host boot beside the presets bundled inside dsh-agent-presets.
const DESKTOP_PRESETS = fileURLToPath(new URL('../../../../apps/desktop/config/agent-presets/', import.meta.url))

const CHANGED_ROWS = new Set(['webserver', 'web-runtime', 'client-hmr', 'connection'])
const ADDED_ROWS = ['sdkwork-desktop-carrier', 'desktop-connection', 'sdkwork-desktop-app', 'window-controls', 'update-banner'] as const

function compose(paths: readonly string[]): Map<string, PatchOptions> {
  return composeLayers(paths.map(path => loadOptionalPatches('desktop-parity', path) ?? []))
}

function composeLayers(layers: readonly PatchOptions[][]): Map<string, PatchOptions> {
  const rows = composeEntries(layers)
  return new Map(rows.map((row) => {
    if (typeof row.id !== 'string') throw new Error('composed plugin row has no string id')
    return [row.id, row]
  }))
}

describe('desktop and Web plugin composition parity', () => {
  it('declares the update UI package mounted by the desktop bundle', () => {
    const manifest = JSON.parse(readFileSync(DESKTOP_PACKAGE, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(manifest.dependencies?.['@deepseek-ai/dsh-client-ui-sdkwork-updater']).toBe('workspace:^')
  })

  it('preserves every Web row outside the explicit desktop carrier swap', () => {
    const web = compose([BASE_PATCH, WEB_PATCH])
    const desktop = compose([BASE_PATCH, WEB_PATCH, DESKTOP_PATCH])

    for (const [id, row] of web) {
      expect(desktop.has(id), `desktop dropped Web row ${id}`).toBe(true)
      if (!CHANGED_ROWS.has(id)) expect(desktop.get(id), `desktop changed Web row ${id}`).toEqual(row)
    }
    expect([...desktop.keys()].filter(id => !web.has(id))).toEqual(ADDED_ROWS)
  })

  it('limits changed and added rows to the documented desktop transport and shell plugins', () => {
    const web = compose([BASE_PATCH, WEB_PATCH])
    const desktop = compose([BASE_PATCH, WEB_PATCH, DESKTOP_PATCH])

    expect(desktop.get('webserver')).toEqual({ ...web.get('webserver'), disabled: true })
    expect(desktop.get('client-hmr')).toEqual({ ...web.get('client-hmr'), disabled: true })
    expect(desktop.get('web-runtime')).toEqual({
      ...web.get('web-runtime'),
      config: { openBrowser: false, printUrl: false, surfaceContext: false, trustedHosts: [] },
    })
    expect(desktop.get('connection')).toEqual({
      ...web.get('connection'),
      config: { trustedHosts: [] },
    })
    expect(ADDED_ROWS.map(id => desktop.get(id))).toEqual([
      {
        id: 'sdkwork-desktop-carrier',
        name: '@deepseek-ai/dsh-sdkwork-desktop-carrier',
        config: { host: '127.0.0.1', port: 0 },
      },
      { id: 'desktop-connection', name: '@deepseek-ai/dsh-client-connection/desktop' },
      { id: 'sdkwork-desktop-app', name: '@deepseek-ai/dsh-sdkwork-desktop-app' },
      { id: 'window-controls', name: '@deepseek-ai/dsh-client-ui-sdkwork-window-controls' },
      { id: 'update-banner', name: '@deepseek-ai/dsh-client-ui-sdkwork-updater' },
    ])
  })

  it('preserves profile-installed plugin rows and their profile patch values', () => {
    const profileBundle: PatchOptions[] = [{
      insert: [{ id: 'profile-addon', name: 'profile-addon', config: { value: 'bundle-default' } }],
    }]
    const profilePatch: PatchOptions[] = [{ id: 'profile-addon', config: { value: 'web-profile-patch' } }]
    const sharedLayers = [
      loadOptionalPatches('desktop-parity', BASE_PATCH) ?? [],
      loadOptionalPatches('desktop-parity', WEB_PATCH) ?? [],
      profileBundle,
      profilePatch,
    ]
    const web = composeLayers(sharedLayers)
    const desktop = composeLayers([
      ...sharedLayers,
      loadOptionalPatches('desktop-parity', DESKTOP_PATCH) ?? [],
    ])

    expect(web.get('profile-addon')).toEqual({
      id: 'profile-addon',
      name: 'profile-addon',
      config: { value: 'web-profile-patch' },
    })
    expect(desktop.get('profile-addon')).toEqual(web.get('profile-addon'))
  })

  it('keeps the desktop shipped preset root present beside the plugin-bundled presets', () => {
    // The CLI no longer ships preset files (they moved inside
    // dsh-agent-presets); the desktop launcher keeps its own fork preset root
    // and injects it as a system root, so only its presence is asserted here.
    expect(statSync(DESKTOP_PRESETS).isDirectory()).toBe(true)
    expect(readdirSync(DESKTOP_PRESETS).length).toBeGreaterThan(0)
  })
})

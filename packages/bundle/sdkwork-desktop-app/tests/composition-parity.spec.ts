/** Source-only parity checks between the Web and desktop plugin trees. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { composeEntries, loadOptionalPatches } from '@deepseek-ai/dsh-app-boot'

const BASE_PATCH = fileURLToPath(new URL('../../base/cordis.patch.yml', import.meta.url))
const WEB_PATCH = fileURLToPath(new URL('../../web-app/cordis.patch.yml', import.meta.url))
const DESKTOP_PATCH = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
const DESKTOP_PACKAGE = fileURLToPath(new URL('../package.json', import.meta.url))
// The browser welcome step's own namespace constant. Read as source: a
// host-side project cannot import a browser package (see apps/web/tests/
// scaffold.ts), and reading the reader's file is what makes an upstream rename
// a failure here instead of a silently unanswerable namespace.
const SETTINGS_MODELS_COPY = fileURLToPath(new URL('../../../client/ui-settings-models/src/onboarding-copy.ts', import.meta.url))
const SETTINGS_SHELL_PACKAGE = fileURLToPath(new URL('../../../client/ui-sdkwork-settings-menu/package.json', import.meta.url))
/** A row id the fork must never occupy: it would be a second settings namespace nothing reads. */
const FORK_ONLY_SETTINGS_ROW = 'ui-sdkwork-settings-menu'

const CHANGED_ROWS = new Set(['webserver', 'web-runtime', 'client-hmr', 'connection', 'harness-dev-context'])
const ADDED_ROWS = ['sdkwork-desktop-carrier', 'desktop-connection', 'sdkwork-desktop-app', 'update-banner'] as const

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
    expect(manifest.dependencies?.['@deepseek-ai/dsh-client-ui-sdkwork-updater']).toBe('workspace:*')
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
      { id: 'desktop-connection', name: '@deepseek-ai/dsh-sdkwork-api-gateway/desktop' },
      { id: 'sdkwork-desktop-app', name: '@deepseek-ai/dsh-sdkwork-desktop-app' },
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

  // The desktop launcher's own `config/agent-presets` root and its
  // `includeShippedRoot` injection were removed with the old in-process shell
  // (54561513cf); presets reach the desktop through the composition's
  // dsh-agent-preset rows, which the parity assertions above already cover.
})

describe('profile-backed settings namespaces', () => {
  it('answers a reader’s namespace from an enabled row of that id, never from a fork-only row id', () => {
    // A profile-backed settings namespace IS the loader row id of the entry
    // whose plugin Config declares the field: the Host resolves
    // `settings.mutate(ns, …)` with `configEditor.entries().find(row =>
    // row.options.id === ns)` and rejects the write with `No configurable
    // plugin entry "<ns>"` when no row of that id is live. The fork's settings
    // shell therefore has to keep upstream's row id and swap only the
    // implementation package behind it — the shape the directory-picker row
    // already uses — rather than disabling upstream's row and mounting the fork
    // package on a fork-only id. Under the fork-only id every namespace the
    // shell re-declares answers no row, and the welcome notice loses its only
    // exit: a successful write is the sole dismissal the modal accepts, so a
    // rejected write strands the user in the notice forever.
    const namespace = /WELCOME_NOTICE_SETTINGS_NAMESPACE = '([^']+)'/.exec(readFileSync(SETTINGS_MODELS_COPY, 'utf8'))?.[1]
    if (namespace === undefined) throw new Error(`cannot read the welcome namespace from ${SETTINGS_MODELS_COPY}`)
    const shell = JSON.parse(readFileSync(SETTINGS_SHELL_PACKAGE, 'utf8')) as { name?: string }

    const layers = { web: [BASE_PATCH, WEB_PATCH], desktop: [BASE_PATCH, WEB_PATCH, DESKTOP_PATCH] }
    for (const [layer, patches] of Object.entries(layers)) {
      const rows = compose(patches)
      const row = rows.get(namespace)
      expect(row?.name, `${layer} must load the fork settings shell on ${namespace}`).toBe(shell.name)
      // `disabled` arrives as `true`, as a boolean false, or not at all; only a
      // row that loads carries no disabling value.
      expect(row?.disabled ?? false, `${layer} disables the ${namespace} row`).toBe(false)
      expect(rows.has(FORK_ONLY_SETTINGS_ROW), `${layer} carries fork-only row ${FORK_ONLY_SETTINGS_ROW}`).toBe(false)
    }
  })
})

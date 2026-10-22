/**
 * The IM connector's composition: this bundle composes
 * `@deepseek-ai/dsh-client-ui-sdkwork-im-connector` by default, the package
 * ships its browser half, and the bundle manifest declares the dependency the
 * profile boots the row through. A dropped row, a renamed package, a lost
 * browser declaration, or a missing artifact fails here instead of at boot.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

const ROW_ID = 'ui-sdkwork-im-connector'
const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-sdkwork-im-connector'

const patchPath = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
const bundleManifestPath = fileURLToPath(new URL('../package.json', import.meta.url))
const require = createRequire(import.meta.url)

/** Every row the patch list inserts or addresses, in composition order. */
function rows(): EntryOptions[] {
  const parsed = yaml.load(readFileSync(patchPath, 'utf8'), { schema: entryListSchema }) as
    | ({ insert?: EntryOptions[] } & EntryOptions)[]
    | undefined
  return (parsed ?? []).flatMap(patch => patch.insert === undefined ? [patch] : patch.insert)
}

/** Read the bundle's declared dependency versions. */
function declaredDependencies(): Readonly<Record<string, string>> {
  const manifest = JSON.parse(readFileSync(bundleManifestPath, 'utf8')) as
    { dependencies?: Record<string, string> }
  return manifest.dependencies ?? {}
}

/** Read the package manifest and its built client artifact as the row sees them. */
function inspect(): {
  manifest: Record<string, unknown>
  clientArtifact: { path: string; exists: boolean }
} {
  const manifestPath = require.resolve(`${PACKAGE_NAME}/package.json`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  const root = dirname(manifestPath)
  const exportsField = manifest.exports as Record<string, unknown> | undefined
  const client = exportsField === undefined ? undefined : exportsField['./client']
  const clientExport = client as { default?: unknown } | string | undefined
  const relative = typeof clientExport === 'string' ? clientExport : clientExport?.default
  const path = typeof relative === 'string' ? relative : './lib/client.js'
  return { manifest, clientArtifact: { path, exists: existsSync(join(root, path)) } }
}

describe('IM connector composition', () => {
  it('composes the rail shortcut plugin by default', () => {
    const row = rows().find(candidate => candidate.id === ROW_ID)
    expect(row).toBeDefined()
    expect(row?.name).toBe(PACKAGE_NAME)
    expect(row?.disabled).toBeUndefined()
  })

  it('declares the package dependency the profile boots the row through', () => {
    expect(declaredDependencies()[PACKAGE_NAME]).toBe('workspace:*')
  })

  it('ships the browser half the composed row resolves', () => {
    const { manifest, clientArtifact } = inspect()
    const dsh = manifest.dsh as { client?: { platform?: unknown } } | undefined
    expect(dsh?.client?.platform).toBe('web')
    expect(clientArtifact.exists).toBe(true)
  })
})

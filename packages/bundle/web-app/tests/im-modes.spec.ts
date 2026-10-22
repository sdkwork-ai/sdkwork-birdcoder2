/**
 * The SDKWork IM modes' composition: this bundle composes the four IM host
 * plugins by default, each package ships its browser half, and the bundle
 * manifest declares the dependency the profile boots each row through. A
 * dropped row, a renamed package, a lost browser declaration, a broken
 * injection edge, or a missing artifact fails here instead of at boot.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

/** One composed row and the package edges its browser half declares. */
interface ImRow {
  id: string
  packageName: string
  inject: string[]
}

const ROWS: readonly ImRow[] = [
  {
    id: 'ui-sdkwork-im',
    packageName: '@deepseek-ai/dsh-client-ui-sdkwork-im',
    inject: [
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-ui-sdkwork-env',
      '@deepseek-ai/dsh-client-ui-sdkwork-iam',
    ],
  },
  {
    id: 'ui-sdkwork-im-conversations',
    packageName: '@deepseek-ai/dsh-client-ui-sdkwork-im-conversations',
    inject: [
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-sdkwork-app-modes',
      '@deepseek-ai/dsh-client-ui-sdkwork-iam',
      '@deepseek-ai/dsh-client-ui-sdkwork-im',
    ],
  },
  {
    id: 'ui-sdkwork-im-chat',
    packageName: '@deepseek-ai/dsh-client-ui-sdkwork-im-chat',
    inject: [
      '@deepseek-ai/dsh-client-ui-sdkwork-im',
      '@deepseek-ai/dsh-client-ui-sdkwork-im-conversations',
    ],
  },
  {
    id: 'ui-sdkwork-im-contacts',
    packageName: '@deepseek-ai/dsh-client-ui-sdkwork-im-contacts',
    inject: [
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-sdkwork-app-modes',
      '@deepseek-ai/dsh-client-ui-sdkwork-iam',
      '@deepseek-ai/dsh-client-ui-sdkwork-im',
    ],
  },
]

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

/** Read a package manifest and its built client artifact as the row sees them. */
function inspect(packageName: string): {
  manifest: Record<string, unknown>
  clientArtifact: { path: string; exists: boolean }
} {
  const manifestPath = require.resolve(`${packageName}/package.json`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  const root = dirname(manifestPath)
  const exportsField = manifest.exports as Record<string, unknown> | undefined
  const client = exportsField === undefined ? undefined : exportsField['./client']
  const clientExport = client as { default?: unknown } | string | undefined
  const relative = typeof clientExport === 'string' ? clientExport : clientExport?.default
  const path = typeof relative === 'string' ? relative : './lib/client.js'
  return { manifest, clientArtifact: { path, exists: existsSync(join(root, path)) } }
}

describe('SDKWork IM modes composition', () => {
  for (const row of ROWS) {
    it(`composes the ${row.id} row with its browser half and dependency`, () => {
      const composed = rows().find(candidate => candidate.id === row.id)
      expect(composed).toBeDefined()
      expect(composed?.name).toBe(row.packageName)
      expect(composed?.disabled).toBeUndefined()

      expect(declaredDependencies()[row.packageName]).toBe('workspace:*')

      const { manifest } = inspect(row.packageName)
      const dsh = manifest.dsh as { client?: { platform?: unknown; inject?: unknown } } | undefined
      expect(dsh?.client?.platform).toBe('web')
      expect(dsh?.client?.inject).toEqual(row.inject)
    })

    it(`ships the browser artifact the ${row.id} row resolves`, () => {
      const { manifest, clientArtifact } = inspect(row.packageName)
      const exportsField = manifest.exports as Record<string, unknown>
      expect(exportsField['./client']).toBeDefined()
      expect(clientArtifact.exists).toBe(true)
    })
  }
})

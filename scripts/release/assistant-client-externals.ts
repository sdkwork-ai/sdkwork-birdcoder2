/**
 * Keep the assistant plugin's prebuilt browser bundle inside the Web module
 * table.
 *
 * `plugins/sdkwork-deepseekbot` builds its client half outside this
 * repository's client pipeline, so nothing on that path compares the bundle's
 * runtime imports with the modules the Web shell actually seeds. A dependency
 * that the bundler leaves external therefore surfaces as a release-only boot
 * failure: the browser rejects the whole plugin (`require("x") missed the
 * module table`) and every surface it registers disappears, while a development
 * launch that serves the same source through the dev bundler keeps working.
 * This check runs at the release boundary, where the bundle is about to become
 * shipped bytes, and refuses one that the module table cannot satisfy.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLATFORM_MODULES, PRELOADED_CLIENT_EXTERNALS } from '../../packages/client/web/src/platform.ts'

/** A `require()` call, excluding local members such as `module.require()`. */
const REQUIRE_CALL = /(?<![\w$.])require\(\s*(['"])([^'"\n]+)\1\s*\)/gu

/** A package's `dsh.client.external` declarations, as the module graph sees them. */
export interface ClientExternalDeclaration {
  readonly external?: readonly string[]
}

/**
 * Bare specifiers one built browser bundle asks the module table for.
 * @param source - the bundle text.
 * @returns unique bare specifiers in stable order.
 */
export function clientBundleRequires(source: string): string[] {
  const specifiers = new Set<string>()
  for (const match of source.matchAll(REQUIRE_CALL)) {
    const specifier = match[2]
    if (specifier === undefined || specifier.startsWith('.') || specifier.startsWith('/')) continue
    specifiers.add(specifier)
  }
  return [...specifiers].sort()
}

/**
 * Bare specifiers a bundle requests but the Web module table cannot supply.
 *
 * The table answers the shell's platform seeds and the dynamic client rows a
 * bundle declares through `dsh.client.external`; anything else is shipped with
 * no supplier, and the loader drops the entire plugin when it is imported.
 * @param source - the built browser bundle.
 * @param declared - the package's `dsh.client.external` entries.
 * @returns the unsupported specifiers, or an empty array when the bundle is
 *   satisfiable.
 */
export function unsupportedClientRequires(source: string, declared: readonly string[]): string[] {
  const supplied = new Set<string>([...PLATFORM_MODULES, ...PRELOADED_CLIENT_EXTERNALS, ...declared])
  return clientBundleRequires(source).filter(specifier => !supplied.has(specifier))
}

/**
 * Read the `dsh.client.external` entries declared by one package manifest.
 * @param manifest - the parsed package manifest.
 * @returns the declared specifiers, or an empty list when the manifest declares
 *   no client half or no external requests.
 */
export function declaredClientExternals(manifest: unknown): string[] {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return []
  const dsh = (manifest as { dsh?: unknown }).dsh
  if (typeof dsh !== 'object' || dsh === null || Array.isArray(dsh)) return []
  const client = (dsh as { client?: unknown }).client
  if (typeof client !== 'object' || client === null || Array.isArray(client)) return []
  const external = (client as ClientExternalDeclaration).external
  if (!Array.isArray(external)) return []
  return external.filter((specifier): specifier is string => typeof specifier === 'string')
}

/**
 * Refuse an assistant-client package whose built browser bundle names a module
 * the Web shell does not seed.
 * @param packageRoot - the `@botharness/ui` package directory.
 * @param packageName - the package name used in diagnostics.
 * @throws If the bundle cannot be read or requires an unsupplied module.
 */
export function assertAssistantClientExternals(packageRoot: string, packageName: string): void {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as unknown
  const source = readFileSync(join(packageRoot, 'lib', 'client.js'), 'utf8')
  const unsupported = unsupportedClientRequires(source, declaredClientExternals(manifest))
  if (unsupported.length === 0) return
  throw new Error(
    `pack-assistant-plugin: ${packageName}'s browser bundle requires ${unsupported.join(', ')},`
    + ` which the Web module table cannot supply; bundle ${unsupported.length === 1 ? 'it' : 'them'}`
    + ' into the client entry or declare a module the shell seeds',
  )
}

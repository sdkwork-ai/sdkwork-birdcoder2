// The packaged application serves the SDKWork IM embed bundle from its own
// origin: the Web build copies `apps/web/public/**` into the dist, and the
// tracked non-development profiles name the root-relative route the host adapter
// resolves against the page. A bundle whose build externalized its module
// imports publishes no `SdkworkImEmbed`, and a profile naming a route the dist
// does not serve fails the same way, so both are pinned here instead of in a
// packaging run.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))

/** Root-relative route the browser resolves against the application origin. */
const ROUTE = '/sdkwork-im/im-pc-embed.js'

/** Profiles every packaged or hosted build of this repository reads. */
const PACKAGED_PROFILES = [
  '.env.cloud.test',
  '.env.cloud.production',
  '.env.standalone.test',
  '.env.standalone.production',
] as const

/** The same route inside Vite's public directory, which the build copies verbatim. */
const BUNDLE_PATH = join(root, 'apps', 'web', 'public', ROUTE.slice(1))

it('ships a self-contained IM embed bundle at the served route', async () => {
  const source = await readFile(BUNDLE_PATH, 'utf8')
  // A failed build emits a short file; a correct one carries the whole IM PC
  // surface set and its dependencies.
  expect(Buffer.byteLength(source, 'utf8')).toBeGreaterThan(1_000_000)
  expect(source.startsWith('var SdkworkImEmbed=')).toBe(true)
  // Self-contained IIFE: an artifact built with external module arguments cannot
  // publish the host API in a browser, which is how a broken embed build ships.
  expect(source.trimEnd().endsWith('})({});')).toBe(true)
  expect(() => new vm.Script(source, { filename: BUNDLE_PATH })).not.toThrow()
})

it('names the shipped route in every packaged environment profile', async () => {
  for (const profile of PACKAGED_PROFILES) {
    const content = await readFile(join(root, profile), 'utf8')
    const configured = /^SDKWORK_IM_EMBED_URL=(.*)$/mu.exec(content)?.[1]?.trim()
    expect(configured, profile).toBe(ROUTE)
  }
})

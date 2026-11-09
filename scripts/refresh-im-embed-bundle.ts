/**
 * Refresh the vendored SDKWork IM embed bundle the Web build ships.
 *
 * BirdCoder hosts the IM surfaces from a prebuilt IIFE that the sibling
 * `sdkwork-im` product builds (`pnpm --dir apps/sdkwork-im-pc run build:embed`);
 * it compiles no IM source and declares no IM dependency. The Web build copies
 * `apps/web/public/**` into its dist, so the application serves that artifact at
 * the root-relative route the tracked deployment profiles name and every
 * packaged or hosted deployment mounts IM from its own origin.
 *
 * The artifact is generated, so it is replaced only through this script: point it
 * at a successful `dist-embed/im-pc-embed.js` and it validates the bundle before
 * overwriting the vendored copy. Validation covers the two failure modes a
 * packaging run would otherwise only discover in the shipped application — a
 * truncated file, and a bundle whose build externalized its own module imports
 * (an IIFE invoked with extra arguments such as `})({},react_i18next,i18next)`),
 * which cannot publish `SdkworkImEmbed` in a browser. The host adapter still
 * checks the published contract version at runtime.
 *
 * Usage:
 *   pnpm run refresh:im-embed [--source <path>]
 *
 * `--source` defaults to `SDKWORK_IM_EMBED_BUNDLE`, then to the sibling
 * checkout's build output `../sdkwork-im/apps/sdkwork-im-pc/dist-embed/im-pc-embed.js`.
 */

import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import vm from 'node:vm'

/** Repository root the vendored path is relative to. */
const root = resolve(import.meta.dirname, '..')

/** Repository-relative location Vite copies to the dist root. */
const VENDORED = 'apps/web/public/sdkwork-im/im-pc-embed.js'

/** Sibling checkout's build output, used when no source is named. */
const DEFAULT_SOURCE = '../sdkwork-im/apps/sdkwork-im-pc/dist-embed/im-pc-embed.js'

/** Smallest plausible bundle; a shorter file is a truncated or failed build. */
const MINIMUM_BYTES = 1_000_000

/** Globals the bundle publishes: the host adapter reads `mountSurface` and `version`. */
const HEADER = 'var SdkworkImEmbed='

/**
 * Invocation tail of a self-contained IIFE. `vite.embed.config.ts` builds the
 * bundle with `formats: ['iife']`, so a correct artifact ends by calling the
 * factory with no module arguments. Any other argument list means the build
 * treated one of the bundle's imports as external.
 */
const SELF_CONTAINED_TAIL = '})({});'

/**
 * Validate one candidate bundle.
 * @param source - bundle text.
 * @returns nothing; throws a message naming the rejected artifact.
 */
function assertUsableBundle(source: string): void {
  if (!source.startsWith(HEADER)) {
    throw new Error(`refresh:im-embed: the bundle does not start with "${HEADER}"; `
      + 'it is not the IM embed build output (or it was concatenated with something else)')
  }
  const tail = source.trimEnd()
  if (!tail.endsWith(SELF_CONTAINED_TAIL)) {
    throw new Error(`refresh:im-embed: the bundle does not end with "${SELF_CONTAINED_TAIL}", so its build `
      + `externalized module imports (tail: ${JSON.stringify(tail.slice(-120))}). `
      + 'Rebuild it with a complete dependency install in the sdkwork-im checkout.')
  }
  // Compile without running: a syntax error would otherwise surface only when
  // the packaged application loads the script.
  new vm.Script(source, { filename: VENDORED })
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { source: { type: 'string' } },
    allowPositionals: false,
  })
  const selected = values.source ?? process.env.SDKWORK_IM_EMBED_BUNDLE
  const sourcePath = selected === undefined || selected.trim() === ''
    ? resolve(root, DEFAULT_SOURCE)
    : resolve(selected)
  let exists = false
  try {
    exists = (await stat(sourcePath)).isFile()
  } catch {
    exists = false
  }
  if (!exists) {
    throw new Error(`refresh:im-embed: no embed bundle at ${sourcePath}. Build it first with `
      + '`pnpm --dir apps/sdkwork-im-pc run build:embed` in the sdkwork-im checkout, '
      + 'or name another artifact with --source/SDKWORK_IM_EMBED_BUNDLE.')
  }
  const bytes = await readFile(sourcePath)
  if (bytes.byteLength < MINIMUM_BYTES) {
    throw new Error(`refresh:im-embed: ${sourcePath} is ${String(bytes.byteLength)} bytes, below the `
      + `${String(MINIMUM_BYTES)}-byte floor for the IM embed bundle`)
  }
  const source = bytes.toString('utf8')
  assertUsableBundle(source)
  const target = resolve(root, VENDORED)
  await writeFile(target, bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  console.log(`refresh:im-embed: wrote ${VENDORED} (${String(bytes.byteLength)} bytes, sha256 ${digest})`)
  return 0
}

if (import.meta.main) {
  try {
    process.exitCode = await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

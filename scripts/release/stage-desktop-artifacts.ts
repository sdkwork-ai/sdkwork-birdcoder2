/**
 * Stage one packaged Desktop target's release assets into a clean directory.
 *
 * The release job assembles the GitHub Release from exactly the asset files each
 * target declares, and it rejects a directory holding anything else — but
 * electron-builder writes the unpacked application tree beside the installers in
 * the same output directory. Verifying there and copying only the declared files
 * means the artifact a packaging runner uploads is exactly what assembly expects,
 * and a bad target fails on the runner that produced it.
 */

import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DESKTOP_BUILDER_BOOKKEEPING, desktopArtifactFiles } from './assemble-github-release.ts'
import { isEntry } from './process.ts'

/** Verify `--source` against the contract and copy its assets into `--output`. */
function main(): void {
  const { values } = parseArgs({
    options: {
      artifact: { type: 'string' },
      source: { type: 'string' },
      output: { type: 'string' },
      version: { type: 'string' },
    },
    allowPositionals: false,
  })
  if (values.artifact === undefined || values.source === undefined
    || values.output === undefined || values.version === undefined) {
    throw new Error('usage: stage-desktop-artifacts.ts --artifact <dsh-desktop-*> --source <directory> --output <directory> --version <x.y.z>')
  }
  const source = resolve(values.source)
  const output = resolve(values.output)
  const files = desktopArtifactFiles(values.artifact, source, values.version, DESKTOP_BUILDER_BOOKKEEPING)

  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  for (const name of files) copyFileSync(join(source, name), join(output, name))
  console.log(`desktop artifacts: staged ${String(files.length)} asset(s) for ${values.artifact} in ${values.output}`)
}

if (isEntry(import.meta.url)) main()

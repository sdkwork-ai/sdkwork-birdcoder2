import { defineConfig } from 'tsdown'
import { join } from 'node:path'
import { typertPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'
import { readBuildFace } from './scripts/tsdown-build-face.ts'

/**
 * The ordinary workspace build consumes JavaScript emitted by the Host
 * TypeScript project and runs Typert. The Client pass selects packages that
 * declare a browser bundle and lets their package-local configs emit both
 * their Node loader entry and browser artifact.
 *
 * Face resolution must match package-local configs: nested workspace configs
 * on Linux CI may receive an empty inline `env`, so fall back to
 * `process.env.DSH_BUILD_FACE` via {@link readBuildFace}. Mis-detecting the
 * Client pass as Host re-applies host `lib/types` entries to packages without
 * a local config and fails with UNRESOLVED_ENTRY once those files are absent.
 */
export default defineConfig((options) => {
  const client = readBuildFace(options) === 'client'
  return {
    workspace: ['vendor/*', 'packages/*/*', 'apps/cli'],
    entry: client ? '' : ['lib/types/{index,invariant,startup}.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    // Sibling SDKWork sources import bare specifiers (`@sdkwork/*`, and npm
    // packages their apps declare) that only resolve through the sibling's own
    // install. The release runner clones pinned siblings without node_modules,
    // so append the pnpm virtual store's flat link directory as a module search
    // root: every installed package, including each workspace member, is
    // reachable there. The default `node_modules` entry stays first so a
    // package's own nested install (walk-up) wins over the flat store links,
    // whose versions can differ from a package's pinned private deps. The path
    // derives from `process.cwd()` (tsdown's invocation directory) rather than
    // `import.meta.url`, which the config loader rewrites on CI.
    inputOptions: {
      resolve: {
        modules: ['node_modules', join(process.cwd(), 'node_modules/.pnpm/node_modules')],
      },
    },
    plugins: client ? [] : [typertPlugin({ mode: 'workspace', faces: ['host'] })],
  }
})

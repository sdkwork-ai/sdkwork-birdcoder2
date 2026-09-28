import react from '@vitejs/plugin-react'
import path from 'node:path'
import { readConfigFile, sys } from 'typescript'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Test configuration for the BirdCoder2 H5 app root.
 *
 * Two things make this file load-bearing rather than cosmetic:
 *
 * 1. Without it vitest falls back to `vite.config.ts`, which is a *build* config:
 *    it reads `mode` to derive `dist/<deployment-profile>/<envAlias>/` and throws
 *    `browser deployment profile must be one of standalone, cloud` when no
 *    `--mode` is passed. The package script `test` passes only `--root .`, so the
 *    fallback made every test run fail at startup. A `vitest.config.ts` takes
 *    precedence over `vite.config.ts`, so the app root gets a test entry that
 *    never touches the build layout.
 *
 * 2. vitest has no tsconfig `paths` support of its own. A `paths` entry resolves
 *    straight to a file and is transparent to package `exports`, so every
 *    subpath a spec reaches needs its own alias. Rather than hand-maintaining
 *    that list, the aliases are derived from `tsconfig.base.json` — the repo's
 *    single source of truth — exactly as the repo-root vitest config does.
 */
const appRoot = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const { config, error } = readConfigFile(path.join(repoRoot, 'tsconfig.base.json'), sys.readFile)
if (error !== undefined) {
  throw new Error(`vitest.config: cannot read tsconfig.base.json: ${String(error.messageText)}`)
}

const paths: Record<string, readonly string[]> = config?.compilerOptions?.paths ?? {}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

// A `paths` table encodes two different match shapes and they need two different
// alias kinds:
//
//   "@sdkwork/utils"    -> src/index.ts   a bare specifier, NOT a prefix
//   "@sdkwork/utils/*"  -> src/*          a prefix, so `@sdkwork/utils/id` -> src/id
//
// A Vite string alias matches on `key` or `key + '/'`, so a bare row alone would
// swallow `@sdkwork/utils/id` and rewrite it to `src/index.ts/id`. Wildcard rows
// therefore become regex aliases (which leave the bare specifier alone) and are
// tried first; the bare rows stay strings, longest key first so that
// `@sdkwork/birdcoder2-h5-core/host` wins over `@sdkwork/birdcoder2-h5-core`.
const wildcardAliases = Object.entries(paths)
  .filter(([key, targets]) => key.endsWith('/*') && targets.length === 1)
  .map(([key, targets]) => {
    const base = key.slice(0, -2)
    const targetBase = (targets[0] as string).slice(0, -2)
    return {
      find: new RegExp(`^${escapeRegExp(base)}/(.*)$`, 'u'),
      replacement: `${path.resolve(repoRoot, targetBase)}/$1`,
    }
  })

const exactAliases = Object.entries(paths)
  .filter(([key, targets]) => !key.includes('*') && targets.length === 1)
  .sort(([left], [right]) => right.length - left.length)
  .map(([key, targets]) => ({ find: key, replacement: path.resolve(repoRoot, targets[0] as string) }))

export default defineConfig({
  root: appRoot,
  // The specs live in the app root's own packages; the app-level `tests/`
  // directory is kept in the pattern so app-wide suites can be added beside them.
  test: {
    include: ['packages/*/tests/**/*.spec.{ts,tsx}', 'tests/**/*.spec.{ts,tsx}'],
    environment: 'node',
  },
  plugins: [react()],
  resolve: { alias: [...wildcardAliases, ...exactAliases] },
})

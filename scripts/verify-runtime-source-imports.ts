/**
 * Verify no shipped library artifact imports a TypeScript source file.
 *
 * Why: a package may reach a sibling's helper through that sibling's `/src/*`
 * export — every workspace package exports `./src/*` verbatim, so the
 * specifier resolves through tsconfig `paths` (typecheck green) and through
 * Vite (vitest green) while pointing at TypeScript SOURCE. Node's ESM loader
 * has no such extension: it rejects the specifier with
 * ERR_UNKNOWN_FILE_EXTENSION, and the Cordis Loader reports it as
 * `failed to import loader entry <name>` inside an AggregateError that only
 * surfaces when an application boots. That is exactly how a fork host package
 * took down `pnpm desktop:dev` with every build, typecheck, and unit test
 * passing — the failure lived on the one path no static gate covered.
 *
 * This scans the built `lib/**\/*.js` of every workspace package and fails on
 * any import/export specifier ending in a TypeScript extension. `lib/types/**`
 * is skipped: it is the `tsc -b` output a bundler consumes as INPUT, so its
 * source specifiers are expected and are resolved away before shipping.
 *
 * Remedy when it fails: give the helper a built entry and import that, or
 * inline it into the consuming bundle (`deps.alwaysBundle` in that package's
 * tsdown config). Do not widen the exemption list below — every widening is a
 * runtime landmine handed to the next merge.
 * @module scripts/verify-runtime-source-imports
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/** TypeScript source extensions Node's ESM loader refuses to load. */
const TYPESCRIPT_SOURCE = /\.(?:ts|tsx|mts|cts)$/

/**
 * A module specifier in a static import/export statement or a dynamic
 * `import()`. Anchored on the `from`/`import` keyword so a prose string inside
 * the bundle cannot trip it.
 */
const IMPORT_SPECIFIER = /(?:^|[\s;{}()*])(?:from|import)\s*\(?\s*['"]([^'"\n]+)['"]/g

/**
 * Built artifacts whose TypeScript specifiers are resolved by a bundler at
 * consumption time, never by Node. Each entry carries its reason: this list
 * only ever shrinks, and every addition costs a runtime guarantee.
 */
const EXEMPT_PACKAGES: Readonly<Record<string, string>> = {
  'packages/test-support/client-runtime':
    'vitest inlines and transforms this test-support package, so Vite resolves its TypeScript specifiers; no Node runtime ever loads lib/index.js.',
}

/** One built artifact to scan. */
export interface BuiltArtifact {
  /** Absolute (or synthetic, in tests) path of the artifact. */
  readonly path: string
  /** Full text of the artifact. */
  readonly content: string
}

/** One TypeScript source specifier found in a built artifact. */
export interface RuntimeSourceImport {
  /** Path of the artifact carrying the specifier. */
  readonly file: string
  /** The offending module specifier. */
  readonly specifier: string
  /** Directory of the package that owns the artifact. */
  readonly packageDir: string
}

/**
 * Whether an artifact path is a bundler INPUT rather than a shipped artifact.
 * `lib/types/**` is `tsc -b` output fed to tsdown, so its source specifiers
 * are expected there and are resolved away before anything ships.
 * @param artifactPath - path to classify.
 * @returns `true` when the artifact is a bundler input and must be skipped.
 */
export function isBundlerInputArtifact(artifactPath: string): boolean {
  const segments = artifactPath.split(/[/\\]/)
  const typesIndex = segments.indexOf('types')
  return typesIndex > 0 && segments[typesIndex - 1] === 'lib'
}

/**
 * Split an artifact path into its owning package directory.
 * @param artifactPath - path containing a `lib` segment.
 * @returns the package directory, or `undefined` when no `lib` segment exists.
 */
export function owningPackageDir(artifactPath: string): string | undefined {
  const segments = artifactPath.split(/[/\\]/)
  const libIndex = segments.indexOf('lib')
  if (libIndex < 1) return undefined
  // Anchor on the workspace root segment so the result is repository-relative
  // no matter whether the artifact was collected with an absolute path.
  const rootIndex = segments.findIndex(segment => segment === 'packages' || segment === 'apps')
  if (rootIndex < 0 || rootIndex >= libIndex) return undefined
  return segments.slice(rootIndex, libIndex).join('/')
}

/**
 * Whether a match sits inside a string literal on its own line. Bundled
 * artifacts embed generated documentation payloads that quote TypeScript
 * source — including `import('./views.ts')` inside a copied doc comment — and
 * that text is not an import.
 * @param content - artifact text.
 * @param matchIndex - index of the match inside `content`.
 * @returns `true` when the match is quoted text rather than code.
 */
export function isInsideStringLiteral(content: string, matchIndex: number): boolean {
  const lineStart = content.lastIndexOf('\n', matchIndex - 1) + 1
  const prefix = content.slice(lineStart, matchIndex).replaceAll('\\"', '').replaceAll("\\'", '')
  let quotes = 0
  for (const char of prefix) if (char === '"' || char === "'") quotes += 1
  return quotes % 2 === 1
}

/**
 * Collect every TypeScript source specifier imported by the given artifacts.
 * @param artifacts - built artifacts to scan.
 * @returns one entry per offending specifier, ordered by artifact then position.
 */
export function findRuntimeSourceImports(artifacts: readonly BuiltArtifact[]): RuntimeSourceImport[] {
  const violations: RuntimeSourceImport[] = []
  for (const artifact of artifacts) {
    if (isBundlerInputArtifact(artifact.path)) continue
    const packageDir = owningPackageDir(artifact.path)
    if (packageDir === undefined) continue
    for (const match of artifact.content.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1]
      if (specifier === undefined || !TYPESCRIPT_SOURCE.test(specifier)) continue
      if (isInsideStringLiteral(artifact.content, match.index ?? 0)) continue
      violations.push({ file: artifact.path, specifier, packageDir })
    }
  }
  return violations
}

/**
 * Split findings into blocking violations and declared exemptions.
 * @param found - findings from {@link findRuntimeSourceImports}.
 * @param exempt - package directories exempted, mapped to their reason.
 * @returns the findings that must fail the gate, and those exempted.
 */
export function classifyImports(
  found: readonly RuntimeSourceImport[],
  exempt: Readonly<Record<string, string>> = EXEMPT_PACKAGES,
): { readonly violations: RuntimeSourceImport[]; readonly exempted: RuntimeSourceImport[] } {
  const violations: RuntimeSourceImport[] = []
  const exempted: RuntimeSourceImport[] = []
  for (const entry of found) {
    if (exempt[entry.packageDir] === undefined) violations.push(entry)
    else exempted.push(entry)
  }
  return { violations, exempted }
}

/**
 * Read every shipped `lib/**\/*.js` under the given repository root.
 * @param repositoryRoot - absolute repository root.
 * @returns the artifacts found under `packages/` and `apps/`.
 */
export function collectBuiltArtifacts(repositoryRoot: string): BuiltArtifact[] {
  const artifacts: BuiltArtifact[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        visit(entryPath)
        continue
      }
      if (!entry.name.endsWith('.js')) continue
      if (!entryPath.split(sep).includes('lib')) continue
      if (isBundlerInputArtifact(entryPath)) continue
      artifacts.push({ path: entryPath, content: readFileSync(entryPath, 'utf8') })
    }
  }
  for (const root of ['packages', 'apps']) {
    const absolute = resolve(repositoryRoot, root)
    if (existsSync(absolute)) visit(absolute)
  }
  return artifacts
}

if (import.meta.main) {
  const repositoryRoot = resolve(import.meta.dirname, '..')
  const artifacts = collectBuiltArtifacts(repositoryRoot)
  if (artifacts.length === 0) {
    // A clean tree has no `lib/` at all. Failing here would break every
    // build-free aggregate, so say so loudly and let the artifact aggregates
    // (which declare a `build` dependency) be the ones that mean it.
    console.warn(
      'verify-runtime-source-imports: no built lib artifacts found — run the host/client lib build before this gate.',
    )
  } else {
    const { violations, exempted } = classifyImports(findRuntimeSourceImports(artifacts))
    if (violations.length > 0) {
      console.error(
        `verify-runtime-source-imports: ${violations.length} built artifact(s) import TypeScript source, `
          + 'which Node refuses to load at runtime (ERR_UNKNOWN_FILE_EXTENSION):',
      )
      for (const violation of violations) {
        console.error(`  ${violation.file}\n    imports ${violation.specifier}`)
      }
      console.error(
        '\nFix: import the helper from the owning package\'s built entry, or inline it with '
          + "`deps.alwaysBundle` in the consuming package's tsdown config.",
      )
      process.exitCode = 1
    } else {
      const exemptNote = exempted.length === 0
        ? ''
        : ` (${new Set(exempted.map(entry => entry.packageDir)).size} exempted package(s))`
      console.log(
        `verify-runtime-source-imports: ${artifacts.length} built artifact(s) scanned, `
          + `0 TypeScript source import(s)${exemptNote}.`,
      )
    }
  }
}

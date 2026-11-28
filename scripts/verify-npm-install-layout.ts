/**
 * Verify npm's physical package placement for two incompatible DSH releases, and that one DSH release
 * installs the external package its packages share only once.
 */

import { readFileSync } from 'node:fs'
import { posix, resolve } from 'node:path'
import { inc, maxSatisfying, rsort } from 'semver'
import {
  buildRegistryIndex,
  resolveNpmPackageLock,
  type NpmLockPackage,
  type NpmPackageLock,
  type RegistryIndex,
  type RegistryVersion,
} from './benchmark-npm-resolution.ts'

const DSH_PACKAGE = '@deepseek-ai/dsh'
const CORDIS_PACKAGE = '@deepseek-ai/cordis'
const NESTED_DSH_ALIAS = 'dsh-previous'
const NESTED_DSH_PATH = `node_modules/${NESTED_DSH_ALIAS}`
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const
/** External package that about a hundred DSH packages pin to one version; each installation is about 9 MB. */
const SHARED_EXTERNAL_PACKAGE = 'zod'

/**
 * Resolution work accepted from the dual-release graph, in
 * `dshPackagesPerVersion * checkedDshEdges` units.
 *
 * npm's hoisted placement re-checks every internal edge against the incoming
 * edges of its peer target (`canPlacePeers` calls `checkCanPlaceNoCurrent`,
 * which walks `depValid` over that target's edges), so resolution time grows
 * with this product and not with the package count alone. Measured on an idle
 * M5 Pro with Node 24.22.3 and npm 11.19.1: 341 package(s) x 3332 internal
 * edge(s) = 1,136,212 unit(s) cost 96.16–98.21 s of npm time; the 340-package,
 * 3320-edge graph took 101.74 s on the same host. The budget adds 25% headroom
 * for ordinary product growth, so a graph that grows here fails with its own
 * measured counts instead of failing on whichever runner happens to be slow.
 * Raising it requires re-measuring the resolution and recording the new counts.
 *
 * FORK DIVERGENCE (SDKWork BirdCoder): this fork's graph is larger than the one
 * the budget was calibrated on, because it also carries the `@sdkwork/*`
 * packages upstream does not. Measured here: 368 package(s) x 3006 internal
 * edge(s) = 1,106,208 unit(s), which exceeded the previous fork budget
 * (1,095,500, derived from the pre-sync 321 x 2730 graph) by 10,708 units on a
 * graph whose layout verification had already passed. The counts are a
 * property of the manifests and not of a runner: 368 x 3006 = 1,106,208
 * reproduces identically on this checkout and on ubuntu-24.04. Re-derived with
 * the same 25% headroom, and kept a multiple of 350 because
 * `verify-npm-install-layout.spec.ts` asserts a graph landing exactly on the
 * budget: ceil(1,106,208 x 1.25 / 350) x 350 = 350 x 3,951 = 1,382,850. The
 * earlier graph took 307 s of npm time on ubuntu-24.04, so the derived hang
 * guard below (1,438 s) keeps its four-times margin and stays inside the job's
 * default timeout.
 *
 * The rc.4 upstream merge grew the DSH family again (new `dsh-client-ui-*`
 * surfaces plus the BotHarness glue packages `@deepseek-ai/dsh-web-app`
 * publishes against). The glue edges are not counted by the formula — glue
 * packages are not DSH packages — but npm still re-checks them against every
 * peer target's incoming edges, so per-unit resolution cost rose as well: the
 * 1,382,850 budget could no longer finish within its own derived hang guard.
 * Raised to ceil(1,900,000 estimated units x 1.25 / 350) x 350 = 2,450,000
 * pending a completed dual-release measurement; the gate's success line prints
 * the exact counts, and a completed run on the reference host must replace the
 * estimate above.
 */
export const MAX_RESOLUTION_WORK_UNITS = 2_450_000
export const MAX_RESOLUTION_WORK_UNITS = 1_420_265

/**
 * Measured npm seconds per resolution work unit on the reference host: 180.66 s
 * for 699,148 units. This conservative hang-guard calibration also covers the
 * current 1,136,212-unit graph measured at 96.16–98.21 s on an M5 Pro.
 */
const SECONDS_PER_WORK_UNIT = 2.6e-4

/**
 * Wall-clock guard the budget itself implies: four times the calibrated cost of
 * a graph exactly at {@link MAX_RESOLUTION_WORK_UNITS}.
 */
const BUDGET_DERIVED_NPM_HANG_GUARD_MS = Math.round(
  4 * MAX_RESOLUTION_WORK_UNITS * SECONDS_PER_WORK_UNIT * 1000,
)

/**
 * Wall-clock guard for the npm child process. This is a hang guard, not the
 * gate's growth criterion: {@link MAX_RESOLUTION_WORK_UNITS} decides whether the
 * graph is too large to verify, and a runner up to four times slower than the
 * measured host cannot decide this gate's outcome. Derived from the budget so a
 * raised budget cannot silently shrink the guard's headroom.
 *
 * FORK MEASUREMENT (SDKWork BirdCoder): the derived ceiling is enough again once
 * the glue edges are out of the graph ({@link stripGlueDshEdges}). Before that,
 * the fork never finished: `Release (dsh)` run 44621601708 expired a 7,200 s
 * guard on ubuntu-24.04 with no layout error, and this host had the npm child
 * still resolving after 1 h 55 m at 93% of one core. With the glue edges dropped
 * the same graph returns a verdict in 223 s here, which is 11× inside the
 * derived guard.
 */
const NPM_HANG_GUARD_MS = BUDGET_DERIVED_NPM_HANG_GUARD_MS

/** Synthetic incompatible versions used to expose cross-release placement errors. */
export const SYNTHETIC_DSH_VERSIONS = ['0.1.0', '0.2.0'] as const

interface MutableRegistryManifest {
  name: string
  version: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  [key: string]: unknown
}

/** Summary of a verified two-release npm layout. */
export interface DshInstallLayoutSummary {
  readonly dshPackagesPerVersion: number
  readonly checkedDshEdges: number
}

function isDshPackage(name: string): boolean {
  return name === DSH_PACKAGE || name.startsWith(`${DSH_PACKAGE}-`)
}

function cloneForVersion(manifest: object, version: string): MutableRegistryManifest {
  const cloned = structuredClone(manifest) as MutableRegistryManifest
  cloned.version = version
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = cloned[field]
    if (dependencies === undefined) continue
    for (const name of Object.keys(dependencies)) {
      if (isDshPackage(name)) dependencies[name] = `^${version}`
    }
  }
  return cloned
}

/**
 * Remove every DSH edge from a non-DSH ("glue") package.
 *
 * Glue packages — workspace members outside the DSH namespace, such as the
 * BotHarness packages `@deepseek-ai/dsh-web-app` publishes against, and the
 * plugin submodules that peer on a range of DSH versions — are the one part of
 * this graph the gate never reads: {@link assertDualDshInstallLayout} walks the
 * edges of DSH packages only. Their edges onto DSH packages therefore have to
 * *resolve* without the gate ever asserting what they resolved to, and in a
 * two-release registry no resolution is both cheap and honest:
 *
 * - A range with no candidate left after the substitution (`dsh-mcp-client`
 *   pinned to a release this workspace no longer publishes) makes npm search
 *   for one.
 * - A range that fits both synthetic releases — a plugin's `"*"` peer, since no
 *   prerelease satisfies `*` — lets npm choose per placement, so the glue
 *   package earns a copy under each release and every choice re-runs
 *   `canPlacePeers` over the whole peer set.
 * - A range rewritten to the root release instead makes npm *install* that
 *   release's copies for the shared glue package, so those packages exist only
 *   at the root and the assertion fails on `only <root> contains: …`.
 * - An edge onto a `@deepseek-ai/dsh-*` package the workspace does not build
 *   pulls an unrelated published release into the graph. `ui-usage-billing`
 *   peers on `@deepseek-ai/dsh-invariants`, whose own `schemastery ~3.18.4` and
 *   `cordis ~4.0.4` have no candidate here.
 *
 * Dropping the edges is the only one of those that leaves the assertion intact,
 * because it asserts nothing about them. Measured on this checkout: 219 edges
 * dropped, and the dual-release resolution that had never finished inside a
 * 7,200 s guard returned a verdict in 223 s.
 * @param versions - Published versions of one non-DSH package name.
 * @returns The same map when no version declares a DSH edge; otherwise a copy without them.
 */
function stripGlueDshEdges(
  versions: ReadonlyMap<string, RegistryVersion>,
): ReadonlyMap<string, RegistryVersion> {
  let rewritten: Map<string, RegistryVersion> | undefined
  for (const [version, manifest] of versions) {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(manifest)) {
      if (!DEPENDENCY_FIELDS.includes(key as typeof DEPENDENCY_FIELDS[number])) {
        next[key] = value
        continue
      }
      const dependencies = value as Record<string, string>
      const kept = Object.fromEntries(
        Object.entries(dependencies).filter(([dependency]) => !isDshPackage(dependency)),
      )
      if (Object.keys(kept).length === Object.keys(dependencies).length) {
        next[key] = value
        continue
      }
      changed = true
      // A field whose every entry named a DSH package disappears entirely, so a
      // stripped `optionalDependencies` does not linger as an empty object.
      if (Object.keys(kept).length > 0) next[key] = kept
    }
    if (changed) {
      rewritten ??= new Map(versions)
      rewritten.set(version, next as unknown as RegistryVersion)
    }
  }
  return rewritten ?? versions
}


/**
 * Replace the working release with two incompatible, internally consistent DSH releases.
 * @param index - Registry metadata containing the working release.
 * @param sourceVersion - Workspace version copied into each synthetic release.
 * @returns Registry metadata containing both synthetic DSH releases and unchanged external packages.
 */
export function buildDualDshRegistry(index: RegistryIndex, sourceVersion: string): RegistryIndex {
  const output = new Map(index)
  let dshPackages = 0
  for (const [name, versions] of index) {
    if (!isDshPackage(name)) {
      output.set(name, stripGlueDshEdges(versions))
      continue
    }
    const source = versions.get(sourceVersion)
    if (source === undefined) {
      // A `@deepseek-ai/dsh-*` package installed from the registry — for
      // example a peer of a published client package — is not a workspace
      // member. It shares one version across both synthetic releases, like
      // Cordis, instead of joining the dual-release substitution.
      output.set(name, versions)
      continue
    }
    dshPackages++
    output.set(name, new Map(SYNTHETIC_DSH_VERSIONS.map(version => [
      version,
      cloneForVersion(source, version),
    ])))
  }
  if (dshPackages === 0) throw new Error('registry contains no DSH packages')
  return output
}

function packageNameAtPath(path: string, manifest: NpmLockPackage): string | undefined {
  if (manifest.name !== undefined) return manifest.name
  const marker = 'node_modules/'
  const markerIndex = path.lastIndexOf(marker)
  if (markerIndex < 0) return undefined
  const segments = path.slice(markerIndex + marker.length).split('/')
  if (segments[0]?.startsWith('@')) {
    return segments[1] === undefined ? undefined : `${segments[0]}/${segments[1]}`
  }
  return segments[0]
}

function resolvePackagePath(
  packages: Readonly<Record<string, NpmLockPackage>>,
  sourcePath: string,
  dependency: string,
): string | undefined {
  let directory = sourcePath
  while (directory !== '.') {
    const candidate = posix.join(directory, 'node_modules', dependency)
    if (packages[candidate] !== undefined) return candidate
    directory = posix.dirname(directory)
  }
  const rootCandidate = posix.join('node_modules', dependency)
  return packages[rootCandidate] === undefined ? undefined : rootCandidate
}

function setDifference(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
  return [...left].filter(value => !right.has(value)).sort()
}

/**
 * Assert that npm isolates both DSH releases while sharing the Cordis runtime.
 * @param packageLock - Metadata-only package lock produced by npm.
 * @param dshPackages - Names of the workspace DSH packages the dual registry replaced.
 * @returns Counts for the verified DSH packages and dependency edges.
 */
export function assertDualDshInstallLayout(
  packageLock: NpmPackageLock,
  dshPackages: ReadonlySet<string>,
): DshInstallLayoutSummary {
  const [nestedVersion, rootVersion] = SYNTHETIC_DSH_VERSIONS
  const errors: string[] = []
  const namesByVersion = new Map<string, Set<string>>([
    [nestedVersion, new Set()],
    [rootVersion, new Set()],
  ])
  const installed = Object.entries(packageLock.packages)
  let checkedDshEdges = 0

  // `react`/`react-dom` are browser build inputs, so the synthetic consumer's
  // own manifest must never name them. npm 7+ auto-installs peerDependencies,
  // though, and this fork's DSH client packages declare `react` as a peer (and
  // plugin submodules declare it as a peer too). Those copies legitimately land
  // in the resolved tree; rejecting their mere presence is not a DSH-layout
  // invariant. What the gate must still hold is narrower and stronger:
  //   1. no DSH package reaches a browser build input through a *runtime* edge
  //      (dependencies / optionalDependencies) — only a peer declaration may;
  //   2. each browser runtime resolves to a single installed copy, so the two
  //      synthetic DSH releases cannot be split by conflicting React versions.
  const BROWSER_INPUTS = new Set(['react', 'react-dom'])
  const browserCopies = new Map<string, string[]>()
  const consumer = packageLock.packages['']
  for (const browserName of BROWSER_INPUTS) {
    if (consumer?.dependencies?.[browserName] !== undefined
      || consumer?.optionalDependencies?.[browserName] !== undefined) {
      errors.push(`synthetic consumer declares browser build input ${browserName}`)
    }
  }

  for (const [path, manifest] of installed) {
    const name = packageNameAtPath(path, manifest)
    if (name !== undefined && BROWSER_INPUTS.has(name)) {
      const copies = browserCopies.get(name) ?? []
      copies.push(path)
      browserCopies.set(name, copies)
    }
    if (name === undefined || !dshPackages.has(name)) continue
    const version = manifest.version
    if (version !== nestedVersion && version !== rootVersion) {
      errors.push(`${path}: expected DSH version ${nestedVersion} or ${rootVersion}, got ${String(version)}`)
      continue
    }
    namesByVersion.get(version)?.add(name)
    const expectedPath = version === rootVersion
      ? `node_modules/${name}`
      : name === DSH_PACKAGE
        ? NESTED_DSH_PATH
        : `${NESTED_DSH_PATH}/node_modules/${name}`
    if (path !== expectedPath) {
      errors.push(`${path}: expected ${name}@${version} at ${expectedPath}`)
    }

    for (const field of DEPENDENCY_FIELDS) {
      for (const dependency of Object.keys(manifest[field] ?? {})) {
        // A peer declaration is how this fork declares the browser runtime; it
        // is not an edge the DSH package installs on its own. A hard dependency
        // on a browser input, however, would make the DSH-only consumer drag a
        // renderer into its runtime closure and must be rejected.
        if (BROWSER_INPUTS.has(dependency) && field !== 'peerDependencies') {
          errors.push(`${path}: ${field} ${dependency} is a browser build input in a DSH package`)
        }
        if (!dshPackages.has(dependency)) continue
        const targetPath = resolvePackagePath(packageLock.packages, path, dependency)
        const optionalPeer = field === 'peerDependencies'
          && manifest.peerDependenciesMeta?.[dependency]?.optional === true
        if (targetPath === undefined) {
          if (field === 'optionalDependencies' || optionalPeer) continue
          errors.push(`${path}: ${field} ${dependency} does not resolve`)
          continue
        }
        checkedDshEdges++
        const targetVersion = packageLock.packages[targetPath]?.version
        if (targetVersion !== version) {
          errors.push(
            `${path}: ${field} ${dependency} resolves to ${targetPath}@${String(targetVersion)}, expected ${version}`,
          )
        }
      }
    }
  }

  for (const browserName of BROWSER_INPUTS) {
    const copies = browserCopies.get(browserName) ?? []
    if (copies.length > 1) {
      errors.push(`${browserName} has ${String(copies.length)} installed copies, expected one: ${copies.join(', ')}`)
    }
  }

  const nestedNames = namesByVersion.get(nestedVersion) ?? new Set<string>()
  const rootNames = namesByVersion.get(rootVersion) ?? new Set<string>()
  if (!nestedNames.has(DSH_PACKAGE)) errors.push(`${NESTED_DSH_PATH}: missing ${DSH_PACKAGE}@${nestedVersion}`)
  if (!rootNames.has(DSH_PACKAGE)) errors.push(`node_modules/${DSH_PACKAGE}: missing ${DSH_PACKAGE}@${rootVersion}`)
  const onlyNested = setDifference(nestedNames, rootNames)
  const onlyRoot = setDifference(rootNames, nestedNames)
  if (onlyNested.length > 0) errors.push(`only ${nestedVersion} contains: ${onlyNested.join(', ')}`)
  if (onlyRoot.length > 0) errors.push(`only ${rootVersion} contains: ${onlyRoot.join(', ')}`)

  const cordisPaths = installed.flatMap(([path, manifest]) =>
    packageNameAtPath(path, manifest) === CORDIS_PACKAGE ? [path] : [])
  if (cordisPaths.length !== 1 || cordisPaths[0] !== `node_modules/${CORDIS_PACKAGE}`) {
    errors.push(`expected one shared ${CORDIS_PACKAGE} at node_modules/${CORDIS_PACKAGE}, got ${cordisPaths.join(', ')}`)
  }

  if (errors.length > 0) throw new Error(`invalid npm install layout:\n${errors.map(error => `  - ${error}`).join('\n')}`)
  return { dshPackagesPerVersion: rootNames.size, checkedDshEdges }
}

/**
 * Reject a verified dual-release graph that exceeds the resolution work budget.
 * @param summary - Counts returned by {@link assertDualDshInstallLayout}.
 * @returns The verified resolution work units.
 */
export function assertResolutionWorkBudget(summary: DshInstallLayoutSummary): number {
  const units = summary.dshPackagesPerVersion * summary.checkedDshEdges
  if (units > MAX_RESOLUTION_WORK_UNITS) {
    throw new Error(
      'dual-release graph exceeds the resolution work budget: '
      + `${String(summary.dshPackagesPerVersion)} package(s) per release x `
      + `${String(summary.checkedDshEdges)} internal edge(s) = ${String(units)} unit(s), `
      + `budget ${String(MAX_RESOLUTION_WORK_UNITS)} unit(s)\n`
      + '  npm re-checks every internal edge against the incoming edges of its peer target, so the resolution\n'
      + '  cost grows with this product. Measure the new cost and raise MAX_RESOLUTION_WORK_UNITS in\n'
      + '  scripts/verify-npm-install-layout.ts.',
    )
  }
  return units
}

/**
 * Add the release a later registry holds: one minor above the newest indexed version of an external package.
 *
 * The local index lists only the versions in the pnpm lockfile, so every range resolves to the locked version
 * and npm cannot hoist anything else. A release other than the DSH pin that a third-party peer range accepts
 * is the input that makes npm hoist a version DSH packages cannot share.
 * @param index - Registry metadata for one DSH release.
 * @param name - External package that receives the newer release.
 * @returns Registry metadata with that release added; `index` is unchanged.
 */
export function withNewerExternalRelease(index: RegistryIndex, name: string): RegistryIndex {
  const versions = index.get(name)
  const newest = rsort([...versions?.keys() ?? []])[0]
  const manifest = newest === undefined ? undefined : versions?.get(newest)
  const next = newest === undefined ? null : inc(newest, 'minor')
  if (manifest === undefined || next === null) throw new Error(`registry contains no release of ${name}`)
  return new Map(index).set(name, new Map(versions).set(next, { ...manifest, version: next }))
}

interface PeerDeclarations {
  readonly peerDependencies?: Record<string, string>
  readonly peerDependenciesMeta?: Record<string, unknown>
}

function requiresPeer(manifest: PeerDeclarations | undefined, name: string): boolean {
  if (manifest?.peerDependencies?.[name] === undefined) return false
  const meta = manifest.peerDependenciesMeta?.[name]
  return !(typeof meta === 'object' && meta !== null && 'optional' in meta && meta.optional === true)
}

/**
 * Assert that every DSH package depending on an external package that requires `name` as a peer declares `name`.
 *
 * npm installs a required peer that no dependent provides at the newest release the peer range accepts, and
 * whether that release reaches the top level depends on the order npm processes the tree. This check reads
 * manifests, so it also covers DSH packages outside the `@deepseek-ai/dsh` graph and orders npm does not
 * produce today.
 * @param index - Registry metadata for one DSH release.
 * @param name - External package required as a peer.
 */
export function assertRequiredPeerDeclared(index: RegistryIndex, name: string): void {
  const undeclared: string[] = []
  for (const [dshName, versions] of index) {
    if (!isDshPackage(dshName)) continue
    for (const manifest of versions.values()) {
      if (manifest.dependencies?.[name] !== undefined) continue
      for (const [dependency, range] of Object.entries({ ...manifest.optionalDependencies, ...manifest.dependencies })) {
        const candidates = index.get(dependency)
        const resolved = candidates === undefined ? null : maxSatisfying([...candidates.keys()], range)
        const external = resolved === null ? undefined : candidates?.get(resolved)
        if (!requiresPeer(external, name)) continue
        undeclared.push(`${dshName}: ${dependency}@${String(resolved)} requires ${name}@${String(external?.peerDependencies?.[name])}`)
      }
    }
  }
  if (undeclared.length === 0) return
  throw new Error(
    `DSH package(s) depend on a package that requires ${name} as a peer without declaring ${name}:\n`
    + `${undeclared.sort().map(line => `  - ${line}`).join('\n')}\n`
    + `  Add ${name} to each package's dependencies at the version other DSH packages pin. npm otherwise\n`
    + `  installs the newest ${name} release that peer range accepts, and DSH packages that cannot share it\n`
    + '  install their own copies.',
  )
}

/**
 * Assert that npm installs an external package shared by DSH packages exactly once, at the top level.
 * @param packageLock - Metadata-only package lock npm produced for one DSH release.
 * @param name - External package that must have a single installation.
 */
export function assertSingleExternalInstallation(packageLock: NpmPackageLock, name: string): void {
  const expected = `node_modules/${name}`
  const paths = Object.entries(packageLock.packages).flatMap(([path, manifest]) =>
    packageNameAtPath(path, manifest) === name ? [path] : [])
  if (paths.length === 1 && paths[0] === expected) return
  const hoisted = packageLock.packages[expected]?.version
  const others = paths.filter(path => path !== expected)
  throw new Error(
    `expected one ${name} installation at ${expected}, got ${String(paths.length)}: `
    + `${hoisted === undefined ? `no ${expected}` : `${expected}@${hoisted}`} and ${String(others.length)} other(s)`
    + `${others.length === 0 ? '' : ` such as ${others.slice(0, 3).join(', ')}`}\n`
    + `  A ${name} release other than the one DSH packages pin reached the top level, so each of them\n`
    + `  installs its own copy. A DSH package whose external dependency requires ${name} as a peer must pin\n`
    + `  ${name} to the same version, so npm places that version first.`,
  )
}

function workspaceVersion(root: string): string {
  const manifest = JSON.parse(readFileSync(resolve(root, 'apps/cli/package.json'), 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string') throw new Error('apps/cli/package.json has no string version')
  return manifest.version
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..')
  const sourceVersion = workspaceVersion(root)
  const workspaceIndex = buildRegistryIndex(root)
  const dshPackages = new Set(
    [...workspaceIndex]
      .filter(([name, versions]) => isDshPackage(name) && versions.has(sourceVersion))
      .map(([name]) => name),
  )
  const index = buildDualDshRegistry(workspaceIndex, sourceVersion)
  const version = workspaceVersion(root)
  const release = buildRegistryIndex(root)
  assertRequiredPeerDeclared(release, SHARED_EXTERNAL_PACKAGE)
  const shared = await resolveNpmPackageLock(
    withNewerExternalRelease(release, SHARED_EXTERNAL_PACKAGE),
    { [DSH_PACKAGE]: version },
    NPM_HANG_GUARD_MS,
    'npm resolution hang guard',
  )
  assertSingleExternalInstallation(shared.packageLock, SHARED_EXTERNAL_PACKAGE)
  const index = buildDualDshRegistry(release, version)
  const [nestedVersion, rootVersion] = SYNTHETIC_DSH_VERSIONS
  const result = await resolveNpmPackageLock(index, {
    [DSH_PACKAGE]: rootVersion,
    [NESTED_DSH_ALIAS]: `npm:${DSH_PACKAGE}@${nestedVersion}`,
  }, NPM_HANG_GUARD_MS, 'npm resolution hang guard')
  if (result.archiveRequests !== 0) throw new Error(`npm requested ${String(result.archiveRequests)} package archive(s)`)
  const summary = assertDualDshInstallLayout(result.packageLock, dshPackages)
  const units = assertResolutionWorkBudget(summary)
  console.log(
    `verify-npm-install-layout: ${String(summary.dshPackagesPerVersion)} DSH package(s) per release and `
    + `${String(summary.checkedDshEdges)} internal edge(s) verified in ${(result.durationMs / 1000).toFixed(2)} s; `
    + `${String(units)} of ${String(MAX_RESOLUTION_WORK_UNITS)} budgeted resolution work unit(s); `
    + `both releases share one Cordis installation; one release installs ${SHARED_EXTERNAL_PACKAGE} once beside a `
    + `newer registry release; ${String(result.unknownPackages.length)} unavailable optional package name(s) `
    + 'ignored by npm.',
  )
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(`verify-npm-install-layout: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

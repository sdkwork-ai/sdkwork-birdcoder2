/** SDKWork source-pin validation shared by local, CI, and release checks. */
import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync, readdirSync, type Dirent } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const FORBIDDEN_PARENT = 'birdcoder-' + 'pinned-parent'
const SOURCE_MANIFEST = 'scripts/sdkwork-sources.manifest.json'
const WORKFLOW_CONFIG = 'sdkwork.workflow.json'

/** One immutable SDKWork repository input. */
export interface SdkworkRepository {
  name: string
  url: string
  commit: string
}

interface SourceManifest {
  version: number
  /** Siblings materialized as pnpm workspace members and Docker build inputs. */
  repositories: SdkworkRepository[]
  /** Siblings the Cargo workspace resolves through `../sdkwork-*` path deps. */
  rustRepositories: SdkworkRepository[]
}

/** One `sdkwork.workflow.json` release dependency, the SDKWork release authority. */
interface WorkflowDependency {
  id: string
  repository: string
  ref: string
  refInput: string
  tokenSecret: string
}

/** SDKWork validation mode. */
export interface VerifySdkworkOptions {
  online?: boolean
}

/**
 * Validate SDKWork workspace provenance.
 * @param root - repository root containing the pin manifest and workspace files.
 * @param options - enable checkout verification for CI and release builds.
 * @returns diagnostics; an empty array means the dependency inputs are valid.
 */
export function verifySdkworkDependencies(
  root: string,
  options: VerifySdkworkOptions = {},
): string[] {
  const errors: string[] = []
  const manifest = loadSourceManifest(root, errors)
  if (manifest === undefined) return errors

  const repositories = new Map<string, SdkworkRepository>()
  for (const repository of [...manifest.repositories, ...manifest.rustRepositories]) {
    validateRepository(repository, repositories, errors)
    repositories.set(repository.name, repository)
  }

  const workspaceSource = readRequired(root, 'pnpm-workspace.yaml', errors)
  const workspaceRepositories = new Set<string>()
  if (workspaceSource !== undefined) {
    for (const member of externalWorkspaceMembers(workspaceSource)) {
      const repositoryName = member.slice(3).split('/')[0]
      if (repositoryName === undefined || !/^sdkwork-[a-z0-9-]+$/.test(repositoryName)) {
        errors.push(`pnpm-workspace.yaml: external member ${JSON.stringify(member)} must be under ../sdkwork-*`)
        continue
      }
      workspaceRepositories.add(repositoryName)
      if (!repositories.has(repositoryName)) {
        errors.push(`pnpm-workspace.yaml: ${repositoryName} has no entry in ${SOURCE_MANIFEST}`)
      }
    }
  }
  // The pnpm group carries the Docker-copy and lockfile coupling, so it must
  // stay exactly equal to the workspace members; the rust group adds the
  // Cargo-only siblings on top.
  const pnpmPinned = new Set(manifest.repositories.map(repository => repository.name))
  const rustPinned = new Set(manifest.rustRepositories.map(repository => repository.name))
  for (const repository of repositories.values()) {
    if (!workspaceRepositories.has(repository.name) && !rustPinned.has(repository.name)) {
      errors.push(`${SOURCE_MANIFEST}: ${repository.name} has no pnpm workspace member`)
    }
  }

  checkForbiddenMachinePaths(root, errors)
  checkDependencyOnlyWorkspaces(root, errors)
  checkActionUsesManifest(root, errors)
  checkWorkflowCheckouts(root, errors)
  checkDockerRepositories(root, pnpmPinned, errors)
  checkLockfileRepositories(root, pnpmPinned, errors)
  checkClientBundleSdkworkExternals(root, errors)
  checkSdkworkImportCoverage(root, errors)
  checkDependencyAlignment(root, repositories, workspaceRepositories, pnpmPinned, rustPinned, errors)

  if (options.online === true) {
    checkOnlineRepositories(root, repositories, errors)
  }
  return errors
}

function loadSourceManifest(root: string, errors: string[]): SourceManifest | undefined {
  const source = readRequired(root, SOURCE_MANIFEST, errors)
  if (source === undefined) return undefined
  let value: unknown
  try {
    value = JSON.parse(source) as unknown
  } catch (error) {
    errors.push(`${SOURCE_MANIFEST}: invalid JSON: ${String(error)}`)
    return undefined
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.repositories)) {
    errors.push(`${SOURCE_MANIFEST}: expected version 1 and a repositories array`)
    return undefined
  }
  const rustEntries: readonly unknown[] = Array.isArray(value.rustRepositories) ? value.rustRepositories : []
  const readGroup = (group: string, entries: readonly unknown[]): SdkworkRepository[] => {
    const repositories: SdkworkRepository[] = []
    for (const [index, repository] of entries.entries()) {
      if (!isRecord(repository)
        || typeof repository.name !== 'string'
        || typeof repository.url !== 'string'
        || typeof repository.commit !== 'string') {
        errors.push(`${SOURCE_MANIFEST}: ${group}[${index}] must contain string name, url, and commit fields`)
        continue
      }
      repositories.push({
        name: repository.name,
        url: repository.url,
        commit: repository.commit,
      })
    }
    return repositories
  }
  return {
    version: 1,
    repositories: readGroup('repositories', value.repositories),
    rustRepositories: readGroup('rustRepositories', rustEntries),
  }
}

function validateRepository(
  repository: SdkworkRepository,
  repositories: ReadonlyMap<string, SdkworkRepository>,
  errors: string[],
): void {
  if (!/^sdkwork-[a-z0-9-]+$/.test(repository.name)) {
    errors.push(`${SOURCE_MANIFEST}: invalid repository name ${JSON.stringify(repository.name)}`)
  }
  const expectedUrl = `https://github.com/sdkwork-ai/${repository.name}.git`
  if (repository.url !== expectedUrl) {
    errors.push(`${SOURCE_MANIFEST}: ${repository.name} URL must be ${expectedUrl}`)
  }
  if (!/^[0-9a-f]{40}$/.test(repository.commit)) {
    errors.push(`${SOURCE_MANIFEST}: ${repository.name} commit must be a full 40-character lowercase SHA`)
  }
  if (repositories.has(repository.name)) {
    errors.push(`${SOURCE_MANIFEST}: duplicate repository ${repository.name}`)
  }
}

function externalWorkspaceMembers(source: string): string[] {
  const members: string[] = []
  for (const line of source.split(/\r?\n/u)) {
    const match = /^\s*-\s*["'](\.\.\/[^"']+)["']\s*$/u.exec(line)
    if (match?.[1] !== undefined) members.push(match[1])
  }
  return members
}

function checkForbiddenMachinePaths(root: string, errors: string[]): void {
  const files = globSync([
    'package.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'tsconfig*.json',
    'Dockerfile*',
    '.github/**/*.{yml,yaml,json}',
    'packages/client/*/package.json',
    'packages/client/*/tsconfig*.json',
    'packages/client/*/tsdown.config.ts',
  ], { cwd: root }).sort()
  for (const file of files) {
    if (!readFileSync(resolve(root, file), 'utf8').includes(FORBIDDEN_PARENT)) continue
    errors.push(`${file}: references forbidden external parent ${FORBIDDEN_PARENT}`)
  }
}

function checkDependencyOnlyWorkspaces(root: string, errors: string[]): void {
  // The Client test aggregate (tsconfig.client.tests.json) is the program that
  // would compile SDKWork sources under strict client flags; the build
  // solution tsconfig.client.json includes no files at all.
  const clientPath = 'tsconfig.client.tests.json'
  const clientSource = readRequired(root, clientPath, errors)
  for (const path of [
    'packages/client/ui-sdkwork-knowledge/tests/**',
    'packages/client/ui-sdkwork-drive/tests/**',
    'packages/client/ui-sdkwork-course/tests/**',
  ]) {
    if (clientSource !== undefined && !clientSource.includes(`"${path}"`)) {
      errors.push(`${clientPath}: must exclude ${path} because tsconfig.tests.json owns its SDKWork source checks`)
    }
  }
}

function checkActionUsesManifest(root: string, errors: string[]): void {
  const path = '.github/actions/setup-sdkwork-siblings/action.yml'
  const source = readRequired(root, path, errors)
  if (source === undefined) return
  if (!source.includes('sdkwork-sources.manifest.json')) {
    errors.push(`${path}: must read repositories from ${SOURCE_MANIFEST}`)
  }
  if (/clone\s+sdkwork-[a-z0-9-]+\s+[0-9a-f]{40}\b/u.test(source)) {
    errors.push(`${path}: repository pins must not be duplicated outside ${SOURCE_MANIFEST}`)
  }
  for (const [required, message] of [
    ['https://github.com/sdkwork-ai/${repository.name}.git', 'must validate every Git URL before authentication'],
    ['http.https://github.com/.extraheader', 'must scope temporary credentials to GitHub'],
    ['::add-mask::', 'must mask the derived authorization value'],
    ['status --porcelain --ignored', 'must reject tracked, untracked, and ignored checkout changes'],
  ] as const) {
    if (!source.includes(required)) errors.push(`${path}: ${message}`)
  }
  if (source.includes('http.extraheader=') || source.includes(' < <(')) {
    errors.push(`${path}: authentication and manifest parsing must fail closed`)
  }
}

function checkWorkflowCheckouts(root: string, errors: string[]): void {
  for (const nativePath of globSync([
    '.github/workflows/*.yml',
    '.github/workflows/*.yaml',
  ], { cwd: root }).sort()) {
    const path = nativePath.replaceAll('\\', '/')
    const source = readFileSync(resolve(root, nativePath), 'utf8')
    const lines = source.split(/\r?\n/u)
    for (const [index, line] of lines.entries()) {
      if (!/^\s*SDKWORK_GITHUB_TOKEN:\s*\$\{\{\s*secrets\.SDKWORK_GITHUB_TOKEN\s*\}\}\s*$/u.test(line)) continue
      // A reusable workflow receives no secrets unless the caller names them,
      // so a caller must pass this one under `secrets:`; that is the only way
      // the callee's checkout action can read it. What the rule forbids is a
      // workflow- or job-level `env:` block, which broadcasts the token to
      // every step in the job instead of scoping it to the action input.
      if (owningMappingKey(lines, index) === 'env') {
        errors.push(`${path}: SDKWork token must be scoped to the checkout action input`)
      }
    }
    if (!source.includes('setup-sdkwork-siblings')) continue
    if (/if:\s*\$\{\{\s*env\.SDKWORK_GITHUB_TOKEN\s*!=\s*''\s*\}\}/u.test(source)) {
      errors.push(`${path}: SDKWork checkout must fail when its token is missing, not skip`)
    }
  }
}

/**
 * The mapping key that owns a line inside a YAML block mapping, found by
 * indentation: the nearest preceding line that opens a block at a shallower
 * indent. Lets a text-level rule distinguish `env:` from `secrets:` without a
 * YAML parser or a greedy pattern that would swallow later sections.
 */
function owningMappingKey(lines: readonly string[], index: number): string | undefined {
  const indent = /^\s*/u.exec(lines[index] ?? '')?.[0].length ?? 0
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = lines[cursor] ?? ''
    if (/^\s*(#.*)?$/u.test(line)) continue
    const match = /^(\s*)([A-Za-z0-9_.-]+):/u.exec(line)
    if (match === null) continue
    const ownerIndent = match[1]?.length ?? 0
    if (ownerIndent < indent) return match[2]
  }
  return undefined
}

function checkDockerRepositories(
  root: string,
  pnpmRepositories: ReadonlySet<string>,
  errors: string[],
): void {
  for (const path of ['Dockerfile', 'Dockerfile.debug']) {
    const source = readRequired(root, path, errors)
    if (source === undefined) continue
    const copied = new Set(
      [...source.matchAll(/^COPY --from=sdkwork-ecosystem (sdkwork-[a-z0-9-]+) \/sdkwork-[a-z0-9-]+$/gmu)]
        .map(match => match[1])
        .filter((name): name is string => name !== undefined),
    )
    for (const name of pnpmRepositories) {
      if (!copied.has(name)) errors.push(`${path}: missing sdkwork-ecosystem copy for ${name}`)
    }
    for (const name of copied) {
      if (!pnpmRepositories.has(name)) errors.push(`${path}: ${name} is not pinned in ${SOURCE_MANIFEST}`)
    }
  }
}

function checkLockfileRepositories(
  root: string,
  pnpmRepositories: ReadonlySet<string>,
  errors: string[],
): void {
  const source = readRequired(root, 'pnpm-lock.yaml', errors)
  if (source === undefined) return
  for (const name of pnpmRepositories) {
    // Subpath members appear as `../<name>/<path>`; a sibling consumed at its
    // repository root appears as `../<name>` at the end of a link value or as
    // an importer key. The lookahead keeps `../sdkwork-app` from matching for
    // `../sdkwork-appbase`.
    const referenced = source.includes(`../${name}/`)
      || new RegExp(`\\.\\./${name}(?![a-z0-9-])`, 'u').test(source)
    if (!referenced) {
      errors.push(`pnpm-lock.yaml: no importer or link references ../${name}`)
    }
  }
}

/** SDKWork release dependency token secret, fixed by DEPENDENCY_MANAGEMENT_SPEC.md section 4. */
const RELEASE_TOKEN_SECRET = 'SDKWORK_RELEASE_TOKEN'

/**
 * Sibling repositories resolved through `../sdkwork-*` Cargo path dependencies.
 *
 * Two scopes share this scan. Called with no extra owners it reads only this
 * repository's own manifests and answers "which siblings must be pinned" — the
 * completeness direction, where a sibling's own `[workspace.dependencies]`
 * table would over-report because it also declares entries no member crate
 * consumes. Called with the pinned rust siblings it additionally reads their
 * root path tables, which answers "is this pin reachable at all" — a superset,
 * so it only rejects pins unrelated to any Cargo path in the workspace.
 *
 * The exact transitive closure needs `cargo metadata`; use
 * `sdkwork-specs/tools/check-dependency-list-completeness.mjs` for that. This
 * scan stays offline and deterministic because it runs as the first step of
 * `pnpm build`.
 */
function cargoSiblingNames(root: string, siblingManifestOwners: Iterable<string> = []): Set<string> {
  const names = new Set<string>()
  const manifests = ['Cargo.toml']
  const cratesDir = resolve(root, 'crates')
  if (existsSync(cratesDir)) {
    for (const entry of readdirSync(cratesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(join('crates', entry.name, 'Cargo.toml'))
    }
  }
  for (const owner of siblingManifestOwners) manifests.push(join('..', owner, 'Cargo.toml'))
  for (const relative of manifests) {
    const absolute = resolve(root, relative)
    if (!existsSync(absolute)) continue
    for (const match of readFileSync(absolute, 'utf8').matchAll(/path\s*=\s*"\.\.\/(sdkwork-[a-z0-9-]+)/gu)) {
      const name = match[1]
      if (name === undefined) continue
      // `../sdkwork-*` from a member crate can resolve inside this repository's
      // own crates/ directory; that is not an external sibling.
      if (existsSync(resolve(root, 'crates', name))) continue
      names.add(name)
    }
  }
  return names
}

/**
 * Cross-authority alignment for SDKWork dependencies. Three files describe the
 * same closure and must agree or the CI checkout layout silently diverges from
 * the local workspace layout: the native build-tool workspace resolves
 * `../sdkwork-*` paths, the source manifest pins what the checkout action
 * materializes, and `sdkwork.workflow.json` is the release dependency
 * authority (DEPENDENCY_MANAGEMENT_SPEC.md sections 4 to 6,
 * GITHUB_WORKFLOW_SPEC.md section 6).
 */
function checkDependencyAlignment(
  root: string,
  pinned: ReadonlyMap<string, SdkworkRepository>,
  pnpmSiblings: ReadonlySet<string>,
  pnpmPinned: ReadonlySet<string>,
  rustPinned: ReadonlySet<string>,
  errors: string[],
): void {
  const source = readRequired(root, WORKFLOW_CONFIG, errors)
  if (source === undefined) return
  let value: unknown
  try {
    value = JSON.parse(source) as unknown
  } catch (error) {
    errors.push(`${WORKFLOW_CONFIG}: invalid JSON: ${String(error)}`)
    return
  }
  if (!isRecord(value) || !Array.isArray(value.dependencies)) {
    errors.push(`${WORKFLOW_CONFIG}: expected an object with a dependencies array`)
    return
  }

  const declared = new Map<string, WorkflowDependency>()
  for (const [index, entry] of value.dependencies.entries()) {
    if (!isRecord(entry)
      || typeof entry.id !== 'string'
      || typeof entry.repository !== 'string'
      || typeof entry.ref !== 'string'
      || typeof entry.refInput !== 'string'
      || typeof entry.tokenSecret !== 'string') {
      errors.push(`${WORKFLOW_CONFIG}: dependencies[${index}] must declare string id, repository, ref, refInput, and tokenSecret fields`)
      continue
    }
    const dependency: WorkflowDependency = {
      id: entry.id,
      repository: entry.repository,
      ref: entry.ref,
      refInput: entry.refInput,
      tokenSecret: entry.tokenSecret,
    }
    if (!/^sdkwork-[a-z0-9-]+$/u.test(dependency.id)) {
      errors.push(`${WORKFLOW_CONFIG}: dependencies[${index}] id ${JSON.stringify(dependency.id)} must name a sdkwork-<lowercase-kebab> repository`)
      continue
    }
    if (declared.has(dependency.id)) {
      errors.push(`${WORKFLOW_CONFIG}: duplicate dependency ${dependency.id}`)
      continue
    }
    declared.set(dependency.id, dependency)

    if (dependency.repository !== `sdkwork-ai/${dependency.id}`) {
      errors.push(`${WORKFLOW_CONFIG}: ${dependency.id} repository must be sdkwork-ai/${dependency.id}`)
    }
    if (dependency.tokenSecret !== RELEASE_TOKEN_SECRET) {
      errors.push(`${WORKFLOW_CONFIG}: ${dependency.id} tokenSecret must be ${RELEASE_TOKEN_SECRET}`)
    }
    if (!/^[A-Z][A-Z0-9_]*$/u.test(dependency.refInput)) {
      errors.push(`${WORKFLOW_CONFIG}: ${dependency.id} refInput must be an uppercase environment variable name`)
    }
    const pin = pinned.get(dependency.id)
    if (pin === undefined) {
      errors.push(
        `${WORKFLOW_CONFIG}: ${dependency.id} is a release dependency but is not pinned in ${SOURCE_MANIFEST}`
        + ' — the checkout action would leave ../' + dependency.id + ' missing on the runner',
      )
    } else if (!/^[0-9a-f]{40}$/u.test(dependency.ref)) {
      errors.push(`${WORKFLOW_CONFIG}: ${dependency.id} ref must be a full 40-character lowercase SHA`)
    } else if (dependency.ref !== pin.commit) {
      errors.push(`${WORKFLOW_CONFIG}: ${dependency.id} ref ${dependency.ref} must equal the ${SOURCE_MANIFEST} pin ${pin.commit}`)
    }
  }

  const cargo = cargoSiblingNames(root)
  const reachable = cargoSiblingNames(root, rustPinned)
  const referenced = new Set([...pnpmSiblings, ...cargo])
  for (const id of [...referenced].sort()) {
    if (!declared.has(id)) {
      errors.push(
        `${WORKFLOW_CONFIG}: ${id} is referenced by the native workspace but has no dependencies[] entry`
        + ' — CI and release checkouts would not materialize the ../' + id + ' layout local development resolves',
      )
    }
  }
  for (const id of [...pinned.keys()].sort()) {
    if (!declared.has(id)) {
      errors.push(`${WORKFLOW_CONFIG}: ${id} is pinned in ${SOURCE_MANIFEST} but missing from dependencies[]`)
    }
  }
  for (const id of [...pnpmPinned].sort()) {
    if (!pnpmSiblings.has(id)) {
      errors.push(`${SOURCE_MANIFEST}: ${id} is a repositories[] entry but no pnpm workspace member references it`)
    }
  }
  // The rust group must cover every Cargo path dependency the pnpm group does
  // not already materialize, so a new `../sdkwork-*` Cargo path cannot land
  // without a pin, and every rust pin must be reachable from a Cargo path table
  // so a pin cannot outlive the path that justified it.
  for (const id of [...cargo].sort()) {
    if (!pnpmPinned.has(id) && !rustPinned.has(id)) {
      errors.push(`${SOURCE_MANIFEST}: ${id} is a Cargo path dependency but is pinned in neither repositories[] nor rustRepositories[]`)
    }
  }
  for (const id of [...rustPinned].sort()) {
    if (pnpmPinned.has(id)) {
      errors.push(`${SOURCE_MANIFEST}: ${id} is pinned in both repositories[] and rustRepositories[]`)
    } else if (!reachable.has(id)) {
      errors.push(`${SOURCE_MANIFEST}: ${id} is pinned in rustRepositories[] but no Cargo path in the workspace resolves ../${id}`)
    }
  }
}

/** SDKWork client bundles must inline sibling packages; loader externals throw at boot. */
function checkClientBundleSdkworkExternals(root: string, errors: string[]): void {
  for (const relative of globSync('packages/client/ui-*/lib/client.js', { cwd: root }).sort()) {
    const path = relative.replaceAll('\\', '/')
    const source = readFileSync(resolve(root, relative), 'utf8')
    for (const match of source.matchAll(/require\(["']@sdkwork\/[^"']+["']\)/gu)) {
      errors.push(
        `${path}: client bundle leaves ${match[0]} external — map the package to sibling source in tsconfig.bundle.json so tsdown inlines it`,
      )
    }
  }
}

/** Every `@sdkwork/*` specifier a sibling source file imports. */
function sdkworkSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*["'](@sdkwork\/[^"']+)["']/gu)]
    .map(match => match[1])
    .filter((specifier): specifier is string => specifier !== undefined)
    .filter((specifier, index, all) => all.indexOf(specifier) === index)
}

/**
 * Every `@sdkwork/*` specifier imported by the dependency closure must have a
 * `tsconfig.base.json` path entry for its package root, exact or wildcard.
 * The closure is the sources the client bundles compile: local files, the
 * sibling workspace members joined in pnpm-workspace.yaml, and — iterated to
 * a fixpoint — every package a mapping resolves into. tsconfig.base.json
 * aliases package roots only; subpath specifiers resolve through each
 * package's `exports` map (see the "alias sdkwork package roots only" release
 * fix). A missing package-root mapping is a build-time externals drift that
 * only surfaces at runtime, so this gate turns it into a build error. Repos
 * pinned in the manifest but never reached through the closure (app shells
 * such as sdkwork-cloudrouter) are not scanned — their imports are not this
 * repo's dependency.
 */
function checkSdkworkImportCoverage(root: string, errors: string[]): void {
  const basePath = resolve(root, 'tsconfig.base.json')
  if (!existsSync(basePath)) return
  const baseConfig = JSON.parse(readFileSync(basePath, 'utf8')
    .split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')) as {
    compilerOptions?: { paths?: Record<string, readonly string[]> }
  }
  const paths = new Map(
    Object.entries(baseConfig.compilerOptions?.paths ?? {})
      .filter(([specifier]) => specifier.startsWith('@sdkwork/')),
  )
  const wildcard = [...paths.keys()].filter(path => path.endsWith('/*'))
  const packageRootOf = (specifier: string): string =>
    specifier.startsWith('@sdkwork/') ? specifier.split('/').slice(0, 2).join('/') : specifier
  const coveringKey = (specifier: string): string | undefined => {
    if (paths.has(specifier)) return specifier
    const prefix = wildcard.find(path => specifier.startsWith(path.slice(0, -1)))
    if (prefix !== undefined) return prefix
    const root = packageRootOf(specifier)
    return paths.has(root) ? root : undefined
  }

  const used = new Set<string>()
  const covering = new Set<string>()
  const uncovered: string[] = []
  const scannedRoots = new Set<string>()
  const isTestFile = (path: string): boolean => /[._](spec|test)\.(ts|tsx|mjs|cjs|js)$/u.test(path)
  const scanSpecifiers = (specifiers: readonly string[]): void => {
    for (const specifier of specifiers) {
      if (used.has(specifier)) continue
      used.add(specifier)
      const key = coveringKey(specifier)
      if (key === undefined) {
        uncovered.push(specifier)
        continue
      }
      covering.add(key)
      const root = sourceRoot(paths.get(key)?.[0] ?? '')
      if (root === undefined || scannedRoots.has(root)) continue
      scannedRoots.add(root)
      for (const relative of globSync('**/*.{ts,tsx}', { cwd: root }).sort()) {
        if (isTestFile(relative)) continue
        scanSpecifiers(sdkworkSpecifiers(readFileSync(join(root, relative), 'utf8')))
      }
    }
  }

  for (const pattern of [
    'packages/**/*.{ts,tsx,mjs,cjs,js}',
    'apps/**/*.{ts,tsx,mjs,cjs,js}',
    'scripts/**/*.{ts,tsx,mjs,cjs,js}',
    'examples/**/*.{ts,tsx,mjs,cjs,js}',
    'website/**/*.{ts,tsx,mjs,cjs,js}',
    'native/**/*.{ts,tsx,mjs,cjs,js}',
    '*.{ts,tsx,mjs,cjs,js}',
  ]) {
    for (const relative of globSync(pattern, { cwd: root }).sort()) {
      const normalized = relative.replaceAll('\\', '/')
      if (normalized.includes('/node_modules/') || normalized.includes('/lib/') || normalized.includes('/dist/')) continue
      if (isTestFile(normalized)) continue
      scanSpecifiers(sdkworkSpecifiers(readFileSync(join(root, relative), 'utf8')))
    }
  }
  for (const member of workspaceMemberDirs(root)) {
    for (const relative of globSync('src/**/*.{ts,tsx}', { cwd: member }).sort()) {
      if (isTestFile(relative)) continue
      scanSpecifiers(sdkworkSpecifiers(readFileSync(join(member, relative), 'utf8')))
    }
  }

  for (const specifier of [...new Set(uncovered)].sort()) {
    errors.push(
      `${specifier}: imported by the dependency closure but tsconfig.base.json maps no @sdkwork package root for it`
      + ' — add the mapping (or join the package as a workspace member) so client bundles inline sibling source on the release runner',
    )
  }
  checkSdkworkPathDeclarations(root, covering, errors)
}

/**
 * Reverse of the import-coverage gate: every declared `@sdkwork/*` path must
 * cover at least one specifier the dependency closure actually imports, and
 * keys must not repeat. Declarations feed the client-bundle alias table
 * (packages/client/tsdown.client.ts reads tsconfig.base.json), so a dead
 * entry is dead surface in every bundle and a duplicate silently resolves to
 * the last target.
 */
function checkSdkworkPathDeclarations(
  root: string,
  covering: ReadonlySet<string>,
  errors: string[],
): void {
  const basePath = resolve(root, 'tsconfig.base.json')
  if (!existsSync(basePath)) return
  const source = readFileSync(basePath, 'utf8')
  const seen = new Set<string>()
  for (const match of source.matchAll(/"(@sdkwork\/[^"]+)":\s*\[/gu)) {
    const key = match[1]
    if (key === undefined) continue
    if (seen.has(key)) errors.push(`tsconfig.base.json: duplicate @sdkwork path key ${key}`)
    seen.add(key)
  }
  for (const key of [...seen].sort()) {
    if (covering.has(key)) continue
    errors.push(
      `tsconfig.base.json: @sdkwork path ${key} covers no import in the dependency closure — remove it`
      + ' (regenerate with `node scripts/analyze-sdkwork-closure.mjs --rewrite`)',
    )
  }
}

/** Absolute dirs of the sibling workspace members, `packages/*` globs expanded. */
function workspaceMemberDirs(root: string): string[] {
  const workspacePath = resolve(root, 'pnpm-workspace.yaml')
  if (!existsSync(workspacePath)) return []
  const members: string[] = []
  for (const match of readFileSync(workspacePath, 'utf8').matchAll(/^\s*-\s*["'](\.\.\/[^"']+)["']\s*$/gmu)) {
    const member = match[1]
    if (member === undefined) continue
    const dir = resolve(root, member)
    if (member.endsWith('/*')) {
      let children: Dirent[] = []
      try {
        children = readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const child of children) {
        if (child.isDirectory() && existsSync(join(dir, child.name, 'package.json'))) {
          members.push(join(dir, child.name))
        }
      }
      continue
    }
    if (existsSync(join(dir, 'package.json'))) members.push(dir)
  }
  return members
}

/** The package `src` tree a tsconfig target resolves into. */
function sourceRoot(target: string): string | undefined {
  const match = /(^|\/)src(\/|$)/u.exec(target)
  if (match === null) return undefined
  const prefixLength = match[1]?.length ?? 0
  return target.slice(0, match.index + prefixLength + 3)
}

function checkOnlineRepositories(
  root: string,
  repositories: ReadonlyMap<string, SdkworkRepository>,
  errors: string[],
): void {
  const parent = dirname(root)
  for (const repository of repositories.values()) {
    const directory = resolve(parent, repository.name)
    if (!existsSync(directory)) {
      errors.push(`${repository.name}: pinned checkout is missing at ${directory}`)
      continue
    }
    const head = git(directory, ['rev-parse', 'HEAD'], errors, repository.name)
    if (head !== undefined && head !== repository.commit) {
      errors.push(`${repository.name}: HEAD ${head} does not match pinned commit ${repository.commit}`)
    }
    const remote = git(directory, ['remote', 'get-url', 'origin'], errors, repository.name)
    if (remote !== undefined && normalizeGitUrl(remote) !== normalizeGitUrl(repository.url)) {
      errors.push(`${repository.name}: origin ${remote} does not match ${repository.url}`)
    }
    const status = git(directory, ['status', '--porcelain', '--ignored'], errors, repository.name)
    if (status !== undefined && status !== '') {
      errors.push(`${repository.name}: pinned checkout has uncommitted, untracked, or ignored files`)
    }
  }
}

function git(directory: string, args: string[], errors: string[], label: string): string | undefined {
  try {
    return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim()
  } catch (error) {
    errors.push(`${label}: git ${args.join(' ')} failed: ${String(error)}`)
    return undefined
  }
}

function normalizeGitUrl(url: string): string {
  return url
    .trim()
    .replace(/^git@github\.com:/u, 'https://github.com/')
    .replace(/\/$/u, '')
    .replace(/\.git$/u, '')
}

function readRequired(root: string, path: string, errors: string[]): string | undefined {
  const absolute = resolve(root, path)
  if (!existsSync(absolute)) {
    errors.push(`${path}: required file is missing`)
    return undefined
  }
  return readFileSync(absolute, 'utf8')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

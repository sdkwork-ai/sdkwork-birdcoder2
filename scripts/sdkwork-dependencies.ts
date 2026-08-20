/** SDKWork source-pin validation shared by local, CI, and release checks. */
import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const FORBIDDEN_PARENT = 'birdcoder-' + 'pinned-parent'
const SOURCE_MANIFEST = 'scripts/sdkwork-sources.manifest.json'

/** One immutable SDKWork repository input. */
export interface SdkworkRepository {
  name: string
  url: string
  commit: string
}

interface SourceManifest {
  version: number
  repositories: SdkworkRepository[]
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
  for (const repository of manifest.repositories) {
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

  for (const repository of repositories.values()) {
    if (!workspaceRepositories.has(repository.name)) {
      errors.push(`${SOURCE_MANIFEST}: ${repository.name} has no pnpm workspace member`)
    }
  }

  checkForbiddenMachinePaths(root, errors)
  checkDependencyOnlyWorkspaces(root, errors)
  checkActionUsesManifest(root, errors)
  checkWorkflowCheckouts(root, errors)
  checkDockerRepositories(root, repositories, errors)
  checkLockfileRepositories(root, repositories, errors)
  checkClientBundleSdkworkExternals(root, errors)

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
  const repositories: SdkworkRepository[] = []
  for (const [index, repository] of value.repositories.entries()) {
    if (!isRecord(repository)
      || typeof repository.name !== 'string'
      || typeof repository.url !== 'string'
      || typeof repository.commit !== 'string') {
      errors.push(`${SOURCE_MANIFEST}: repositories[${index}] must contain string name, url, and commit fields`)
      continue
    }
    repositories.push({
      name: repository.name,
      url: repository.url,
      commit: repository.commit,
    })
  }
  return { version: 1, repositories }
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
  const clientPath = 'tsconfig.client.json'
  const clientSource = readRequired(root, clientPath, errors)
  for (const path of [
    'packages/client/ui-knowledge/tests/**',
    'packages/client/ui-drive/tests/**',
    'packages/client/ui-course/tests/**',
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
    if (/^\s*SDKWORK_GITHUB_TOKEN:\s*\$\{\{\s*secrets\.SDKWORK_GITHUB_TOKEN\s*\}\}/mu.test(source)) {
      errors.push(`${path}: SDKWork token must be scoped to the checkout action input`)
    }
    if (!source.includes('setup-sdkwork-siblings')) continue
    if (/if:\s*\$\{\{\s*env\.SDKWORK_GITHUB_TOKEN\s*!=\s*''\s*\}\}/u.test(source)) {
      errors.push(`${path}: SDKWork checkout must fail when its token is missing, not skip`)
    }
  }
}

function checkDockerRepositories(
  root: string,
  repositories: ReadonlyMap<string, SdkworkRepository>,
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
    for (const name of repositories.keys()) {
      if (!copied.has(name)) errors.push(`${path}: missing sdkwork-ecosystem copy for ${name}`)
    }
    for (const name of copied) {
      if (!repositories.has(name)) errors.push(`${path}: ${name} is not pinned in ${SOURCE_MANIFEST}`)
    }
  }
}

function checkLockfileRepositories(
  root: string,
  repositories: ReadonlyMap<string, SdkworkRepository>,
  errors: string[],
): void {
  const source = readRequired(root, 'pnpm-lock.yaml', errors)
  if (source === undefined) return
  for (const repository of repositories.values()) {
    if (!source.includes(`../${repository.name}/`)) {
      errors.push(`pnpm-lock.yaml: no importer or link references ../${repository.name}/`)
    }
  }
}

/** SDKWork client bundles must inline sibling packages; loader externals throw at boot. */
function checkClientBundleSdkworkExternals(root: string, errors: string[]): void {
  for (const relative of globSync('packages/client/ui-*/lib/client.js', { cwd: root }).sort()) {
    const path = relative.replaceAll('\\', '/')
    const source = readFileSync(resolve(root, relative), 'utf8')
    for (const match of source.matchAll(/require\("@sdkwork\/[^"]+"\)/gu)) {
      errors.push(
        `${path}: client bundle leaves ${match[0]} external — map the package to sibling source in tsconfig.bundle.json so tsdown inlines it`,
      )
    }
  }
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

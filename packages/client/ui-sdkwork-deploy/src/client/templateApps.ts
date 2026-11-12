/**
 * Discover the independent applications under a project's `apps/` directory.
 *
 * SDKWork workspace standard (SDKWORK_WORKSPACE_SPEC): `apps/` is the
 * collection of application roots, `apps/README.md` is the directory index,
 * and every independent app root carries the governed
 * `agent.app.config.json` manifest (APP_MANIFEST_SPEC). A directory without
 * that manifest is not a publishable application — it is a shared package
 * family (`role: common`) or an incomplete scaffold — and the template flow
 * must say which, not silently list it.
 *
 * The walk is pure over a structural port, so tests feed an in-memory tree and
 * the dialog feeds the host workspace bridge. Directory listing is directory
 * only (the Host directory browser intentionally returns no files); file
 * existence is therefore probed by reading the exact manifest/package path
 * and treating a failed read as "absent".
 */
import { DEPLOY_APP_CONFIG_FILE, parseDeployLink } from './deployAppConfig.ts'
import { parseAppsIndex, type AppsIndexRow } from './appsIndex.ts'
import { projectAppCardId, readProjectAppState, type ProjectAppIdentity } from './projectApp.ts'
import { templatePlatformIdsForApp } from './templatePlatforms.ts'

/** One directory row as the workspace bridge serves it. */
export interface TemplateAppListing {
  readonly entries: readonly {
    readonly name: string
    readonly path: string
    readonly hidden: boolean
  }[]
}

/** Structural minimum the scan needs from the host workspace bridge. */
export interface TemplateAppScanPort {
  /** List one directory; undefined prunes the branch (unreadable or absent). */
  listDirectory(path: string): Promise<TemplateAppListing | undefined>
  /** Read one small text file; undefined when absent or unreadable. */
  readTextFile(path: string): Promise<string | undefined>
}

/** One publishable app root under `apps/`. */
export interface TemplateAppCandidate {
  /** Absolute app root directory. */
  readonly directory: string
  /** Final path segment (`sdkwork-<code>-h5`, …): the default template key. */
  readonly directoryName: string
  /** Governed `app.key`, falling back to the directory name. */
  readonly appKey: string
  /** Display name (`app.displayName` → `app.name` → directory name). */
  readonly name: string
  /** Product description (`app.description`). */
  readonly description?: string
  /** Icon URL (`app.iconUrl` or `media.icons.primary.url`). */
  readonly iconUrl?: string
  /** Console type card derived from the manifest. */
  readonly cardId?: string
  /** Package version from the app's `package.json`, when present. */
  readonly version?: string
  /** Template platform ids derived from `publish.platforms`. */
  readonly platforms: readonly string[]
  /** deploy_app id recorded by the manifest, when one is linked. */
  readonly linkedAppId?: string
  /** deploy_app_template id recorded by the manifest, when one is published. */
  readonly linkedTemplateId?: string
  /** Template key recorded beside {@link linkedTemplateId}. */
  readonly linkedTemplateKey?: string
  /** Semantic template version this app root last published. */
  readonly linkedTemplateVersion?: string
  /** Raw manifest text, passed to the publish flow's profile resolver. */
  readonly manifestRaw: string
  /** True when this candidate is the project root itself (no `apps/` dir). */
  readonly projectRoot: boolean
}

/** A directory the scan deliberately did not publish. */
export interface IgnoredTemplateDirectory {
  readonly directory: string
  readonly directoryName: string
  /** Why it is not an independent app root. */
  readonly reason: 'missing-manifest' | 'invalid-manifest' | 'shared-package'
}

/** One scan of a project's `apps/` directory. */
export interface TemplateAppScan {
  /** The project directory the scan started from. */
  readonly projectDirectory: string
  /** `<project>/apps`, whether or not it exists. */
  readonly appsDirectory: string
  /** The directory index was found and parsed. */
  readonly appsIndexFound: boolean
  /** Publishable app roots, sorted by display name. */
  readonly apps: readonly TemplateAppCandidate[]
  /** `apps/` children that are not publishable app roots. */
  readonly ignored: readonly IgnoredTemplateDirectory[]
  /** `apps/` was unavailable, so the project root itself was considered. */
  readonly fallbackToProjectRoot: boolean
}

/** Scan options (overridable limits for tests). */
export interface TemplateAppScanOptions {
  /** Maximum `apps/` children inspected (defaults to 200). */
  readonly maxDirectories?: number | undefined
}

/** Default ceiling on `apps/` children inspected in one scan. */
const MAX_APPS_DIRECTORIES = 200

/**
 * Read one project's `apps/` directory into publishable candidates.
 * @param port - directory listing plus text reads.
 * @param projectDirectory - the project root (a right-clicked workspace cwd).
 * @param options - scan limits.
 * @returns the app roots plus the ignored directories and index state.
 */
export async function scanTemplateApps(
  port: TemplateAppScanPort,
  projectDirectory: string,
  options: TemplateAppScanOptions = {},
): Promise<TemplateAppScan> {
  const project = trimSeparators(projectDirectory)
  const appsDirectory = joinChild(project, 'apps')
  const listing = await safeList(port, appsDirectory)
  if (listing === undefined) {
    const root = await readCandidate(port, project, basenameOf(project), true)
    return {
      projectDirectory: project,
      appsDirectory,
      appsIndexFound: false,
      apps: root === undefined ? [] : [root],
      ignored: root === undefined
        ? [{
          directory: project,
          directoryName: basenameOf(project),
          reason: 'missing-manifest',
        }]
        : [],
      fallbackToProjectRoot: true,
    }
  }
  const indexText = await safeRead(port, joinChild(appsDirectory, 'README.md'))
  const index = indexText === undefined ? undefined : parseAppsIndex(indexText)
  const maxDirectories = options.maxDirectories ?? MAX_APPS_DIRECTORIES
  const apps: TemplateAppCandidate[] = []
  const ignored: IgnoredTemplateDirectory[] = []
  let inspected = 0
  for (const entry of listing.entries) {
    if (entry.hidden) continue
    if (inspected >= maxDirectories) break
    inspected += 1
    const directory = joinChild(appsDirectory, entry.name)
    const row: AppsIndexRow | undefined = index?.get(entry.name)
    const raw = await safeRead(port, joinChild(directory, DEPLOY_APP_CONFIG_FILE))
    if (raw === undefined) {
      ignored.push({
        directory,
        directoryName: entry.name,
        reason: row?.role === 'common' ? 'shared-package' : 'missing-manifest',
      })
      continue
    }
    const state = readProjectAppState(raw, { directory })
    if (!state.hasManifest) {
      ignored.push({ directory, directoryName: entry.name, reason: 'invalid-manifest' })
      continue
    }
    // The directory index owns the repository's declaration of a shared
    // package family; a stray manifest in one must not make it publishable.
    if (row?.role === 'common') {
      ignored.push({ directory, directoryName: entry.name, reason: 'shared-package' })
      continue
    }
    const version = await readPackageVersion(port, directory)
    apps.push(candidateOf({
      directory,
      directoryName: entry.name,
      raw,
      state,
      projectRoot: false,
      packageVersion: version,
    }))
  }
  apps.sort((left, right) => left.name.localeCompare(right.name))
  return {
    projectDirectory: project,
    appsDirectory,
    appsIndexFound: index !== undefined,
    apps,
    ignored,
    fallbackToProjectRoot: false,
  }
}

/** Interpret one manifest into a candidate (identity + linkage + platforms). */
function candidateOf(input: {
  readonly directory: string
  readonly directoryName: string
  readonly raw: string
  readonly state: ReturnType<typeof readProjectAppState>
  readonly projectRoot: boolean
  readonly packageVersion?: string | undefined
}): TemplateAppCandidate {
  const identity: ProjectAppIdentity | undefined = input.state.identity
  const link = parseDeployLink(input.raw)
  const cardId = projectAppCardId(identity)
  const appKey = identity?.appKey ?? input.directoryName
  const name = identity?.displayName ?? identity?.appName ?? input.directoryName
  return {
    directory: input.directory,
    directoryName: input.directoryName,
    appKey,
    name,
    ...(identity?.description === undefined ? {} : { description: identity.description }),
    ...(identity?.iconUrl === undefined ? {} : { iconUrl: identity.iconUrl }),
    ...(cardId === undefined ? {} : { cardId }),
    ...(input.packageVersion === undefined ? {} : { version: input.packageVersion }),
    platforms: templatePlatformIdsForApp(identity?.platforms ?? [], cardId),
    ...(link?.appId === undefined ? {} : { linkedAppId: link.appId }),
    ...(link?.templateId === undefined ? {} : { linkedTemplateId: link.templateId }),
    ...(link?.templateKey === undefined ? {} : { linkedTemplateKey: link.templateKey }),
    ...(link?.templateVersion === undefined ? {} : { linkedTemplateVersion: link.templateVersion }),
    manifestRaw: input.raw,
    projectRoot: input.projectRoot,
  }
}

/** Read a single app candidate from one directory. */
async function readCandidate(
  port: TemplateAppScanPort,
  directory: string,
  directoryName: string,
  projectRoot: boolean,
): Promise<TemplateAppCandidate | undefined> {
  const raw = await safeRead(port, joinChild(directory, DEPLOY_APP_CONFIG_FILE))
  if (raw === undefined) return undefined
  const state = readProjectAppState(raw, { directory })
  if (!state.hasManifest) return undefined
  return candidateOf({
    directory,
    directoryName,
    raw,
    state,
    projectRoot,
    packageVersion: await readPackageVersion(port, directory),
  })
}

/** Read a `package.json` version without treating a malformed file as fatal. */
async function readPackageVersion(port: TemplateAppScanPort, directory: string): Promise<string | undefined> {
  const raw = await safeRead(port, joinChild(directory, 'package.json'))
  if (raw === undefined || raw.trim() === '') return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const version = (parsed as { version?: unknown }).version
    return typeof version === 'string' && version.trim() !== '' ? version.trim() : undefined
  } catch {
    return undefined
  }
}

/**
 * The directory-index role one installed app root declares.
 *
 * Architecture suffixes in the directory name are the repository's own
 * convention (`sdkwork-<code>-h5`, `-pc`, `-pad`, `-flutter-mobile`, …); the
 * console card is the fallback when the name carries no suffix.
 * @param directoryName - the `apps/` child name.
 * @param cardId - the console type card derived from the manifest.
 * @returns the surface role for the index row.
 */
export function appsIndexRoleForDirectory(directoryName: string, cardId?: string): string {
  const name = directoryName.toLowerCase()
  if (name.endsWith('-flutter-mobile')) return 'flutter-mobile'
  if (name.endsWith('-android-mobile')) return 'android'
  if (name.endsWith('-ios-mobile')) return 'ios'
  if (name.endsWith('-harmony-mobile')) return 'harmony'
  if (name.endsWith('-mini-program')) return 'mini-program'
  if (name.endsWith('-pad')) return 'pad'
  if (name.endsWith('-pc')) return 'pc'
  if (name.endsWith('-h5')) return 'h5'
  switch (cardId) {
    case 'h5': return 'h5'
    case 'pc-web': return 'pc'
    case 'pad': return 'pad'
    case 'desktop': return 'desktop'
    case 'mini-program': return 'mini-program'
    case 'android': return 'android'
    case 'ios': return 'ios'
    case 'harmonyos': return 'harmony'
    default: return 'app'
  }
}

/** ListDirectory that never throws: every failure prunes the branch. */
async function safeList(port: TemplateAppScanPort, path: string): Promise<TemplateAppListing | undefined> {
  try {
    return await port.listDirectory(path)
  } catch {
    return undefined
  }
}

/** ReadTextFile that never throws: every failure reads as "absent". */
async function safeRead(port: TemplateAppScanPort, path: string): Promise<string | undefined> {
  try {
    return await port.readTextFile(path)
  } catch {
    return undefined
  }
}

/** Strip trailing separators so paths compare across joins. */
function trimSeparators(path: string): string {
  return path.replace(/[/\\]+$/u, '')
}

/** Last path segment of a directory (the name fallback). */
function basenameOf(directory: string): string {
  return trimSeparators(directory).split(/[\\/]/u).filter(Boolean).at(-1) ?? directory
}

/** Join one child segment onto a directory path (both separators tolerated). */
function joinChild(parent: string, child: string): string {
  return parent.endsWith('/') || parent.endsWith('\\') ? `${parent}${child}` : `${parent}/${child}`
}

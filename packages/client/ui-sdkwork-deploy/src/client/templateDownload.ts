/**
 * Template download for app development scaffolds.
 *
 * A published scaffold is one app root's files at the archive root. Installing
 * it therefore targets a directory *under the project's `apps/` tree* by
 * default (`apps/<templateKey>`), never the project root — the SDKWork
 * workspace standard keeps every application root under `apps/`, and a
 * downloaded app must join that layout exactly like a generated one. A caller
 * may instead name a custom absolute directory.
 *
 * After the files land, the installer:
 *
 * - records the template identity in the installed app's
 *   `agent.app.config.json` (so a repeat install or a later update relates by
 *   id);
 * - validates the manifest/readme the archive carried and reports what the
 *   scaffold still lacks; and
 * - upserts the app's row in `apps/README.md`, the repository directory index
 *   the workspace standard requires.
 *
 * Side effects arrive through {@link TemplateInstallPorts}; the module is
 * plain data and the tests drive it with stubs.
 */
import { DEPLOY_APP_CONFIG_FILE } from './deployAppConfig.ts'
import { upsertAppsIndexRow } from './appsIndex.ts'
import { appsIndexRoleForDirectory } from './templateApps.ts'
import { projectAppCardId, readProjectAppState } from './projectApp.ts'
import type { TemplateInstallProgress } from './installTemplate.ts'

/** Where a downloaded template will land. */
export type TemplateInstallTargetMode = 'apps' | 'custom'

/** The resolved target directory and the facts a confirmation needs. */
export interface TemplateInstallTarget {
  readonly mode: TemplateInstallTargetMode
  /** The project root the `apps/` mode is relative to (absent for custom). */
  readonly projectDirectory?: string
  /** The directory the app root will be created under. */
  readonly parent: string
  /** The final path segment (the app root directory name). */
  readonly directoryName: string
  /** Absolute target directory. */
  readonly directory: string
  /** The requested name existed and a numeric suffix was chosen instead. */
  readonly renamed: boolean
}

/** One template row the download panel lists. */
export interface TemplateCatalogRow {
  readonly id: string
  readonly appUuid: string
  readonly templateKey: string
  readonly displayName: string
  readonly summary: string
  readonly version: string
  readonly status: string
  readonly installCount: string
  readonly updatedAt: string
}

/** Facts of one completed install. */
export interface TemplateDownloadOutcome {
  readonly templateId: string
  readonly displayName: string
  readonly version: string
  readonly directory: string
  readonly fileCount: number
  readonly totalBytes: number
  /** The installed root carries a parsable `agent.app.config.json`. */
  readonly manifestFound: boolean
  /** The template identity was written into the installed manifest. */
  readonly linkWritten: boolean
  /** The app's row was added/replaced in `apps/README.md`. */
  readonly indexUpdated: boolean
  /** Non-fatal spec gaps or skipped steps, already user-facing facts. */
  readonly warnings: readonly string[]
}

/** Install-time document and progress ports. */
export interface TemplateInstallPorts {
  /** List the project's `apps/` child directories, or undefined when absent. */
  listApps(projectDirectory: string): Promise<readonly string[] | undefined>
  /** Create one child directory under an existing parent; undefined on failure. */
  createDirectory(parent: string, name: string): Promise<string | undefined>
  /** Read a small text file; undefined when absent or unreadable. */
  readTextFile(path: string): Promise<string | undefined>
  /** Replace a small text file; false on failure. */
  writeTextFile(path: string, content: string): Promise<boolean>
  /** Download the template's artifact version and write every planned file. */
  installInto(
    templateId: string,
    targetDirectory: string,
    onProgress: ((progress: TemplateInstallProgress) => void) | undefined,
  ): Promise<{
    readonly fileCount: number
    readonly totalBytes: number
    readonly version: string
    readonly displayName: string
  }>
  /** Merge the template identity into the installed app manifest. */
  writeTemplateLink(
    directory: string,
    patch: {
      readonly templateId: string
      readonly templateKey: string
      readonly templateName: string
      readonly sourceDirectory: string
    },
  ): Promise<boolean>
}

/** The custom target is not an absolute directory path. */
export class TemplateInstallTargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateInstallTargetError'
  }
}

/** One download request as the panel collects it. */
export interface TemplateInstallRequest {
  readonly templateId: string
  readonly templateKey: string
  readonly displayName: string
  readonly projectDirectory: string
  readonly mode: TemplateInstallTargetMode
  /** Absolute custom directory; required for `mode: 'custom'`. */
  readonly customDirectory?: string | undefined
  /** Optional directory name override for the `apps/` mode. */
  readonly directoryName?: string | undefined
}

/**
 * Resolve the directory a download will land in.
 *
 * `apps/` mode picks `apps/<preferred>` and appends `-2`, `-3`, … when that
 * directory already exists, so a download can never silently overwrite a
 * local application. Custom mode uses the caller's absolute directory as-is.
 * @param request - the template and target request.
 * @param existingApps - `apps/` child names, or undefined when the directory is absent.
 * @returns the resolved target.
 * @throws TemplateInstallTargetError for a blank/relative custom target or a
 *   preferred name that is not one safe segment.
 */
export function planTemplateInstallTarget(
  request: TemplateInstallRequest,
  existingApps: readonly string[] | undefined,
): TemplateInstallTarget {
  if (request.mode === 'custom') {
    const raw = request.customDirectory?.trim() ?? ''
    if (raw === '' || !isAbsolutePath(raw)) {
      throw new TemplateInstallTargetError('the custom install directory must be an absolute path')
    }
    const directory = trimSeparators(raw)
    const cut = Math.max(directory.lastIndexOf('/'), directory.lastIndexOf('\\'))
    if (cut < 0) {
      throw new TemplateInstallTargetError('the custom install directory must name a directory below a root')
    }
    // `/demo` and `C:\demo` name a child of the filesystem root; keep the
    // root's separator in the parent so directory creation addresses it.
    const driveRoot = cut === 2 && directory[1] === ':'
    const parent = cut === 0
      ? directory.slice(0, 1)
      : driveRoot ? directory.slice(0, 3) : directory.slice(0, cut)
    const directoryName = driveRoot ? directory.slice(3) : directory.slice(cut + 1)
    if (directoryName === '') {
      throw new TemplateInstallTargetError('the custom install directory must name a directory below a root')
    }
    return {
      mode: 'custom',
      parent,
      directoryName,
      directory,
      renamed: false,
    }
  }
  const project = trimSeparators(request.projectDirectory)
  const appsDirectory = joinChild(project, 'apps')
  const preferred = safeDirectoryName(request.directoryName ?? request.templateKey)
  if (preferred === undefined) {
    throw new TemplateInstallTargetError(`"${request.directoryName ?? request.templateKey}" is not a usable app directory name`)
  }
  const taken = new Set((existingApps ?? []).map(name => name.toLowerCase()))
  let directoryName = preferred
  let renamed = false
  for (let suffix = 2; taken.has(directoryName.toLowerCase()) && suffix <= 99; suffix += 1) {
    directoryName = `${preferred}-${suffix}`
    renamed = true
  }
  return {
    mode: 'apps',
    projectDirectory: project,
    parent: appsDirectory,
    directoryName,
    directory: joinChild(appsDirectory, directoryName),
    renamed,
  }
}

/**
 * Install one template into its resolved target and reconcile the app
 * repository facts.
 * @param ports - listing/creation/document/install side effects.
 * @param request - the template and target request.
 * @param onProgress - download/write progress from the installer.
 * @returns the install facts and the spec reconciliation results.
 * @throws TemplateInstallTargetError for an unusable target, plus any download
 *   or write failure from {@link TemplateInstallPorts.installInto}.
 */
export async function installTemplateIntoProject(
  ports: TemplateInstallPorts,
  request: TemplateInstallRequest,
  onProgress?: (progress: TemplateInstallProgress) => void,
): Promise<TemplateDownloadOutcome> {
  const projectDirectory = trimSeparators(request.projectDirectory)
  const existingApps = request.mode === 'apps'
    ? await ports.listApps(projectDirectory)
    : undefined
  const target = planTemplateInstallTarget(request, existingApps)
  await ensureTargetDirectory(ports, target)
  const installed = await ports.installInto(request.templateId, target.directory, onProgress)
  const warnings: string[] = []
  if (target.renamed) {
    warnings.push(`"${request.templateKey}" already exists in apps/; installed as "${target.directoryName}"`)
  }
  const manifestRaw = await ports.readTextFile(joinChild(target.directory, DEPLOY_APP_CONFIG_FILE))
  const manifestState = readProjectAppState(manifestRaw, { directory: target.directory })
  let linkWritten = false
  if (!manifestState.hasManifest) {
    // Writing a linkage into a missing/damaged manifest would fabricate an
    // app identity (`app`/`app`) that the scaffold never declared. Report the
    // gap and leave the file alone.
    warnings.push('the installed scaffold carries no parsable agent.app.config.json')
  } else {
    linkWritten = await ports.writeTemplateLink(target.directory, {
      templateId: request.templateId,
      templateKey: request.templateKey,
      templateName: installed.displayName,
      sourceDirectory: target.directory,
    }).catch(() => false)
    if (!linkWritten) warnings.push('the template identity was not written into agent.app.config.json')
  }

  let indexUpdated = false
  if (target.mode === 'apps') {
    const indexPath = joinChild(joinChild(projectDirectory, 'apps'), 'README.md')
    const index = await ports.readTextFile(indexPath)
    if (index === undefined) {
      warnings.push('apps/README.md was not found; the directory index was not updated')
    } else {
      const cardId = projectAppCardId(manifestState.identity)
      const readme = await ports.readTextFile(joinChild(target.directory, 'README.md'))
      const updated = upsertAppsIndexRow(index, {
        directory: target.directoryName,
        role: appsIndexRoleForDirectory(target.directoryName, cardId),
        runnable: 'yes',
        purpose: manifestState.identity?.displayName
          ?? manifestState.identity?.appName
          ?? installed.displayName,
        entry: readme === undefined
          ? `${target.directoryName}/`
          : `[README](${target.directoryName}/README.md)`,
      })
      if (updated === index) {
        warnings.push('apps/README.md has no directory index table; the row was not added')
      } else {
        indexUpdated = await ports.writeTextFile(indexPath, updated)
        if (!indexUpdated) warnings.push('writing apps/README.md failed')
      }
    }
  }
  return {
    templateId: request.templateId,
    displayName: installed.displayName,
    version: installed.version,
    directory: target.directory,
    fileCount: installed.fileCount,
    totalBytes: installed.totalBytes,
    manifestFound: manifestState.hasManifest,
    linkWritten,
    indexUpdated,
    warnings,
  }
}

/** Create the target directory (and the `apps/` parent when absent). */
async function ensureTargetDirectory(
  ports: TemplateInstallPorts,
  target: TemplateInstallTarget,
): Promise<void> {
  if (target.mode === 'custom') {
    const created = await ports.createDirectory(target.parent, target.directoryName)
    if (created === undefined) {
      // An existing directory is the expected custom-download case; the
      // installer's first write is the authoritative existence check.
      return
    }
    return
  }
  const project = target.projectDirectory ?? target.parent
  const appsCreated = await ports.createDirectory(project, 'apps')
  if (appsCreated === undefined) {
    // Either apps/ already exists (normal) or its creation failed; creating the
    // child below is the next authoritative step.
  }
  const created = await ports.createDirectory(target.parent, target.directoryName)
  if (created === undefined) {
    throw new TemplateInstallTargetError(`cannot create the app directory "${target.directory}"`)
  }
}

/** True for a Windows drive, UNC, or POSIX absolute path. */
function isAbsolutePath(path: string): boolean {
  return /^[a-z]:[\\/]/iu.test(path) || /^[/\\]{1,2}[^/\\]/u.test(path)
}

/** One safe directory segment, or undefined when the value cannot be one. */
function safeDirectoryName(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return undefined
  if (/[/\\\u0000-\u001f<>:"|?*]/u.test(trimmed)) return undefined
  if (/[. ]$/u.test(trimmed)) return undefined
  return trimmed
}

/** Strip trailing separators so paths compare across joins. */
function trimSeparators(path: string): string {
  return path.replace(/[/\\]+$/u, '')
}

/** Join one child segment onto a directory path (both separators tolerated). */
function joinChild(parent: string, child: string): string {
  return parent.endsWith('/') || parent.endsWith('\\') ? `${parent}${child}` : `${parent}/${child}`
}

/**
 * File-driven discovery of SDKWork app projects for the app library.
 *
 * The library dialog must list the apps that already exist on disk without the
 * operator opening them one by one, so a bounded walk over the workspace finds
 * every directory carrying the governed app manifest
 * (`sdkwork.app.config.json`, APP_MANIFEST_SPEC) and derives from it the same
 * identity the publish flows use ({@link readProjectAppState}). A directory
 * without a manifest is invisible here; a manifest without a deploy_app
 * linkage still lists, and its row actions run the create-or-link flow.
 *
 * The walk is pure over a structural scan port, so the dialog can hand it the
 * host adapter and tests can hand it an in-memory tree.
 */
import { DEPLOY_APP_CONFIG_FILE, parseSourceSpec } from './deployAppConfig.ts'
import { projectAppDraft, readProjectAppState, type ProjectAppState } from './projectApp.ts'

/** One directory row as the scan port serves it (structural host listing). */
export interface AppLibraryListing {
  readonly entries: readonly { readonly name: string; readonly path: string; readonly hidden: boolean }[]
}

/** Structural minimum the walk needs from the host workspace bridge. */
export interface AppLibraryScanPort {
  /**
   * List one directory. `undefined` reads as "unreadable or not a directory"
   * and prunes the walk branch; any throw is caught by the caller.
   */
  listDirectory(path: string): Promise<AppLibraryListing | undefined>
  /** Read a small governed text file; `undefined` when absent or unreadable. */
  readTextFile(path: string): Promise<string | undefined>
}

/** One discovered app project, ready for a library row. */
export interface AppLibraryEntry {
  /** Project directory the manifest was found in (the row's identity). */
  readonly directory: string
  /** Display name (manifest displayName → name → directory basename). */
  readonly name: string
  /** Console type card derived from the manifest (`h5`, `pc-web`, …). */
  readonly cardId?: string
  /** Product description (`app.description`). */
  readonly description?: string
  /** Manifest `app.key`, when declared. */
  readonly appKey?: string
  /** Product icon URL (`app.iconUrl` or `media.icons.primary.url`). */
  readonly iconUrl?: string
  /** The deploy_app id the manifest records, when one is linked. */
  readonly linkedAppId?: string
  /** The linked app's recorded name, for the row's linkage badge. */
  readonly linkedAppName?: string
  /** The recorded local source directory, when the manifest carries one. */
  readonly sourceDirectory?: string
  /** The recorded git source clone URL, when the manifest carries one. */
  readonly sourceGitUrl?: string
  /** The full project state the row's flows re-consume. */
  readonly state: ProjectAppState
}

/** Walk depth limit from the scan root (root = 0). */
export const APP_LIBRARY_MAX_DEPTH = 3

/** Limit on successfully listed directories per scan. */
export const APP_LIBRARY_MAX_DIRECTORIES = 120

/** Limit on total listing attempts per scan, so file-heavy trees stay cheap. */
export const APP_LIBRARY_MAX_ATTEMPTS = 300

/**
 * Child directory names the walk never descends into. Build outputs, package
 * stores, and VCS internals can hold thousands of entries but never an
 * application project root.
 */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'unpackage',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'tmp',
  'temp',
  'releases',
])

/** Scan options: every limit is overridable for tests. */
export interface AppLibraryScanOptions {
  readonly maxDepth?: number | undefined
  readonly maxDirectories?: number | undefined
  readonly maxAttempts?: number | undefined
  /**
   * Resolve the canonical deployment profile id a manifest's linkage is read
   * under (the host's `<mode>.<environment>`); omitted linkage reads fall back
   * to the single-entry rule.
   */
  readonly profileIdOf?: ((raw: string) => string) | undefined
}

/**
 * Walk the workspace from `root` and collect every manifest-carrying project.
 *
 * Breadth-first, pruning hidden and build-output children, with hard limits on
 * depth, listed directories, and total listing attempts. A failed listing
 * prunes that branch (the child was a file or unreadable) without consuming
 * the directory budget.
 * @param port - the workspace scan port.
 * @param root - directory to walk from (the session cwd).
 * @param options - limits and the linkage profile resolver.
 * @returns the discovered entries sorted by display name.
 */
export async function discoverAppLibrary(
  port: AppLibraryScanPort,
  root: string,
  options: AppLibraryScanOptions = {},
): Promise<AppLibraryEntry[]> {
  const maxDepth = options.maxDepth ?? APP_LIBRARY_MAX_DEPTH
  const maxDirectories = options.maxDirectories ?? APP_LIBRARY_MAX_DIRECTORIES
  const maxAttempts = options.maxAttempts ?? APP_LIBRARY_MAX_ATTEMPTS
  const seen = new Set<string>()
  const entries: AppLibraryEntry[] = []
  let attempts = 0
  let listed = 0
  let frontier: { readonly path: string; readonly depth: number }[] = [{ path: trimSeparators(root), depth: 0 }]
  while (frontier.length > 0 && listed < maxDirectories && attempts < maxAttempts) {
    const next: { path: string; depth: number }[] = []
    for (const directory of frontier) {
      if (listed >= maxDirectories || attempts >= maxAttempts) break
      if (seen.has(directory.path)) continue
      seen.add(directory.path)
      attempts += 1
      const listing = await safeList(port, directory.path)
      if (listing === undefined) continue
      listed += 1
      const names = listing.entries.map(entry => entry.name)
      if (names.includes(DEPLOY_APP_CONFIG_FILE)) {
        const raw = await safeRead(port, joinChild(directory.path, DEPLOY_APP_CONFIG_FILE))
        if (raw !== undefined) {
          const state = readProjectAppState(raw, {
            directory: directory.path,
            ...(options.profileIdOf === undefined ? {} : { profileId: options.profileIdOf(raw) }),
          })
          if (state.hasManifest) {
            const source = parseSourceSpec(raw)
            entries.push(entryOf(state, directory.path, source))
          }
        }
      }
      if (directory.depth >= maxDepth) continue
      for (const child of listing.entries) {
        if (child.hidden || SKIPPED_DIRECTORIES.has(child.name.toLowerCase())) continue
        next.push({ path: trimSeparators(child.path), depth: directory.depth + 1 })
      }
    }
    frontier = next
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

/** Project an interpreted manifest state into a library entry. */
function entryOf(
  state: ProjectAppState,
  directory: string,
  source: { sourceDirectory?: string; sourceGitUrl?: string } | undefined,
): AppLibraryEntry {
  const draft = projectAppDraft(state, basenameOf(directory))
  return {
    directory,
    name: draft.name,
    ...(draft.cardId === undefined ? {} : { cardId: draft.cardId }),
    ...(draft.description === undefined ? {} : { description: draft.description }),
    ...(draft.appKey === undefined ? {} : { appKey: draft.appKey }),
    ...(state.identity?.iconUrl === undefined ? {} : { iconUrl: state.identity.iconUrl }),
    ...(state.linkedAppId === undefined ? {} : { linkedAppId: state.linkedAppId }),
    ...(state.link?.appName === undefined ? {} : { linkedAppName: state.link.appName }),
    ...(source === undefined ? {} : {
      ...(source.sourceDirectory === undefined ? {} : { sourceDirectory: source.sourceDirectory }),
      ...(source.sourceGitUrl === undefined ? {} : { sourceGitUrl: source.sourceGitUrl }),
    }),
    state,
  }
}

/** ListDirectory that never throws: every failure prunes the branch. */
async function safeList(port: AppLibraryScanPort, path: string): Promise<AppLibraryListing | undefined> {
  try {
    return await port.listDirectory(path)
  } catch {
    return undefined
  }
}

/** ReadTextFile that never throws: every failure reads as "no manifest". */
async function safeRead(port: AppLibraryScanPort, path: string): Promise<string | undefined> {
  try {
    return await port.readTextFile(path)
  } catch {
    return undefined
  }
}

/** Strip trailing separators so a path is comparable across listing rounds. */
function trimSeparators(path: string): string {
  return path.replace(/[/\\]+$/u, '')
}

/** Last path segment of a project directory (the entry name fallback). */
function basenameOf(directory: string): string {
  return trimSeparators(directory).split(/[\\/]/u).filter(Boolean).at(-1) ?? directory
}

/** Join one child segment onto a directory path (both separators tolerated). */
function joinChild(parent: string, child: string): string {
  return parent.endsWith('/') || parent.endsWith('\\') ? `${parent}${child}` : `${parent}/${child}`
}

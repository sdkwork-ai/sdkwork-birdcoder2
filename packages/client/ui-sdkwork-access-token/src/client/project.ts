/**
 * Discovery of the manifest-bearing application roots under one SDKWork
 * project directory, plus the identity and format each root declares.
 *
 * A project row may be an application root itself (`agent.app.config.json` at
 * the top) or a workspace whose client surfaces live under `apps/*`. The
 * access token is per manifest-bearing root, so the dialog lists exactly those
 * and never invents an identity (`APP_ACCESS_TOKEN_SPEC.md` §2–§3).
 */
import type { ApplicationTypeId } from './applicationTypes.ts'
import { inferApplicationTypeId } from './applicationTypes.ts'
import { joinHostPath } from './paths.ts'

/**
 * The directory-bridge slice the initializer consumes: the `uiWorkspace`
 * service's governed file operations, structured so tests and compositions can
 * substitute a plain in-memory implementation.
 */
export interface AccessTokenFileSystem {
  /**
   * List one Host directory level.
   * @param path - absolute directory path.
   * @param signal - cancellation for a superseded scan.
   */
  listDirectory(path: string, signal?: AbortSignal): Promise<{
    path: string
    entries: ReadonlyArray<{ name: string; path: string }>
  }>
  /**
   * Read one governed text file.
   * @param path - absolute file path.
   * @param signal - cancellation for a superseded read.
   */
  readTextFile(path: string, signal?: AbortSignal): Promise<string>
  /**
   * Write one governed text file; parents must already exist.
   * @param path - absolute file path.
   * @param content - UTF-8 text replacing any previous content.
   */
  writeTextFile(path: string, content: string): Promise<string>
  /**
   * Create one child directory.
   * @param path - existing parent directory.
   * @param name - child directory name (one segment).
   */
  createDirectory(path: string, name: string): Promise<string>
}

/** File name of the application manifest at every root. */
export const AGENT_APP_CONFIG_FILE = 'agent.app.config.json'

/** Identity fields read from one root manifest. */
export interface AppManifestIdentity {
  /** Manifest `app.displayName`, then `app.key`, then the directory name. */
  displayName: string
  /** Manifest `backend.appId`; the token anchor when the app id is repository-owned. */
  appId: string
  /** Manifest `backend.tenantId`. */
  tenantId: string
  /** Manifest `backend.organizationId`; non-zero for an organization-level surface. */
  organizationId: string
  /** Manifest `backend.accessTokenPermissionScope`, defaulting to `iam:self`. */
  permissionScope: string[]
  /** Manifest `app.appType`. */
  appType?: string | undefined
  /** Manifest `runtime.framework`. */
  framework?: string | undefined
  /** Manifest `runtime.family`. */
  family?: string | undefined
  /** Manifest `publish.config.workspaceRoot`: the surface this manifest delegates to, if any. */
  workspaceRoot?: string | undefined
  /** Manifest `devApp.sourceRoot`: the development surface this manifest delegates to, if any. */
  sourceRoot?: string | undefined
}

/** One manifest-bearing application root the dialog can initialize. */
export interface AccessTokenCandidate {
  /** Absolute Host path of the application root. */
  rootPath: string
  /** Operator-facing application name. */
  displayName: string
  /** Identity fields from the root manifest. */
  identity: AppManifestIdentity
  /** Application type inferred from the manifest and the root's file markers. */
  detectedTypeId: ApplicationTypeId
  /** True when this root is the project directory itself, not an `apps/*` child. */
  isProjectRoot: boolean
}

/** Result of scanning one project directory. */
export interface AccessTokenProject {
  /** The scanned project directory. */
  directory: string
  /** Manifest-bearing roots, in discovery order (project root first). */
  candidates: AccessTokenCandidate[]
  /** True when an `apps/` level exists under the project directory. */
  hasAppsDirectory: boolean
}

/** Parse one manifest document's identity fields. */
function identityOf(manifest: Record<string, unknown>, fallbackName: string): AppManifestIdentity {
  const app = typeof manifest.app === 'object' && manifest.app !== null
    ? manifest.app as Record<string, unknown>
    : {}
  const backend = typeof manifest.backend === 'object' && manifest.backend !== null
    ? manifest.backend as Record<string, unknown>
    : {}
  const runtime = typeof manifest.runtime === 'object' && manifest.runtime !== null
    ? manifest.runtime as Record<string, unknown>
    : {}
  const publish = typeof manifest.publish === 'object' && manifest.publish !== null
    ? manifest.publish as Record<string, unknown>
    : {}
  const publishConfig = typeof publish.config === 'object' && publish.config !== null
    ? publish.config as Record<string, unknown>
    : {}
  const devApp = typeof manifest.devApp === 'object' && manifest.devApp !== null
    ? manifest.devApp as Record<string, unknown>
    : {}
  const permissionScope = Array.isArray(backend.accessTokenPermissionScope)
    ? backend.accessTokenPermissionScope.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      .map(entry => entry.trim())
    : []
  const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
  return {
    displayName: text(app.displayName) || text(app.key) || fallbackName,
    appId: text(backend.appId),
    tenantId: text(backend.tenantId),
    organizationId: text(backend.organizationId),
    permissionScope: permissionScope.length > 0 ? permissionScope : ['iam:self'],
    ...(text(app.appType) === '' ? {} : { appType: text(app.appType) }),
    ...(text(runtime.framework) === '' ? {} : { framework: text(runtime.framework) }),
    ...(text(runtime.family) === '' ? {} : { family: text(runtime.family) }),
    ...(text(publishConfig.workspaceRoot) === '' ? {} : { workspaceRoot: text(publishConfig.workspaceRoot) }),
    ...(text(devApp.sourceRoot) === '' ? {} : { sourceRoot: text(devApp.sourceRoot) }),
  }
}

/**
 * Read one file, reporting absence instead of rejecting.
 * @param fsPort - the directory bridge.
 * @param path - absolute file path.
 * @param signal - cancellation for a superseded read.
 * @returns the text content, or undefined when the file is absent or unreadable.
 */
async function readOptionalText(
  fsPort: AccessTokenFileSystem, path: string, signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    return await fsPort.readTextFile(path, signal)
  } catch {
    return undefined
  }
}

/** List one directory's child rows, reporting absence instead of rejecting. */
async function listOptional(
  fsPort: AccessTokenFileSystem, path: string, signal?: AbortSignal,
): Promise<ReadonlyArray<{ name: string; path: string }>> {
  try {
    const listing = await fsPort.listDirectory(path, signal)
    return listing.entries
  } catch {
    return []
  }
}

/** Name of one root's directory, used as the manifest display fallback. */
function directoryNameOf(path: string): string {
  const segments = path.split(/[\\/]+/u).filter(segment => segment !== '')
  return segments[segments.length - 1] ?? path
}

/**
 * Describe one manifest-bearing root: its identity and inferred application type.
 * @param fsPort - the directory bridge.
 * @param rootPath - absolute application-root path.
 * @param manifest - parsed root manifest.
 * @param isProjectRoot - whether this is the scanned project directory itself.
 * @param signal - cancellation for a superseded scan.
 * @returns the candidate the dialog lists.
 */
async function describeCandidate(
  fsPort: AccessTokenFileSystem,
  rootPath: string,
  manifest: Record<string, unknown>,
  isProjectRoot: boolean,
  signal?: AbortSignal,
): Promise<AccessTokenCandidate> {
  const identity = identityOf(manifest, directoryNameOf(rootPath))
  const [pubspec, miniProgramProject, harmonyBuildProfile, viteConfig] = await Promise.all([
    readOptionalText(fsPort, joinHostPath(rootPath, 'pubspec.yaml'), signal),
    readOptionalText(fsPort, joinHostPath(rootPath, 'project.config.json'), signal),
    readOptionalText(fsPort, joinHostPath(rootPath, 'build-profile.json5'), signal),
    readOptionalText(fsPort, joinHostPath(rootPath, 'vite.config.ts'), signal),
  ])
  const detectedTypeId = inferApplicationTypeId({
    manifestAppType: identity.appType,
    manifestFramework: identity.framework,
    manifestFamily: identity.family,
    hasPubspec: pubspec !== undefined,
    hasMiniProgramProject: miniProgramProject !== undefined,
    hasHarmonyProject: harmonyBuildProfile !== undefined,
    hasViteProject: viteConfig !== undefined,
  })
  return { rootPath, displayName: identity.displayName, identity, detectedTypeId, isProjectRoot }
}

/**
 * Read and parse one root manifest.
 * @param fsPort - the directory bridge.
 * @param rootPath - absolute application-root path.
 * @param signal - cancellation for a superseded scan.
 * @returns the parsed manifest document, or undefined when absent or not an object.
 */
async function readManifest(
  fsPort: AccessTokenFileSystem, rootPath: string, signal?: AbortSignal,
): Promise<Record<string, unknown> | undefined> {
  const raw = await readOptionalText(fsPort, joinHostPath(rootPath, AGENT_APP_CONFIG_FILE), signal)
  if (raw === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether one root manifest names a client surface or an umbrella/back-end root.
 *
 * A repository-level manifest may describe the whole installation while the
 * client surfaces live under `apps/*`: it delegates through
 * `publish.config.workspaceRoot` / `devApp.sourceRoot`, or it declares a
 * server/container family. Those roots do not carry the profile matrix, so the
 * initializer never offers them.
 * @param manifest - parsed root manifest.
 * @param directory - the project directory the manifest sits in.
 * @returns true when the directory is a client application root.
 */
function isSurfaceProjectRoot(manifest: Record<string, unknown>, directory: string): boolean {
  const identity = identityOf(manifest, directoryNameOf(directory))
  const family = (identity.family ?? '').toLowerCase()
  if (family === 'server' || family === 'container' || family === 'docker') return false
  for (const declared of [identity.workspaceRoot, identity.sourceRoot]) {
    if (declared === undefined) continue
    const normalized = declared.replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/\/+$/u, '')
    if (normalized !== '' && normalized !== '.') return false
  }
  return true
}

/**
 * Scan one SDKWork project directory for its manifest-bearing application roots.
 *
 * The project directory itself is checked first (an application checkout), then
 * its `apps/*` children (a workspace checkout). A root without a readable
 * `agent.app.config.json` is not offered: the token claims come from that
 * manifest identity. A repository-level manifest that merely describes the
 * installation (a delegated workspace root or a server family) is not a client
 * surface and is skipped.
 * @param fsPort - the directory bridge.
 * @param directory - absolute project directory.
 * @param signal - cancellation for a superseded scan.
 * @returns the discovered roots in display order.
 */
export async function describeAccessTokenProject(
  fsPort: AccessTokenFileSystem, directory: string, signal?: AbortSignal,
): Promise<AccessTokenProject> {
  const candidates: AccessTokenCandidate[] = []
  const rootManifest = await readManifest(fsPort, directory, signal)
  if (rootManifest !== undefined && isSurfaceProjectRoot(rootManifest, directory)) {
    candidates.push(await describeCandidate(fsPort, directory, rootManifest, true, signal))
  }
  const appsDirectory = joinHostPath(directory, 'apps')
  const children = await listOptional(fsPort, appsDirectory, signal)
  for (const child of children) {
    if (signal?.aborted === true) break
    const manifest = await readManifest(fsPort, child.path, signal)
    if (manifest === undefined) continue
    candidates.push(await describeCandidate(fsPort, child.path, manifest, false, signal))
  }
  return { directory, candidates, hasAppsDirectory: children.length > 0 }
}

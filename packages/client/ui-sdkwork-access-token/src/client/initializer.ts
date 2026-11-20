/**
 * Initialization of the public application access token across one project's
 * application roots and profile matrix.
 *
 * For every selected root the initializer builds the deterministic token per
 * profile (`APP_ACCESS_TOKEN_SPEC.md` §3) and merges it into that format's
 * committed profile file (§2 table). Existing content is preserved: a dotenv
 * file keeps every other key and its own line endings, a JSON runtime document
 * keeps its other members, and an unchanged file is reported as such instead of
 * being rewritten.
 */
import type {
  AccessTokenLevel, AccessTokenProfile, RuntimeTarget,
} from './accessToken.ts'
import {
  PUBLIC_APP_ACCESS_TOKEN_KEY, buildPublicApplicationAccessToken, profileIdOf,
} from './accessToken.ts'
import type { ApplicationType, ApplicationTypeId } from './applicationTypes.ts'
import { applicationTypeById, profileFilePath } from './applicationTypes.ts'
import type { AccessTokenCandidate, AccessTokenFileSystem } from './project.ts'
import { messageOf } from './errors.ts'

/** One application root the operator selected, with its chosen format. */
export interface AccessTokenRootSelection {
  /** The root the dialog discovered. */
  candidate: AccessTokenCandidate
  /** Application type written for this root (defaults to the detected one). */
  applicationTypeId: ApplicationTypeId
  /** Runtime target the token claims for this root. */
  runtimeTarget: RuntimeTarget
}

/** One requested initialization. */
export interface AccessTokenInitializeRequest {
  /** The directory bridge that reads and writes the profile files. */
  fs: AccessTokenFileSystem
  /** Selected roots, each with its own application type and runtime target. */
  roots: readonly AccessTokenRootSelection[]
  /** Token level: tenant-level or organization-level. */
  level: AccessTokenLevel
  /** Organization binding for an organization-level token (positive decimal id). */
  organizationId?: string | undefined
  /** Tenant id override; each root's manifest `backend.tenantId` is the default. */
  tenantId?: string | undefined
  /** Deployment anchor override; each root's manifest `backend.appId` is the default. */
  appId?: string | undefined
  /** Profiles to write, in canonical order. */
  profiles: readonly AccessTokenProfile[]
  /** Cancellation for a superseded run. */
  signal?: AbortSignal | undefined
}

/** Outcome of one profile-file write. */
export interface AccessTokenFileOutcome {
  /** Absolute application-root path the file belongs to. */
  rootPath: string
  /** Profile id of the file. */
  profileId: string
  /** Absolute profile-file path. */
  path: string
  /** What happened to the file. */
  status: 'written' | 'unchanged' | 'failed'
  /** The token written (or already present) when the file succeeded. */
  token?: string | undefined
  /** Failure reason when the file failed. */
  message?: string | undefined
}

/** Complete initialization outcome. */
export interface AccessTokenInitializeResult {
  /** One row per profile file, in root/profile order. */
  files: AccessTokenFileOutcome[]
  /** Files created or rewritten. */
  written: number
  /** Files already carrying the identical token. */
  unchanged: number
  /** Files that could not be written. */
  failed: number
}

/** One resolved root, validated before any file is touched. */
interface ResolvedRoot {
  selection: AccessTokenRootSelection
  type: ApplicationType
  appId: string
  tenantId: string
}

/** Parse one JSON document, refusing to overwrite a document it cannot read. */
function parseJsonObject(raw: string | undefined, path: string): Record<string, unknown> {
  if (raw === undefined || raw.trim() === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error: unknown) {
    throw new Error(
      `${path} is not valid JSON, so its other values would be lost: ${messageOf(error)}`,
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object; refusing to overwrite it.`)
  }
  return parsed as Record<string, unknown>
}

/** Sort a JSON object's own keys so a repeated initialization produces no diff. */
function sortRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]))
}

/**
 * Merge the token into a dotenv profile file.
 *
 * Existing keys and comments stay byte-identical; the token line replaces an
 * existing `SDKWORK_ACCESS_TOKEN` (duplicates collapse to one) or is appended.
 * @param existing - current file content, or undefined when the file is absent.
 * @param token - token to write.
 * @returns the complete new file content.
 */
export function mergeDotenvAccessToken(existing: string | undefined, token: string): string {
  const line = `${PUBLIC_APP_ACCESS_TOKEN_KEY}=${token}`
  if (existing === undefined || existing.trim() === '') {
    return `# SDKWork public application access token (APP_ACCESS_TOKEN_SPEC.md).\n${line}\n`
  }
  const newline = existing.includes('\r\n') ? '\r\n' : '\n'
  const lines = existing.split(/\r?\n/u)
  if (lines[lines.length - 1] === '') lines.pop()
  const tokenLine = /^\s*(?:export\s+)?SDKWORK_ACCESS_TOKEN\s*=/u
  const merged: string[] = []
  let replaced = false
  for (const raw of lines) {
    if (!tokenLine.test(raw)) {
      merged.push(raw)
      continue
    }
    if (!replaced) {
      merged.push(line)
      replaced = true
    }
  }
  if (!replaced) merged.push(line)
  return `${merged.join(newline)}${newline}`
}

/**
 * Merge the token into a flat JSON runtime profile file (Flutter, mini program,
 * other JSON runtime roots). Keys are sorted, matching the canonical
 * materializer's deterministic output.
 * @param existing - current file content, or undefined when the file is absent.
 * @param token - token to write.
 * @param path - file path, named by the refusal when the document is unreadable.
 * @returns the complete new file content.
 */
export function mergeJsonAccessToken(existing: string | undefined, token: string, path: string): string {
  const record = parseJsonObject(existing, path)
  record[PUBLIC_APP_ACCESS_TOKEN_KEY] = token
  return `${JSON.stringify(sortRecord(record), null, 2)}\n`
}

/**
 * Merge the token into a Harmony native runtime template.
 *
 * The template is a nested, hand-authored document; its shape is preserved and
 * only the profile identity and the token are stamped (`materialize-client-env`
 * does the same). A missing template is created with those five members.
 * @param existing - current file content, or undefined when the file is absent.
 * @param token - token to write.
 * @param profile - deployment profile and environment.
 * @param runtimeTarget - surface runtime target.
 * @param path - file path, named by the refusal when the document is unreadable.
 * @returns the complete new file content.
 */
export function mergeHarmonyRuntimeEnvAccessToken(
  existing: string | undefined,
  token: string,
  profile: AccessTokenProfile,
  runtimeTarget: RuntimeTarget,
  path: string,
): string {
  const record = parseJsonObject(existing, path)
  record.environment = profile.environment
  record.deploymentProfile = profile.deploymentProfile
  record.profileId = profileIdOf(profile)
  record.runtimeTarget = runtimeTarget
  record[PUBLIC_APP_ACCESS_TOKEN_KEY] = token
  return `${JSON.stringify(record, null, 2)}\n`
}

/** Create the missing directory segments of one profile file's parent chain. */
async function ensureParentDirectories(
  fsPort: AccessTokenFileSystem,
  appRoot: string,
  segments: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  let current = appRoot
  for (const segment of segments.slice(0, -1)) {
    const listing = await fsPort.listDirectory(current, signal)
    const found = listing.entries.find(entry => entry.name === segment)
    if (found !== undefined) {
      current = found.path
      continue
    }
    current = await fsPort.createDirectory(current, segment)
  }
}

/** Read one profile file, reporting absence instead of rejecting. */
async function readOptionalFile(
  fsPort: AccessTokenFileSystem, path: string, signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    return await fsPort.readTextFile(path, signal)
  } catch {
    return undefined
  }
}

/**
 * Validate one root selection before any profile file is touched.
 * @param selection - root, application type, and runtime target.
 * @param request - the initialization request.
 * @returns the resolved root identity.
 */
function resolveRoot(selection: AccessTokenRootSelection, request: AccessTokenInitializeRequest): ResolvedRoot {
  const type = applicationTypeById(selection.applicationTypeId)
  if (type === undefined) {
    throw new Error(`unknown application type "${selection.applicationTypeId}" for ${selection.candidate.rootPath}.`)
  }
  const requestedOrganizationId = (request.organizationId ?? '').trim()
  const manifestOrganizationId = (selection.candidate.identity.organizationId ?? '').trim()
  // The installation decides its release level (`APPLICATION_IDENTITY_SPEC.md` §4.1):
  // a root whose manifest binds a non-zero organization is an organization-level
  // surface, so a tenant-level request must not overwrite it, and an organization
  // request must target that same organization. Roots of different levels are
  // initialized in separate runs.
  if (request.level === 'tenant' && manifestOrganizationId !== '' && manifestOrganizationId !== '0') {
    throw new Error(
      `${selection.candidate.rootPath}: its manifest binds organization ${manifestOrganizationId}; `
      + 'a tenant-level token must not replace an organization-level surface.',
    )
  }
  if (
    request.level === 'organization'
    && manifestOrganizationId !== ''
    && manifestOrganizationId !== '0'
    && manifestOrganizationId !== requestedOrganizationId
  ) {
    throw new Error(
      `${selection.candidate.rootPath}: its manifest binds organization ${manifestOrganizationId}, not `
      + `${requestedOrganizationId}; select roots of one organization or initialize them separately.`,
    )
  }
  if (!type.runtimeTargets.includes(selection.runtimeTarget)) {
    throw new Error(
      `${selection.candidate.rootPath}: runtime target "${selection.runtimeTarget}" is not valid for `
      + `${type.id}; expected one of ${type.runtimeTargets.join(', ')}.`,
    )
  }
  const appId = (request.appId ?? '').trim() || selection.candidate.identity.appId
  if (appId === '') {
    throw new Error(
      `${selection.candidate.rootPath}: its manifest declares no backend.appId, and no deployment anchor `
      + 'was entered; the token needs an application identity.',
    )
  }
  const tenantId = (request.tenantId ?? '').trim() || selection.candidate.identity.tenantId
  if (tenantId === '') {
    throw new Error(`${selection.candidate.rootPath}: its manifest declares no backend.tenantId, and none was entered.`)
  }
  return { selection, type, appId, tenantId }
}

/**
 * Initialize the public application access token across the selected roots and
 * profiles. Identity problems abort before any write; a single unreadable
 * profile file fails only that file.
 * @param request - roots, level, identity, and profile selection.
 * @returns every file outcome with its counts.
 */
export async function initializeAccessTokens(
  request: AccessTokenInitializeRequest,
): Promise<AccessTokenInitializeResult> {
  if (request.roots.length === 0) throw new Error('no application root is selected.')
  if (request.profiles.length === 0) throw new Error('no profile is selected.')
  const organizationId = (request.organizationId ?? '').trim()
  if (request.level === 'organization' && organizationId === '') {
    throw new Error('an organization-level token needs the organization id it binds to.')
  }
  if (request.level === 'tenant' && organizationId !== '' && organizationId !== '0') {
    throw new Error(
      `a tenant-level token cannot bind organizationId=${organizationId}; clear the organization `
      + 'field or choose the organization level.',
    )
  }
  const resolved = request.roots.map(selection => resolveRoot(selection, request))
  const files: AccessTokenFileOutcome[] = []
  for (const root of resolved) {
    request.signal?.throwIfAborted()
    const segmentsOfProfile = (profile: AccessTokenProfile): readonly string[] =>
      root.type.profileFile(profileIdOf(profile))
    try {
      await ensureParentDirectories(
        request.fs, root.selection.candidate.rootPath, segmentsOfProfile(request.profiles[0]), request.signal,
      )
    } catch (error: unknown) {
      for (const profile of request.profiles) {
        const path = profileFilePath(root.selection.candidate.rootPath, root.type, profileIdOf(profile))
        files.push({
          rootPath: root.selection.candidate.rootPath,
          profileId: profileIdOf(profile),
          path,
          status: 'failed',
          message: `cannot create the profile directory: ${messageOf(error)}`,
        })
      }
      continue
    }
    for (const profile of request.profiles) {
      request.signal?.throwIfAborted()
      const profileId = profileIdOf(profile)
      const path = profileFilePath(root.selection.candidate.rootPath, root.type, profileId)
      let token: string
      try {
        token = buildPublicApplicationAccessToken({
          identity: {
            appId: root.appId,
            tenantId: root.tenantId,
            organizationId,
            permissionScope: root.selection.candidate.identity.permissionScope,
          },
          profile,
          runtimeTarget: root.selection.runtimeTarget,
          level: request.level,
        })
      } catch (error: unknown) {
        files.push({
          rootPath: root.selection.candidate.rootPath,
          profileId,
          path,
          status: 'failed',
          message: messageOf(error),
        })
        continue
      }
      const existing = await readOptionalFile(request.fs, path, request.signal)
      let content: string
      try {
        content = root.type.format === 'dotenv'
          ? mergeDotenvAccessToken(existing, token)
          : root.type.format === 'harmony-json'
            ? mergeHarmonyRuntimeEnvAccessToken(existing, token, profile, root.selection.runtimeTarget, path)
            : mergeJsonAccessToken(existing, token, path)
      } catch (error: unknown) {
        files.push({
          rootPath: root.selection.candidate.rootPath,
          profileId,
          path,
          status: 'failed',
          message: messageOf(error),
        })
        continue
      }
      if (existing === content) {
        files.push({ rootPath: root.selection.candidate.rootPath, profileId, path, status: 'unchanged', token })
        continue
      }
      try {
        await request.fs.writeTextFile(path, content)
        files.push({ rootPath: root.selection.candidate.rootPath, profileId, path, status: 'written', token })
      } catch (error: unknown) {
        files.push({
          rootPath: root.selection.candidate.rootPath,
          profileId,
          path,
          status: 'failed',
          message: messageOf(error),
        })
      }
    }
  }
  return {
    files,
    written: files.filter(file => file.status === 'written').length,
    unchanged: files.filter(file => file.status === 'unchanged').length,
    failed: files.filter(file => file.status === 'failed').length,
  }
}

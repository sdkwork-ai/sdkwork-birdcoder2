/**
 * Deploy linkage persistence standard (`sdkwork.app.config.json`).
 *
 * The deploy plugin records the deploy_app / deploy_app_template identities it
 * created (or associated) into the governed per-project app manifest, so
 * repeat runs relate by ID instead of creating duplicates.
 *
 * Canonical location (APP_MANIFEST_SPEC §4.1): the platform-side
 * application id lives in `metadata.publishing.appIdByTarget`, keyed by the
 * canonical deployment profile id `<mode>.<environment>` (`standalone` /
 * `cloud` + `development` / `test` / `staging` / `demo` / `production`). The
 * canonical manifest validator rejects unknown top-level fields, so nothing
 * here may add a top-level section. Earlier plugin versions wrote a top-level
 * `deploy` section and overwrote `backend.appId`; readers still accept the
 * former for un-migrated projects, and the first write folds it into the
 * canonical block and removes it.
 *
 * Fork-owned display/provenance detail (app name and slug, source directory,
 * and the published template identity) rides beside the canonical map as
 * `metadata.publishing.birdcoder`. `metadata` is free-form in the standard and
 * the console's publisher merges the single target key while preserving other
 * metadata subtrees, so the two blocks coexist.
 *
 * Manifest shape written by this module:
 *
 *     {
 *       "schemaVersion": 3,
 *       "kind": "sdkwork.app",
 *       "metadata": {
 *         "publishing": {
 *           "appIdByTarget": { "standalone.development": "<deploy_app uuid>" },
 *           "birdcoder": {
 *             "appId": "<deploy_app uuid>",
 *             "appName": "...",
 *             "appSlug": "...",
 *             "appKey": "...",
 *             "sourceDirectory": "...",
 *             "templateId": "...",
 *             "templateKey": "...",
 *             "templateName": "...",
 *             "templateGitUrl": "https://...",
 *             "templateGitBranch": "main",
 *             "templateSubDirectory": "...",
 *             "updatedAt": "<ISO timestamp>"
 *           }
 *         }
 *       },
 *       ...every other section preserved...
 *     }
 */

/** Deployment mode half of the canonical profile id (ENVIRONMENT_SPEC §5.1). */
export type DeployDeploymentMode = 'standalone' | 'cloud'

/** Canonical environment half of the profile id (ENVIRONMENT_SPEC §2). */
export type DeployEnvironmentId = 'development' | 'test' | 'staging' | 'demo' | 'production'

/** Canonical deployment profile ids in publish-target order. */
export const DEPLOYMENT_MODES: readonly DeployDeploymentMode[] = ['standalone', 'cloud']

/** Canonical environments in publish-target order. */
export const DEPLOY_ENVIRONMENTS: readonly DeployEnvironmentId[] = [
  'development',
  'test',
  'staging',
  'demo',
  'production',
]

/** The ui-sdkwork-env lifecycle tier →canonical environment id. */
const ENV_SERVICE_ENVIRONMENTS: Readonly<Record<string, DeployEnvironmentId>> = {
  development: 'development',
  testing: 'test',
  staging: 'staging',
  production: 'production',
}

/** The deploy linkage persisted into `sdkwork.app.config.json`. */
export interface DeployAppConfigLink {
  /** `deploy_app.uuid` —the API identity the deploy SDK addresses. */
  appId: string
  appName?: string
  appSlug?: string
  /** The manifest's own `app.key`, recorded with the linkage for cross-reference. */
  appKey?: string
  /** `deploy_app_template.uuid` —present once the app was published as a template. */
  templateId?: string
  templateKey?: string
  templateName?: string
  /**
   * The git repository bound as the template's source at publish time
   * (`update-source` binding), with the project subdirectory the template
   * packages. Recorded locally so the packaging spec travels with the
   * project; the server-side binding carries the URL and branch only.
   */
  templateGitUrl?: string
  templateGitBranch?: string
  templateSubDirectory?: string
  /** Last source directory associated with the app (the session cwd at creation). */
  sourceDirectory?: string
  /** ISO timestamp of the last linkage write. */
  updatedAt?: string
}

/** The governed manifest file this module reads and writes. */
export const DEPLOY_APP_CONFIG_FILE = 'sdkwork.app.config.json'

/** Options for a linkage write: which canonical target key the app id belongs to. */
export interface DeployLinkWriteOptions {
  /** Canonical deployment profile id, `<mode>.<environment>`. */
  readonly profileId: string
}

/**
 * Compose the canonical deployment profile id.
 * @param mode - deployment mode half.
 * @param environment - canonical environment half.
 * @returns `<mode>.<environment>`, the key used by `metadata.publishing.appIdByTarget`.
 */
export function deployProfileId(mode: DeployDeploymentMode, environment: DeployEnvironmentId): string {
  return `${mode}.${environment}`
}

/**
 * Normalize a lifecycle tier reported by the host environment service.
 * @param value - the active tier (`development` | `testing` | `production`, or a canonical id).
 * @returns the canonical environment id; unknown input reads as `development`.
 */
export function deployEnvironmentOf(value: string | undefined): DeployEnvironmentId {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (normalized === '') return 'development'
  if (Object.hasOwn(ENV_SERVICE_ENVIRONMENTS, normalized)) return ENV_SERVICE_ENVIRONMENTS[normalized]
  return (DEPLOY_ENVIRONMENTS as readonly string[]).includes(normalized)
    ? normalized as DeployEnvironmentId
    : 'development'
}

/**
 * Resolve the canonical deployment profile a project manifest defaults to.
 *
 * `runtime.defaultDeploymentProfile` is the manifest's own default hint; it
 * falls back to `standalone` (the self-contained build), which is the profile
 * a local BirdCoder session can publish without a cloud target.
 * @param raw - raw manifest text (tolerates a missing or unparsable file).
 * @param environment - the host's active lifecycle tier.
 * @returns the canonical `<mode>.<environment>` profile id.
 */
export function resolveDeployProfileId(raw: string | undefined, environment: string | undefined): string {
  const manifest = parseManifestObject(raw)
  const runtime = asRecord(manifest?.['runtime'])
  const declared = runtime?.['defaultDeploymentProfile']
  const mode: DeployDeploymentMode = declared === 'cloud' ? 'cloud' : 'standalone'
  return deployProfileId(mode, deployEnvironmentOf(environment))
}

/**
 * Extract the deploy linkage from a raw manifest string.
 * @param raw - the manifest text, or undefined when the file is absent.
 * @param profileId - the project's canonical deployment profile; used to pick
 *   the matching `appIdByTarget` entry, else a single entry is authoritative.
 * @returns the linkage, or undefined when the file is absent, unparsable, or
 *   records no deploy app.
 */
export function parseDeployLink(raw: string | undefined, profileId?: string): DeployAppConfigLink | undefined {
  const manifest = parseManifestObject(raw)
  if (manifest === undefined) return undefined
  const publishing = asRecord(asRecord(manifest['metadata'])?.['publishing'])
  const byTarget = asRecord(publishing?.['appIdByTarget'])
  const canonicalId = pickAppId(byTarget, profileId)
  const legacyDeploy = asRecord(manifest['deploy'])
  const appId = canonicalId
    ?? stringValue(legacyDeploy?.['appId'])
    ?? legacyBackendAppId(manifest)
  if (appId === undefined) return undefined
  // Provenance prefers the canonical block; an un-migrated legacy section
  // fills whatever the canonical one does not carry.
  const provenance = asRecord(publishing?.['birdcoder'])
  const link: DeployAppConfigLink = { appId }
  for (const key of LINK_STRING_FIELDS) {
    const value = stringValue(provenance?.[key]) ?? stringValue(legacyDeploy?.[key])
    if (value !== undefined) link[key] = value
  }
  return link
}

/**
 * Merge a linkage patch into a raw manifest string and serialize the result.
 *
 * Writes the canonical `metadata.publishing.appIdByTarget[profileId]` entry
 * plus the fork provenance block, preserves every other manifest field, folds
 * a legacy top-level `deploy` section into the canonical block and removes it
 * (the standard rejects unknown top-level fields), and leaves
 * `backend.appId` —the IAM application id, a different identity —untouched.
 * @param raw - the current manifest text, or undefined when absent.
 * @param patch - the linkage fields to record; omitted fields are preserved.
 * @param options - the canonical target key the app id belongs to.
 * @returns the new manifest text.
 */
export function mergeDeployLink(
  raw: string | undefined,
  patch: Partial<DeployAppConfigLink>,
  options: DeployLinkWriteOptions,
): string {
  const config = parseManifestObject(raw) ?? {}
  const metadata = asRecord(config['metadata']) ?? {}
  const publishing = asRecord(metadata['publishing']) ?? {}
  const byTarget = asRecord(publishing['appIdByTarget']) ?? {}
  const legacy = asRecord(config['deploy'])
  // Migrate the legacy linkage before dropping its section.
  if (pickAppId(byTarget, undefined) === undefined) {
    const legacyId = stringValue(legacy?.['appId']) ?? legacyBackendAppId(config)
    if (legacyId !== undefined) byTarget[options.profileId] = legacyId
  }
  const patchAppId = stringValue(patch.appId)
  if (patchAppId !== undefined) byTarget[options.profileId] = patchAppId
  const provenance = asRecord(publishing['birdcoder']) ?? {}
  // Carry the legacy provenance into the canonical block.
  for (const key of LINK_STRING_FIELDS) {
    if (provenance[key] === undefined && legacy?.[key] !== undefined) {
      provenance[key] = legacy[key]
    }
  }
  for (const [key, value] of Object.entries(compact(patch))) {
    provenance[key] = value
  }
  provenance['appId'] = pickAppId(byTarget, options.profileId)
  provenance['updatedAt'] = new Date().toISOString()
  metadata['publishing'] = {
    ...publishing,
    appIdByTarget: byTarget,
    birdcoder: provenance,
  }
  config['metadata'] = metadata
  delete config['deploy']
  return `${JSON.stringify(config, null, 2)}\n`
}

/** Linkage fields stored as strings inside the provenance block. */
const LINK_STRING_FIELDS = [
  'appName',
  'appSlug',
  'appKey',
  'templateId',
  'templateKey',
  'templateName',
  'templateGitUrl',
  'templateGitBranch',
  'templateSubDirectory',
  'sourceDirectory',
  'updatedAt',
] as const

/** Parse a manifest text into its object form, tolerating absence and damage. */
function parseManifestObject(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  return asRecord(parsed)
}

/** Narrow a value to a plain record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Read a non-empty trimmed string member. */
function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Pick the app id recorded for a target key. The project's own profile wins; a
 * manifest with one entry answers with it; otherwise the first entry of the
 * same deployment mode is the fallback, then the first recorded entry.
 */
function pickAppId(byTarget: Record<string, unknown> | undefined, profileId: string | undefined): string | undefined {
  if (byTarget === undefined) return undefined
  const entries = Object.entries(byTarget)
    .map(([key, value]) => [key, stringValue(value)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
  if (entries.length === 0) return undefined
  if (profileId !== undefined) {
    const exact = entries.find(([key]) => key === profileId)
    if (exact !== undefined) return exact[1]
  }
  if (entries.length === 1) return entries[0][1]
  const mode = profileId?.split('.')[0]
  const sameMode = mode === undefined ? undefined : entries.find(([key]) => key.startsWith(`${mode}.`))
  return (sameMode ?? entries[0])[1]
}

/**
 * Legacy `backend.appId` tolerance: earlier plugin versions overwrote that
 * slot with the deploy app uuid. Only a uuid-shaped value is accepted —the
 * canonical slot also carries an IAM application key (`sdkwork-<code>`), which
 * is a different identity and must not be mistaken for a deploy app.
 */
function legacyBackendAppId(config: Record<string, unknown>): string | undefined {
  const value = stringValue(asRecord(config['backend'])?.['appId'])
  return value !== undefined && DEPLOY_APP_UUID.test(value) ? value : undefined
}

/** Shape of a `deploy_app.uuid` (the column is `VARCHAR(36)`). */
const DEPLOY_APP_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/** Drop undefined/blank values so a patch only carries what it states. */
function compact(patch: Partial<DeployAppConfigLink>): Partial<DeployAppConfigLink> {
  const out: Partial<DeployAppConfigLink> = {}
  for (const [key, value] of Object.entries(patch) as [keyof DeployAppConfigLink, string | undefined][]) {
    if (value !== undefined && value.trim() !== '') {
      out[key] = value.trim()
    }
  }
  return out
}

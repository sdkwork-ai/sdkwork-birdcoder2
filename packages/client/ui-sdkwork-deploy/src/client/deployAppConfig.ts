/**
 * Deploy linkage persistence standard (`sdkwork.app.config.json`).
 *
 * The deploy plugin records the deploy_app / deploy_app_template identities
 * it created (or associated) into the governed per-project app manifest, so
 * repeat runs relate by ID instead of creating duplicates. The manifest is
 * read and written in place: every section the file already carries is
 * preserved byte-for-value, only the `deploy` section (and the `backend.appId`
 * slot) is owned here.
 *
 * Manifest shape (SDKWORK_APP_STANDARD v3, `kind: "sdkwork.app"`):
 *
 *     {
 *       "schemaVersion": 3,
 *       "kind": "sdkwork.app",
 *       "backend": { "appId": "<deploy_app uuid>" | null, ... },
 *       "deploy": {
 *         "appId": "<deploy_app uuid>",
 *         "appName": "...",
 *         "appSlug": "...",
 *         "templateId": "<deploy_app_template uuid>" | undefined,
 *         "templateKey": "..." | undefined,
 *         "templateName": "..." | undefined,
 *         "sourceDirectory": "..." | undefined,
 *         "updatedAt": "<ISO timestamp>"
 *       },
 *       ...every other section preserved...
 *     }
 */

/** The deploy linkage section persisted into `sdkwork.app.config.json`. */
export interface DeployAppConfigLink {
  /** `deploy_app.uuid` — the API identity the deploy SDK addresses. */
  appId: string
  appName?: string
  appSlug?: string
  /** `deploy_app_template.uuid` — present once the app was published as a template. */
  templateId?: string
  templateKey?: string
  templateName?: string
  /** Last source directory associated with the app (the session cwd at creation). */
  sourceDirectory?: string
  /** ISO timestamp of the last linkage write. */
  updatedAt?: string
}

/** The governed manifest file this module reads and writes. */
export const DEPLOY_APP_CONFIG_FILE = 'sdkwork.app.config.json'

/**
 * Extract the deploy linkage from a raw manifest string.
 * @returns the linkage, or undefined when the file is absent, unparsable, or carries none.
 */
export function parseDeployLink(raw: string | undefined): DeployAppConfigLink | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const deploy = (parsed as Record<string, unknown>)['deploy']
  if (typeof deploy !== 'object' || deploy === null) {
    // Legacy tolerance: the manifest's backend.appId slot alone still names
    // the related app (without display metadata).
    const backendAppId = readBackendAppId(parsed)
    return backendAppId === undefined ? undefined : { appId: backendAppId }
  }
  const link = normalizeLink(deploy)
  return link ?? undefined
}

/**
 * Merge a linkage patch into a raw manifest string and serialize the result.
 * Sections the file already carries are preserved; `backend.appId` is kept in
 * sync with the patched app id.
 * @returns the new manifest text.
 */
export function mergeDeployLink(
  raw: string | undefined,
  patch: Partial<DeployAppConfigLink>,
): string {
  let config: Record<string, unknown> = {}
  if (raw !== undefined && raw.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) {
        config = parsed as Record<string, unknown>
      }
    } catch {
      // Unparsable manifest: the rewrite starts fresh rather than failing the flow.
    }
  }
  const existing = normalizeLink(config['deploy']) ?? { appId: readBackendAppId(config) ?? '' }
  const merged: DeployAppConfigLink = {
    ...existing,
    ...compact(patch),
    appId: patch.appId ?? existing.appId,
    updatedAt: new Date().toISOString(),
  }
  const backend =
    typeof config['backend'] === 'object' && config['backend'] !== null
      ? (config['backend'] as Record<string, unknown>)
      : {}
  config['backend'] = { ...backend, appId: merged.appId }
  config['deploy'] = merged
  return `${JSON.stringify(config, null, 2)}\n`
}

/** Read the manifest's `backend.appId` slot (legacy linkage home). */
function readBackendAppId(config: Record<string, unknown>): string | undefined {
  const backend = config['backend']
  if (typeof backend !== 'object' || backend === null) return undefined
  const appId = (backend as Record<string, unknown>)['appId']
  return typeof appId === 'string' && appId.trim() !== '' ? appId.trim() : undefined
}

/** Normalize a candidate linkage object: keep it only when it names an app. */
function normalizeLink(candidate: unknown): DeployAppConfigLink | undefined {
  if (typeof candidate !== 'object' || candidate === null) return undefined
  const record = candidate as Record<string, unknown>
  const appId = record['appId']
  if (typeof appId !== 'string' || appId.trim() === '') return undefined
  const link: DeployAppConfigLink = { appId: appId.trim() }
  for (const key of [
    'appName',
    'appSlug',
    'templateId',
    'templateKey',
    'templateName',
    'sourceDirectory',
    'updatedAt',
  ] as const) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') {
      link[key] = value.trim()
    }
  }
  return link
}

/** Drop undefined/blank values so a patch only carries what it states. */
function compact(patch: Partial<DeployAppConfigLink>): Partial<DeployAppConfigLink> {
  const out: Partial<DeployAppConfigLink> = {}
  for (const [key, value] of Object.entries(patch) as [keyof DeployAppConfigLink, string | undefined][]) {
    if (value !== undefined && value.trim() !== '') {
      out[key] = value.trim() as never
    }
  }
  return out
}

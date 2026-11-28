/**
 * Route paths and wire payloads shared verbatim by the Host installer and the
 * browser skills page (`@deepseek-ai/dsh-client-ui-sdkwork-markets`), published
 * as the `./shared` subpath. Browser-safe: constants and types only.
 *
 * Every route carries the absolute pathname the Host registers beside the
 * document-relative form the browser addresses.
 */

/** Prefix every installer route lives under. */
export const SKILLHUB_API_PREFIX = '/sdkwork-skillhub/api'

/** GET: the local install ledger plus whatever the roots actually hold. */
export const SKILLHUB_INSTALLED_PATH = `${SKILLHUB_API_PREFIX}/installed`

/** Browser-relative form of {@link SKILLHUB_INSTALLED_PATH}. */
export const SKILLHUB_INSTALLED_ROUTE = SKILLHUB_INSTALLED_PATH.slice(1)

/** POST: install one catalog skill (optionally a pinned version) into the skill root. */
export const SKILLHUB_INSTALL_PATH = `${SKILLHUB_API_PREFIX}/install`

/** Browser-relative form of {@link SKILLHUB_INSTALL_PATH}. */
export const SKILLHUB_INSTALL_ROUTE = SKILLHUB_INSTALL_PATH.slice(1)

/** POST: remove an installed skill from both roots. */
export const SKILLHUB_UNINSTALL_PATH = `${SKILLHUB_API_PREFIX}/uninstall`

/** Browser-relative form of {@link SKILLHUB_UNINSTALL_PATH}. */
export const SKILLHUB_UNINSTALL_ROUTE = SKILLHUB_UNINSTALL_PATH.slice(1)

/** POST: move an installed skill between the enabled and disabled roots. */
export const SKILLHUB_ENABLED_PATH = `${SKILLHUB_API_PREFIX}/enabled`

/** Browser-relative form of {@link SKILLHUB_ENABLED_PATH}. */
export const SKILLHUB_ENABLED_ROUTE = SKILLHUB_ENABLED_PATH.slice(1)

/** GET: upstream detail — versions, files and security reports — for one skill. */
export const SKILLHUB_DETAIL_PATH = `${SKILLHUB_API_PREFIX}/detail`

/** Browser-relative form of {@link SKILLHUB_DETAIL_PATH}. */
export const SKILLHUB_DETAIL_ROUTE = SKILLHUB_DETAIL_PATH.slice(1)

/** Stable error codes the browser maps to localized copy. */
export type SkillhubErrorCode =
  | 'invalid-request'
  | 'not-found'
  | 'unsupported-coordinate'
  | 'unavailable'
  | 'checksum'
  | 'install-failed'
  | 'forbidden'

/** One security report a SkillHub vendor published for a version. */
export interface SkillhubSecurityReport {
  /** Vendor key (`keen`, `sanbu`, …). */
  readonly vendor: string
  /** Upstream status token (`benign`, …). */
  readonly status: string
  /** Localized status sentence from the vendor. */
  readonly statusText: string
  /** Report page, when the vendor published one. */
  readonly reportUrl?: string
}

/** One published version of a skill. */
export interface SkillhubVersionInfo {
  readonly version: string
  readonly changelog: string
  readonly createdAt: string
  readonly security: readonly SkillhubSecurityReport[]
}

/** One file of a version's file list. */
export interface SkillhubFileInfo {
  readonly path: string
  readonly size: number
  readonly sha256: string
}

/** An installed skill, as the ledger and the roots describe it. */
export interface SkillhubInstalledSkill {
  /** Stable directory id: `<namespace>--<slug>`. */
  readonly id: string
  readonly namespace: string
  readonly slug: string
  /** Package key the catalog page sent, when the install ran through a route. */
  readonly packageKey: string
  readonly version: string
  /** Whether the directory currently sits in the enabled skill root. */
  readonly enabled: boolean
  /** Absolute directory holding the installed files. */
  readonly directory: string
  readonly files: number
  readonly bytes: number
  readonly installedAt: string
}

/** GET installed response. */
export interface SkillhubInstalledPayload {
  readonly skills: readonly SkillhubInstalledSkill[]
}

/** Install request body. */
export interface SkillhubInstallPayload {
  /** Catalog package key (`skillhub.<handle>.<slug>`). */
  readonly packageKey: string
  /** Exact version to install; omitted installs the current latest. */
  readonly version?: string
}

/** Install response body. */
export interface SkillhubInstallResult {
  readonly skill: SkillhubInstalledSkill
  /** New skills are usable from the next session, matching the SkillHub market. */
  readonly restartRequired: boolean
}

/** Uninstall request body. */
export interface SkillhubUninstallPayload {
  readonly packageKey: string
}

/** Uninstall response body. */
export interface SkillhubUninstallResult {
  readonly removed: boolean
}

/** Enable/disable request body. */
export interface SkillhubEnabledPayload {
  readonly packageKey: string
  readonly enabled: boolean
}

/** Enable/disable response body. */
export interface SkillhubEnabledResult {
  readonly skill: SkillhubInstalledSkill
}

/** Detail request (GET query parameters). */
export interface SkillhubDetailPayload {
  readonly packageKey: string
  /** Version whose file list is reported; omitted reports the latest. */
  readonly version?: string
}

/** Detail response body. */
export interface SkillhubDetail {
  readonly namespace: string
  readonly slug: string
  readonly name: string
  readonly summary: string
  /** Version whose file list is reported. */
  readonly version: string
  readonly files: readonly SkillhubFileInfo[]
  readonly versions: readonly SkillhubVersionInfo[]
}

/** Error body every route returns on failure. */
export interface SkillhubErrorPayload {
  readonly code: SkillhubErrorCode
  readonly message: string
}

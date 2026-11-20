/**
 * The access-token login configuration contract shared by the plugin's Host and
 * browser halves.
 *
 * This is a standard DSH settings section (entry id `ui-sdkwork-access-token`)
 * and its projection: the settings document persisted by the Host settings
 * service under `$DSH_HOME`, and `<DSH_HOME>/sdkwork/access-token.config.json`,
 * the file an operator or a sibling tool reads. No file is written inside an
 * application repository.
 *
 * The module is deliberately platform-free: no `node:` import and no DOM, so
 * both compiler faces and the browser bundle can read it.
 */

/** Settings namespace; also this plugin's profile entry id. */
export const ACCESS_TOKEN_NAMESPACE = 'ui-sdkwork-access-token'

/** Page global carrying the resolved projection target. */
export const ACCESS_TOKEN_CONFIG_FILE_GLOBAL = '__DSH_SDKWORK_ACCESS_TOKEN_CONFIG__'

/** Directory under the harness home that holds SDKWork projections. */
export const ACCESS_TOKEN_CONFIG_DIRECTORY = 'sdkwork'

/** File name of the operator-readable login configuration. */
export const ACCESS_TOKEN_CONFIG_FILE_NAME = 'access-token.config.json'

/** Document kind, so a reader can identify the file. */
export const ACCESS_TOKEN_CONFIG_FILE_KIND = 'sdkwork.access-token-config'

/** Schema version of the projected document. */
export const ACCESS_TOKEN_CONFIG_FILE_SCHEMA_VERSION = '1.0.0'

/** Settings field carrying the remembered logins. */
export const ACCOUNTS_FIELD = 'accounts'

/** One remembered login. It is operator-grade private material, never committed. */
export interface SdkworkAccessTokenAccount {
  /** Absolute project directory the login belongs to. */
  project: string
  /** Account username or e-mail. */
  username: string
  /** Account password, stored only inside the harness home. */
  password: string
  /** Gateway origin used by the login. */
  baseUrl: string
  /** Public bootstrap token presented as the credential-entry `Access-Token`. */
  bootstrapAccessToken: string
  /** Lifecycle preselected for the exchange. */
  environment: string
  /** When this row was last written (ISO 8601). */
  updatedAt: string
}

/** The durable settings section. */
export interface SdkworkAccessTokenSettings {
  /** Remembered logins, newest write last. */
  [ACCOUNTS_FIELD]: SdkworkAccessTokenAccount[]
}

/** The section's initial value. */
export const DEFAULT_ACCESS_TOKEN_SETTINGS: SdkworkAccessTokenSettings = { [ACCOUNTS_FIELD]: [] }

/** Projection document shape. */
export interface SdkworkAccessTokenConfigDocument {
  schemaVersion: string
  kind: string
  updatedAt: string
  accounts: SdkworkAccessTokenAccount[]
}

/** One resolved projection target. */
export interface AccessTokenConfigFileTarget {
  /** Directory the document is written to. */
  directory: string
  /** File name inside {@link directory}. */
  fileName: string
  /** Absolute path of the document. */
  path: string
}

/** The login facts the signed dialog consumes, independent of persistence. */
export interface SdkworkAccessTokenPrefill {
  username: string
  password: string
  baseUrl: string
  bootstrapAccessToken: string
  environment: string
}

/** One login the dialog asks the Host section to remember. */
export interface SaveAccessTokenCredentialsInput {
  username: string
  password: string
  baseUrl: string
  bootstrapAccessToken: string
  environment: string
}

/** Result of remembering one login. */
export interface SavedAccessTokenCredentials {
  /** Absolute projection path, as the Host published it. */
  path: string
  /** Whether the section changed. */
  status: 'written' | 'unchanged'
}

/**
 * Identity key of one project directory.
 *
 * Windows paths are case-insensitive and may come with either separator, so a
 * Windows path is normalized to lower-case forward slashes; a POSIX path keeps
 * its case (two distinct directories may differ only in case).
 * @param project - absolute project directory.
 * @returns the comparison key.
 */
export function projectKeyOf(project: string): string {
  const normalized = project.trim().replace(/\\/gu, '/').replace(/\/+$/u, '')
  return normalized.includes(':') || project.includes('\\') ? normalized.toLowerCase() : normalized
}

/**
 * Find the remembered login of one project.
 * @param accounts - remembered logins.
 * @param project - absolute project directory.
 * @returns the matching row, or undefined.
 */
export function findAccessTokenAccount(
  accounts: readonly SdkworkAccessTokenAccount[], project: string,
): SdkworkAccessTokenAccount | undefined {
  const key = projectKeyOf(project)
  return accounts.find(account => projectKeyOf(account.project) === key)
}

/** Whether two rows carry the same persisted facts. */
function sameAccount(left: SdkworkAccessTokenAccount, right: SdkworkAccessTokenAccount): boolean {
  return left.project === right.project
    && left.username === right.username
    && left.password === right.password
    && left.baseUrl === right.baseUrl
    && left.bootstrapAccessToken === right.bootstrapAccessToken
    && left.environment === right.environment
}

/**
 * Insert or replace one project's login.
 * @param accounts - current rows.
 * @param account - the row to persist.
 * @returns the next rows and whether anything changed.
 */
export function upsertAccessTokenAccount(
  accounts: readonly SdkworkAccessTokenAccount[],
  account: SdkworkAccessTokenAccount,
): { accounts: SdkworkAccessTokenAccount[]; status: 'written' | 'unchanged' } {
  const key = projectKeyOf(account.project)
  const index = accounts.findIndex(candidate => projectKeyOf(candidate.project) === key)
  if (index >= 0) {
    const existing = accounts[index] as SdkworkAccessTokenAccount
    if (sameAccount(existing, account)) return { accounts: [...accounts], status: 'unchanged' }
    const next = [...accounts]
    next[index] = account
    return { accounts: next, status: 'written' }
  }
  return { accounts: [...accounts, account], status: 'written' }
}

/**
 * Project the settings section into the operator-readable document.
 * @param settings - current section value.
 * @param updatedAt - document write instant (ISO 8601).
 * @returns the projection document.
 */
export function projectAccessTokenConfigDocument(
  settings: SdkworkAccessTokenSettings,
  updatedAt: string,
): SdkworkAccessTokenConfigDocument {
  return {
    schemaVersion: ACCESS_TOKEN_CONFIG_FILE_SCHEMA_VERSION,
    kind: ACCESS_TOKEN_CONFIG_FILE_KIND,
    updatedAt,
    accounts: settings[ACCOUNTS_FIELD],
  }
}

/**
 * Serialize the projection document deterministically.
 * @param document - projection document.
 * @returns formatted JSON with a trailing newline.
 */
export function serializeAccessTokenConfigDocument(document: SdkworkAccessTokenConfigDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`
}

/**
 * Read the projection path out of the page global the Host published.
 * @param value - the global's value.
 * @returns the absolute path, or the empty string when the payload is unusable.
 */
export function decodeAccessTokenConfigPath(value: unknown): string {
  if (typeof value !== 'object' || value === null) return ''
  const path = (value as { path?: unknown }).path
  return typeof path === 'string' ? path : ''
}

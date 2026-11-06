/**
 * Mini-program account transport over the IAM backend OAuth API.
 *
 * The wire rows are `iam_oauth_resource_account` records with
 * `resourceAccountKind = "mini_program"`. Creating one also reuses or creates
 * the matching `wechat_mini_program` login integration, exactly as the
 * sdkwork-iam PC admin mini-program page does, so a saved account is usable for
 * mini-program login immediately. Field readers tolerate the generated SDK's
 * camelCase rows and the backend's snake_case spellings.
 */

/** Provider code of the WeChat mini-program login integration. */
export const MINI_PROGRAM_PROVIDER_CODE = 'wechat_mini_program'

/** Resource account kind stored for a mini-program account. */
export const MINI_PROGRAM_ACCOUNT_KIND = 'mini_program'

/** One mini-program account as the dialog renders it. */
export interface MiniProgramAccount {
  /** Resource account row id. */
  id: string
  /** WeChat mini-program AppID (`providerAccountId`). */
  appId: string
  /** Operator-facing display name. */
  displayName: string
  /** Whether the account and its login integration are enabled. */
  enabled: boolean
  /** Login integration the account belongs to, when the row carries one. */
  integrationId?: string
  /** Wire timestamps, when the row carries them. */
  createdAt?: string
  updatedAt?: string
}

/** Draft of one new mini-program account. */
export interface MiniProgramDraft {
  appId: string
  appSecret: string
  displayName: string
  enabled: boolean
}

/** Editable fields of an existing mini-program account. */
export interface MiniProgramEdit {
  displayName: string
  /** New AppID; blank keeps the stored one. */
  appId?: string
  /** New AppSecret; blank keeps the stored one. */
  appSecret?: string
}

/** The generated-backend slice this module calls (tests bind a double). */
export interface MiniProgramOauthPort {
  resourceAccounts: {
    list(params?: { page?: number; pageSize?: number; q?: string }): Promise<{ items: Record<string, unknown>[] }>
    create(body: Record<string, unknown>): Promise<Record<string, unknown>>
    update(resourceAccountId: string, body?: Record<string, unknown>): Promise<Record<string, unknown>>
    delete(resourceAccountId: string): Promise<void>
    miniProgramLoginChecks: {
      create(resourceAccountId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>
    }
  }
  integrations: {
    list(params?: { page?: number; pageSize?: number; q?: string }): Promise<{ items: Record<string, unknown>[] }>
    create(body: Record<string, unknown>): Promise<Record<string, unknown>>
    update(integrationId: string, body?: Record<string, unknown>): Promise<Record<string, unknown>>
  }
}

/** The backend client shape this module consumes. */
export interface MiniProgramBackend {
  iamOauth: {
    iam: {
      oauth: MiniProgramOauthPort
    }
  }
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') return value
    // The backend stores `enabled` as a PostgreSQL INTEGER on these tables.
    if (value === 0 || value === 1) return value === 1
  }
  return undefined
}

/** The generated row id of a resource account. */
function readAccountId(record: Record<string, unknown>): string | undefined {
  return readString(record, 'id', 'resourceAccountId', 'resource_account_id')
}

/** The generated row id of a login integration. */
function readIntegrationId(record: Record<string, unknown>): string | undefined {
  return readString(record, 'id', 'integrationId', 'integration_id')
}

/** The provider AppID of a resource account or integration row. */
function readAppId(record: Record<string, unknown>): string | undefined {
  return readString(
    record,
    'providerAccountId',
    'provider_account_id',
    'providerClientId',
    'provider_client_id',
  )
}

/** The provider code of a resource account or integration row. */
function readProviderCode(record: Record<string, unknown>): string | undefined {
  return readString(record, 'providerCode', 'provider_code')
}

/** The account kind of a resource account row. */
function readAccountKind(record: Record<string, unknown>): string | undefined {
  return readString(record, 'resourceAccountKind', 'resource_account_kind')
}

/**
 * Project one backend row into the dialog model.
 * @param value - one resource account row.
 * @returns the account, or undefined when the row is not a mini-program account
 * or carries no id/AppID.
 */
export function toMiniProgramAccount(value: unknown): MiniProgramAccount | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const kind = readAccountKind(record)
  const providerCode = readProviderCode(record)
  const isMiniProgram = kind === MINI_PROGRAM_ACCOUNT_KIND || providerCode === MINI_PROGRAM_PROVIDER_CODE
  if (!isMiniProgram) return undefined
  const id = readAccountId(record)
  const appId = readAppId(record)
  if (id === undefined || appId === undefined) return undefined
  const displayName = readString(record, 'displayName', 'display_name') ?? appId
  const integrationId = readString(record, 'integrationId', 'integration_id')
  const createdAt = readString(record, 'createdAt', 'created_at')
  const updatedAt = readString(record, 'updatedAt', 'updated_at')
  const status = readString(record, 'status')
  // Rows without an `enabled` column express their lifecycle through `status`.
  const enabled = readBoolean(record, 'enabled', 'is_enabled')
    ?? (status === 'active' ? true : status === 'inactive' ? false : true)
  return {
    id,
    appId,
    displayName,
    enabled,
    ...(integrationId === undefined ? {} : { integrationId }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  }
}

/**
 * Project a page of resource-account rows, dropping non-mini-program rows.
 * @param items - the backend page's items.
 * @returns the mini-program accounts in page order.
 */
export function toMiniProgramAccounts(items: readonly unknown[]): MiniProgramAccount[] {
  const accounts: MiniProgramAccount[] = []
  for (const item of items) {
    const account = toMiniProgramAccount(item)
    if (account !== undefined) accounts.push(account)
  }
  return accounts
}

/**
 * List the mini-program accounts of the current tenant.
 *
 * The backend list has no kind filter, so one bounded page is read and the
 * mini-program rows are projected out. A tenant with more than 200 resource
 * accounts needs the cursor page; the dialog's README records that limit.
 * @param backend - the IAM backend client.
 * @returns the mini-program accounts.
 */
export async function listMiniProgramAccounts(backend: MiniProgramBackend): Promise<MiniProgramAccount[]> {
  const page = await backend.iamOauth.iam.oauth.resourceAccounts.list({ pageSize: 200 })
  return toMiniProgramAccounts(page.items)
}

/**
 * Create one mini-program account, reusing the matching login integration when
 * it already exists (or creating it) exactly as the sdkwork-iam admin surface
 * does.
 * @param backend - the IAM backend client.
 * @param draft - the validated account draft.
 * @returns the created account.
 * @throws when the integration or account row cannot be created, or when an
 * account with the same AppID already exists.
 */
export async function createMiniProgramAccount(
  backend: MiniProgramBackend,
  draft: MiniProgramDraft,
): Promise<MiniProgramAccount> {
  const oauth = backend.iamOauth.iam.oauth
  const appId = draft.appId.trim()
  const appSecret = draft.appSecret.trim()
  const displayName = draft.displayName.trim()

  const integrations = await oauth.integrations.list({ pageSize: 200, q: MINI_PROGRAM_PROVIDER_CODE })
  const existingIntegration = integrations.items.find(row =>
    readProviderCode(row) === MINI_PROGRAM_PROVIDER_CODE && readAppId(row) === appId)
  let integrationId = existingIntegration === undefined ? undefined : readIntegrationId(existingIntegration)

  if (integrationId === undefined) {
    const created = await oauth.integrations.create({
      integrationCode: `mini-program-${appId}`,
      displayName,
      providerCode: MINI_PROGRAM_PROVIDER_CODE,
      providerClientId: appId,
      providerClientSecret: appSecret,
      redirectUri: '',
      surfaceKind: MINI_PROGRAM_ACCOUNT_KIND,
      enabled: draft.enabled,
    })
    integrationId = readIntegrationId(created)
    if (integrationId === undefined) {
      throw new Error('iam-mini-program: the created login integration carried no id')
    }
  } else {
    // The integration may have been created by another surface; make its
    // enabled state follow this account, as the admin page does.
    await oauth.integrations.update(integrationId, { enabled: draft.enabled })
  }

  const existingAccounts = await oauth.resourceAccounts.list({ pageSize: 200, q: appId })
  const duplicate = existingAccounts.items.find(row =>
    readProviderCode(row) === MINI_PROGRAM_PROVIDER_CODE && readAppId(row) === appId)
  if (duplicate !== undefined) {
    throw new Error(`A mini program with AppID ${appId} already exists`)
  }

  const created = await oauth.resourceAccounts.create({
    integrationId,
    providerCode: MINI_PROGRAM_PROVIDER_CODE,
    resourceAccountCode: `mini-${appId}`,
    resourceAccountKind: MINI_PROGRAM_ACCOUNT_KIND,
    displayName,
    providerAccountId: appId,
    accessMode: 'operator_managed',
    enabled: draft.enabled,
  })
  const account = toMiniProgramAccount({ ...created, integrationId, resourceAccountKind: MINI_PROGRAM_ACCOUNT_KIND })
  if (account === undefined) {
    throw new Error('iam-mini-program: the created account carried no id or AppID')
  }
  return account
}

/**
 * Turn one account and its login integration on or off.
 * @param backend - the IAM backend client.
 * @param account - the account row.
 * @param enabled - the desired state.
 */
export async function setMiniProgramEnabled(
  backend: MiniProgramBackend,
  account: MiniProgramAccount,
  enabled: boolean,
): Promise<void> {
  const oauth = backend.iamOauth.iam.oauth
  await oauth.resourceAccounts.update(account.id, { enabled })
  if (account.integrationId !== undefined) {
    await oauth.integrations.update(account.integrationId, { enabled })
  }
}

/**
 * Delete one account row. The shared login integration is left in place, which
 * is the admin surface's own rule ("only the account row is removed").
 * @param backend - the IAM backend client.
 * @param accountId - the resource account id.
 */
export async function deleteMiniProgramAccount(backend: MiniProgramBackend, accountId: string): Promise<void> {
  await backend.iamOauth.iam.oauth.resourceAccounts.delete(accountId)
}

/**
 * Queue the backend's mini-program login check for one account.
 * @param backend - the IAM backend client.
 * @param accountId - the resource account id.
 */
export async function queueMiniProgramLoginCheck(
  backend: MiniProgramBackend,
  accountId: string,
): Promise<void> {
  await backend.iamOauth.iam.oauth.resourceAccounts.miniProgramLoginChecks.create(accountId, {})
}

/**
 * Update an account's display name and, when supplied, its AppID/AppSecret.
 * The backend cascades a changed AppID and AppSecret to the linked OAuth client.
 * @param backend - the IAM backend client.
 * @param account - the account being edited.
 * @param edit - the validated edit fields.
 */
export async function updateMiniProgramAccount(
  backend: MiniProgramBackend,
  account: MiniProgramAccount,
  edit: MiniProgramEdit,
): Promise<void> {
  const oauth = backend.iamOauth.iam.oauth
  const displayName = edit.displayName.trim()
  const patch: Record<string, unknown> = { displayName }
  const appId = edit.appId?.trim()
  if (appId !== undefined && appId !== '') patch.providerAccountId = appId
  const appSecret = edit.appSecret?.trim()
  if (appSecret !== undefined && appSecret !== '') patch.providerClientSecret = appSecret
  await oauth.resourceAccounts.update(account.id, patch)
  if (account.integrationId !== undefined) {
    await oauth.integrations.update(account.integrationId, { displayName })
  }
}

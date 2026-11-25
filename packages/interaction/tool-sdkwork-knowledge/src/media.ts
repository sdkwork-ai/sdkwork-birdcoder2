/**
 * Host-side media adapters for Facebook, X and Douyin.
 *
 * These three platforms publish over their official HTTP APIs, which the app's
 * Host process can call directly: the browser cannot (CORS, secret handling) and
 * the Knowledge Base backend has no adapter for them. Accounts and their
 * credentials are operator configuration, not model input: the account file
 * names the token's environment variable, and the token itself never enters a
 * tool argument, a result, or a log.
 *
 * Toutiao and Xiaohongshu have no public creator-publishing API for this
 * deployment, so they are reported by the capability matrix and never reach an
 * adapter.
 *
 * @module @deepseek-ai/dsh-tool-sdkwork-knowledge/media
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { HostMediaPlatform } from './types.ts'
import { HOST_MEDIA_PLATFORMS } from './types.ts'

/** One operator-configured account a Host adapter can publish with. */
export interface HostMediaAccount {
  /** Stable id the tool addresses. */
  readonly id: string
  /** Platform adapter this account uses. */
  readonly platform: HostMediaPlatform
  /** Display name shown in the account list. */
  readonly name: string
  /** Facebook Page id. */
  readonly pageId?: string
  /** Douyin open id from the platform authorization. */
  readonly openId?: string
  /** Inline token; prefer {@link accessTokenEnv} so the file carries no secret. */
  readonly accessToken?: string
  /** Environment variable holding the token. */
  readonly accessTokenEnv?: string
  /** API base override for tests or a regional gateway. */
  readonly apiBaseUrl?: string
}

/** One publish payload the adapters consume. */
export interface MediaPublishPayload {
  /** Post or caption text. */
  readonly text: string
  /** Article title, when the platform distinguishes one. */
  readonly title?: string
  /** Link a Facebook feed post should attach. */
  readonly link?: string
  /** Local image paths; the first supported one is uploaded. */
  readonly imagePaths?: readonly string[]
  /** Local video path. */
  readonly videoPath?: string
}

/** Dependencies an adapter borrows, so tests can inject a mock transport. */
export interface MediaAdapterDeps {
  /** HTTP transport; defaults to the process `fetch`. */
  readonly fetch: typeof fetch
  /** File reader; defaults to `node:fs/promises` `readFile`. */
  readonly readFile: typeof readFile
}

/** The default adapter dependencies. */
export const DEFAULT_MEDIA_DEPS: MediaAdapterDeps = { fetch, readFile }

/** A publish failure with a stable code the tool reports. */
export class MediaPublishError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'MediaPublishError'
  }
}

/** One adapter's accepted publish. */
export interface AdapterReceipt {
  /** Platform post, photo, video or item ids. */
  readonly remoteIds: string[]
  /** Platform status token. */
  readonly status: string
  /** Operator-facing detail. */
  readonly message: string
}

/**
 * Resolve the account file path: `SDKWORK_MEDIA_ACCOUNTS_FILE`, else
 * `$DSH_HOME/media-accounts.json`.
 * @param env - process environment to read.
 * @returns the configured or default path.
 */
export function mediaAccountsPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.SDKWORK_MEDIA_ACCOUNTS_FILE?.trim() ?? ''
  if (explicit !== '') return explicit
  const home = env.DSH_HOME?.trim() ?? ''
  return join(home === '' ? join(homedir(), '.birdcoder') : home, 'media-accounts.json')
}

/**
 * Load and validate the operator's media accounts. A missing file means no Host
 * account is configured; a malformed file is an error, because a typo must not
 * read as "no account".
 * @param env - environment supplying the path and token values.
 * @returns the validated accounts.
 * @throws MediaPublishError when the file is malformed.
 */
export async function loadMediaAccounts(env: NodeJS.ProcessEnv = process.env): Promise<HostMediaAccount[]> {
  const path = mediaAccountsPath(env)
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if (isNotFound(error)) return []
    throw new MediaPublishError('ACCOUNT_FILE_UNREADABLE', `Could not read the media account file ${path}: ${messageOf(error)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new MediaPublishError('ACCOUNT_FILE_INVALID', `The media account file ${path} is not valid JSON.`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new MediaPublishError('ACCOUNT_FILE_INVALID', `The media account file ${path} must contain an object.`)
  }
  const entries = 'accounts' in parsed && Array.isArray(parsed.accounts) ? parsed.accounts : []
  const accounts: HostMediaAccount[] = []
  for (const entry of entries) accounts.push(validateAccount(entry, path))
  return accounts
}

/** Validate one account entry. */
function validateAccount(entry: unknown, path: string): HostMediaAccount {
  if (typeof entry !== 'object' || entry === null) {
    throw new MediaPublishError('ACCOUNT_FILE_INVALID', `${path}: every account must be an object.`)
  }
  const row = entry as Record<string, unknown>
  const id = textField(row, 'id')
  const name = textField(row, 'name')
  const platform = row.platform
  if (id === undefined || name === undefined) {
    throw new MediaPublishError('ACCOUNT_FILE_INVALID', `${path}: every account needs a non-empty id and name.`)
  }
  if (typeof platform !== 'string' || !(HOST_MEDIA_PLATFORMS as readonly string[]).includes(platform)) {
    throw new MediaPublishError('ACCOUNT_FILE_INVALID', `${path}: account ${id} names an unsupported platform.`)
  }
  const resolved = platform as HostMediaPlatform
  const pageId = textField(row, 'pageId')
  const openId = textField(row, 'openId')
  const accessToken = textField(row, 'accessToken')
  const accessTokenEnv = textField(row, 'accessTokenEnv')
  const apiBaseUrl = textField(row, 'apiBaseUrl')
  const account: HostMediaAccount = {
    id,
    name,
    platform: resolved,
    ...(pageId === undefined ? {} : { pageId }),
    ...(openId === undefined ? {} : { openId }),
    ...(accessToken === undefined ? {} : { accessToken }),
    ...(accessTokenEnv === undefined ? {} : { accessTokenEnv }),
    ...(apiBaseUrl === undefined ? {} : { apiBaseUrl }),
  }
  if (resolved === 'facebook' && account.pageId === undefined) {
    throw new MediaPublishError('ACCOUNT_FILE_INVALID', `${path}: Facebook account ${id} needs a pageId.`)
  }
  if (resolved === 'douyin' && account.openId === undefined) {
    throw new MediaPublishError('ACCOUNT_FILE_INVALID', `${path}: Douyin account ${id} needs an openId.`)
  }
  return account
}

/** Read one required non-empty string field. */
function textField(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Publish one payload to a configured account.
 * @param account - the selected account.
 * @param payload - text, link, image or video to publish.
 * @param env - environment that may hold the token.
 * @param deps - transport and file reader.
 * @returns the platform ids and status.
 * @throws MediaPublishError for missing credentials, unsupported content, or a platform rejection.
 */
export async function publishToHostPlatform(
  account: HostMediaAccount,
  payload: MediaPublishPayload,
  env: NodeJS.ProcessEnv = process.env,
  deps: MediaAdapterDeps = DEFAULT_MEDIA_DEPS,
): Promise<AdapterReceipt> {
  switch (account.platform) {
    case 'facebook':
      return publishFacebook(account, payload, env, deps)
    case 'twitter':
      return publishTwitter(account, payload, env, deps)
    case 'douyin':
      return publishDouyin(account, payload, env, deps)
    default: {
      const platform: never = account.platform
      throw new MediaPublishError('PLATFORM_NOT_CONFIGURED', `No Host adapter for ${String(platform)}.`)
    }
  }
}

/** Resolve the bearer token without exposing it in an error message. */
function resolveToken(account: HostMediaAccount, env: NodeJS.ProcessEnv): string {
  const inline = account.accessToken?.trim() ?? ''
  if (inline !== '') return inline
  const name = account.accessTokenEnv?.trim() ?? ''
  const fromEnv = name === '' ? '' : env[name]?.trim() ?? ''
  if (fromEnv === '') {
    throw new MediaPublishError(
      'MISSING_CREDENTIAL',
      `${account.platform} account ${account.id} has no access token: set ${name === '' ? 'accessTokenEnv' : name}.`,
    )
  }
  return fromEnv
}

/** Publish to a Facebook Page: a feed post, one photo, or one video. */
async function publishFacebook(
  account: HostMediaAccount,
  payload: MediaPublishPayload,
  env: NodeJS.ProcessEnv,
  deps: MediaAdapterDeps,
): Promise<AdapterReceipt> {
  const token = resolveToken(account, env)
  const pageId = account.pageId ?? ''
  const base = account.apiBaseUrl ?? 'https://graph.facebook.com/v21.0'
  const text = requireText(payload.text, 'facebook')
  if (payload.videoPath !== undefined && payload.videoPath !== '') {
    const form = new FormData()
    form.append('source', await fileBlob(payload.videoPath, deps), basename(payload.videoPath))
    form.append('description', text)
    form.append('access_token', token)
    const response = await deps.fetch(`${base}/${encodeURIComponent(pageId)}/videos`, { method: 'POST', body: form })
    const body = await readJson(response, 'facebook')
    return { remoteIds: [stringField(body, 'id') ?? ''], status: 'published', message: 'Video uploaded to the Page.' }
  }
  const firstImage = (payload.imagePaths ?? []).find(path => path.trim() !== '')
  if (firstImage !== undefined) {
    const form = new FormData()
    form.append('source', await fileBlob(firstImage, deps), basename(firstImage))
    form.append('message', text)
    form.append('access_token', token)
    const response = await deps.fetch(`${base}/${encodeURIComponent(pageId)}/photos`, { method: 'POST', body: form })
    const body = await readJson(response, 'facebook')
    return { remoteIds: [stringField(body, 'post_id') ?? stringField(body, 'id') ?? ''], status: 'published', message: 'Photo uploaded to the Page.' }
  }
  const form = new URLSearchParams()
  form.set('message', text)
  if (payload.link !== undefined && payload.link.trim() !== '') form.set('link', payload.link.trim())
  form.set('access_token', token)
  const response = await deps.fetch(`${base}/${encodeURIComponent(pageId)}/feed`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  const body = await readJson(response, 'facebook')
  return { remoteIds: [stringField(body, 'id') ?? ''], status: 'published', message: 'Posted to the Page feed.' }
}

/** Publish one text post to X. */
async function publishTwitter(
  account: HostMediaAccount,
  payload: MediaPublishPayload,
  env: NodeJS.ProcessEnv,
  deps: MediaAdapterDeps,
): Promise<AdapterReceipt> {
  const token = resolveToken(account, env)
  const text = requireText(payload.text, 'twitter')
  if (Array.from(text).length > 280) {
    throw new MediaPublishError('TEXT_TOO_LONG', 'An X post is limited to 280 characters on the standard tier.')
  }
  if ((payload.imagePaths ?? []).some(path => path.trim() !== '') || (payload.videoPath ?? '').trim() !== '') {
    throw new MediaPublishError('MEDIA_UNSUPPORTED', 'This X adapter publishes text only; attach media in X itself or add an OAuth 1.0a media adapter.')
  }
  const base = account.apiBaseUrl ?? 'https://api.x.com'
  const response = await deps.fetch(`${base}/2/tweets`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const body = await readJson(response, 'twitter')
  const data = objectField(body, 'data')
  return { remoteIds: [stringField(data, 'id') ?? ''], status: 'published', message: 'Post created on X.' }
}

/** Upload a video to Douyin and create the post. */
async function publishDouyin(
  account: HostMediaAccount,
  payload: MediaPublishPayload,
  env: NodeJS.ProcessEnv,
  deps: MediaAdapterDeps,
): Promise<AdapterReceipt> {
  const token = resolveToken(account, env)
  const openId = account.openId ?? ''
  const videoPath = payload.videoPath?.trim() ?? ''
  if (videoPath === '') {
    throw new MediaPublishError('VIDEO_REQUIRED', 'Douyin publishes short videos; pass a local videoPath.')
  }
  const base = account.apiBaseUrl ?? 'https://open.douyin.com'
  const query = `open_id=${encodeURIComponent(openId)}&access_token=${encodeURIComponent(token)}`
  const uploadForm = new FormData()
  uploadForm.append('video', await fileBlob(videoPath, deps), basename(videoPath))
  const uploadResponse = await deps.fetch(`${base}/api/douyin/v1/video/upload_video/?${query}`, {
    method: 'POST',
    body: uploadForm,
  })
  const uploaded = await readJson(uploadResponse, 'douyin')
  const uploadData = objectField(uploaded, 'data')
  const video = objectField(uploadData, 'video')
  const videoId = stringField(video, 'video_id') ?? stringField(video, 'videoId')
  if (videoId === undefined || videoId === '') {
    throw new MediaPublishError('UPLOAD_FAILED', 'Douyin did not return a video id for the uploaded file.')
  }
  const createResponse = await deps.fetch(`${base}/api/douyin/v1/video/create_video/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      open_id: openId,
      access_token: token,
      video_id: videoId,
      text: payload.text.trim(),
    }),
  })
  const created = await readJson(createResponse, 'douyin')
  const createdData = objectField(created, 'data')
  return {
    remoteIds: [stringField(createdData, 'item_id') ?? videoId],
    status: 'submitted',
    message: 'Video uploaded and the Douyin post was created; Douyin owns review.',
  }
}

/** Read a local file as a Blob for multipart upload. */
async function fileBlob(path: string, deps: MediaAdapterDeps): Promise<Blob> {
  try {
    const bytes = await deps.readFile(path)
    return new Blob([bytes])
  } catch (error) {
    throw new MediaPublishError('FILE_UNREADABLE', `Could not read ${path}: ${messageOf(error)}`)
  }
}

/** Require non-blank publish text. */
function requireText(value: string, platform: string): string {
  const text = value.trim()
  if (text === '') throw new MediaPublishError('TEXT_REQUIRED', `${platform} requires post text.`)
  return text
}

/**
 * Read a JSON response and turn a platform error into a MediaPublishError.
 * Facebook reports `{error:{message}}`; X reports `{detail|title}`; Douyin reports
 * `{data:{description, error_code}}`.
 */
async function readJson(response: Response, platform: string): Promise<Record<string, unknown>> {
  const raw = await response.text()
  let parsed: unknown
  try {
    parsed = raw === '' ? {} : JSON.parse(raw)
  } catch {
    throw new MediaPublishError('INVALID_RESPONSE', `${platform} returned a non-JSON response (${String(response.status)}).`)
  }
  const body = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  const facebookError = objectField(body, 'error')
  const douyinData = objectField(body, 'data')
  const douyinCode = douyinData === undefined ? undefined : douyinData['error_code']
  const douyinFailed = typeof douyinCode === 'number' && douyinCode !== 0
  const detail = stringField(facebookError, 'message')
    ?? stringField(body, 'detail')
    ?? stringField(body, 'title')
    ?? stringField(douyinData, 'description')
  if (!response.ok || facebookError !== undefined || douyinFailed) {
    const code = stringField(facebookError, 'code') ?? stringField(body, 'code') ?? String(response.status)
    throw new MediaPublishError('PLATFORM_REJECTED', `${platform} rejected the publish (${code}): ${detail ?? 'no detail returned'}`)
  }
  return body
}

/** Read one object-valued field. */
function objectField(value: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined
  const field = value[key]
  return typeof field === 'object' && field !== null && !Array.isArray(field) ? field as Record<string, unknown> : undefined
}

/** Read one string-valued field, including numeric ids. */
function stringField(value: Record<string, unknown> | undefined, key: string): string | undefined {
  if (value === undefined) return undefined
  const field = value[key]
  if (typeof field === 'string' && field.trim() !== '') return field
  if (typeof field === 'number') return String(field)
  return undefined
}

/** True for a missing-file error. */
function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}

/** The detail of a thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

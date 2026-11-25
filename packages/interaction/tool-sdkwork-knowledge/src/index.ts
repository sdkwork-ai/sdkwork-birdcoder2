/**
 * Model-facing knowledge-base authoring and media-publishing tools.
 *
 * The Host validates each request and relays one scoped
 * `sdkwork-knowledge/request` waterfall to the connected client. Writing an
 * article needs the Knowledge Base app client bound to the signed-in IAM
 * session; publishing needs the official accounts configured on that tenant and
 * the generated publish endpoint. Both live in the BirdCoder browser client, so
 * the tools carry no credential and perform no network call themselves — they
 * read a local cover image, forward the request, and format the returned facts.
 *
 * @module @deepseek-ai/dsh-tool-sdkwork-knowledge
 */
import { extname } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-error'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { ToolArgsError, ToolContextUnavailableError, defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-working-directory'
import type {
  KnowledgeArticleVisibility,
  MediaPlatform,
  SdkworkKnowledgeArticle,
  SdkworkKnowledgeRequestEvent,
  SdkworkKnowledgeResult,
  SdkworkMediaArticle,
  SdkworkMediaCapability,
  SdkworkPublishMode,
} from './types.ts'
import {
  KNOWLEDGE_ARTICLE_VISIBILITIES,
  HOST_MEDIA_PLATFORMS,
  MEDIA_CAPABILITIES,
  MEDIA_PLATFORMS,
} from './types.ts'
import type { HostMediaPlatform } from './types.ts'
import {
  loadMediaAccounts,
  mediaAccountsPath,
  MediaPublishError,
  publishToHostPlatform,
  type HostMediaAccount,
  type MediaPublishPayload,
} from './media.ts'

export type {
  KnowledgeArticleVisibility,
  MediaPlatform,
  SdkworkKnowledgeAction,
  SdkworkKnowledgeArticle,
  SdkworkKnowledgeFailureStage,
  SdkworkKnowledgeRequestEvent,
  SdkworkKnowledgeResult,
  SdkworkKnowledgeSpace,
  SdkworkMediaAccount,
  SdkworkMediaArticle,
  SdkworkMediaCapability,
  SdkworkMediaReceipt,
  SdkworkPublishMode,
} from './types.ts'

/** Stable Loader identity. */
export const name = 'tool-sdkwork-knowledge'

/** Services used by the relay tools. */
export const inject = ['tools', 'fs', 'workingDirectory']

/** Upper bound of one relayed operation, matching the ingest and publish budget. */
const OPERATION_TIMEOUT_MS = 3 * 60_000

/** Cover images the platform accepts; WeChat classifies the material by this type. */
const COVER_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

/** Largest cover the Knowledge Base publish contract accepts. */
const MAX_COVER_BYTES = 5 * 1024 * 1024

/** Longest title the Knowledge Base document and WeChat article contracts accept. */
const MAX_TITLE_CHARS = 64

/** Longest summary the WeChat article contract accepts. */
const MAX_SUMMARY_CHARS = 120

/** Longest article body the WeChat article contract accepts. */
const MAX_ARTICLE_CHARS = 20_000

/**
 * Count characters the way the Knowledge Base and WeChat limits measure them:
 * Unicode code points, so every CJK character counts once.
 * @param text - text to measure.
 * @returns the code-point count.
 */
function characterCount(text: string): number {
  // oxlint-disable-next-line typescript/no-misused-spread -- a platform limit counts code points, not grapheme clusters
  return [...text].length
}

/** A relay failure with a stable, model-routable code. */
export class SdkworkKnowledgeRelayError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'SdkworkKnowledgeRelayError'
  }
}

/** No connected client can run the operation (for example a headless CLI Session). */
const NO_CLIENT = 'NO_CLIENT'

/** Services one tool execution borrows. */
interface RelayExecution {
  agent?: Agent
  signal: AbortSignal
}

const KNOWLEDGE_WRITE = 'sdkwork_knowledge_write'
const CONTENT_PUBLISH = 'sdkwork_content_publish'

/**
 * Register the knowledge article and media publishing tools.
 * @param ctx - agent-scoped services.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: KNOWLEDGE_WRITE,
    description: 'Write or read an article in the SDKWork Knowledge Base through the signed-in BirdCoder client. '
      + 'Use `action: list_spaces` to see the knowledge bases the signed-in user can write to, `action: list_articles` to read one space, '
      + '`action: read_article` to load one document\'s Markdown, `action: create_article` to ingest a Markdown article as a new document, '
      + 'and `action: upsert_concept` to create or update a wiki concept page. '
      + 'A write needs a space id: when the user has not chosen one, list the spaces first and ask which one to use. '
      + 'The tool reuses the account this app is already signed in to and never asks for a credential.',
    parameters: {
      action: {
        type: 'string',
        enum: ['list_spaces', 'list_articles', 'read_article', 'create_article', 'upsert_concept'],
        required: true,
        description: 'Article operation to run.',
      },
      spaceId: {
        type: 'string',
        description: 'Knowledge space id. Required for list_articles, create_article and upsert_concept; omit for list_spaces.',
      },
      documentId: {
        type: 'string',
        description: 'Document id to read. Required for read_article.',
      },
      title: {
        type: 'string',
        description: 'Article title, at most 64 characters. Required for create_article and upsert_concept.',
      },
      markdown: {
        type: 'string',
        description: 'Full article body in Markdown. Required for create_article and upsert_concept.',
      },
      conceptId: {
        type: 'string',
        description: 'Existing wiki concept id to update. Omit to create a new concept from the title.',
      },
      publishConcept: {
        type: 'boolean',
        description: 'Publish the wiki concept to its space after upserting it. Defaults to false, which leaves it unpublished.',
      },
      visibility: {
        type: 'string',
        enum: [...KNOWLEDGE_ARTICLE_VISIBILITIES],
        description: 'Visibility of a created document. Omit for the space default.',
      },
    },
    timeoutMs: OPERATION_TIMEOUT_MS,
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: describeResult(value) }],
    },
    async execute(args, exec) {
      if (exec.agent === undefined) {
        throw new ToolContextUnavailableError(`${KNOWLEDGE_WRITE} requires an agent Session`)
      }
      exec.signal.throwIfAborted()
      return relay(ctx, exec, normalizeArticleRequest(KNOWLEDGE_WRITE, args, exec.agent))
    },
  }))

  ctx.tools.register(defineTool({
    name: CONTENT_PUBLISH,
    description: 'Publish content or an article to a media account. '
      + 'Use `action: capabilities` first to check which media this deployment can publish to and what each one accepts, '
      + 'then `action: accounts` for the configured accounts of one platform. '
      + 'Publishing needs an explicit account selection: when the user has not chosen one, show the accounts and ask which to use. '
      + '`wechat-official-account` publishes through the signed-in Knowledge Base client and takes an HTML article plus a cover; '
      + '`facebook`, `twitter` and `douyin` publish through this Host process with the official platform API and take `text`, plus `link`, `imagePaths` or `videoPath`. '
      + '`toutiao` and `xiaohongshu` have no public creator-publishing API here and are reported as unavailable. '
      + 'Host platform accounts come from the media account file, whose accounts reference their token by environment variable; never pass a token in an argument.',
    parameters: {
      action: {
        type: 'string',
        enum: ['capabilities', 'accounts', 'publish', 'preview'],
        required: true,
        description: 'Media operation to run.',
      },
      platform: {
        type: 'string',
        enum: [...MEDIA_PLATFORMS],
        description: 'Media platform. Defaults to `wechat-official-account`, the only platform with a live adapter in this deployment.',
      },
      accountIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Accounts the publish targets. Required for publish; for preview the first id is the sending account.',
      },
      wechatIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'WeChat recipient open ids for preview, 1 to 20 values.',
      },
      text: {
        type: 'string',
        description: 'Post, caption or note text for facebook, twitter and douyin.',
      },
      link: {
        type: 'string',
        description: 'Link a Facebook feed post attaches.',
      },
      imagePaths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Local image paths. Facebook uploads the first one as a Page photo.',
      },
      videoPath: {
        type: 'string',
        description: 'Local video path. Required for douyin; Facebook uploads it as a Page video.',
      },
      title: {
        type: 'string',
        description: 'Article title, at most 64 characters.',
      },
      author: {
        type: 'string',
        description: 'Author line the platform renders. Required for a WeChat article.',
      },
      summary: {
        type: 'string',
        description: 'Short digest, at most 120 characters.',
      },
      contentHtml: {
        type: 'string',
        description: 'Article body as platform HTML. At most 20,000 characters and 2 MiB for WeChat.',
      },
      coverPath: {
        type: 'string',
        description: 'Local cover image path (png, jpeg, gif or bmp, at most 5 MiB). Resolved against the Session working directory.',
      },
      coverDataUri: {
        type: 'string',
        description: 'Cover image already encoded as a `data:image/...;base64,...` URI. Alternative to coverPath.',
      },
      coverMediaId: {
        type: 'string',
        description: 'Already-uploaded platform cover media id. Alternative to coverPath and coverDataUri.',
      },
      mode: {
        type: 'string',
        enum: ['publish', 'draft'],
        description: '`publish` sends the article to followers; `draft` saves it to the platform draft box. Defaults to publish.',
      },
    },
    timeoutMs: OPERATION_TIMEOUT_MS,
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: describeResult(value) }],
    },
    async execute(args, exec) {
      if (exec.agent === undefined) {
        throw new ToolContextUnavailableError(`${CONTENT_PUBLISH} requires an agent Session`)
      }
      exec.signal.throwIfAborted()
      if (args.action === 'capabilities') return hostCapabilities(ctx, exec)
      const platform = args.platform ?? 'wechat-official-account'
      if (platform === 'wechat-official-account') {
        return relay(ctx, exec, await normalizeMediaRequest(ctx, args, exec))
      }
      if ((HOST_MEDIA_PLATFORMS as readonly string[]).includes(platform)) {
        return runHostMedia(args, exec, platform as HostMediaPlatform)
      }
      return unsupportedPlatform(platform, args.action)
    },
  }))
}

/** One article row shared by the list and single-write outputs. */
const ARTICLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    documentId: { type: 'string' },
    conceptId: { type: 'string' },
    title: { type: 'string', required: true },
    spaceId: { type: 'string', required: true },
    state: { type: 'string' },
    updatedAt: { type: 'string' },
    markdown: { type: 'string' },
  },
} as const

/** Output schema both tools share: one domain answer or one reported failure. */
const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    status: { type: 'string', required: true },
    action: { type: 'string', required: true },
    spaces: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: true },
          kind: { type: 'string', required: true },
          documentCount: { type: 'integer' },
        },
      },
    },
    articles: {
      type: 'array',
      items: ARTICLE_SCHEMA,
    },
    article: ARTICLE_SCHEMA,
    accounts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: true },
          platform: { type: 'string', required: true },
          accountType: { type: 'string' },
          description: { type: 'string' },
          group: { type: 'string' },
        },
      },
    },
    capabilities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          platform: { type: 'string', required: true },
          label: { type: 'string', required: true },
          status: { type: 'string', required: true },
          contentKinds: { type: 'array', items: { type: 'string' } },
          requirement: { type: 'string', required: true },
          limits: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string', required: true },
        },
      },
    },
    receipt: {
      type: 'object',
      additionalProperties: false,
      properties: {
        platform: { type: 'string', required: true },
        accepted: { type: 'boolean', required: true },
        status: { type: 'string', required: true },
        mode: { type: 'string', required: true },
        accountIds: { type: 'array', items: { type: 'string' } },
        titles: { type: 'array', items: { type: 'string' } },
        remoteIds: { type: 'array', items: { type: 'string' } },
        message: { type: 'string' },
      },
    },
    stage: { type: 'string' },
    code: { type: 'string' },
    message: { type: 'string' },
  },
} as const

/** Host-platform arguments the media actions read. */
interface HostMediaArgs {
  action: 'capabilities' | 'accounts' | 'publish' | 'preview'
  platform?: MediaPlatform
  accountIds?: string[]
  title?: string
  text?: string
  link?: string
  imagePaths?: string[]
  videoPath?: string
}

/**
 * Build the media capability matrix from configured accounts: WeChat accounts
 * come from the signed-in Knowledge Base client, the Host platforms from the
 * media account file, and Toutiao/Xiaohongshu stay unavailable.
 * @param ctx - context for the WeChat account relay.
 * @param exec - calling agent and cancellation.
 * @returns the capability rows or a reported account-file failure.
 */
async function hostCapabilities(ctx: Context, exec: RelayExecution): Promise<SdkworkKnowledgeResult> {
  let hostAccounts: HostMediaAccount[]
  try {
    hostAccounts = await loadMediaAccounts()
  } catch (error) {
    return mediaFailure('media.capabilities', 'accounts', error)
  }
  const wechat = await wechatAccountCount(ctx, exec)
  return {
    ok: true,
    status: 'ok',
    action: 'media.capabilities',
    capabilities: buildCapabilities(wechat, hostAccounts, mediaAccountsPath()),
  }
}

/** Count the WeChat accounts the signed-in client reports, or 0 without a client. */
async function wechatAccountCount(ctx: Context, exec: RelayExecution): Promise<number> {
  const agent = exec.agent
  if (agent === undefined) return 0
  try {
    const result = await relay(ctx, exec, { action: 'media.accounts', platform: 'wechat-official-account', agent })
    return result.ok ? result.accounts?.length ?? 0 : 0
  } catch {
    return 0
  }
}

/** Project the static matrix with each platform's live account state. */
function buildCapabilities(
  wechatAccounts: number,
  hostAccounts: readonly HostMediaAccount[],
  accountsPath: string,
): SdkworkMediaCapability[] {
  return MEDIA_CAPABILITIES.map((row) => {
    if (row.platform === 'wechat-official-account') {
      return wechatAccounts > 0
        ? { ...row, contentKinds: [...row.contentKinds], limits: [...row.limits], status: 'ready' }
        : {
          ...row,
          contentKinds: [...row.contentKinds],
          limits: [...row.limits],
          status: 'account-required',
          requirement: 'No official account is configured. Save an appId and appSecret in the Knowledge Base WeChat configuration, then enable the deployment switch for external publication.',
        }
    }
    const hostPlatform = (HOST_MEDIA_PLATFORMS as readonly string[]).includes(row.platform)
    if (!hostPlatform) {
      return { ...row, contentKinds: [...row.contentKinds], limits: [...row.limits] }
    }
    const count = hostAccounts.filter(account => account.platform === row.platform).length
    return count > 0
      ? { ...row, contentKinds: [...row.contentKinds], limits: [...row.limits], status: 'ready' }
      : {
        ...row,
        contentKinds: [...row.contentKinds],
        limits: [...row.limits],
        status: 'account-required',
        requirement: `No ${row.label} account is configured. Add one to ${accountsPath} with its token environment variable, then retry.`,
      }
  })
}

/**
 * Run one Host adapter action: list accounts, or publish to the selected ones.
 * @param args - media arguments.
 * @param exec - calling agent and cancellation.
 * @param platform - the Host platform the action addresses.
 * @returns the account list or the publish receipt, or a reported failure.
 */
async function runHostMedia(
  args: HostMediaArgs,
  exec: RelayExecution,
  platform: HostMediaPlatform,
): Promise<SdkworkKnowledgeResult> {
  if (exec.agent === undefined) throw new ToolContextUnavailableError(`${CONTENT_PUBLISH} requires an agent Session`)
  let accounts: HostMediaAccount[]
  try {
    accounts = await loadMediaAccounts()
  } catch (error) {
    return mediaFailure(args.action === 'accounts' ? 'media.accounts' : 'media.publish', 'accounts', error)
  }
  const platformAccounts = accounts.filter(account => account.platform === platform)
  if (args.action === 'accounts') {
    return {
      ok: true,
      status: 'ok',
      action: 'media.accounts',
      accounts: platformAccounts.map(account => ({
        id: account.id,
        name: account.name,
        platform: account.platform,
        description: `${account.platform} account`,
      })),
    }
  }
  if (args.action === 'preview') {
    return {
      ok: false,
      status: 'failed',
      action: 'media.preview',
      stage: 'preview',
      code: 'PREVIEW_UNSUPPORTED',
      message: `Preview is a WeChat feature; ${platform} has no preview. Publish with action: publish instead.`,
    }
  }
  const requested = (args.accountIds ?? []).map(id => id.trim()).filter(id => id !== '')
  if (requested.length === 0) {
    return {
      ok: false,
      status: 'failed',
      action: 'media.publish',
      stage: 'validate',
      code: 'ACCOUNT_REQUIRED',
      message: `Select at least one ${platform} account; call action: accounts to list them.`,
    }
  }
  const selected: HostMediaAccount[] = []
  for (const id of requested) {
    const account = platformAccounts.find(candidate => candidate.id === id)
    if (account === undefined) {
      return {
        ok: false,
        status: 'failed',
        action: 'media.publish',
        stage: 'validate',
        code: 'UNKNOWN_ACCOUNT',
        message: `No configured ${platform} account has id ${id}. Known ids: ${platformAccounts.map(account => account.id).join(', ') || 'none'}.`,
      }
    }
    selected.push(account)
  }
  const text = (args.text ?? args.title ?? '').trim()
  if (text === '') {
    return {
      ok: false,
      status: 'failed',
      action: 'media.publish',
      stage: 'validate',
      code: 'TEXT_REQUIRED',
      message: `${platform} needs post text; pass text (and title when the platform renders one).`,
    }
  }
  const payload: MediaPublishPayload = {
    text,
    ...(args.title === undefined || args.title.trim() === '' ? {} : { title: args.title.trim() }),
    ...(args.link === undefined || args.link.trim() === '' ? {} : { link: args.link.trim() }),
    ...(args.imagePaths === undefined ? {} : { imagePaths: args.imagePaths }),
    ...(args.videoPath === undefined || args.videoPath.trim() === '' ? {} : { videoPath: args.videoPath.trim() }),
  }
  const remoteIds: string[] = []
  const messages: string[] = []
  for (const account of selected) {
    try {
      const receipt = await publishToHostPlatform(account, payload, process.env)
      remoteIds.push(...receipt.remoteIds.filter(id => id !== ''))
      messages.push(`${account.name}: ${receipt.message}`)
    } catch (error) {
      return mediaFailure('media.publish', 'publish', error, `; published before the failure: ${messages.join(' ') || 'none'}`)
    }
  }
  return {
    ok: true,
    status: 'ok',
    action: 'media.publish',
    receipt: {
      platform,
      accepted: true,
      status: 'published',
      mode: 'publish',
      accountIds: requested,
      titles: [payload.title ?? payload.text.slice(0, 40)],
      ...(remoteIds.length === 0 ? {} : { remoteIds }),
      ...(messages.length === 0 ? {} : { message: messages.join(' ') }),
    },
  }
}

/** Report a platform that has no adapter in this deployment. */
function unsupportedPlatform(platform: MediaPlatform, action: HostMediaArgs['action']): SdkworkKnowledgeResult {
  const row = MEDIA_CAPABILITIES.find(candidate => candidate.platform === platform)
  const label = row?.label ?? platform
  const mappedAction: SdkworkKnowledgeResult['action'] = action === 'accounts'
    ? 'media.accounts'
    : action === 'preview' ? 'media.preview' : 'media.publish'
  return {
    ok: false,
    status: 'failed',
    action: mappedAction,
    stage: action === 'accounts' ? 'accounts' : 'publish',
    code: 'PLATFORM_NOT_CONFIGURED',
    message: `${label}: ${row?.requirement ?? 'no adapter in this deployment.'} Nothing was published.`,
  }
}

/** Map a thrown Host adapter failure to the reported result. */
function mediaFailure(
  action: SdkworkKnowledgeResult['action'],
  stage: NonNullable<SdkworkKnowledgeResult['stage']>,
  error: unknown,
  suffix = '',
): SdkworkKnowledgeResult {
  if (error instanceof MediaPublishError) {
    return { ok: false, status: 'failed', action, stage, code: error.code, message: `${error.message}${suffix}` }
  }
  return {
    ok: false,
    status: 'failed',
    action,
    stage,
    code: 'HOST_ADAPTER_FAILED',
    message: `${error instanceof Error ? error.message : 'the Host adapter failed without a message'}${suffix}`,
  }
}

/** The schema-inferred result shape, named for the text renderer. */
export type KnowledgeToolOutput = SdkworkKnowledgeResult
/**
 * Start the article request and reject an argument the operation cannot use
 * before any browser client sees it.
 * @param tool - tool name named in a validation message.
 * @param args - validated tool arguments.
 * @param agent - calling agent, forwarded so the client can scope the work.
 * @returns one article request.
 */
function normalizeArticleRequest(
  tool: string,
  args: {
    action: 'list_spaces' | 'list_articles' | 'read_article' | 'create_article' | 'upsert_concept'
    spaceId?: string
    documentId?: string
    title?: string
    markdown?: string
    conceptId?: string
    publishConcept?: boolean
    visibility?: KnowledgeArticleVisibility
  },
  agent: Agent,
): SdkworkKnowledgeRequestEvent & { agent: Agent } {
  switch (args.action) {
    case 'list_spaces':
      return { action: 'spaces.list', agent }
    case 'list_articles':
      return { action: 'articles.list', spaceId: requireText(tool, args.spaceId, 'spaceId'), agent }
    case 'read_article':
      return { action: 'articles.read', documentId: requireText(tool, args.documentId, 'documentId'), agent }
    case 'create_article': {
      const title = requireTitle(tool, args.title)
      return {
        action: 'articles.create',
        spaceId: requireText(tool, args.spaceId, 'spaceId'),
        title,
        markdown: requireText(tool, args.markdown, 'markdown'),
        ...(args.visibility === undefined ? {} : { visibility: args.visibility }),
        agent,
      }
    }
    case 'upsert_concept': {
      const conceptId = args.conceptId?.trim() ?? ''
      return {
        action: 'concepts.upsert',
        spaceId: requireText(tool, args.spaceId, 'spaceId'),
        ...(conceptId === '' ? {} : { conceptId }),
        title: requireTitle(tool, args.title),
        markdown: requireText(tool, args.markdown, 'markdown'),
        publishConcept: args.publishConcept ?? false,
        agent,
      }
    }
    default: {
      const action: never = args.action
      throw new ToolArgsError([`${tool} does not support action ${String(action)}`])
    }
  }
}

/**
 * Validate a media request, resolve the platform, and embed a local cover image
 * as a data URI the publish contract accepts.
 * @param ctx - context supplying the filesystem and working directory.
 * @param args - validated tool arguments.
 * @param exec - calling agent and cancellation.
 * @returns one media request.
 */
async function normalizeMediaRequest(
  ctx: Context,
  args: {
    action: 'capabilities' | 'accounts' | 'publish' | 'preview'
    platform?: MediaPlatform
    accountIds?: string[]
    wechatIds?: string[]
    title?: string
    author?: string
    summary?: string
    contentHtml?: string
    coverPath?: string
    coverDataUri?: string
    coverMediaId?: string
    mode?: SdkworkPublishMode
  },
  exec: RelayExecution,
): Promise<SdkworkKnowledgeRequestEvent & { agent: Agent }> {
  const agent = exec.agent
  if (agent === undefined) throw new ToolContextUnavailableError(`${CONTENT_PUBLISH} requires an agent Session`)
  const platform = args.platform ?? 'wechat-official-account'
  if (args.action === 'capabilities') {
    return { action: 'media.capabilities', platform, agent }
  }
  if (args.action === 'accounts') {
    return { action: 'media.accounts', platform, agent }
  }
  if (args.action === 'preview') {
    const accountIds = requireIds(CONTENT_PUBLISH, args.accountIds, 'accountIds')
    const wechatIds = requireIds(CONTENT_PUBLISH, args.wechatIds, 'wechatIds')
    if (wechatIds.length > 20) {
      throw new ToolArgsError(['wechatIds accepts 1 to 20 recipients'])
    }
    return {
      action: 'media.preview',
      platform,
      accountIds,
      wechatIds,
      articles: [await normalizeArticle(ctx, args, exec)],
      agent,
    }
  }
  const accountIds = requireIds(CONTENT_PUBLISH, args.accountIds, 'accountIds')
  if (accountIds.length > 20) {
    throw new ToolArgsError(['accountIds accepts 1 to 20 accounts per publish'])
  }
  return {
    action: 'media.publish',
    platform,
    accountIds,
    articles: [await normalizeArticle(ctx, args, exec)],
    mode: args.mode ?? 'publish',
    agent,
  }
}

/**
 * Build one media article, validating the fields the platform contract
 * enforces and reading the cover image when the caller named a local file.
 * @param ctx - context supplying the filesystem and working directory.
 * @param args - article fields from the tool call.
 * @param exec - calling agent and cancellation.
 * @returns the article the publish operation sends.
 */
async function normalizeArticle(
  ctx: Context,
  args: {
    title?: string
    author?: string
    summary?: string
    contentHtml?: string
    coverPath?: string
    coverDataUri?: string
    coverMediaId?: string
  },
  exec: RelayExecution,
): Promise<SdkworkMediaArticle> {
  const title = requireTitle(CONTENT_PUBLISH, args.title)
  const contentHtml = requireText(CONTENT_PUBLISH, args.contentHtml, 'contentHtml')
  if (characterCount(contentHtml) > MAX_ARTICLE_CHARS) {
    throw new ToolArgsError([`contentHtml is limited to ${String(MAX_ARTICLE_CHARS)} characters for a WeChat article`])
  }
  const summary = args.summary?.trim() ?? ''
  if (characterCount(summary) > MAX_SUMMARY_CHARS) {
    throw new ToolArgsError([`summary is limited to ${String(MAX_SUMMARY_CHARS)} characters`])
  }
  return {
    title,
    author: requireText(CONTENT_PUBLISH, args.author, 'author'),
    contentHtml,
    ...(summary === '' ? {} : { summary }),
    cover: await resolveCover(ctx, {
      ...(args.coverPath === undefined ? {} : { coverPath: args.coverPath }),
      ...(args.coverDataUri === undefined ? {} : { coverDataUri: args.coverDataUri }),
      ...(args.coverMediaId === undefined ? {} : { coverMediaId: args.coverMediaId }),
    }, exec),
  }
}

/**
 * Resolve the article cover to the one form the publish contract accepts: a
 * base64 data URI, or an existing platform media id. Remote URLs are rejected
 * because the platform never fetches caller-supplied links.
 * @param ctx - context supplying the filesystem and working directory.
 * @param args - the cover arguments, at most one non-blank.
 * @param exec - calling agent and cancellation.
 * @returns the cover value to send.
 */
async function resolveCover(
  ctx: Context,
  args: { coverPath?: string; coverDataUri?: string; coverMediaId?: string },
  exec: RelayExecution,
): Promise<string> {
  const supplied = [args.coverPath, args.coverDataUri, args.coverMediaId]
    .filter((value): value is string => value !== undefined && value.trim() !== '')
  if (supplied.length > 1) {
    throw new ToolArgsError(['provide only one of coverPath, coverDataUri and coverMediaId'])
  }
  if (supplied.length === 0) {
    throw new ToolArgsError(['a cover image is required: pass coverPath, coverDataUri or coverMediaId'])
  }
  const mediaId = args.coverMediaId?.trim() ?? ''
  if (mediaId !== '') return mediaId
  const dataUri = args.coverDataUri?.trim() ?? ''
  if (dataUri !== '') {
    if (!dataUri.startsWith('data:image/')) {
      throw new ToolArgsError(['coverDataUri must be a data:image/...;base64,... URI'])
    }
    return dataUri
  }
  const path = args.coverPath?.trim() ?? ''
  const mime = COVER_MIME_BY_EXTENSION[extname(path).toLowerCase()]
  if (mime === undefined) {
    throw new ToolArgsError(['coverPath must be a png, jpg, jpeg, gif or bmp image'])
  }
  const cwd = exec.agent === undefined ? undefined : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  const fs = ctx.get('fs')
  if (fs === undefined) {
    throw new SdkworkKnowledgeRelayError('No filesystem service can read the cover image', 'FILESYSTEM_UNAVAILABLE')
  }
  const target = await fs.resolve(path, { ...(cwd === undefined ? {} : { cwd }), signal: exec.signal })
  const info = await fs.stat(target, exec.signal)
  if (info === undefined || info.type !== 'file') {
    throw new ToolArgsError([`coverPath is not a readable file: ${path}`])
  }
  const bytes = await fs.readBytes(target, exec.signal, MAX_COVER_BYTES + 1)
  if (bytes.byteLength > MAX_COVER_BYTES) {
    throw new ToolArgsError(['coverPath exceeds the 5 MiB cover limit'])
  }
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
}

/** Relay one request to the connected client and report the failure it names. */
async function relay(
  ctx: Context,
  exec: RelayExecution,
  request: SdkworkKnowledgeRequestEvent & { agent: Agent },
): Promise<SdkworkKnowledgeResult> {
  const agent = exec.agent
  if (agent === undefined) throw new ToolContextUnavailableError('the SDKWork knowledge operation requires an agent Session')
  let result: SdkworkKnowledgeResult
  try {
    result = await ctx.waterfall(
      scopeTarget(agent, agent),
      'sdkwork-knowledge/request',
      request,
      () => Promise.reject(new SdkworkKnowledgeRelayError(
        'No connected BirdCoder client can run this knowledge operation: the signed-in browser client owns the Knowledge Base session. '
        + 'Open this Session in the BirdCoder desktop or web app and call the tool again.',
        NO_CLIENT,
      )),
    )
  } catch (error) {
    if (exec.signal.aborted) {
      throw new SdkworkKnowledgeRelayError('The knowledge operation was cancelled before it finished', 'CANCELLED', { cause: error })
    }
    throw error instanceof HarnessError
      ? error
      : new SdkworkKnowledgeRelayError(
        error instanceof Error ? error.message : 'the knowledge client failed before answering',
        'OPERATION_FAILED',
        { cause: error },
      )
  }
  return result
}

/** Require one non-blank text argument. */
function requireText(tool: string, value: string | undefined, field: string): string {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') throw new ToolArgsError([`${tool} requires a non-empty ${field}`])
  return trimmed
}

/** Require a title within the platform limit. */
function requireTitle(tool: string, value: string | undefined): string {
  const title = requireText(tool, value, 'title')
  if (characterCount(title) > MAX_TITLE_CHARS) {
    throw new ToolArgsError([`title is limited to ${String(MAX_TITLE_CHARS)} characters`])
  }
  return title
}

/** Require one non-empty id list. */
function requireIds(tool: string, value: readonly string[] | undefined, field: string): string[] {
  const ids = (value ?? []).map(id => id.trim()).filter(id => id !== '')
  if (ids.length === 0) throw new ToolArgsError([`${tool} requires at least one ${field} entry`])
  return ids
}

/** One article row as the tool schema projects it. */
interface DescribeArticle {
  documentId?: string
  conceptId?: string
  title: string
  spaceId: string
  state?: string
  updatedAt?: string
  markdown?: string
}

/**
 * One result as the tool schema projects it. The schema cannot carry a string
 * union, so `status`, `action`, `platform`, and `mode` widen to `string`; the
 * renderer reads only their comparisons.
 */
export interface KnowledgeDescribeValue {
  ok: boolean
  status: string
  action: string
  spaces?: { id: string; name: string; kind: string; documentCount?: number }[]
  articles?: DescribeArticle[]
  article?: DescribeArticle
  accounts?: { id: string; name: string; platform: string; accountType?: string; description?: string; group?: string }[]
  capabilities?: {
    platform: string
    label: string
    status: string
    contentKinds?: string[]
    requirement: string
    limits?: string[]
    notes: string
  }[]
  receipt?: {
    platform: string
    accepted: boolean
    status: string
    mode: string
    accountIds?: string[]
    titles?: string[]
    remoteIds?: string[]
    message?: string
  }
  stage?: string
  code?: string
  message?: string
}

/**
 * Model-facing text form of one answer or reported failure.
 * @param value - the tool result to describe.
 * @returns the text the model reads.
 */
export function describeResult(value: KnowledgeDescribeValue): string {
  if (!value.ok) {
    const stage = value.stage ?? 'operation'
    const code = value.code === undefined ? '' : ` (${value.code})`
    return `Knowledge operation failed at ${stage}${code}: ${value.message ?? 'no detail reported'}`
  }
  const lines: string[] = []
  if (value.spaces !== undefined) {
    lines.push(value.spaces.length === 0
      ? 'No knowledge spaces are available to the signed-in account.'
      : 'Knowledge spaces:')
    for (const space of value.spaces) {
      const count = space.documentCount === undefined ? '' : ` · ${String(space.documentCount)} documents`
      lines.push(`- ${space.name} (id ${space.id}, ${space.kind}${count})`)
    }
  }
  if (value.articles !== undefined) {
    lines.push(value.articles.length === 0 ? 'No articles in this space.' : 'Articles:')
    for (const article of value.articles) {
      const state = article.state === undefined ? '' : `, ${article.state}`
      lines.push(`- ${article.title} (${describeArticleIdentity(article)}${state})`)
    }
  }
  if (value.article !== undefined) {
    if (value.action === 'articles.read') {
      lines.push(`Article "${value.article.title}" (document ${value.article.documentId ?? 'unknown'}):`)
      lines.push(value.article.markdown ?? '(the client returned no Markdown body)')
    } else {
      lines.push(`Wrote "${value.article.title}" in space ${value.article.spaceId}: ${describeArticleIdentity(value.article)}`)
    }
  }
  if (value.accounts !== undefined) {
    lines.push(value.accounts.length === 0
      ? 'No media accounts are configured for this platform in the signed-in tenant.'
      : 'Media accounts:')
    for (const account of value.accounts) {
      const type = account.accountType === undefined ? '' : ` · ${account.accountType}`
      const group = account.group === undefined ? '' : ` · group ${account.group}`
      lines.push(`- ${account.name} (id ${account.id}, ${account.platform}${type}${group})`)
    }
  }
  if (value.capabilities !== undefined) {
    lines.push('Media capability check:')
    for (const capability of value.capabilities) {
      const kinds = (capability.contentKinds ?? []).length === 0 ? 'none' : (capability.contentKinds ?? []).join(', ')
      lines.push(`- ${capability.label} (${capability.platform}): ${capability.status}; content: ${kinds}. ${capability.requirement}`)
      for (const limit of capability.limits ?? []) lines.push(`  - ${limit}`)
      lines.push(`  - note: ${capability.notes}`)
    }
  }
  if (value.receipt !== undefined) {
    const titles = value.receipt.titles ?? []
    const accountIds = value.receipt.accountIds ?? []
    const verb = value.receipt.mode === 'preview' ? 'Preview sent' : value.receipt.mode === 'draft' ? 'Draft saved' : 'Published'
    lines.push(`${verb} for ${value.receipt.platform}: ${value.receipt.status} (accepted: ${String(value.receipt.accepted)})`)
    if (titles.length > 0) lines.push(`- articles: ${titles.join(' | ')}`)
    if (accountIds.length > 0) lines.push(`- accounts: ${accountIds.join(', ')}`)
    if (value.receipt.remoteIds !== undefined && value.receipt.remoteIds.length > 0) {
      lines.push(`- platform ids: ${value.receipt.remoteIds.join(', ')}`)
    }
    if (value.receipt.message !== undefined) lines.push(`- detail: ${value.receipt.message}`)
    if (value.receipt.mode === 'publish') {
      lines.push('Publication completes asynchronously on the platform; an accepted submit is not a live article yet.')
    }
  }
  return lines.length === 0 ? `${value.action} completed` : lines.join('\n')
}

/** One article's stable identity for the text result. */
function describeArticleIdentity(article: Pick<SdkworkKnowledgeArticle, 'documentId' | 'conceptId'>): string {
  if (article.documentId !== undefined) return `document ${article.documentId}`
  if (article.conceptId !== undefined) return `concept ${article.conceptId}`
  return 'identity not reported yet'
}

/**
 * Conversation bridge for knowledge authoring and media publishing.
 *
 * The Host tools `sdkwork_knowledge_write` and `sdkwork_content_publish`
 * forward one `sdkwork-knowledge/request` each. The request runs here because
 * writing an article and publishing it need the generated Knowledge Base app
 * client bound to the signed-in IAM session, which never leaves this browser
 * client. The executor answers with the article identity or the platform
 * receipt; the Host only formats it.
 *
 * The capability matrix below is the one place that states which content each
 * media accepts. Only the WeChat Official Account adapter exists in the
 * Knowledge Base app API today; every other platform is reported as
 * `account-required` instead of being published through a guessed workflow.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-knowledge/knowledge-conversation
 */
import type {
  MediaPlatform,
  SdkworkKnowledgeArticle,
  SdkworkKnowledgeRequestEvent,
  SdkworkKnowledgeResult,
  SdkworkKnowledgeSpace,
  SdkworkMediaAccount,
  SdkworkMediaArticle,
} from '@deepseek-ai/dsh-tool-sdkwork-knowledge/types'
import type { KnowledgeBaseRecord } from './knowledgeCatalog.ts'

/** Display label per platform, used by an availability message. */
const PLATFORM_LABELS: Readonly<Record<MediaPlatform, string>> = {
  'wechat-official-account': 'WeChat Official Account',
  'toutiao': 'Toutiao',
  'douyin': 'Douyin',
  'xiaohongshu': 'Xiaohongshu',
  'facebook': 'Facebook',
  'twitter': 'Twitter / X',
}

/** Generated-client face this executor borrows; the generated client satisfies it. */
export interface KnowledgeConversationClient {
  knowledge: {
    ingests: {
      create(body: {
        spaceId: string
        title: string
        payloadMarkdown?: string
        idempotencyKey: string
      }): Promise<IngestionJobLike>
      retrieve(ingestId: string): Promise<IngestionJobLike>
    }
    documents: {
      list(params: { spaceId: string; pageSize?: number }): Promise<{ items: KnowledgeDocumentLike[] }>
      retrieve(documentId: string): Promise<KnowledgeDocumentLike>
      content: {
        list(documentId: string): Promise<{ contentMarkdown: string }>
      }
      update(documentId: string, body: {
        spaceId: string
        title: string
        visibility?: string
      }): Promise<KnowledgeDocumentLike>
    }
    okf: {
      concepts: {
        update(body: {
          spaceId: string
          conceptId: string
          markdown: string
          publish: boolean
        }): Promise<{ conceptId: string; title: string; updatedAt?: string }>
      }
    }
    wechat: {
      officialAccounts: {
        list(): Promise<{ items: WechatAccountLike[] }>
      }
      articles: {
        publish(body: WechatPublishBody): Promise<WechatOperationLike>
        preview(body: WechatPreviewBody): Promise<WechatOperationLike>
      }
    }
  }
}

/** One ingestion job row the executor polls. */
export interface IngestionJobLike {
  id: string
  state: string
  errorMessage?: string | null
}

/** One knowledge document row the executor reads back. */
export interface KnowledgeDocumentLike {
  id: string
  title: string
  spaceId: string
  contentState?: string
}

/** One configured WeChat official account. */
export interface WechatAccountLike {
  id: string
  name: string
  type?: string
  description?: string
  group?: string
}

/** Publish body the Knowledge Base WeChat endpoint accepts. */
export interface WechatPublishBody {
  accountIds: string[]
  articles: {
    id: string
    title: string
    author: string
    content: string
    cover: string
    abstract?: string
  }[]
  sendNotification?: boolean
}

/** Preview body the Knowledge Base WeChat endpoint accepts. */
export interface WechatPreviewBody {
  accountId: string
  wechatIds: string[]
  articles: WechatPublishBody['articles']
}

/** Publish or preview result the endpoint returns. */
export interface WechatOperationLike {
  accepted: boolean
  status: string
}

/** Capabilities the executor reads from the host adapter. */
export interface KnowledgeConversationPorts {
  /** Whether an IAM user session is present. */
  isSignedIn(): boolean
  /** The application's own selectable-space projection. */
  listBases(): Promise<readonly KnowledgeBaseRecord[]>
  /** The generated app client for the active environment and tokens. */
  client(): KnowledgeConversationClient
  /** Delay between ingestion polls; tests inject an immediate one. */
  sleep?(ms: number): Promise<void>
}

/** Polling budget for one ingestion job. */
const INGEST_ATTEMPTS = 30

/** Delay between ingestion polls. */
const INGEST_POLL_MS = 1_000

/**
 * Execute one relayed knowledge or media operation.
 * @param ports - signed-in state, space listing and the app client.
 * @param request - the operation the Host relayed.
 * @returns the article identity or media receipt, or the reported failure.
 */
export async function runKnowledgeConversation(
  ports: KnowledgeConversationPorts,
  request: SdkworkKnowledgeRequestEvent,
): Promise<SdkworkKnowledgeResult> {
  if (!ports.isSignedIn()) {
    return failed(request.action, 'signedOut', 'SIGNED_OUT', 'Sign in to SDKWork in this app first; the account this app is signed in to owns the knowledge base write and the media account configuration.')
  }
  try {
    switch (request.action) {
      case 'spaces.list':
        return { ok: true, status: 'ok', action: request.action, spaces: await listSpaces(ports) }
      case 'articles.list':
        return {
          ok: true,
          status: 'ok',
          action: request.action,
          articles: await listArticles(ports, requireSpace(request.spaceId)),
        }
      case 'articles.read':
        return {
          ok: true,
          status: 'ok',
          action: request.action,
          article: await readArticle(ports, request),
        }
      case 'articles.create':
        return {
          ok: true,
          status: 'ok',
          action: request.action,
          article: await createArticle(ports, request),
        }
      case 'concepts.upsert':
        return {
          ok: true,
          status: 'ok',
          action: request.action,
          article: await upsertConcept(ports, request),
        }
      case 'media.accounts':
        return {
          ok: true,
          status: 'ok',
          action: request.action,
          accounts: await listAccounts(ports, request),
        }
      case 'media.publish':
        return {
          ok: true,
          status: 'ok',
          action: request.action,
          receipt: await publish(ports, request),
        }
      case 'media.preview':
        return {
          ok: true,
          status: 'ok',
          action: request.action,
          receipt: await preview(ports, request),
        }
      default: {
        const action: never = request.action
        return failed(String(action), 'validate', 'UNKNOWN_ACTION', `The client does not implement ${String(action)}.`)
      }
    }
  } catch (error) {
    return failureFrom(request.action, error)
  }
}

/** @returns the selectable spaces in application order. */
async function listSpaces(ports: KnowledgeConversationPorts): Promise<SdkworkKnowledgeSpace[]> {
  const entries = await ports.listBases()
  const spaces: SdkworkKnowledgeSpace[] = []
  for (const entry of entries) {
    const id = entry.id?.trim() ?? ''
    const name = entry.name?.trim() ?? ''
    if (id === '' || id === '0' || name === '') continue
    if (entry.type !== 'team' && entry.type !== 'personal') continue
    spaces.push({
      id,
      name,
      kind: entry.type,
      ...(typeof entry.count === 'number' && entry.count >= 0 ? { documentCount: entry.count } : {}),
    })
  }
  return spaces
}

/** @returns the articles one space holds. */
async function listArticles(
  ports: KnowledgeConversationPorts,
  spaceId: string,
): Promise<SdkworkKnowledgeArticle[]> {
  const listing = await ports.client().knowledge.documents.list({ spaceId, pageSize: 100 })
  return listing.items.map(document => ({
    documentId: document.id,
    title: document.title,
    spaceId: document.spaceId,
    ...(document.contentState === undefined ? {} : { state: document.contentState }),
  }))
}

/**
 * Read one document and its Markdown body.
 * @param ports - executor ports.
 * @param request - the relayed read request.
 * @returns the document identity and its Markdown.
 */
async function readArticle(
  ports: KnowledgeConversationPorts,
  request: SdkworkKnowledgeRequestEvent,
): Promise<SdkworkKnowledgeArticle> {
  const documentId = requireText(request.documentId, 'documentId')
  const client = ports.client()
  const document = await client.knowledge.documents.retrieve(documentId)
  const content = await client.knowledge.documents.content.list(documentId)
  return {
    documentId: document.id,
    title: document.title,
    spaceId: document.spaceId,
    ...(document.contentState === undefined ? {} : { state: document.contentState }),
    markdown: content.contentMarkdown,
  }
}

/**
 * Ingest a Markdown article as a new document and read it back.
 * @param ports - executor ports.
 * @param request - the relayed create request.
 * @returns the created article identity; a still-running ingest reports its job state.
 */
async function createArticle(
  ports: KnowledgeConversationPorts,
  request: SdkworkKnowledgeRequestEvent,
): Promise<SdkworkKnowledgeArticle> {
  const spaceId = requireSpace(request.spaceId)
  const title = requireText(request.title, 'title')
  const markdown = requireText(request.markdown, 'markdown')
  const client = ports.client()
  const job = await client.knowledge.ingests.create({
    spaceId,
    title,
    payloadMarkdown: markdown,
    idempotencyKey: articleIdempotencyKey(spaceId, title),
  })
  const pause = ports.sleep === undefined
    ? undefined
    : (ms: number) => ports.sleep?.(ms).then(() => undefined)
  const settled = await waitForIngest(client, job, pause)
  if (settled.state === 'failed' || settled.state === 'cancelled') {
    throw new ConversationFailure(
      'ingest',
      `INGEST_${settled.state.toUpperCase()}`,
      settled.errorMessage ?? `The knowledge base ingestion ended as ${settled.state}.`,
    )
  }
  if (settled.state !== 'succeeded') {
    return { title, spaceId, state: settled.state }
  }
  const document = await findDocument(client, spaceId, title)
  if (document !== undefined && request.visibility !== undefined) {
    await client.knowledge.documents.update(document.id, {
      spaceId,
      title,
      visibility: request.visibility,
    })
  }
  return {
    ...(document === undefined ? {} : { documentId: document.id }),
    title,
    spaceId,
    state: document?.contentState ?? 'succeeded',
  }
}

/**
 * Create or update one wiki concept page.
 * @param ports - executor ports.
 * @param request - the relayed upsert request.
 * @returns the concept identity.
 */
async function upsertConcept(
  ports: KnowledgeConversationPorts,
  request: SdkworkKnowledgeRequestEvent,
): Promise<SdkworkKnowledgeArticle> {
  const spaceId = requireSpace(request.spaceId)
  const title = requireText(request.title, 'title')
  const markdown = requireText(request.markdown, 'markdown')
  const conceptId = request.conceptId?.trim() === '' || request.conceptId === undefined
    ? conceptIdForTitle(title)
    : request.conceptId.trim()
  const summary = await ports.client().knowledge.okf.concepts.update({
    spaceId,
    conceptId,
    markdown,
    publish: request.publishConcept ?? false,
  })
  return {
    conceptId: summary.conceptId,
    title: summary.title,
    spaceId,
    state: request.publishConcept === true ? 'published' : 'draft',
    ...(summary.updatedAt === undefined ? {} : { updatedAt: summary.updatedAt }),
  }
}

/** @returns the accounts one platform exposes. */
async function listAccounts(
  ports: KnowledgeConversationPorts,
  request: SdkworkKnowledgeRequestEvent,
): Promise<SdkworkMediaAccount[]> {
  const platform = request.platform ?? 'wechat-official-account'
  if (platform !== 'wechat-official-account') {
    throw new ConversationFailure(
      'accounts',
      'PLATFORM_NOT_CONFIGURED',
      `${PLATFORM_LABELS[platform]} has no account adapter in this app. Only the WeChat Official Account adapter is available; tell the user what the platform would need instead of publishing.`,
    )
  }
  const accounts = await readWechatAccounts(ports)
  return accounts.map(account => ({
    id: account.id,
    name: account.name,
    platform: 'wechat-official-account',
    ...(account.type === undefined ? {} : { accountType: account.type }),
    ...(account.description === undefined ? {} : { description: account.description }),
    ...(account.group === undefined ? {} : { group: account.group }),
  }))
}

/**
 * Publish the article to every selected account.
 * @param ports - executor ports.
 * @param request - the relayed publish request.
 * @returns the platform receipt.
 */
async function publish(
  ports: KnowledgeConversationPorts,
  request: SdkworkKnowledgeRequestEvent,
): Promise<NonNullable<SdkworkKnowledgeResult['receipt']>> {
  const platform = requireWechat(request.platform)
  const accountIds = requireIds(request.accountIds, 'accountIds')
  const articles = requireArticles(request)
  const result = await ports.client().knowledge.wechat.articles.publish({
    accountIds,
    articles: articles.map(toWechatArticle),
    sendNotification: request.mode !== 'draft',
  })
  return {
    platform,
    accepted: result.accepted,
    status: result.status,
    mode: request.mode === 'draft' ? 'draft' : 'publish',
    accountIds,
    titles: articles.map(article => article.title),
  }
}

/**
 * Preview the article to the given WeChat recipients.
 * @param ports - executor ports.
 * @param request - the relayed preview request.
 * @returns the platform receipt.
 */
async function preview(
  ports: KnowledgeConversationPorts,
  request: SdkworkKnowledgeRequestEvent,
): Promise<NonNullable<SdkworkKnowledgeResult['receipt']>> {
  const platform = requireWechat(request.platform)
  const accountIds = requireIds(request.accountIds, 'accountIds')
  const wechatIds = requireIds(request.wechatIds, 'wechatIds')
  const articles = requireArticles(request)
  const [sendingAccountId] = accountIds
  const result = await ports.client().knowledge.wechat.articles.preview({
    accountId: sendingAccountId,
    wechatIds,
    articles: articles.map(toWechatArticle),
  })
  return {
    platform,
    accepted: result.accepted,
    status: result.status,
    mode: 'preview',
    accountIds: [sendingAccountId],
    titles: articles.map(article => article.title),
  }
}

/** Map one relayed article to the WeChat publish payload. */
function toWechatArticle(article: SdkworkMediaArticle): WechatPublishBody['articles'][number] {
  const title = requireText(article.title, 'title')
  return {
    id: `media-${hashKey(title)}`,
    title,
    author: requireText(article.author, 'author'),
    content: requireText(article.contentHtml, 'contentHtml'),
    cover: requireText(article.cover, 'cover'),
    ...(article.summary === undefined || article.summary.trim() === '' ? {} : { abstract: article.summary.trim() }),
  }
}

/** Read the configured official accounts, tolerating an unavailable endpoint. */
async function readWechatAccounts(ports: KnowledgeConversationPorts): Promise<WechatAccountLike[]> {
  const listing = await ports.client().knowledge.wechat.officialAccounts.list()
  return [...listing.items]
}

/** Poll one ingestion job until it settles or the budget runs out. */
async function waitForIngest(
  client: KnowledgeConversationClient,
  job: IngestionJobLike,
  sleep: ((ms: number) => Promise<void>) | undefined,
): Promise<IngestionJobLike> {
  const pause = sleep ?? delay
  let current = job
  for (let attempt = 0; attempt < INGEST_ATTEMPTS; attempt += 1) {
    if (isTerminalIngestState(current.state)) return current
    await pause(INGEST_POLL_MS)
    current = await client.knowledge.ingests.retrieve(current.id)
  }
  return current
}

/** Whether one ingestion state needs no more polling. */
function isTerminalIngestState(state: string): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled'
}

/** Find the document the ingestion created, matching on the title it was given. */
async function findDocument(
  client: KnowledgeConversationClient,
  spaceId: string,
  title: string,
): Promise<KnowledgeDocumentLike | undefined> {
  const listing = await client.knowledge.documents.list({ spaceId, pageSize: 200 })
  let winner: KnowledgeDocumentLike | undefined
  for (const document of listing.items) {
    if (document.title.trim() !== title) continue
    if (winner === undefined || compareNumericIds(document.id, winner.id) > 0) winner = document
  }
  return winner
}

/** Order two durable ids as numbers when both are numeric, else as text. */
function compareNumericIds(left: string, right: string): number {
  if (/^\d+$/u.test(left) && /^\d+$/u.test(right)) {
    const difference = Number(left) - Number(right)
    if (Number.isSafeInteger(difference) && difference !== 0) return difference
  }
  return left.localeCompare(right)
}

/** Stable idempotency key for one article title in one space. */
function articleIdempotencyKey(spaceId: string, title: string): string {
  return `article:${spaceId}:${hashKey(title)}`
}

/** A concept id derived from the title; CJK titles fall back to a stable hash. */
function conceptIdForTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return slug === '' ? `article-${hashKey(title)}` : slug.slice(0, 64)
}

/** FNV-1a of the input, as 8 lowercase hex characters. */
function hashKey(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Resolve the delay between ingestion polls. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/** One reported failure carrying its stage and code. */
class ConversationFailure extends Error {
  constructor(
    readonly stage: SdkworkKnowledgeResult['stage'],
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ConversationFailure'
  }
}

/** Map a thrown value onto one reported failure. */
function failureFrom(action: SdkworkKnowledgeResult['action'], error: unknown): SdkworkKnowledgeResult {
  if (error instanceof ConversationFailure) {
    return failed(action, error.stage ?? 'validate', error.code, error.message)
  }
  const code = typeof error === 'object' && error !== null
    ? stringField(error, 'code') ?? stringField(error, 'name') ?? 'OPERATION_FAILED'
    : 'OPERATION_FAILED'
  const message = error instanceof Error ? error.message : 'the knowledge client failed without a message'
  return failed(action, stageForAction(action), code, message)
}

/** The stage a thrown client failure belongs to, by operation. */
function stageForAction(action: SdkworkKnowledgeResult['action']): NonNullable<SdkworkKnowledgeResult['stage']> {
  switch (action) {
    case 'spaces.list':
      return 'spaces'
    case 'articles.list':
    case 'articles.read':
      return 'documents'
    case 'articles.create':
      return 'ingest'
    case 'concepts.upsert':
      return 'concept'
    case 'media.capabilities':
      return 'accounts'
    case 'media.accounts':
      return 'accounts'
    case 'media.publish':
      return 'publish'
    case 'media.preview':
      return 'preview'
    default:
      return 'unavailable'
  }
}

/** Read a string field from a thrown value without widening it to unknown. */
function stringField(value: object, key: string): string | undefined {
  if (!(key in value)) return undefined
  const field: unknown = Reflect.get(value, key)
  return typeof field === 'string' && field.trim() !== '' ? field : undefined
}

/** One reported failure. */
function failed(
  action: SdkworkKnowledgeResult['action'],
  stage: NonNullable<SdkworkKnowledgeResult['stage']>,
  code: string,
  message: string,
): SdkworkKnowledgeResult {
  return { ok: false, status: 'failed', action, stage, code, message }
}

/** Require a non-blank space id. */
function requireSpace(value: string | undefined): string {
  return requireText(value, 'spaceId')
}

/** Require a non-blank text value. */
function requireText(value: string | undefined, field: string): string {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') throw new ConversationFailure('validate', 'INVALID_ARGS', `${field} must not be empty`)
  return trimmed
}

/** Require at least one non-blank id. */
function requireIds(value: readonly string[] | undefined, field: string): string[] {
  const ids = (value ?? []).map(id => id.trim()).filter(id => id !== '')
  if (ids.length === 0) throw new ConversationFailure('validate', 'INVALID_ARGS', `${field} must name at least one id`)
  return ids
}

/** Require the WeChat platform adapter. */
function requireWechat(platform: MediaPlatform | undefined): MediaPlatform {
  const resolved = platform ?? 'wechat-official-account'
  if (resolved !== 'wechat-official-account') {
    throw new ConversationFailure(
      'publish',
      'PLATFORM_NOT_CONFIGURED',
      `${PLATFORM_LABELS[resolved]} has no publishing adapter in this app. Only the WeChat Official Account adapter is available.`,
    )
  }
  return resolved
}

/** Require the relayed articles. */
function requireArticles(request: SdkworkKnowledgeRequestEvent): SdkworkMediaArticle[] {
  if (request.articles === undefined || request.articles.length === 0) {
    throw new ConversationFailure('validate', 'INVALID_ARGS', 'articles must carry at least one article')
  }
  return [...request.articles]
}

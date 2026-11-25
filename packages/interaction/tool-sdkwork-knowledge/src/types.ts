/**
 * Cross-package vocabulary of the knowledge-base authoring and media-publishing
 * bridge.
 *
 * The Host tool only validates a request and relays it over the scoped
 * `sdkwork-knowledge/request` waterfall: writing an article needs the SDKWork
 * Knowledge Base app client bound to the signed-in IAM session, and publishing
 * needs the official accounts configured on that same tenant. Both live in the
 * connected BirdCoder browser client, so this module carries the request, the
 * result, and the platform capability matrix the model reads — never a
 * credential.
 *
 * @module @deepseek-ai/dsh-tool-sdkwork-knowledge/types
 */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Scoped } from '@deepseek-ai/dsh-scope'

/**
 * Media the publishing tool names. Only `wechat-official-account` has a live
 * adapter in the SDKWork Knowledge Base app API today; the remaining platforms
 * are named so the model can check availability and tell the user what an
 * account configuration would need, instead of silently dropping the request.
 */
export const MEDIA_PLATFORMS = [
  'wechat-official-account',
  'toutiao',
  'douyin',
  'xiaohongshu',
  'facebook',
  'twitter',
] as const

/** One media platform the publishing tool can address. */
export type MediaPlatform = typeof MEDIA_PLATFORMS[number]

/** Visibility a newly written knowledge article may carry. */
export const KNOWLEDGE_ARTICLE_VISIBILITIES = ['private', 'space', 'organization', 'public'] as const

/** One article visibility value. */
export type KnowledgeArticleVisibility = typeof KNOWLEDGE_ARTICLE_VISIBILITIES[number]

/**
 * The operations the relayed request names. Article actions read and write the
 * Knowledge Base; media actions resolve an account and publish through the
 * generated app client.
 */
export const SDKWORK_KNOWLEDGE_ACTIONS = [
  'spaces.list',
  'articles.list',
  'articles.read',
  'articles.create',
  'concepts.upsert',
  'media.capabilities',
  'media.accounts',
  'media.publish',
  'media.preview',
] as const

/** One relayed knowledge or media operation. */
export type SdkworkKnowledgeAction = typeof SDKWORK_KNOWLEDGE_ACTIONS[number]

/** Publish mode: a live publication or a draft saved in the platform's draft box. */
export type SdkworkPublishMode = 'publish' | 'draft'

/** One article the publishing operation sends to one or more accounts. */
export interface SdkworkMediaArticle {
  /** Article title, as the platform renders it. */
  readonly title: string
  /** Author line; platforms that render one require it. */
  readonly author?: string
  /** Article body in platform HTML. */
  readonly contentHtml: string
  /** Short digest the platform may render under the title. */
  readonly summary?: string
  /**
   * Cover image: base64 `data:image/...` content the client uploads, or an
   * already-uploaded platform media id. Remote URLs are never fetched.
   */
  readonly cover?: string
}

/** One relayed request: the operation, its payload, and the calling agent. */
export interface SdkworkKnowledgeRequestEvent {
  /** Operation to execute in the connected client. */
  readonly action: SdkworkKnowledgeAction
  /** Knowledge space the article operation addresses. */
  readonly spaceId?: string
  /** Document id for `articles.read`. */
  readonly documentId?: string
  /** Existing OKF concept id for `concepts.upsert`. */
  readonly conceptId?: string
  /** Article title for `articles.create` or `concepts.upsert`. */
  readonly title?: string
  /** Markdown body for `articles.create` or `concepts.upsert`. */
  readonly markdown?: string
  /** Publish the concept to its space wiki after upserting it. */
  readonly publishConcept?: boolean
  /** Visibility for a created document. */
  readonly visibility?: KnowledgeArticleVisibility
  /** Media platform for the media operations. */
  readonly platform?: MediaPlatform
  /** Accounts the publish operation targets. */
  readonly accountIds?: string[]
  /** WeChat recipient ids for `media.preview`. */
  readonly wechatIds?: string[]
  /** Articles the publish or preview operation sends. */
  readonly articles?: SdkworkMediaArticle[]
  /** Live publication or draft; defaults to `publish`. */
  readonly mode?: SdkworkPublishMode
  /** Agent identity projected to the corresponding Client Context in transit. */
  readonly agent?: Agent
}

/** One selectable knowledge space. */
export interface SdkworkKnowledgeSpace {
  /** Space id the article API addresses. */
  readonly id: string
  /** Space name as the application displays it. */
  readonly name: string
  /** Application group: a team space or a personal one. */
  readonly kind: string
  /** Indexed documents, when the application reports a count. */
  readonly documentCount?: number
}

/** One knowledge article (an ingested document or an OKF concept). */
export interface SdkworkKnowledgeArticle {
  /** Document id when the article is an ingested document. */
  readonly documentId?: string
  /** Concept id when the article is a wiki concept. */
  readonly conceptId?: string
  /** Article title. */
  readonly title: string
  /** Space the article lives in. */
  readonly spaceId: string
  /** Indexing or publication state the platform reports. */
  readonly state?: string
  /** Creation or update timestamp the platform reports. */
  readonly updatedAt?: string
  /** Markdown body, for `articles.read`. */
  readonly markdown?: string
}

/** One official account the signed-in tenant configured. */
export interface SdkworkMediaAccount {
  /** Account id the publish operation addresses. */
  readonly id: string
  /** Account display name. */
  readonly name: string
  /** Platform this account publishes to. */
  readonly platform: MediaPlatform
  /** Platform account type, such as a WeChat subscription or service account. */
  readonly accountType?: string
  /** Operator-facing description. */
  readonly description?: string
  /** Account group the configuration assigned. */
  readonly group?: string
}

/**
 * What one platform can publish and what it needs. `ready` means this
 * deployment resolved an adapter and at least one account; `account-required`
 * means the platform is known but no adapter or account is configured here.
 */
export interface SdkworkMediaCapability {
  /** Platform the row describes. */
  readonly platform: MediaPlatform
  /** Display label. */
  readonly label: string
  /** Whether the platform can publish right now. */
  readonly status: 'ready' | 'account-required'
  /** Content kinds the platform accepts. */
  readonly contentKinds: string[]
  /** What an operator must configure before this platform can publish. */
  readonly requirement: string
  /** Platform constraints the article must satisfy. */
  readonly limits: string[]
  /** Non-obvious behavior the model must account for. */
  readonly notes: string
}

/** One accepted publish or preview, as the platform reported it. */
export interface SdkworkMediaReceipt {
  /** Platform the operation addressed. */
  readonly platform: MediaPlatform
  /** Whether the platform accepted the operation. */
  readonly accepted: boolean
  /** Platform status token (`accepted` for a publish, `validated` for a preview). */
  readonly status: string
  /** `publish`, `draft`, or `preview`. */
  readonly mode: 'publish' | 'draft' | 'preview'
  /** Account ids the operation targeted. */
  readonly accountIds: string[]
  /** Article titles the operation sent. */
  readonly titles: string[]
  /** Platform post or media ids the adapter read back. */
  readonly remoteIds?: string[]
  /** Platform detail the model can report. */
  readonly message?: string
}

/**
 * Platforms whose adapter runs in this Host process. The WeChat adapter stays in
 * the Knowledge Base browser client because its account configuration and
 * secrets live on the tenant; these three call the platform's official HTTP API
 * directly with an operator-provided account file.
 */
export const HOST_MEDIA_PLATFORMS = ['facebook', 'twitter', 'douyin'] as const

/** One platform served by a Host adapter. */
export type HostMediaPlatform = typeof HOST_MEDIA_PLATFORMS[number]

/**
 * Which content each platform accepts, and what an unavailable platform would
 * need. The WeChat row mirrors the Knowledge Base publish contract's limits; the
 * Toutiao and Xiaohongshu rows state the missing public API so an unsupported
 * request becomes a reported fact rather than a guessed publish.
 */
export const MEDIA_CAPABILITIES: SdkworkMediaCapability[] = [
  {
    platform: 'wechat-official-account',
    label: 'WeChat Official Account',
    status: 'ready',
    contentKinds: ['article'],
    requirement: 'An official account (appId + appSecret) in the Knowledge Base WeChat configuration, plus the deployment switch for external publication.',
    limits: [
      'title at most 64 characters',
      'content is platform HTML, at most 20,000 characters and 2 MiB',
      'summary at most 120 characters',
      'cover is required: png, jpeg, gif or bmp, at most 5 MiB',
      '1 to 20 accounts and 1 to 8 articles per operation',
      'scheduleTime and fan-tag targeting are rejected, not ignored',
    ],
    notes: 'A draft saves to the account draft box; only a publish submits freepublish. Publication completes asynchronously upstream.',
  },
  {
    platform: 'facebook',
    label: 'Facebook',
    status: 'ready',
    contentKinds: ['post', 'link', 'photo', 'video'],
    requirement: 'A Facebook Page account in the media account file, with a Page access token referenced by `accessTokenEnv`.',
    limits: [
      'message is required for a feed post',
      'one photo or one video per operation through this adapter',
      'photo and video files are read from the local path the tool was given',
    ],
    notes: 'A Page post is public to the Page audience. Text, link, a single photo or a single video is supported; multi-photo posts are not.',
  },
  {
    platform: 'twitter',
    label: 'Twitter / X',
    status: 'ready',
    contentKinds: ['post'],
    requirement: 'An X account in the media account file, with a user-context access token referenced by `accessTokenEnv`.',
    limits: ['post text at most 280 characters on the standard tier', 'media upload is not implemented by this adapter'],
    notes: 'The X API v2 create-post endpoint needs OAuth 2.0 user context; an app-only bearer token is rejected. Media must be posted through X itself.',
  },
  {
    platform: 'douyin',
    label: 'Douyin',
    status: 'ready',
    contentKinds: ['short-video'],
    requirement: 'A Douyin account in the media account file with `openId` and an access token from the open-platform authorization.',
    limits: ['a local video file is required', 'caption text is optional', 'the open-platform app needs the “代替用户发布内容到抖音” capability'],
    notes: 'The adapter uploads the video and then creates the post; review state is owned by Douyin and is not read back.',
  },
  {
    platform: 'toutiao',
    label: 'Toutiao',
    status: 'account-required',
    contentKinds: ['article', 'short-video'],
    requirement: 'Toutiao exposes no public content-publishing API to individual creators; publishing needs browser automation or a third-party service this deployment does not ship.',
    limits: [],
    notes: 'Do not report a Toutiao publication. Tell the user the platform needs a channel this app does not provide.',
  },
  {
    platform: 'xiaohongshu',
    label: 'Xiaohongshu',
    status: 'account-required',
    contentKinds: ['note'],
    requirement: 'Xiaohongshu content APIs are limited to qualified merchants and service providers; this deployment has no such qualification or adapter.',
    limits: [],
    notes: 'Notes are short text plus images; do not send a WeChat article unchanged.',
  },
]


/** Stage that stopped a relayed operation. */
export type SdkworkKnowledgeFailureStage =
  | 'validate'
  | 'readCover'
  | 'signedOut'
  | 'unavailable'
  | 'spaces'
  | 'documents'
  | 'ingest'
  | 'concept'
  | 'accounts'
  | 'publish'
  | 'preview'

/** The client's answer to one relayed request. */
export interface SdkworkKnowledgeResult {
  /** Whether the operation completed. */
  readonly ok: boolean
  /** `ok` only when the operation returned its domain answer. */
  readonly status: 'ok' | 'failed'
  /** Operation the answer belongs to. */
  readonly action: SdkworkKnowledgeAction
  /** Spaces for `spaces.list`. */
  readonly spaces?: SdkworkKnowledgeSpace[]
  /** Articles for `articles.list`. */
  readonly articles?: SdkworkKnowledgeArticle[]
  /** The written article for `articles.create` or `concepts.upsert`. */
  readonly article?: SdkworkKnowledgeArticle
  /** Accounts for `media.accounts`. */
  readonly accounts?: SdkworkMediaAccount[]
  /** Capability matrix for `media.capabilities`. */
  readonly capabilities?: SdkworkMediaCapability[]
  /** Platform answer for `media.publish` or `media.preview`. */
  readonly receipt?: SdkworkMediaReceipt
  /** Stage that failed; present when not `ok`. */
  readonly stage?: SdkworkKnowledgeFailureStage
  /** Stable machine code for the failure. */
  readonly code?: string
  /** Human-readable failure detail. */
  readonly message?: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Execute one knowledge-base article or media-publishing operation through
     * the connected Client that owns the IAM session and the generated
     * Knowledge Base app client.
     * @param request - operation, payload and calling agent.
     * @param next - delegate to the Host fallback when no Client answers.
     * @mode waterfall
     */
    'sdkwork-knowledge/request'(
      this: Scoped<Agent>,
      request: SdkworkKnowledgeRequestEvent,
      next: () => Promise<SdkworkKnowledgeResult>,
    ): Promise<SdkworkKnowledgeResult>
  }
}

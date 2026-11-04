/**
 * Knowledge Base catalog provided to composer surfaces as `ctx.knowledgeBases`.
 *
 * The SDKWork Knowledge Base application owns both halves of the capability,
 * and this package only binds its host ports to them:
 *
 * - `knowledgeSelectionService.getBases()` is the application's own selection
 *   projection — the same one that lists the knowledge bases a user can attach
 *   to an agent profile — so the composer picker offers exactly those.
 * - the configured generated app client's `knowledge.retrievals.create`
 *   returns the passages one query pulls out of selected knowledge spaces.
 *
 * Both enter through {@link KnowledgeBaseCatalogDeps} so the catalog stays a
 * pure mapping that tests drive without the SDKWork runtime. Listing keeps the
 * application's order and drops entries without an id, a name, or a renderable
 * group. Retrieval keeps the first {@link KNOWLEDGE_TOP_K} hits and drops blank
 * titles and contents, so a caller can paste every excerpt into composer text
 * without re-bounding it.
 */

/** Group a knowledge base belongs to, in the application's presentation order. */
export type KnowledgeBaseKind = 'team' | 'personal'

/** One selectable knowledge base. */
export interface KnowledgeBaseSummary {
  /** Knowledge space id the retrieval API addresses. */
  readonly id: string
  /** Knowledge space title as the application displays it. */
  readonly name: string
  /** Group heading the row renders under. */
  readonly kind: KnowledgeBaseKind
  /** Indexed documents, when the application reports a count. */
  readonly documentCount?: number
}

/** One retrieved passage, already reduced to the fields composer text uses. */
export interface KnowledgeExcerpt {
  /** Document title the passage came from. */
  readonly title: string
  /** Passage text. */
  readonly content: string
}

/** One knowledge base entry as the application's selection projection reports it. */
export interface KnowledgeBaseRecord {
  readonly id?: string
  readonly name?: string
  readonly type?: string
  readonly count?: number
}

/** One retrieval hit, reduced to the fields this catalog reads. */
export interface KnowledgeRetrievalHitLike {
  readonly title?: string
  readonly content?: string
}

/** Request body the generated retrieval endpoint accepts. */
export interface KnowledgeRetrievalRequestLike {
  readonly query: string
  readonly bindings: {
    readonly spaceId: string
    readonly priority: number
    readonly topK: number
  }[]
  readonly topK: number
  readonly includeCitations: boolean
  readonly includeTrace: boolean
}

/** Result frame the generated retrieval endpoint returns. */
export interface KnowledgeRetrievalResultLike {
  readonly hits?: readonly KnowledgeRetrievalHitLike[]
}

/**
 * Structural face of the generated Knowledge Base app client this package
 * calls. The generated client satisfies it; tests supply a fake.
 */
export interface KnowledgeBaseAppClient {
  readonly knowledge: {
    readonly retrievals: {
      create(
        body: KnowledgeRetrievalRequestLike,
        options?: { readonly signal?: AbortSignal },
      ): Promise<KnowledgeRetrievalResultLike>
    }
  }
}

/** Injected capabilities behind the catalog. */
export interface KnowledgeBaseCatalogDeps {
  /** @returns the knowledge bases the application offers for selection. */
  listBases(): Promise<readonly KnowledgeBaseRecord[]>
  /** @returns the generated app client bound to the active environment and tokens. */
  client(): KnowledgeBaseAppClient
}

/** The `ctx.knowledgeBases` service face. */
export interface KnowledgeBaseCatalog {
  /**
   * List the knowledge bases a user can attach to the conversation.
   * @param signal - cancels waiting for the application's selection projection.
   * @returns selectable rows in application order.
   */
  list(signal: AbortSignal): Promise<readonly KnowledgeBaseSummary[]>
  /**
   * Retrieve passages for one query from the given knowledge spaces.
   * @param query - retrieval query.
   * @param spaceIds - knowledge space ids to retrieve from.
   * @param signal - cancels the application request.
   * @returns the first {@link KNOWLEDGE_TOP_K} usable passages.
   */
  retrieve(query: string, spaceIds: readonly string[], signal: AbortSignal): Promise<readonly KnowledgeExcerpt[]>
}

/** Passages requested per knowledge space; also the catalog's hard cap. */
export const KNOWLEDGE_TOP_K = 5

/** Map one application entry to a row, or drop it when it cannot be selected. */
function toSummary(record: KnowledgeBaseRecord): KnowledgeBaseSummary | undefined {
  const id = record.id?.trim() ?? ''
  const name = record.name?.trim() ?? ''
  // `0` is the application's placeholder for "no space resolved yet"; it is not
  // an addressable knowledge space, so it never becomes a selectable row.
  if (id === '' || id === '0' || name === '') return undefined
  // The application reports `personal` for private spaces and `team` for both
  // team and public ones; anything else is a newer group this UI cannot label.
  if (record.type !== 'team' && record.type !== 'personal') return undefined
  const count = typeof record.count === 'number' && record.count >= 0 ? record.count : undefined
  return {
    id,
    name,
    kind: record.type,
    ...(count === undefined ? {} : { documentCount: count }),
  }
}

/**
 * Build the catalog over the injected Knowledge Base application capabilities.
 * @param deps - selection listing and retrieval capabilities.
 * @returns the service registered as `ctx.knowledgeBases`.
 */
export function createKnowledgeBaseCatalog(deps: KnowledgeBaseCatalogDeps): KnowledgeBaseCatalog {
  return {
    async list(signal: AbortSignal): Promise<readonly KnowledgeBaseSummary[]> {
      signal.throwIfAborted()
      const entries = await deps.listBases()
      signal.throwIfAborted()
      const rows: KnowledgeBaseSummary[] = []
      for (const entry of entries) {
        const summary = toSummary(entry)
        if (summary !== undefined) rows.push(summary)
      }
      return rows
    },
    async retrieve(
      query: string,
      spaceIds: readonly string[],
      signal: AbortSignal,
    ): Promise<readonly KnowledgeExcerpt[]> {
      const trimmed = query.trim()
      if (trimmed === '' || spaceIds.length === 0) return []
      signal.throwIfAborted()
      const result = await deps.client().knowledge.retrievals.create({
        query: trimmed,
        bindings: spaceIds.map(spaceId => ({ spaceId, priority: 0, topK: KNOWLEDGE_TOP_K })),
        topK: KNOWLEDGE_TOP_K,
        includeCitations: true,
        includeTrace: false,
      }, { signal })
      signal.throwIfAborted()
      const excerpts: KnowledgeExcerpt[] = []
      for (const hit of result.hits ?? []) {
        const title = hit.title?.trim() ?? ''
        const content = hit.content?.trim() ?? ''
        if (title === '' || content === '') continue
        excerpts.push({ title, content })
        if (excerpts.length === KNOWLEDGE_TOP_K) break
      }
      return excerpts
    },
  }
}

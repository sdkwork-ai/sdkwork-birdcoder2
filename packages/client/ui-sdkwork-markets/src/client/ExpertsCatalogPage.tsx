import { useEffect, useMemo, useState, type ReactElement } from 'react'
import clsx from 'clsx'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarketsKey } from './locales.ts'
import { ExpertsIcon, SearchIcon, TeamsIcon } from './icons.tsx'
import css from './ExpertsCatalogPage.module.css'

/**
 * The Experts tab's single cloud catalog.
 *
 * One surface answers "which expert do I use": the featured collections the
 * catalog curates, the 专家 / 专家团 switch, the sort control, the division
 * chips and the card grid. Every list comes from the SDKWork Agents expert
 * catalog API, so an empty response is an empty market — the page never falls
 * back to a bundled roster.
 *
 * The page header owns the search field (the same contract as the Skills
 * catalog), so this surface starts at its first section and filters by the
 * `searchQuery` prop. Filtering, sorting and grouping run in memory over the
 * loaded catalog: the roster is a few hundred rows, so a round trip per chip
 * click would only add latency.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/ExpertsCatalogPage
 */

/** The two catalog kinds the market shelves. */
export type ExpertsCatalogView = 'experts' | 'teams'

/** Catalog order, all-time popularity, or newest first. */
export type ExpertsCatalogSort = 'comprehensive' | 'popular' | 'latest'

/** The page's translator seat. */
export type ExpertsTranslate = (key: MarketsKey, params?: Record<string, unknown>) => string

/** Standard offset page envelope of the Agents App API. */
export interface ExpertsPageData<T> {
  items: T[]
  pageInfo?: {
    page?: number
    pageSize?: number
    totalItems?: string
    totalPages?: number
    hasMore?: boolean
  }
}

/** Options the generated App SDK list methods accept beside their params. */
export interface ExpertsRequestOptions {
  signal?: AbortSignal
}

/** One catalog division (the market's category chip). */
export interface ExpertDivisionRecord {
  code: string
  name: string
  sortOrder: number
  expertCount: number
}

/**
 * One expert: the managed agent's identity plus the catalog's curated display
 * statistics. `usageCount`, `badgeCode`, `sortOrder` and `publishedAt` are
 * optional in the client because a deployment whose catalog has no profile row
 * yet omits the metric instead of inventing it.
 */
export interface ExpertRecord {
  slug: string
  agentId: string
  name: string
  description: string
  emoji: string
  divisionCode: string
  tags: string[]
  usageCount?: number
  badgeCode?: string | null
  sortOrder?: number
  publishedAt?: string | null
}

/** One ordered team member. */
export interface ExpertTeamMemberRecord {
  expertSlug: string
  expertAgentId: string
  duty: string
  instructions: string
}

/** One expert team: several experts delegated as one unit. */
export interface ExpertTeamRecord {
  teamId: string
  name: string
  description: string
  tags: string[]
  goal: string
  /** The team's shared constraints; optional so an older catalog still renders. */
  constraints?: string
  deliveryRequirements: string
  examples: string[]
  coordinatorMode: string
  coordinatorTemplateId: string
  locale: string
  members: ExpertTeamMemberRecord[]
}

/** One curated expert inside a featured collection. */
export interface ExpertCollectionItemRecord {
  expertSlug: string
  expertAgentId: string
  label: string
  labelEn: string
}

/** One featured collection: the market's curated shelf. */
export interface ExpertCollectionRecord {
  collectionCode: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  coverKey: string
  sortOrder: number
  experts: ExpertCollectionItemRecord[]
}

/** The catalog reads the page performs through the Agents App SDK. */
export interface ExpertsCatalogActions {
  listDivisions(
    params: { page: number; pageSize: number },
    options?: ExpertsRequestOptions,
  ): Promise<ExpertsPageData<ExpertDivisionRecord>>
  listExperts(
    params: { page: number; pageSize: number },
    options?: ExpertsRequestOptions,
  ): Promise<ExpertsPageData<ExpertRecord>>
  listTeams(
    params: { page: number; pageSize: number; locale: string },
    options?: ExpertsRequestOptions,
  ): Promise<ExpertsPageData<ExpertTeamRecord>>
  listCollections(
    params: { page: number; pageSize: number },
    options?: ExpertsRequestOptions,
  ): Promise<ExpertsPageData<ExpertCollectionRecord>>
}

/** Props for {@link ExpertsCatalogPage}. */
export interface ExpertsCatalogPageProps {
  /** The catalog reads; the surface owns the SDK client. */
  actions: ExpertsCatalogActions
  /** Active UI locale (`zh-CN`, `en-US`). */
  locale: string
  t: ExpertsTranslate
  /** The page header's search text. */
  searchQuery?: string
  /** Hand a cleared query back to the page header. */
  onClearSearch?: () => void
  /**
   * Start a conversation with one expert. The owning surface enables the expert
   * in the built-in expert plugin first, so the mention resolves.
   */
  onUseExpert?: (expert: ExpertRecord) => void
  /** Assemble one expert team in a new conversation. */
  onUseTeam?: (team: ExpertTeamRecord) => void
}

const PAGE_SIZE = 200
const MAX_PAGES = 10
const FEATURED_EXPERTS = 3

/** The loaded catalog. */
interface CatalogSnapshot {
  divisions: ExpertDivisionRecord[]
  experts: ExpertRecord[]
  teams: ExpertTeamRecord[]
  collections: ExpertCollectionRecord[]
}

/**
 * Read every page of one list method.
 * @param loadPage - the generated list method bound to this page.
 * @param signal - aborts the run when the page unmounts or reloads.
 * @returns the concatenated rows.
 */
async function loadAllPages<T>(
  loadPage: (page: number, signal: AbortSignal) => Promise<ExpertsPageData<T>>,
  signal: AbortSignal,
): Promise<T[]> {
  const rows: T[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await loadPage(page, signal)
    const batch = Array.isArray(response.items) ? response.items : []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    if (response.pageInfo?.hasMore === false) break
  }
  return rows
}

/**
 * Format a usage statistic in the market's own unit.
 * @param value - the raw count.
 * @param locale - the active UI locale.
 * @param t - the translator, for the locale's magnitude word.
 * @returns `2802.12 万` in Chinese and `28.02M` in English.
 */
export function formatExpertUsage(
  value: number,
  locale: string,
  t: ExpertsTranslate,
): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (locale.toLowerCase().startsWith('en')) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}${t('experts.catalog.unit.million')}`
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}${t('experts.catalog.unit.thousand')}`
    return String(Math.round(value))
  }
  if (value >= 10_000) return `${(value / 10_000).toFixed(2)} ${t('experts.catalog.unit.tenThousand')}`
  return String(Math.round(value))
}

/** Case-insensitive substring match over a row's user-facing text. */
function matchesQuery(query: string, ...fields: readonly (string | undefined)[]): boolean {
  if (query === '') return true
  return fields.some(field => (field ?? '').toLowerCase().includes(query))
}

/** The catalog's own rank for a row, with unranked rows last. */
function orderOf(row: { sortOrder?: number }): number {
  return typeof row.sortOrder === 'number' ? row.sortOrder : Number.MAX_SAFE_INTEGER
}

/** The catalog order: the catalog's own sort, then the name. */
function compareCatalog(
  left: { sortOrder?: number; name: string },
  right: { sortOrder?: number; name: string },
): number {
  const delta = orderOf(left) - orderOf(right)
  return delta === 0 ? left.name.localeCompare(right.name) : delta
}

/** Newest first; rows without a publish timestamp sort last. */
function compareLatest(left: { publishedAt?: string | null }, right: { publishedAt?: string | null }): number {
  const leftTime = left.publishedAt === null || left.publishedAt === undefined ? 0 : Date.parse(left.publishedAt)
  const rightTime = right.publishedAt === null || right.publishedAt === undefined ? 0 : Date.parse(right.publishedAt)
  return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
}

/** The badge chip copy for one badge code, or undefined for an unknown code. */
function badgeKey(code: string | null | undefined): MarketsKey | undefined {
  switch (code) {
    case 'official': return 'experts.catalog.badge.official'
    case 'leader': return 'experts.catalog.badge.leader'
    case 'enterprise': return 'experts.catalog.badge.enterprise'
    default: return undefined
  }
}

/** Up to three tag chips, skipping blanks the catalog may carry. */
function visibleTags(tags: readonly string[]): string[] {
  return tags.map(tag => tag.trim()).filter(tag => tag !== '').slice(0, 3)
}

/**
 * A stable decorative tone for one division. The reference design gives every
 * expert tile its own tint; a hash of the division keeps it stable across
 * renders and sorts without storing colours in the catalog.
 * @param divisionCode - the expert's division.
 * @returns a tone id from `0` to `5`.
 */
function avatarTone(divisionCode: string): number {
  let hash = 0
  for (const char of divisionCode) hash = (hash * 31 + char.codePointAt(0)!) % 6
  return hash
}

/** One expert card. */
function ExpertCard({
  expert, divisionLabel, locale, t, onOpen, onUse,
}: {
  expert: ExpertRecord
  /** The division's display name, used when the catalog serves no subject tags. */
  divisionLabel: string
  locale: string
  t: ExpertsTranslate
  onOpen: () => void
  onUse: () => void
}): ReactElement {
  const badge = badgeKey(expert.badgeCode)
  const tags = visibleTags(expert.tags)
  // The catalog's `tags` are the expert's subject tags. Until a deployment
  // seeds them, the card shows the division it belongs to — the same fact the
  // category facet filters by — rather than an empty rail.
  const chips = tags.length > 0 ? tags : (divisionLabel === '' ? [] : [divisionLabel])
  return (
    <article className={css.card} data-expert-card={expert.slug}>
      <button
        type="button"
        className={css.cardOpen}
        onClick={onOpen}
        aria-label={t('experts.catalog.openExpert', { name: expert.name })}
      >
        <span className={css.cardHeader}>
          <span className={css.avatar} data-tone={avatarTone(expert.divisionCode)} aria-hidden="true">
            {expert.emoji.trim() === '' ? <ExpertsIcon size={20} /> : expert.emoji}
          </span>
          <span className={css.cardTitle}>
            <span className={css.cardName}>{expert.name}</span>
            {badge === undefined ? null : <span className={css.badge}>{t(badge)}</span>}
          </span>
        </span>
        <span className={css.cardDescription}>{expert.description}</span>
        {chips.length === 0 ? null : (
          <span className={css.tags}>
            {chips.map(chip => <span key={chip} className={css.tag}>{chip}</span>)}
          </span>
        )}
      </button>
      <span className={css.cardFooter}>
        <span className={css.usage}>
          {typeof expert.usageCount === 'number' && expert.usageCount > 0
            ? t('experts.catalog.usage', { count: formatExpertUsage(expert.usageCount, locale, t) })
            : t('experts.catalog.usageUnknown')}
        </span>
        <button type="button" className={css.useButton} onClick={onUse}>{t('experts.catalog.use')}</button>
      </span>
    </article>
  )
}

/** One expert-team card: the team, its size and its tagged scope. */
function TeamCard({
  team, t, onOpen, onUse,
}: {
  team: ExpertTeamRecord
  t: ExpertsTranslate
  onOpen: () => void
  onUse: () => void
}): ReactElement {
  const tags = visibleTags(team.tags)
  return (
    <article className={css.card} data-team-card={team.teamId}>
      <button
        type="button"
        className={css.cardOpen}
        onClick={onOpen}
        aria-label={t('experts.catalog.openTeam', { name: team.name })}
      >
        <span className={css.cardHeader}>
          <span className={css.avatar} aria-hidden="true"><TeamsIcon size={20} /></span>
          <span className={css.cardTitle}>
            <span className={css.cardName}>{team.name}</span>
          </span>
        </span>
        <span className={css.cardDescription}>{team.description}</span>
        {tags.length === 0 ? null : (
          <span className={css.tags}>
            {tags.map(tag => <span key={tag} className={css.tag}>{tag}</span>)}
          </span>
        )}
      </button>
      <span className={css.cardFooter}>
        <span className={css.usage}>{t('experts.catalog.memberCount', { count: team.members.length })}</span>
        <button type="button" className={css.useButton} onClick={onUse}>{t('experts.catalog.useTeam')}</button>
      </span>
    </article>
  )
}

/** Loading placeholders shaped like the card grid. */
function CatalogSkeleton({ label }: { label: string }): ReactElement {
  return (
    <div className={css.grid} role="status" aria-label={label}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(index => (
        <div key={index} className={css.skeletonCard} aria-hidden="true">
          <span className={css.skeletonAvatar} />
          <span className={css.skeletonLine} />
          <span className={clsx(css.skeletonLine, css.skeletonShort)} />
        </div>
      ))}
    </div>
  )
}

/**
 * Render the cloud expert catalog.
 * @param props - the catalog reads, locale, translator and the use callbacks.
 */
export function ExpertsCatalogPage({
  actions, locale, t, searchQuery, onClearSearch, onUseExpert, onUseTeam,
}: ExpertsCatalogPageProps): ReactElement {
  const [debouncedQuery, setDebouncedQuery] = useState((searchQuery ?? '').trim())
  const [view, setView] = useState<ExpertsCatalogView>('experts')
  const [sort, setSort] = useState<ExpertsCatalogSort>('comprehensive')
  const [division, setDivision] = useState('')
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [selectedExpert, setSelectedExpert] = useState<ExpertRecord | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<ExpertTeamRecord | null>(null)

  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedQuery((searchQuery ?? '').trim()) }, 250)
    return () => { window.clearTimeout(timeout) }
  }, [searchQuery])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void Promise.all([
      loadAllPages(
        page => actions.listDivisions({ page, pageSize: PAGE_SIZE }, { signal: controller.signal }),
        controller.signal,
      ),
      loadAllPages(
        page => actions.listExperts({ page, pageSize: PAGE_SIZE }, { signal: controller.signal }),
        controller.signal,
      ),
      loadAllPages(
        page => actions.listTeams({ page, pageSize: PAGE_SIZE, locale }, { signal: controller.signal }),
        controller.signal,
      ),
      // The curated shelf is the newest catalog surface, so a deployment whose
      // Agents build predates it answers 404. That must cost only the shelf,
      // never the roster: the section renders from whatever collections the
      // catalog serves, and an absent endpoint is simply no collections.
      loadAllPages(
        page => actions.listCollections({ page, pageSize: PAGE_SIZE }, { signal: controller.signal }),
        controller.signal,
      ).catch((): ExpertCollectionRecord[] => []),
    ]).then(([divisions, experts, teams, collections]) => {
      if (!active) return
      setCatalog({ divisions, experts, teams, collections })
      setLoading(false)
    }).catch((cause: unknown) => {
      if (!active) return
      setError(cause instanceof Error ? cause.message : '')
      setLoading(false)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [actions, locale, reloadNonce])

  const query = debouncedQuery.toLowerCase()
  const divisions = catalog?.divisions ?? []
  const collections = catalog?.collections ?? []

  const divisionOrder = useMemo(() => {
    const order = new Map<string, number>()
    for (const row of catalog?.divisions ?? []) order.set(row.code, row.sortOrder)
    return order
  }, [catalog])

  const expertBySlug = useMemo(() => {
    const index = new Map<string, ExpertRecord>()
    for (const expert of catalog?.experts ?? []) index.set(expert.slug, expert)
    return index
  }, [catalog])

  const divisionLabel = useMemo(() => {
    const labels = new Map<string, string>()
    for (const row of catalog?.divisions ?? []) labels.set(row.code, row.name)
    return labels
  }, [catalog])

  const visibleExperts = useMemo(() => {
    const rows = (catalog?.experts ?? []).filter(expert => (
      (division === '' || expert.divisionCode === division)
      && matchesQuery(query, expert.name, expert.description, expert.slug, ...expert.tags)
    ))
    const sorted = rows.slice()
    if (sort === 'popular') {
      sorted.sort((left, right) => (right.usageCount ?? 0) - (left.usageCount ?? 0) || compareCatalog(left, right))
    } else if (sort === 'latest') {
      sorted.sort((left, right) => compareLatest(left, right) || compareCatalog(left, right))
    } else {
      sorted.sort((left, right) => (
        (divisionOrder.get(left.divisionCode) ?? Number.MAX_SAFE_INTEGER)
        - (divisionOrder.get(right.divisionCode) ?? Number.MAX_SAFE_INTEGER)
        || compareCatalog(left, right)
      ))
    }
    return sorted
  }, [catalog, division, divisionOrder, query, sort])

  // A team carries no division of its own; the chip narrows a team to the teams
  // that actually staff someone from that division, which is what a reader
  // scanning "which team works on design" expects.
  const visibleTeams = useMemo(() => {
    const rows = (catalog?.teams ?? []).filter((team) => {
      const inDivision = division === ''
        || team.members.some(member => expertBySlug.get(member.expertSlug)?.divisionCode === division)
      return inDivision && matchesQuery(query, team.name, team.description, team.teamId, ...team.tags)
    })
    const sorted = rows.slice()
    // A team carries no publish timestamp, so "newest" keeps the catalog's own
    // team order and the name breaks ties; only experts can rank by recency.
    sorted.sort((left, right) => (
      sort === 'latest' ? left.teamId.localeCompare(right.teamId) : left.name.localeCompare(right.name)
    ))
    return sorted
  }, [catalog, division, expertBySlug, query, sort])

  const hasFilter = division !== '' || debouncedQuery !== ''
  const clearFilters = (): void => {
    setDivision('')
    onClearSearch?.()
  }
  const openCollectionExpert = (slug: string): void => {
    const expert = expertBySlug.get(slug)
    if (expert !== undefined) setSelectedExpert(expert)
  }

  const viewTabs: readonly { id: ExpertsCatalogView; label: MarketsKey; count: number }[] = [
    { id: 'experts', label: 'experts.catalog.view.experts', count: visibleExperts.length },
    { id: 'teams', label: 'experts.catalog.view.teams', count: visibleTeams.length },
  ]
  const sortTabs: readonly { id: ExpertsCatalogSort; label: MarketsKey }[] = [
    { id: 'comprehensive', label: 'experts.catalog.sort.comprehensive' },
    { id: 'popular', label: 'experts.catalog.sort.popular' },
    { id: 'latest', label: 'experts.catalog.sort.latest' },
  ]

  return (
    <div className={css.catalog} data-experts-catalog="">
      {collections.length === 0 ? null : (
        <section
          className={css.collectionSection}
          aria-label={t('experts.catalog.collections.title')}
          data-experts-collections=""
        >
          <div className={css.collectionRow}>
            {collections.map(collection => (
              <article
                key={collection.collectionCode}
                className={css.collectionCard}
                data-cover={collection.coverKey}
              >
                <span className={css.collectionCover} aria-hidden="true">
                  <span className={css.collectionCoverMark}>{collection.name.slice(0, 1)}</span>
                </span>
                <h3 className={css.collectionTitle}>{collection.name}</h3>
                <ul className={css.collectionList}>
                  {collection.experts.slice(0, FEATURED_EXPERTS).map(item => (
                    <li key={item.expertAgentId}>
                      <button
                        type="button"
                        className={css.collectionLink}
                        onClick={() => { openCollectionExpert(item.expertSlug) }}
                        disabled={!expertBySlug.has(item.expertSlug)}
                      >
                        {item.label}
                        <span className={css.collectionArrow} aria-hidden="true">↗</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className={css.section} aria-label={t('experts.catalog.title')}>
        {/* One rail: the 专家 / 专家团 switch leads, the sort capsule trails.
            The reference design has no section heading above them, so the
            section keeps its name for assistive technology only. */}
        <div className={css.viewRow}>
          <div className={css.viewTabs} role="tablist" aria-label={t('experts.catalog.view.label')}>
            {viewTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={view === tab.id}
                className={clsx(css.viewTab, view === tab.id && css.viewTabActive)}
                data-view={tab.id}
                onClick={() => { setView(tab.id) }}
              >
                {tab.id === 'experts' ? <ExpertsIcon size={16} /> : <TeamsIcon size={16} />}
                {t(tab.label)}
              </button>
            ))}
          </div>
          <div className={css.sort} role="tablist" aria-label={t('experts.catalog.sort.label')}>
            {sortTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={sort === tab.id}
                className={css.sortTab}
                data-sort={tab.id}
                onClick={() => { setSort(tab.id) }}
              >
                {t(tab.label)}
              </button>
            ))}
          </div>
        </div>

        <div className={css.categories} role="group" aria-label={t('experts.catalog.categories.label')}>
          <button
            type="button"
            aria-pressed={division === ''}
            className={clsx(css.category, division === '' && css.categoryActive)}
            onClick={() => { setDivision('') }}
          >
            {t('experts.catalog.category.all')}
          </button>
          {divisions.map(row => (
            <button
              key={row.code}
              type="button"
              aria-pressed={division === row.code}
              className={clsx(css.category, division === row.code && css.categoryActive)}
              data-division-filter={row.code}
              onClick={() => { setDivision(division === row.code ? '' : row.code) }}
            >
              {row.name}
            </button>
          ))}
        </div>

        {error === null ? null : (
          <div className={css.statePanel} role="alert">
            <h3 className={css.stateTitle}>{t('experts.catalog.error.title')}</h3>
            <p className={css.stateDescription}>{error === '' ? t('experts.catalog.error.detail') : error}</p>
            <Button variant="ghost" onClick={() => { setReloadNonce(nonce => nonce + 1) }}>
              {t('experts.catalog.retry')}
            </Button>
          </div>
        )}

        {error !== null ? null : loading && catalog === null ? (
          <CatalogSkeleton label={t('experts.catalog.loading')} />
        ) : view === 'experts' ? (
          visibleExperts.length === 0 ? (
            <div className={css.statePanel}>
              <span className={css.stateIcon} aria-hidden="true"><SearchIcon size={28} /></span>
              <h3 className={css.stateTitle}>{t('experts.catalog.empty.title')}</h3>
              <p className={css.stateDescription}>{t('experts.catalog.empty.detail')}</p>
              {hasFilter ? <Button variant="ghost" onClick={clearFilters}>{t('experts.catalog.clearFilters')}</Button> : null}
            </div>
          ) : (
            <div className={css.grid} data-experts-grid="">
              {visibleExperts.map(expert => (
                <ExpertCard
                  key={expert.slug}
                  expert={expert}
                  divisionLabel={divisionLabel.get(`expert-${expert.divisionCode}`) ?? divisionLabel.get(expert.divisionCode) ?? ''}
                  locale={locale}
                  t={t}
                  onOpen={() => { setSelectedExpert(expert) }}
                  onUse={() => { onUseExpert?.(expert) }}
                />
              ))}
            </div>
          )
        ) : visibleTeams.length === 0 ? (
          <div className={css.statePanel}>
            <span className={css.stateIcon} aria-hidden="true"><TeamsIcon size={28} /></span>
            <h3 className={css.stateTitle}>{t('experts.catalog.empty.teams.title')}</h3>
            <p className={css.stateDescription}>{t('experts.catalog.empty.teams.detail')}</p>
            {hasFilter ? <Button variant="ghost" onClick={clearFilters}>{t('experts.catalog.clearFilters')}</Button> : null}
          </div>
        ) : (
          <div className={css.grid} data-teams-grid="">
            {visibleTeams.map(team => (
              <TeamCard
                key={team.teamId}
                team={team}
                t={t}
                onOpen={() => { setSelectedTeam(team) }}
                onUse={() => { onUseTeam?.(team) }}
              />
            ))}
          </div>
        )}
      </section>

      {selectedExpert === null ? null : (
        <Modal
          open
          onClose={() => { setSelectedExpert(null) }}
          title={selectedExpert.name}
          description={t('experts.catalog.detail.description')}
          closeLabel={t('dialog.close')}
          footer={(
            <div className={css.detailActions}>
              <Button variant="ghost" onClick={() => { setSelectedExpert(null) }}>{t('dialog.close')}</Button>
              <Button
                variant="primary"
                data-modal-autofocus
                onClick={() => {
                  const expert = selectedExpert
                  setSelectedExpert(null)
                  onUseExpert?.(expert)
                }}
              >
                {t('experts.catalog.use')}
              </Button>
            </div>
          )}
        >
          <div className={css.detailBody}>
            <p className={css.detailDescription}>
              {selectedExpert.description.trim() === ''
                ? t('experts.catalog.detail.noDescription')
                : selectedExpert.description}
            </p>
            <dl className={css.detailMeta}>
              <div>
                <dt>{t('experts.catalog.detail.division')}</dt>
                <dd>
                  {divisionLabel.get(`expert-${selectedExpert.divisionCode}`)
                    ?? divisionLabel.get(selectedExpert.divisionCode)
                    ?? selectedExpert.divisionCode}
                </dd>
              </div>
              {typeof selectedExpert.usageCount === 'number' && selectedExpert.usageCount > 0 ? (
                <div>
                  <dt>{t('experts.catalog.detail.usage')}</dt>
                  <dd>{formatExpertUsage(selectedExpert.usageCount, locale, t)}</dd>
                </div>
              ) : null}
            </dl>
            {selectedExpert.tags.length === 0 ? null : (
              <div className={css.tags} aria-label={t('experts.catalog.detail.tags')}>
                {selectedExpert.tags.map(tag => <span key={tag} className={css.tag}>{tag}</span>)}
              </div>
            )}
          </div>
        </Modal>
      )}

      {selectedTeam === null ? null : (
        <Modal
          open
          onClose={() => { setSelectedTeam(null) }}
          title={selectedTeam.name}
          description={t('experts.catalog.detail.teamDescription')}
          closeLabel={t('dialog.close')}
          footer={(
            <div className={css.detailActions}>
              <Button variant="ghost" onClick={() => { setSelectedTeam(null) }}>{t('dialog.close')}</Button>
              <Button
                variant="primary"
                data-modal-autofocus
                onClick={() => {
                  const team = selectedTeam
                  setSelectedTeam(null)
                  onUseTeam?.(team)
                }}
              >
                {t('experts.catalog.useTeam')}
              </Button>
            </div>
          )}
        >
          <div className={css.detailBody}>
            <p className={css.detailDescription}>{selectedTeam.description}</p>
            <dl className={css.detailMeta}>
              <div>
                <dt>{t('experts.catalog.detail.members')}</dt>
                <dd>{t('experts.catalog.teamMembers', { count: selectedTeam.members.length })}</dd>
              </div>
              <div><dt>{t('experts.catalog.detail.goal')}</dt><dd>{selectedTeam.goal}</dd></div>
              <div>
                <dt>{t('experts.catalog.detail.constraints')}</dt>
                <dd>{selectedTeam.constraints?.trim() === '' || selectedTeam.constraints === undefined
                  ? t('experts.catalog.detail.none')
                  : selectedTeam.constraints}
                </dd>
              </div>
              <div>
                <dt>{t('experts.catalog.detail.delivery')}</dt>
                <dd>{selectedTeam.deliveryRequirements}</dd>
              </div>
            </dl>
            {selectedTeam.members.length === 0 ? null : (
              <ul className={css.memberList}>
                {selectedTeam.members.map(member => (
                  <li key={member.expertAgentId} className={css.memberRow}>
                    <span className={css.memberName}>{expertBySlug.get(member.expertSlug)?.name ?? member.expertSlug}</span>
                    <span className={css.memberDuty}>{member.duty}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

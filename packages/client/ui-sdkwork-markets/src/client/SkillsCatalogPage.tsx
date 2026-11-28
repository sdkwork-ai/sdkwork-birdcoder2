import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  PageInfo,
  SdkworkSkillsAppClient,
  SkillCategoryRecord,
  SkillInstallationRecord,
  SkillRecord,
} from '@sdkwork/skills-app-sdk'
import type { MarketsKey } from './locales.ts'
import { InstalledIcon, PlusIcon, RefreshIcon, SkillsIcon } from './icons.tsx'
import { MarketplaceTabs } from './MarketplaceTabs.tsx'
import css from './SkillsCatalogPage.module.css'

type SkillsSort = 'comprehensive' | 'installs' | 'latest'
type SkillsTranslate = (key: MarketsKey, params?: Record<string, unknown>) => string

interface PageData<T> {
  items: T[]
  pageInfo: PageInfo
}

interface CatalogSnapshot {
  requestKey: string
  skills: SkillRecord[]
  categories: SkillCategoryRecord[]
  installations: SkillInstallationRecord[]
}

type SkillsApi = SdkworkSkillsAppClient['skills']
type SkillPackageApi = SkillsApi['skillPackages']

/** Skills SDK callbacks used by the cloud catalog. */
export interface SkillsCatalogActions {
  listMarketplace: SkillsApi['marketplace']['list']
  listCategories: SkillsApi['skillCategories']['list']
  listInstallations: SkillsApi['skillInstallations']['list']
  listArtifacts: SkillPackageApi['artifacts']['list']
  createInstallation: SkillPackageApi['installations']['create']
}

/**
 * Inputs for the BirdCoder cloud Skills catalog.
 *
 * The page header owns the catalog's search field, its installed filter and its
 * add affordance, so the two filter facts arrive as props and the installed
 * count leaves through {@link SkillsCatalogPageProps.onInstalledCountChange}.
 */
export interface SkillsCatalogPageProps {
  actions: SkillsCatalogActions
  searchQuery?: string
  locale: string
  t: SkillsTranslate
  /** Header-owned: show only the installed skills of the current result set. */
  installedOnly: boolean
  /** Header-owned: toggle the installed filter. */
  onInstalledOnlyChange: (value: boolean) => void
  /**
   * Publish how many of the current results are installed, for the header chip.
   * Called where the catalog commits new data — a load settles, an add lands —
   * so the header never reads a count the catalog has not derived from it.
   */
  onInstalledCountChange: (count: number) => void
  onClearSearch?: () => void
  onAdded: (name: string) => void
  onAddFailed: () => void
}

const SORT_TABS: readonly { id: SkillsSort; label: MarketsKey }[] = [
  { id: 'comprehensive', label: 'skills.catalog.sort.comprehensive' },
  { id: 'installs', label: 'skills.catalog.sort.installs' },
  { id: 'latest', label: 'skills.catalog.sort.latest' },
]

/** The featured shelf shows one batch of five at a time, like the catalog row. */
const FEATURED_BATCH = 5

async function loadAllPages<T>(
  loadPage: (page: number, signal: AbortSignal) => Promise<PageData<T>>,
  signal: AbortSignal,
): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; ; page += 1) {
    const result = await loadPage(page, signal)
    items.push(...result.items)
    const hasMore = result.pageInfo.hasMore
      ?? (result.pageInfo.totalPages !== undefined && page < result.pageInfo.totalPages)
    if (!hasMore || result.items.length === 0) return items
  }
}

function countValue(value: string): number {
  const count = Number.parseInt(value, 10)
  return Number.isFinite(count) ? count : 0
}

function formatCount(value: string, locale: string): string {
  const count = countValue(value)
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(count)
  } catch {
    return String(count)
  }
}

function skillInitials(name: string): string {
  return Array.from(name.trim()).slice(0, 2).join('').toUpperCase()
}

function errorDetail(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : ''
}

function isInstalled(skill: SkillRecord, installations: readonly SkillInstallationRecord[]): boolean {
  return installations.some(installation =>
    installation.skillId === skill.id || installation.packageId === skill.packageId,
  )
}

function installedCountOf(
  skills: readonly SkillRecord[],
  installations: readonly SkillInstallationRecord[],
): number {
  return skills.filter(skill => isInstalled(skill, installations)).length
}

/**
 * One catalog card. The featured shelf and the recommendation grid draw the
 * same anatomy — icon, name, one-line summary, add action, install count — and
 * differ only in their metrics ({@link css.featuredCard}).
 */
function SkillCard({
  skill, locale, t, installed, pending, featured, onOpen, onAdd,
}: {
  skill: SkillRecord
  locale: string
  t: SkillsTranslate
  installed: boolean
  pending: boolean
  featured: boolean
  onOpen: () => void
  onAdd: () => void
}) {
  const actionLabel = installed
    ? t('skills.catalog.added')
    : pending
      ? t('skills.catalog.adding')
      : t('skills.catalog.addAria', { name: skill.name })

  return (
    <article
      className={clsx(css.card, featured && css.featuredCard)}
      data-skill-card={skill.id}
      data-skill-featured={featured ? '' : undefined}
    >
      <div className={css.cardTop}>
        <span className={css.skillIcon} aria-hidden="true">
          {skillInitials(skill.name) || <SkillsIcon size={featured ? 22 : 18} />}
        </span>
        <div className={css.cardBody}>
          <button type="button" className={css.cardName} onClick={onOpen}>{skill.name}</button>
          <p className={css.cardDescription}>{skill.summary?.trim() || t('skills.catalog.noDescription')}</p>
        </div>
        <button
          type="button"
          className={clsx(css.cardAction, installed && css.cardActionInstalled)}
          aria-label={actionLabel}
          title={actionLabel}
          disabled={installed || pending}
          onClick={onAdd}
        >
          {installed ? <InstalledIcon size={16} /> : pending ? <span className={css.spinner} /> : <PlusIcon size={16} />}
        </button>
      </div>
      <div className={css.cardMeta}>
        <span className={css.cardStat}>
          {t('skills.catalog.installCount', { count: formatCount(skill.installCount, locale) })}
        </span>
      </div>
    </article>
  )
}

function CatalogSkeleton({ label }: { label: string }) {
  return (
    <div className={css.grid} role="status" aria-label={label}>
      {Array.from({ length: 10 }, (_, index) => (
        <div key={index} className={css.skeletonCard} aria-hidden="true">
          <span className={css.skeletonIcon} />
          <span className={css.skeletonLine} />
          <span className={clsx(css.skeletonLine, css.skeletonShort)} />
          <span className={clsx(css.skeletonLine, css.skeletonMedium)} />
        </div>
      ))}
    </div>
  )
}

/** Cloud Skills catalog with featured, category, sort, detail, and add views. */
export function SkillsCatalogPage({
  actions,
  searchQuery = '',
  locale,
  t,
  installedOnly,
  onInstalledOnlyChange,
  onInstalledCountChange,
  onClearSearch,
  onAdded,
  onAddFailed,
}: SkillsCatalogPageProps) {
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery.trim())
  const [categoryCode, setCategoryCode] = useState('')
  const [sort, setSort] = useState<SkillsSort>('comprehensive')
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [featuredOffset, setFeaturedOffset] = useState(0)
  const [selectedSkill, setSelectedSkill] = useState<SkillRecord | null>(null)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const pendingIdsRef = useRef(new Set<string>())
  const actionControllers = useRef(new Set<AbortController>())
  // The header chip's reporter: a latest-callback ref keeps the load effect off
  // a dependency that an inline callback would re-create on every render.
  const reportInstalledCount = useRef(onInstalledCountChange)
  useEffect(() => { reportInstalledCount.current = onInstalledCountChange })

  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedQuery(searchQuery.trim()) }, 250)
    return () => { window.clearTimeout(timeout) }
  }, [searchQuery])

  useEffect(() => () => {
    for (const controller of actionControllers.current) controller.abort()
    actionControllers.current.clear()
  }, [])

  const requestKey = `${debouncedQuery}\u0000${categoryCode}`

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)

    void Promise.all([
      loadAllPages((page, signal) => actions.listMarketplace({
        page,
        pageSize: 48,
        ...(debouncedQuery === '' ? {} : { q: debouncedQuery }),
        ...(categoryCode === '' ? {} : { categoryCode }),
      }, { signal }), controller.signal),
      loadAllPages((page, signal) => actions.listCategories({ page, pageSize: 200, categoryType: 'skill_market' }, { signal }), controller.signal),
      loadAllPages((page, signal) => actions.listInstallations({ page, pageSize: 200 }, { signal }), controller.signal),
    ]).then(([skills, categoryRows, installations]) => {
      if (!active) return
      const categories = categoryRows
        .filter(category => category.visible && category.status === 1 && category.categoryType === 'skill_market')
        .slice()
        .sort((left, right) => left.sortWeight - right.sortWeight)
      setCatalog({ requestKey, skills, categories, installations })
      setLoading(false)
      // Commit the header fact together with the data it is derived from.
      reportInstalledCount.current(installedCountOf(skills, installations))
    }).catch((cause: unknown) => {
      if (!active) return
      const detail = errorDetail(cause)
      setError(detail === '' ? null : detail)
      setLoading(false)
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [actions, debouncedQuery, categoryCode, reloadNonce, requestKey])

  const visibleCatalog = catalog?.requestKey === requestKey ? catalog : null
  const skills = visibleCatalog?.skills ?? []
  const categories = catalog?.categories ?? []
  const installations = catalog?.installations ?? []
  const installedSkills = useMemo(
    () => skills.filter(skill => isInstalled(skill, installations)),
    [installations, skills],
  )

  const visibleSkills = useMemo(() => {
    const filtered = installedOnly ? installedSkills : skills.slice()
    return filtered.sort((left, right) => {
      if (sort === 'installs') return countValue(right.installCount) - countValue(left.installCount)
      if (sort === 'latest') return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      return Number(right.featured) - Number(left.featured)
    })
  }, [installedOnly, installedSkills, skills, sort])

  // The featured shelf draws one batch of five; "show another batch" advances
  // the window through the featured set and wraps once it runs out.
  const featuredPool = useMemo(() => skills.filter(skill => skill.featured), [skills])
  const featuredSkills = useMemo(() => {
    if (featuredPool.length <= FEATURED_BATCH) return featuredPool
    const start = featuredOffset % featuredPool.length
    return Array.from(
      { length: Math.min(FEATURED_BATCH, featuredPool.length) },
      (_, index) => featuredPool[(start + index) % featuredPool.length],
    )
  }, [featuredOffset, featuredPool])

  const showAnotherBatch = () => {
    setFeaturedOffset(current => (current + FEATURED_BATCH) % Math.max(featuredPool.length, 1))
  }

  const addSkill = async (skill: SkillRecord) => {
    if (pendingIdsRef.current.has(skill.id) || isInstalled(skill, installations)) return
    pendingIdsRef.current.add(skill.id)
    setPendingIds(new Set(pendingIdsRef.current))
    setNotice(null)
    const controller = new AbortController()
    actionControllers.current.add(controller)

    try {
      const artifacts = await loadAllPages(
        (page, signal) => actions.listArtifacts(skill.packageId, { page, pageSize: 20 }, { signal }),
        controller.signal,
      )
      const artifact = artifacts.find(candidate =>
        candidate.status === 'published' && candidate.versionLabel === skill.version,
      )
      if (artifact === undefined) {
        setNotice(t('skills.catalog.missingArtifact', { version: skill.version }))
        return
      }
      const installation = await actions.createInstallation(
        skill.packageId,
        { artifactId: artifact.id },
        { signal: controller.signal },
      )
      setCatalog(current => current === null ? current : {
        ...current,
        installations: [...current.installations, installation],
      })
      // The add is a commit point for the header fact too: the new installation
      // is counted before the toast reports success.
      reportInstalledCount.current(installedCountOf(skills, [...installations, installation]))
      onAdded(skill.name)
    } catch {
      if (!controller.signal.aborted) onAddFailed()
    } finally {
      actionControllers.current.delete(controller)
      pendingIdsRef.current.delete(skill.id)
      setPendingIds(new Set(pendingIdsRef.current))
    }
  }

  const clearFilters = () => {
    setCategoryCode('')
    onInstalledOnlyChange(false)
    onClearSearch?.()
  }

  const renderCard = (skill: SkillRecord, featured: boolean) => (
    <SkillCard
      key={`${featured ? 'featured' : 'grid'}-${skill.id}`}
      skill={skill}
      locale={locale}
      t={t}
      installed={isInstalled(skill, installations)}
      pending={pendingIds.has(skill.id)}
      featured={featured}
      onOpen={() => { setSelectedSkill(skill) }}
      onAdd={() => { void addSkill(skill) }}
    />
  )

  return (
    <div className={css.catalog}>
      {notice !== null && (
        <div className={clsx(css.notice, css.noticeError)} role="alert">
          {notice}
        </div>
      )}

      {featuredSkills.length > 0 && (
        <section className={css.section} aria-labelledby="skills-featured-title">
          <div className={css.sectionHeading}>
            <h2 id="skills-featured-title" className={css.sectionTitle}>{t('skills.catalog.featured')}</h2>
            {featuredPool.length > FEATURED_BATCH && (
              <button
                type="button"
                className={css.refresh}
                data-skills-refresh=""
                onClick={showAnotherBatch}
              >
                <RefreshIcon size={14} className={css.refreshIcon} />
                {t('skills.catalog.refreshFeatured')}
              </button>
            )}
          </div>
          <div className={css.featuredGrid}>
            {featuredSkills.map(skill => renderCard(skill, true))}
          </div>
        </section>
      )}

      <section className={css.section} aria-labelledby="skills-recommended-title">
        <div className={css.sectionHeading}>
          <h2 id="skills-recommended-title" className={css.sectionTitle}>{t('skills.catalog.recommended')}</h2>
          <div className={css.sort}>
            <MarketplaceTabs
              tabs={SORT_TABS.map(tab => ({ ...tab, label: t(tab.label) }))}
              selected={sort}
              ariaLabel={t('skills.catalog.sortLabel')}
              onSelect={setSort}
            />
          </div>
        </div>

        {categories.length > 0 && (
          <div className={css.categories} aria-label={t('skills.catalog.categoriesLabel')}>
            <button
              type="button"
              className={clsx(css.category, categoryCode === '' && css.categoryActive)}
              aria-pressed={categoryCode === ''}
              onClick={() => { setCategoryCode('') }}
            >
              {t('skills.catalog.allCategories')}
            </button>
            {categories.map(category => (
              <button
                key={category.id}
                type="button"
                className={clsx(css.category, categoryCode === category.code && css.categoryActive)}
                aria-pressed={categoryCode === category.code}
                onClick={() => { setCategoryCode(category.code) }}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}

        {loading && visibleCatalog === null ? (
          <CatalogSkeleton label={t('skills.catalog.loading')} />
        ) : visibleCatalog === null ? (
          <div className={css.statePanel} role="alert">
            <h3 className={css.stateTitle}>{t('skills.catalog.errorTitle')}</h3>
            <p className={css.stateDescription}>{error ?? t('skills.catalog.loadFailed')}</p>
            <Button variant="toolbar" onClick={() => { setReloadNonce(value => value + 1) }}>{t('skills.catalog.retry')}</Button>
          </div>
        ) : (
          <>
            {error !== null && (
              <div className={clsx(css.notice, css.noticeError)} role="alert">
                <span>{error}</span>
                <Button size="sm" variant="ghost" onClick={() => { setReloadNonce(value => value + 1) }}>{t('skills.catalog.retry')}</Button>
              </div>
            )}
            {visibleSkills.length === 0 ? (
              <div className={css.statePanel}>
                <span className={css.emptyIcon} aria-hidden="true"><SkillsIcon size={30} /></span>
                <h3 className={css.stateTitle}>{t('skills.catalog.emptyTitle')}</h3>
                <p className={css.stateDescription}>{t('skills.catalog.emptyDescription')}</p>
                <Button variant="toolbar" onClick={clearFilters}>{t('skills.catalog.clearFilters')}</Button>
              </div>
            ) : (
              <div className={css.grid}>{visibleSkills.map(skill => renderCard(skill, false))}</div>
            )}
          </>
        )}
      </section>

      {selectedSkill !== null && (
        <Modal
          open
          onClose={() => { setSelectedSkill(null) }}
          title={selectedSkill.name}
          description={t('skills.catalog.detailDescription')}
          closeLabel={t('dialog.close')}
          contentClassName={css.detailContent}
          footer={(
            <div className={css.detailActions}>
              <Button variant="ghost" onClick={() => { setSelectedSkill(null) }}>{t('dialog.close')}</Button>
              <Button
                variant="primary"
                disabled={isInstalled(selectedSkill, installations) || pendingIds.has(selectedSkill.id)}
                data-modal-autofocus
                onClick={() => { void addSkill(selectedSkill) }}
              >
                {isInstalled(selectedSkill, installations)
                  ? t('skills.catalog.added')
                  : pendingIds.has(selectedSkill.id)
                    ? t('skills.catalog.adding')
                    : t('skills.catalog.addToCloud')}
              </Button>
            </div>
          )}
        >
          <div className={css.detailBody}>
            <p className={css.detailDescription}>{selectedSkill.description?.trim() || selectedSkill.summary?.trim() || t('skills.catalog.noDescription')}</p>
            <dl className={css.detailMeta}>
              <div><dt>{t('skills.catalog.version')}</dt><dd>{selectedSkill.version}</dd></div>
              <div><dt>{t('skills.catalog.installCountLabel')}</dt><dd>{formatCount(selectedSkill.installCount, locale)}</dd></div>
            </dl>
            {selectedSkill.tags.length > 0 && (
              <div className={css.tags} aria-label={t('skills.catalog.tags')}>
                {selectedSkill.tags.map(tag => <span key={tag} className={css.tag}>{tag}</span>)}
              </div>
            )}
            <p className={css.detailNote}>{t('skills.catalog.cloudNote')}</p>
          </div>
        </Modal>
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  PageInfo,
  SdkworkSkillsAppClient,
  SkillCategoryRecord,
  SkillInstallationRecord,
  SkillRecord,
} from '@sdkwork/skills-app-sdk'
import type { MarketsKey } from './locales.ts'
import type { SkillhubDetail, SkillhubInstalledSkill } from '@deepseek-ai/dsh-sdkwork-skillhub/shared'
import { CheckPlateIcon, PlusIcon, RefreshIcon, SkillsIcon } from './icons.tsx'
import { MarketplaceTabs } from './MarketplaceTabs.tsx'
import {
  SkillInstallerError,
  fetchSkillDetail,
  installSkill as installLocalSkill,
  listInstalledSkills,
  setSkillEnabled,
  uninstallSkill,
} from './skillsInstaller.ts'
import {
  FeaturedShelfView,
  shelvesFromEntries,
  shelvesFromPayload,
  type FeaturedEntryFace,
  type FeaturedShelfMessages,
} from '@sdkwork/featured-pc-react'
import type { FeaturedShelfPayload } from '@sdkwork/featured-contracts'
import { MarketsDialog } from './MarketsDialog.tsx'
import css from './SkillsCatalogPage.module.css'

/** Tag prefix the catalog mirror uses to carry a record's upstream install coordinate. */
const SOURCE_TAG_PREFIX = 'skillhub:'

/**
 * Read the upstream install coordinate a mirrored record carries.
 * The catalog stores it as a `skillhub:<handle>/<slug>` tag because the Skills
 * API record has no package key; seed records without it are not local-installable.
 */
function skillSource(skill: SkillRecord): string | undefined {
  const tag = skill.tags.find(entry => entry.startsWith(SOURCE_TAG_PREFIX))
  const coordinate = tag?.slice(SOURCE_TAG_PREFIX.length).trim()
  return coordinate === undefined || coordinate === '' ? undefined : `skillhub.${coordinate}`
}

/** Display tags, without the internal install-coordinate tag. */
function displayTags(skill: SkillRecord): readonly string[] {
  return skill.tags.filter(entry => !entry.startsWith(SOURCE_TAG_PREFIX))
}

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
  /** Curated shelves of this catalog; empty when the service has none. */
  featuredShelves: FeaturedShelfPayload[]
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
  /** Curated shelves of the skills catalog; absent on clients without the route. */
  listFeaturedShelves?: SkillsApi['featuredShelves']['list']
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

/**
 * The curated shelves of the skills catalog.
 *
 * Curation is its own model, and a service may not have adopted it yet: a
 * missing route answers nothing and the catalog falls back to its featured
 * records. Any other failure belongs to the catalog request and surfaces there.
 *
 * @param actions - the skills catalog actions.
 * @param signal - aborts with the catalog request.
 * @returns the shelves, or an empty list when the service has none.
 */
async function loadFeaturedShelves(
  actions: SkillsCatalogActions,
  signal: AbortSignal,
): Promise<FeaturedShelfPayload[]> {
  const list = actions.listFeaturedShelves
  if (list === undefined) return []
  try {
    const page = await list({ scope: 'skill' }, { signal })
    return (page.items ?? []).map(shelf => ({
      shelfCode: shelf.shelfCode,
      scope: 'skill',
      kind: shelf.kind === 'collection' ? 'collection' : 'item',
      title: shelf.title,
      description: shelf.description ?? undefined,
      artworkUrl: shelf.artworkUrl ?? undefined,
      sortOrder: shelf.sortOrder,
      items: shelf.items.map(item => ({
        itemKey: item.itemKey,
        sortOrder: item.sortOrder,
        installWithCollection: item.installWithCollection ?? true,
        displayName: item.displayName ?? undefined,
        displayDescription: item.displayDescription ?? undefined,
      })),
    }))
  } catch {
    return []
  }
}

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

/** The record is installed on this machine through the Host installer. */
function isLocallyInstalled(skill: SkillRecord, installed: readonly SkillhubInstalledSkill[]): boolean {
  const packageKey = skillSource(skill)
  return packageKey !== undefined && installed.some(entry => entry.packageKey === packageKey)
}

/** Installed either locally (SkillHub) or in the cloud library (seed records). */
function isSkillInstalled(
  skill: SkillRecord,
  installations: readonly SkillInstallationRecord[],
  installed: readonly SkillhubInstalledSkill[],
): boolean {
  return isLocallyInstalled(skill, installed) || isInstalled(skill, installations)
}

function countInstalled(
  skills: readonly SkillRecord[],
  installations: readonly SkillInstallationRecord[],
  installed: readonly SkillhubInstalledSkill[],
): number {
  return skills.filter(skill => isSkillInstalled(skill, installations, installed)).length
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
          {installed ? <CheckPlateIcon size={17} /> : pending ? <span className={css.spinner} /> : <PlusIcon size={16} />}
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
  // Local (SkillHub) installs: the Host holds the files and reports what it
  // holds, so this list is the page's only statement of "installed on this
  // machine". Cloud-library records from the seed catalog keep their own flow.
  const [installed, setInstalled] = useState<readonly SkillhubInstalledSkill[]>([])
  const [installingKeys, setInstallingKeys] = useState<ReadonlySet<string>>(new Set())
  const [detail, setDetail] = useState<SkillhubDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const [installNotice, setInstallNotice] = useState<string | null>(null)
  const installedRef = useRef<readonly SkillhubInstalledSkill[]>([])
  const pendingIdsRef = useRef(new Set<string>())
  const actionControllers = useRef(new Set<AbortController>())
  // The header chip's reporter: a latest-callback ref keeps the load effect off
  // a dependency that an inline callback would re-create on every render.
  const reportInstalledCount = useRef(onInstalledCountChange)
  useEffect(() => { reportInstalledCount.current = onInstalledCountChange })

  useEffect(() => {
    let active = true
    void listInstalledSkills().then((skills) => {
      if (!active) return
      installedRef.current = skills
      setInstalled(skills)
    }).catch(() => {
      // A composition without the installer host keeps the cloud-library flow.
    })
    return () => { active = false }
  }, [])

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
      loadFeaturedShelves(actions, controller.signal),
    ]).then(([skills, categoryRows, installations, featuredShelves]) => {
      if (!active) return
      const categories = categoryRows
        .filter(category => category.visible && category.status === 1 && category.categoryType === 'skill_market')
        .slice()
        .sort((left, right) => left.sortWeight - right.sortWeight)
      setCatalog({ requestKey, skills, categories, installations, featuredShelves })
      setLoading(false)
      // Commit the header fact together with the data it is derived from.
      reportInstalledCount.current(countInstalled(skills, installations, installedRef.current))
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
  const installedById = useMemo(
    () => new Map(installed.map(entry => [entry.packageKey, entry])),
    [installed],
  )
  const installedSkills = useMemo(
    () => skills.filter(skill => isSkillInstalled(skill, installations, installed)),
    [installations, installed, skills],
  )

  /** Local installation state for one record, when it is locally installed. */
  const localInstallOf = (skill: SkillRecord): SkillhubInstalledSkill | undefined => {
    const packageKey = skillSource(skill)
    return packageKey === undefined ? undefined : installedById.get(packageKey)
  }

  const visibleSkills = useMemo(() => {
    const filtered = installedOnly ? installedSkills : skills.slice()
    return filtered.sort((left, right) => {
      if (sort === 'installs') return countValue(right.installCount) - countValue(left.installCount)
      if (sort === 'latest') return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      return Number(right.featured) - Number(left.featured)
    })
  }, [installedOnly, installedSkills, skills, sort])

  // The featured shelf draws one batch of five; "show another batch" advances
  // the window through the featured set and wraps once it runs out. The shelf
  // obeys the header's installed filter like the grid below it, so a filtered
  // page never shows a card the filter would have excluded.
  const featuredPool = useMemo(
    () => (installedOnly ? installedSkills : skills).filter(skill => skill.featured),
    [installedOnly, installedSkills, skills],
  )
  const featuredSkills = useMemo(() => {
    if (featuredPool.length <= FEATURED_BATCH) return featuredPool
    const start = featuredOffset % featuredPool.length
    return Array.from(
      { length: Math.min(FEATURED_BATCH, featuredPool.length) },
      (_, index) => featuredPool[(start + index) % featuredPool.length],
    )
  }, [featuredOffset, featuredPool])

  // The featured shelf shares the marketplace's curation module: the page only
  // supplies its records and its own install actions.
  const featuredShelves = useMemo(() => {
    const recordsByKey = new Map<string, SkillRecord>()
    for (const skill of catalog?.skills ?? []) {
      recordsByKey.set(skill.packageId, skill)
      recordsByKey.set(skill.id, skill)
    }
    const curated = catalog?.featuredShelves ?? []
    if (curated.length > 0) return shelvesFromPayload(curated, recordsByKey)
    return shelvesFromEntries(
      featuredSkills,
      skill => skill.id,
      skill => ({ title: skill.name, description: skill.summary?.trim() || undefined }),
      'skill',
    )
  }, [catalog, featuredSkills])
  const featuredShelfMessages: FeaturedShelfMessages = {
    install: t('skills.shelf.install'),
    installing: t('skills.shelf.installing'),
    installed: t('skills.shelf.installed'),
    installAll: t('skills.shelf.installAll'),
    installingAll: t('skills.shelf.installingAll'),
    itemCount: count => t('skills.shelf.itemCount', { count }),
    openCollection: title => t('skills.shelf.openCollection', { title }),
    close: t('skills.shelf.close'),
  }
  const featuredShelfFace: FeaturedEntryFace<SkillRecord> = {
    title: skill => skill.name,
    description: skill => skill.summary?.trim() || '',
    installed: skill => isSkillInstalled(skill, installations, installed),
    installing: (skill) => {
      const packageKey = skillSource(skill)
      return packageKey === undefined ? pendingIds.has(skill.id) : installingKeys.has(packageKey)
    },
    install: (skill) => {
      const packageKey = skillSource(skill)
      if (packageKey !== undefined) void installFromSkillHub(skill)
      else void addSkill(skill)
    },
  }

  const showAnotherBatch = () => {
    setFeaturedOffset(current => (current + FEATURED_BATCH) % Math.max(featuredPool.length, 1))
  }

  const addSkill = async (skill: SkillRecord) => {
    if (pendingIdsRef.current.has(skill.id) || isSkillInstalled(skill, installations, installedRef.current)) return
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
      reportInstalledCount.current(countInstalled(skills, [...installations, installation], installedRef.current))
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

  /** Re-read the Host ledger and publish the header count it implies. */
  const refreshInstalled = async (skillsForCount: readonly SkillRecord[] = skills): Promise<void> => {
    const next = await listInstalledSkills()
    installedRef.current = next
    setInstalled(next)
    reportInstalledCount.current(countInstalled(skillsForCount, installations, next))
  }

  const installFailure = (error: unknown): void => {
    const failure = error instanceof SkillInstallerError ? error : undefined
    setNotice(failure?.code === 'unsupported-coordinate'
      ? t('skills.catalog.installUnsupported')
      : t('skills.catalog.installFailed'))
  }

  /** Install a SkillHub record into the Harness skill root through the Host. */
  const installFromSkillHub = async (skill: SkillRecord, version?: string): Promise<void> => {
    const packageKey = skillSource(skill)
    if (packageKey === undefined || installingKeys.has(packageKey)) return
    setInstallingKeys(current => new Set(current).add(packageKey))
    setInstallNotice(null)
    setNotice(null)
    try {
      await installLocalSkill(packageKey, version)
      setInstallNotice(t('skills.catalog.installDone', { name: skill.name }))
      await refreshInstalled()
    } catch (error) {
      installFailure(error)
    } finally {
      setInstallingKeys((current) => {
        const next = new Set(current)
        next.delete(packageKey)
        return next
      })
    }
  }

  /** Enable or disable an installed skill by moving its directory. */
  const toggleInstalled = async (skill: SkillRecord, enabled: boolean): Promise<void> => {
    const packageKey = skillSource(skill)
    if (packageKey === undefined) return
    setNotice(null)
    try {
      await setSkillEnabled(packageKey, enabled)
      setInstallNotice(enabled ? t('skills.catalog.skillEnabled') : t('skills.catalog.skillDisabled'))
      await refreshInstalled()
    } catch (error) {
      installFailure(error)
    }
  }

  /** Remove an installed skill's directory and ledger row. */
  const uninstallInstalled = async (skill: SkillRecord): Promise<void> => {
    const packageKey = skillSource(skill)
    if (packageKey === undefined) return
    setNotice(null)
    setConfirmUninstall(false)
    try {
      await uninstallSkill(packageKey)
      setInstallNotice(null)
      await refreshInstalled()
    } catch (error) {
      installFailure(error)
    }
  }

  /** Open the drawer; mirrored records also load their upstream detail. */
  const openSkill = (skill: SkillRecord): void => {
    setSelectedSkill(skill)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(false)
    setConfirmUninstall(false)
    setInstallNotice(null)
    const packageKey = skillSource(skill)
    if (packageKey === undefined) return
    setDetailLoading(true)
    void fetchSkillDetail(packageKey).then((next) => {
      setDetail(next)
    }).catch((cause: unknown) => {
      const failure = cause instanceof SkillInstallerError ? cause : undefined
      setDetailError(failure?.message ?? t('skills.catalog.detailUnavailable'))
    }).finally(() => {
      setDetailLoading(false)
    })
  }

  const renderCard = (skill: SkillRecord, featured: boolean) => {
    const packageKey = skillSource(skill)
    return (
      <SkillCard
        key={`${featured ? 'featured' : 'grid'}-${skill.id}`}
        skill={skill}
        locale={locale}
        t={t}
        installed={isSkillInstalled(skill, installations, installed)}
        pending={packageKey !== undefined ? installingKeys.has(packageKey) : pendingIds.has(skill.id)}
        featured={featured}
        onOpen={() => { openSkill(skill) }}
        onAdd={() => {
          if (packageKey !== undefined) void installFromSkillHub(skill)
          else void addSkill(skill)
        }}
      />
    )
  }

  return (
    <div className={css.catalog}>
      {notice !== null && (
        <div className={clsx(css.notice, css.noticeError)} role="alert">
          {notice}
        </div>
      )}

      {installNotice !== null && (
        <div className={css.notice} role="status" data-install-notice="">
          <span>{installNotice}</span>
          <span className={css.noticeNote}>{t('skills.catalog.restartNotice')}</span>
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
          {/* The skills catalog draws its featured shelf through the same module
              as every other catalog: single placements today, collections when
              the Skills service serves them. */}
          <FeaturedShelfView
            shelves={featuredShelves}
            messages={featuredShelfMessages}
            face={featuredShelfFace}
          />
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
        <MarketsDialog
          open
          onClose={() => { setSelectedSkill(null) }}
          title={selectedSkill.name}
          description={t('skills.catalog.detailDescription')}
          closeLabel={t('dialog.close')}
          footer={(
            <div className={css.detailActions}>
              <Button variant="ghost" onClick={() => { setSelectedSkill(null) }}>{t('dialog.close')}</Button>
              {skillSource(selectedSkill) !== undefined ? (
                <Button
                  variant="primary"
                  disabled={installingKeys.has(skillSource(selectedSkill)!)}
                  data-modal-autofocus
                  onClick={() => { void installFromSkillHub(selectedSkill) }}
                >
                  {installingKeys.has(skillSource(selectedSkill)!)
                    ? t('skills.catalog.installing')
                    : localInstallOf(selectedSkill) !== undefined
                      ? t('skills.catalog.reinstall')
                      : t('skills.catalog.install')}
                </Button>
              ) : (
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
              )}
            </div>
          )}
        >
          <div className={css.detailBody}>
            <p className={css.detailDescription}>{selectedSkill.description?.trim() || selectedSkill.summary?.trim() || t('skills.catalog.noDescription')}</p>
            {installNotice !== null && (
              <p className={css.installNotice} role="status">
                {installNotice}
                {' '}
                {t('skills.catalog.restartNotice')}
              </p>
            )}
            <dl className={css.detailMeta}>
              <div><dt>{t('skills.catalog.version')}</dt><dd>{detail?.version ?? selectedSkill.version}</dd></div>
              <div><dt>{t('skills.catalog.installCountLabel')}</dt><dd>{formatCount(selectedSkill.installCount, locale)}</dd></div>
            </dl>
            {localInstallOf(selectedSkill) !== undefined && (() => {
              const local = localInstallOf(selectedSkill)!
              return (
                <div className={css.installActions} data-installed-skill={local.id}>
                  <span className={css.installState}>
                    {local.enabled ? t('skills.catalog.enabledState') : t('skills.catalog.disabledState')}
                    {' · '}
                    {t('skills.catalog.installedVersion', { version: local.version })}
                    {' · '}
                    {t('skills.catalog.installedFiles', { count: String(local.files) })}
                  </span>
                  <div className={css.installButtons}>
                    <Button size="sm" variant="toolbar" onClick={() => { void toggleInstalled(selectedSkill, !local.enabled) }}>
                      {local.enabled ? t('skills.catalog.disable') : t('skills.catalog.enable')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirmUninstall) void uninstallInstalled(selectedSkill)
                        else setConfirmUninstall(true)
                      }}
                    >
                      {confirmUninstall ? t('skills.catalog.confirmUninstall') : t('skills.catalog.uninstall')}
                    </Button>
                  </div>
                </div>
              )
            })()}
            <div className={css.statusLines}>
              {detailLoading && <p className={css.detailNote} role="status">{t('skills.catalog.detailLoading')}</p>}
              {detailError !== null && <p className={css.detailNote} role="alert">{detailError}</p>}
            </div>
            {detail !== null && detail.versions.length > 0 && (
              <div className={css.versions}>
                <h3 className={css.detailSectionTitle}>{t('skills.catalog.versions')}</h3>
                <ul className={css.versionList}>
                  {detail.versions.slice(0, 8).map((version) => {
                    const current = localInstallOf(selectedSkill)?.version === version.version
                    const safe = version.security.length > 0 && version.security.every(report => report.status === 'benign')
                    return (
                      <li key={version.version} className={css.versionRow}>
                        <span className={css.versionLabel}>{version.version}</span>
                        <span className={css.versionNote}>
                          {version.security.length === 0
                            ? t('skills.catalog.securityNone')
                            : safe
                              ? t('skills.catalog.securitySafe')
                              : t('skills.catalog.securityMixed')}
                        </span>
                        {current
                          ? <span className={css.versionCurrent}>{t('skills.catalog.currentVersion')}</span>
                          : (
                            <button
                              type="button"
                              className={css.versionInstall}
                              disabled={installingKeys.has(skillSource(selectedSkill)!)}
                              onClick={() => { void installFromSkillHub(selectedSkill, version.version) }}
                            >
                              {t('skills.catalog.installVersion')}
                            </button>
                          )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {displayTags(selectedSkill).length > 0 && (
              <div className={css.tags} aria-label={t('skills.catalog.tags')}>
                {displayTags(selectedSkill).map(tag => <span key={tag} className={css.tag}>{tag}</span>)}
              </div>
            )}
            <p className={css.detailNote}>
              {skillSource(selectedSkill) !== undefined
                ? t('skills.catalog.localNote')
                : t('skills.catalog.cloudNote')}
            </p>
          </div>
        </MarketsDialog>
      )}
    </div>
  )
}

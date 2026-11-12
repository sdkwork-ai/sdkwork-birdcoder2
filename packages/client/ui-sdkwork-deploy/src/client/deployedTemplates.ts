/**
 * Caller-owned app-template inventory for the settings-menu drawer's
 * "我的应用模板" tab: the paged read of the caller's template listings
 * (`template.appTemplates.list`, which is already account-scoped), the latest
 * semantic version each listing currently points at, the status facet the tab
 * narrows by, and the recency ordering the rows render in.
 *
 * Pure module on purpose: every decision the tab makes about *which rows it
 * shows* is a function here, so it is testable without a rendered tab and the
 * component only composes it.
 */
import type { AppTemplateResponse } from '@sdkwork/deployments-app-sdk'
import type { DeployKey } from './locales.ts'
import { walkAccountPages, type AccountListPage, type AccountListSnapshot } from './pagedAccount.ts'

/**
 * Rows pulled per request. The contract caps `page_size` at 200; 100 matches
 * the deployments ledger beside this tab.
 */
export const OWNED_TEMPLATES_PAGE_SIZE = 100

/** Ceiling on {@link loadOwnedTemplates}: 5 × 100 rows, reported as truncated. */
export const OWNED_TEMPLATES_MAX_PAGES = 5

/** One page of the template listing, as the generated client returns it. */
export interface OwnedTemplatesPage extends AccountListPage<AppTemplateResponse> {}

/** The caller's complete reachable set, plus whether the ceiling cut it short. */
export interface OwnedTemplatesSnapshot extends AccountListSnapshot<AppTemplateResponse> {}

/**
 * Walk every page of the caller's own template listings.
 *
 * Termination, the short-page fallback, and the page ceiling are the shared
 * {@link walkAccountPages} contract, shared with the app ledger beside this tab.
 * @param loadPage - loads one page (1-based) of the caller's templates.
 * @returns the accumulated rows and whether the ceiling cut the walk short.
 */
export async function loadOwnedTemplates(
  loadPage: (page: number) => Promise<OwnedTemplatesPage>,
): Promise<OwnedTemplatesSnapshot> {
  return walkAccountPages(loadPage, OWNED_TEMPLATES_PAGE_SIZE, OWNED_TEMPLATES_MAX_PAGES)
}

/** One template status as the listing contract spells it. */
export type TemplateStatus = AppTemplateResponse['status']

/**
 * `app_template.status` → dictionary key for the row badge and the facet chips.
 * The copy is shared with the template center's install tab: the same five
 * statuses, and two surfaces that named them differently would make the same
 * listing read as two different states.
 */
export const TEMPLATE_STATUS_LABEL_KEYS: Readonly<Record<TemplateStatus, DeployKey>> = {
  DRAFT: 'templateCenter.download.status.draft',
  PENDING_REVIEW: 'templateCenter.download.status.pending',
  PUBLISHED: 'templateCenter.download.status.published',
  REJECTED: 'templateCenter.download.status.rejected',
  DISABLED: 'templateCenter.download.status.disabled',
}

/**
 * Display rank of each status: the published listings an operator looks for
 * first, then the ones waiting on review, then drafts, then the states that
 * need attention. A complete map on purpose: a contract status added later
 * becomes a compile error here and in {@link TEMPLATE_STATUS_LABEL_KEYS}
 * together, so that status can neither lose its chip nor its label.
 */
const TEMPLATE_STATUS_RANK: Readonly<Record<TemplateStatus, number>> = {
  PUBLISHED: 0,
  PENDING_REVIEW: 1,
  DRAFT: 2,
  REJECTED: 3,
  DISABLED: 4,
}

/** Every known status in facet display order. */
export const TEMPLATE_STATUS_ORDER: readonly TemplateStatus[] =
  (Object.keys(TEMPLATE_STATUS_LABEL_KEYS) as TemplateStatus[])
    .sort((left, right) => TEMPLATE_STATUS_RANK[left] - TEMPLATE_STATUS_RANK[right])

/** One chip in the template-status facet, with the count of rows it matches. */
export interface TemplateStatusFacet {
  readonly status: TemplateStatus
  /** Rows of this status in the loaded set; zero-count facets stay in this list. */
  readonly count: number
}

/**
 * Count the loaded rows per status, in facet display order.
 *
 * Zero-count statuses are returned on purpose: a chip that disappears once its
 * count reaches zero cannot be switched off again after the caller selected it.
 * The tab itself renders only the populated chips, counted from the full loaded
 * set — the filter never shrinks that set, so a selected chip never loses its
 * own count.
 * @param templates - the caller's loaded templates.
 * @returns one entry per known status, in {@link TEMPLATE_STATUS_ORDER}.
 */
export function countTemplateStatusFacets(
  templates: readonly AppTemplateResponse[],
): readonly TemplateStatusFacet[] {
  const counts = new Map<string, number>()
  for (const template of templates) counts.set(template.status, (counts.get(template.status) ?? 0) + 1)
  return TEMPLATE_STATUS_ORDER.map(status => ({ status, count: counts.get(status) ?? 0 }))
}

/**
 * Apply the template-status facet: a multi-select with OR semantics.
 *
 * An empty selection is "the caller has not narrowed statuses", not "nothing
 * matches", so the tab opens on every template.
 * @param templates - the caller's loaded templates.
 * @param statuses - selected statuses; empty means no narrowing.
 * @returns the templates whose status is selected, in the input order.
 */
export function filterTemplatesByStatus(
  templates: readonly AppTemplateResponse[],
  statuses: ReadonlySet<TemplateStatus>,
): AppTemplateResponse[] {
  return statuses.size === 0 ? [...templates] : templates.filter(template => statuses.has(template.status))
}

/** Parse a wire timestamp, tolerating absent and malformed values. */
function timestampOf(value: string | undefined): number {
  if (value === undefined || value === '') return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Newest first, so a just-published template leads the list. Ties keep their
 * input order (the array sort is stable), which is the server's own order.
 * @param templates - the rows to order.
 * @returns a fresh array in descending `updatedAt` order.
 */
export function sortTemplatesByUpdatedAt(
  templates: readonly AppTemplateResponse[],
): AppTemplateResponse[] {
  return [...templates].sort((left, right) => timestampOf(right.updatedAt) - timestampOf(left.updatedAt))
}

/** The version page one listing resolves against, as far as this module reads it. */
export interface TemplateVersionPage {
  readonly items: readonly { readonly id: string; readonly templateVersion?: string | undefined }[]
}

/**
 * Read the latest semantic version of one listing out of its version page.
 *
 * The listing's own `version` field is an optimistic-lock counter, not a
 * version number, so it is never displayed. The page is matched by
 * `latestVersionUuid` and falls back to its first row for a server that does
 * not echo that pointer (the newest version leads the page).
 * @param latestVersionUuid - the listing's `latestVersionUuid`, if the server sent one.
 * @param page - the listing's version page, if it could be read.
 * @returns the semantic version, or undefined when neither side can supply one.
 */
export function latestTemplateVersion(
  latestVersionUuid: string | undefined,
  page: TemplateVersionPage | undefined,
): string | undefined {
  if (latestVersionUuid === undefined || page === undefined) return undefined
  const matched = page.items.find(item => item.id === latestVersionUuid) ?? page.items[0]
  const semantic = matched?.templateVersion?.trim() ?? ''
  return semantic === '' ? undefined : semantic
}

/** Version-page reads kept in flight together while resolving a listing set. */
const TEMPLATE_VERSION_CONCURRENCY = 4

/**
 * Resolve the latest semantic version of every listing that has one.
 *
 * Version reads are independent side facts: a listing whose read fails (or
 * whose server omits the version page) keeps showing no version, and the tab
 * still lists the row. Failures are therefore swallowed per listing rather
 * than rejecting the whole set. Reads run as a small worker pool so a large
 * account does not turn one tab open into a burst of hundreds of parallel
 * requests, and the caller's signal stops the remaining reads when the tab
 * closes.
 * @param templates - the loaded listings.
 * @param loadVersions - loads one listing's version page with the call's signal.
 * @param options - the caller's abort signal.
 * @returns template id → semantic version, omitting listings without one.
 */
export async function resolveTemplateVersions(
  templates: readonly AppTemplateResponse[],
  loadVersions: (templateId: string, signal?: AbortSignal | undefined) => Promise<TemplateVersionPage>,
  options: { readonly signal?: AbortSignal | undefined } = {},
): Promise<Readonly<Record<string, string>>> {
  const { signal } = options
  const versions: Record<string, string> = {}
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < templates.length && signal?.aborted !== true) {
      const template = templates[next]
      next += 1
      /* v8 ignore next -- the loop bound keeps the index inside the array; the guard only satisfies the indexed-access type. */
      if (template === undefined) continue
      const uuid = template.latestVersionUuid
      if (uuid === undefined) continue
      try {
        const version = latestTemplateVersion(uuid, await loadVersions(template.id, signal))
        if (version !== undefined) versions[template.id] = version
      } catch {
        // A listing whose version page cannot be read keeps no version badge.
      }
    }
  }
  const workers = Math.min(TEMPLATE_VERSION_CONCURRENCY, templates.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return versions
}

/**
 * Whether a wire install count names a non-zero adoption figure. The contract
 * sends a decimal string; anything else (absent, malformed, zero) stays hidden
 * rather than printing a badge that says "0".
 * @param value - the listing's `installCount`.
 * @returns true when the count parses to a positive number.
 */
export function hasInstallCount(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return false
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
}

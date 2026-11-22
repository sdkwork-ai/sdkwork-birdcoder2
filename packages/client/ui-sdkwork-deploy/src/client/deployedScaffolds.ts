/**
 * Caller-owned app-scaffold inventory for the settings-menu drawer's
 * "我的应用脚手架" tab: the paged read of the caller's scaffold listings
 * (`app.scaffolds.list`, which is already account-scoped), the latest
 * semantic version each listing currently points at, the status facet the tab
 * narrows by, and the recency ordering the rows render in.
 *
 * Pure module on purpose: every decision the tab makes about *which rows it
 * shows* is a function here, so it is testable without a rendered tab and the
 * component only composes it.
 */
import type { ApplicationScaffoldResponse } from '@sdkwork/deployments-app-sdk'
import type { DeployKey } from './locales.ts'
import { walkAccountPages, type AccountListPage, type AccountListSnapshot } from './pagedAccount.ts'

/**
 * Rows pulled per request. The contract caps `page_size` at 200; 100 matches
 * the deployments ledger beside this tab.
 */
export const OWNED_TEMPLATES_PAGE_SIZE = 100

/** Ceiling on {@link loadOwnedScaffolds}: 5 × 100 rows, reported as truncated. */
export const OWNED_TEMPLATES_MAX_PAGES = 5

/** One page of the scaffold listing, as the generated client returns it. */
export interface OwnedScaffoldsPage extends AccountListPage<ApplicationScaffoldResponse> {}

/** The caller's complete reachable set, plus whether the ceiling cut it short. */
export interface OwnedScaffoldsSnapshot extends AccountListSnapshot<ApplicationScaffoldResponse> {}

/**
 * Walk every page of the caller's own scaffold listings.
 *
 * Termination, the short-page fallback, and the page ceiling are the shared
 * {@link walkAccountPages} contract, shared with the app ledger beside this tab.
 * @param loadPage - loads one page (1-based) of the caller's scaffolds.
 * @returns the accumulated rows and whether the ceiling cut the walk short.
 */
export async function loadOwnedScaffolds(
  loadPage: (page: number) => Promise<OwnedScaffoldsPage>,
): Promise<OwnedScaffoldsSnapshot> {
  return walkAccountPages(loadPage, OWNED_TEMPLATES_PAGE_SIZE, OWNED_TEMPLATES_MAX_PAGES)
}

/** One scaffold status as the listing contract spells it. */
export type ScaffoldStatus = ApplicationScaffoldResponse['status']

/**
 * `app_scaffold.status` → dictionary key for the row badge and the facet chips.
 * The copy is shared with the scaffold center's install tab: the same five
 * statuses, and two surfaces that named them differently would make the same
 * listing read as two different states.
 */
export const SCAFFOLD_STATUS_LABEL_KEYS: Readonly<Record<ScaffoldStatus, DeployKey>> = {
  DRAFT: 'scaffoldCenter.download.status.draft',
  PENDING_REVIEW: 'scaffoldCenter.download.status.pending',
  PUBLISHED: 'scaffoldCenter.download.status.published',
  REJECTED: 'scaffoldCenter.download.status.rejected',
  DISABLED: 'scaffoldCenter.download.status.disabled',
}

/**
 * Display rank of each status: the published listings an operator looks for
 * first, then the ones waiting on review, then drafts, then the states that
 * need attention. A complete map on purpose: a contract status added later
 * becomes a compile error here and in {@link SCAFFOLD_STATUS_LABEL_KEYS}
 * together, so that status can neither lose its chip nor its label.
 */
const SCAFFOLD_STATUS_RANK: Readonly<Record<ScaffoldStatus, number>> = {
  PUBLISHED: 0,
  PENDING_REVIEW: 1,
  DRAFT: 2,
  REJECTED: 3,
  DISABLED: 4,
}

/** Every known status in facet display order. */
export const SCAFFOLD_STATUS_ORDER: readonly ScaffoldStatus[] =
  (Object.keys(SCAFFOLD_STATUS_LABEL_KEYS) as ScaffoldStatus[])
    .sort((left, right) => SCAFFOLD_STATUS_RANK[left] - SCAFFOLD_STATUS_RANK[right])

/** One chip in the scaffold-status facet, with the count of rows it matches. */
export interface ScaffoldStatusFacet {
  readonly status: ScaffoldStatus
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
 * @param scaffolds - the caller's loaded scaffolds.
 * @returns one entry per known status, in {@link SCAFFOLD_STATUS_ORDER}.
 */
export function countScaffoldStatusFacets(
  scaffolds: readonly ApplicationScaffoldResponse[],
): readonly ScaffoldStatusFacet[] {
  const counts = new Map<string, number>()
  for (const scaffold of scaffolds) counts.set(scaffold.status, (counts.get(scaffold.status) ?? 0) + 1)
  return SCAFFOLD_STATUS_ORDER.map(status => ({ status, count: counts.get(status) ?? 0 }))
}

/**
 * Apply the scaffold-status facet: a multi-select with OR semantics.
 *
 * An empty selection is "the caller has not narrowed statuses", not "nothing
 * matches", so the tab opens on every scaffold.
 * @param scaffolds - the caller's loaded scaffolds.
 * @param statuses - selected statuses; empty means no narrowing.
 * @returns the scaffolds whose status is selected, in the input order.
 */
export function filterScaffoldsByStatus(
  scaffolds: readonly ApplicationScaffoldResponse[],
  statuses: ReadonlySet<ScaffoldStatus>,
): ApplicationScaffoldResponse[] {
  return statuses.size === 0 ? [...scaffolds] : scaffolds.filter(scaffold => statuses.has(scaffold.status))
}

/** Parse a wire timestamp, tolerating absent and malformed values. */
function timestampOf(value: string | undefined): number {
  if (value === undefined || value === '') return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Newest first, so a just-published scaffold leads the list. Ties keep their
 * input order (the array sort is stable), which is the server's own order.
 * @param scaffolds - the rows to order.
 * @returns a fresh array in descending `updatedAt` order.
 */
export function sortScaffoldsByUpdatedAt(
  scaffolds: readonly ApplicationScaffoldResponse[],
): ApplicationScaffoldResponse[] {
  return [...scaffolds].sort((left, right) => timestampOf(right.updatedAt) - timestampOf(left.updatedAt))
}

/** The version page one listing resolves against, as far as this module reads it. */
export interface ScaffoldVersionPage {
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
export function latestScaffoldVersion(
  latestVersionUuid: string | undefined,
  page: ScaffoldVersionPage | undefined,
): string | undefined {
  if (latestVersionUuid === undefined || page === undefined) return undefined
  const matched = page.items.find(item => item.id === latestVersionUuid) ?? page.items[0]
  const semantic = matched?.templateVersion?.trim() ?? ''
  return semantic === '' ? undefined : semantic
}

/** Version-page reads kept in flight together while resolving a listing set. */
const SCAFFOLD_VERSION_CONCURRENCY = 4

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
 * @param scaffolds - the loaded listings.
 * @param loadVersions - loads one listing's version page with the call's signal.
 * @param options - the caller's abort signal.
 * @returns scaffold id → semantic version, omitting listings without one.
 */
export async function resolveScaffoldVersions(
  scaffolds: readonly ApplicationScaffoldResponse[],
  loadVersions: (templateId: string, signal?: AbortSignal | undefined) => Promise<ScaffoldVersionPage>,
  options: { readonly signal?: AbortSignal | undefined } = {},
): Promise<Readonly<Record<string, string>>> {
  const { signal } = options
  const versions: Record<string, string> = {}
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < scaffolds.length && signal?.aborted !== true) {
      const scaffold = scaffolds[next]
      next += 1
      /* v8 ignore next -- the loop bound keeps the index inside the array; the guard only satisfies the indexed-access type. */
      if (scaffold === undefined) continue
      const uuid = scaffold.latestVersionUuid
      if (uuid === undefined) continue
      try {
        const version = latestScaffoldVersion(uuid, await loadVersions(scaffold.id, signal))
        if (version !== undefined) versions[scaffold.id] = version
      } catch {
        // A listing whose version page cannot be read keeps no version badge.
      }
    }
  }
  const workers = Math.min(SCAFFOLD_VERSION_CONCURRENCY, scaffolds.length)
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

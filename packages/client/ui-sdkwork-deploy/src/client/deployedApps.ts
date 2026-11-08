/**
 * Deployed-applications inventory model for the settings-menu drawer:
 * the paged read of the caller's own `deploy_app` rows (the deployments app
 * API's `apps.list` under the `USER` ownership scope), the application-kind
 * facet the drawer narrows by, the recency ordering the list renders, and the
 * `deploy_app` enum → dictionary mapping.
 *
 * Pure module on purpose: every decision the drawer makes about *which rows it
 * shows* is a function here, so it is testable without a rendered drawer and
 * the component only composes it.
 */
import type { AppKind, AppResponse, AppStatus } from '@sdkwork/deployments-app-sdk'
import type { DeployKey } from './locales.ts'

/**
 * Rows pulled per request. The contract caps `page_size` at 200; 100 keeps one
 * request comfortably inside the cap while the whole caller-owned set usually
 * fits in one page.
 */
export const OWNED_APPS_PAGE_SIZE = 100

/** Ceiling on {@link loadOwnedApps}: 5 × 100 rows, reported as truncated. */
export const OWNED_APPS_MAX_PAGES = 5

/** One page of the deployments app list, as the generated client returns it. */
export interface OwnedAppsPage {
  readonly items: readonly AppResponse[]
  readonly pageInfo?: { readonly hasMore?: boolean | undefined } | undefined
}

/** The caller's complete reachable set, plus whether the ceiling cut it short. */
export interface OwnedAppsSnapshot {
  readonly items: AppResponse[]
  /** True when the ceiling stopped the walk while the server still had rows. */
  readonly truncated: boolean
}

/**
 * Walk every page of the caller's own applications.
 *
 * Termination uses the server's `hasMore` when it sends one and the short-page
 * rule otherwise, so a host that wraps the client without forwarding `pageInfo`
 * still stops; an empty page always terminates. The page ceiling keeps a
 * runaway tenant from turning one drawer open into an unbounded request loop.
 * @param loadPage - loads one page (1-based) of the caller's applications.
 * @returns the accumulated rows and whether the ceiling cut the walk short.
 */
export async function loadOwnedApps(
  loadPage: (page: number) => Promise<OwnedAppsPage>,
): Promise<OwnedAppsSnapshot> {
  const items: AppResponse[] = []
  for (let page = 1; ; page += 1) {
    const result = await loadPage(page)
    items.push(...result.items)
    if (result.items.length === 0) return { items, truncated: false }
    // Widened before reading: the generated envelope declares `pageInfo`
    // required, but a wrapper may not forward it, and the short-page fallback
    // has to survive that.
    const pageInfo: { hasMore?: boolean | undefined } | undefined = result.pageInfo
    const hasMore = pageInfo?.hasMore ?? result.items.length >= OWNED_APPS_PAGE_SIZE
    if (!hasMore) return { items, truncated: false }
    if (page === OWNED_APPS_MAX_PAGES) return { items, truncated: true }
  }
}

/** `deploy_app.app_kind` → dictionary key for the row badge and the facet chips. */
export const APP_KIND_LABEL_KEYS: Readonly<Record<AppKind, DeployKey>> = {
  SPA_WEB: 'deployments.kind.spaWeb',
  STATIC_WEB: 'deployments.kind.staticWeb',
  DESKTOP_APP: 'deployments.kind.desktop',
  WECHAT_MINIPROGRAM: 'deployments.kind.wechatMiniProgram',
  DOUYIN_MINIPROGRAM: 'deployments.kind.douyinMiniProgram',
  ANDROID_APP: 'deployments.kind.android',
  IOS_APP: 'deployments.kind.ios',
  HARMONYOS_APP: 'deployments.kind.harmonyos',
  API_SERVICE: 'deployments.kind.apiService',
}

/**
 * Display rank of each kind, by surface family: web, desktop, mini programs,
 * mobile native, then backend. A complete map on purpose: the contract adding a
 * kind becomes a compile error here and in {@link APP_KIND_LABEL_KEYS} together,
 * so that kind can neither lose its facet chip nor its label.
 */
const APP_KIND_RANK: Readonly<Record<AppKind, number>> = {
  SPA_WEB: 0,
  STATIC_WEB: 1,
  DESKTOP_APP: 2,
  WECHAT_MINIPROGRAM: 3,
  DOUYIN_MINIPROGRAM: 4,
  ANDROID_APP: 5,
  IOS_APP: 6,
  HARMONYOS_APP: 7,
  API_SERVICE: 8,
}

/** Every known kind in facet display order. */
export const APP_KIND_ORDER: readonly AppKind[] = (Object.keys(APP_KIND_LABEL_KEYS) as AppKind[])
  .sort((left, right) => APP_KIND_RANK[left] - APP_KIND_RANK[right])

/** `deploy_app.app_status` → dictionary key for the row status badge. */
export const APP_STATUS_LABEL_KEYS: Readonly<Record<AppStatus, DeployKey>> = {
  DRAFT: 'deployments.status.draft',
  READY: 'deployments.status.ready',
  ACTIVE: 'deployments.status.active',
  PAUSED: 'deployments.status.paused',
  ARCHIVED: 'deployments.status.archived',
  FAILED: 'deployments.status.failed',
}

/** One chip in the application-kind facet, with the count of rows it matches. */
export interface AppKindFacet {
  readonly appKind: AppKind
  /** Rows of this kind in the loaded set; zero-count facets stay in this list. */
  readonly count: number
}

/**
 * Count the loaded rows per `app_kind`, in facet display order.
 *
 * Zero-count kinds are returned on purpose: a chip that disappears once its
 * count reaches zero cannot be switched off again after the caller selected it.
 * The drawer itself renders only the populated chips, counted from the full
 * loaded set — the filter never shrinks that set, so a selected chip never
 * loses its own count.
 * @param apps - the caller's loaded rows.
 * @returns one entry per known kind, in {@link APP_KIND_ORDER}.
 */
export function countAppKindFacets(apps: readonly AppResponse[]): readonly AppKindFacet[] {
  const counts = new Map<string, number>()
  for (const app of apps) counts.set(app.appKind, (counts.get(app.appKind) ?? 0) + 1)
  return APP_KIND_ORDER.map(appKind => ({ appKind, count: counts.get(appKind) ?? 0 }))
}

/**
 * Apply the application-kind facet: a multi-select with OR semantics.
 *
 * An empty selection is "the caller has not narrowed types", not "nothing
 * matches", so the drawer opens on every deployed app.
 * @param apps - the caller's loaded rows.
 * @param kinds - selected kinds; empty means no narrowing.
 * @returns the rows whose kind is selected, in the input order.
 */
export function filterAppsByKind(
  apps: readonly AppResponse[],
  kinds: ReadonlySet<AppKind>,
): AppResponse[] {
  return kinds.size === 0 ? [...apps] : apps.filter(app => kinds.has(app.appKind))
}

/** Parse a wire timestamp, tolerating absent and malformed values. */
function timestampOf(value: string | undefined): number {
  if (value === undefined || value === '') return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Newest first, so a just-published app leads the list. Ties keep their input
 * order (the array sort is stable), which is the server's own order.
 * @param apps - the rows to order.
 * @returns a fresh array in descending `updatedAt` order.
 */
export function sortAppsByUpdatedAt(apps: readonly AppResponse[]): AppResponse[] {
  return [...apps].sort((left, right) => timestampOf(right.updatedAt) - timestampOf(left.updatedAt))
}

/**
 * Render a wire timestamp as a stable, locale-free minute form so the drawer
 * does not depend on the viewer's time zone or locale.
 * @param value - the wire timestamp.
 * @returns `YYYY-MM-DD HH:mm` (UTC), or an empty string when absent or invalid.
 */
export function formatUpdatedAt(value: string | undefined): string {
  if (value === undefined || value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16).replace('T', ' ')
}

/** First code point of a display name, uppercased, with a blank-name guard. */
export function initialOf(name: string): string {
  const first = [...name.trim()][0]
  return first === undefined ? '?' : first.toUpperCase()
}

/** One-line cause text for localized failure copy. */
export function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : String(cause)
}

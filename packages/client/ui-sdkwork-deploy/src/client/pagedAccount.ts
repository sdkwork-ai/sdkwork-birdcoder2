/**
 * The paged account-listing walk both settings-menu ledgers use.
 *
 * The deployments app API pages every account-scoped listing (the caller's
 * `deploy_app` rows and the caller's template listings) the same way: a
 * 1-based page parameter, a `pageInfo.hasMore` hint, and a per-request row cap.
 * Keeping the walk here means the two inventories cannot drift on termination,
 * truncation reporting, or the request-storm ceiling.
 */

/** One page of an account-scoped listing, as the generated clients return it. */
export interface AccountListPage<Row> {
  readonly items: readonly Row[]
  readonly pageInfo?: { readonly hasMore?: boolean | undefined } | undefined
}

/** A complete reachable set, plus whether the page ceiling cut it short. */
export interface AccountListSnapshot<Row> {
  readonly items: Row[]
  /** True when the ceiling stopped the walk while the server still had rows. */
  readonly truncated: boolean
}

/**
 * Walk every page of one account-scoped listing.
 *
 * Termination uses the server's `hasMore` when it sends one and the short-page
 * rule otherwise, so a host that wraps the client without forwarding `pageInfo`
 * still stops; an empty page always terminates. The page ceiling keeps a
 * runaway account from turning one drawer open into an unbounded request loop.
 * @param loadPage - loads one page (1-based) of the account's rows.
 * @param pageSize - rows requested per page; the short-page fallback uses it.
 * @param maxPages - page ceiling before the walk reports truncation.
 * @returns the accumulated rows and whether the ceiling cut the walk short.
 */
export async function walkAccountPages<Row>(
  loadPage: (page: number) => Promise<AccountListPage<Row>>,
  pageSize: number,
  maxPages: number,
): Promise<AccountListSnapshot<Row>> {
  const items: Row[] = []
  for (let page = 1; ; page += 1) {
    const result = await loadPage(page)
    items.push(...result.items)
    if (result.items.length === 0) return { items, truncated: false }
    // Widened before reading: the generated envelope declares `pageInfo`
    // required, but a wrapper may not forward it, and the short-page fallback
    // has to survive that.
    const pageInfo: { hasMore?: boolean | undefined } | undefined = result.pageInfo
    const hasMore = pageInfo?.hasMore ?? result.items.length >= pageSize
    if (!hasMore) return { items, truncated: false }
    if (page === maxPages) return { items, truncated: true }
  }
}

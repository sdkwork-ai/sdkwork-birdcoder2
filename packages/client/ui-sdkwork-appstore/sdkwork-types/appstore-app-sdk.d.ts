import type { AuthTokenManager } from '@sdkwork/sdk-common'

/** SDKWork media resource attached to a public listing. */
export interface MediaResource {
  id: string
  kind: string
  url?: string
  driveNodeId?: string
}

/** Public listing summary returned by catalog search. */
export interface ListingSummary {
  id: string
  appKey: string
  displayName: string
  subtitle?: string
  listingSlug: string
  pricingModel: 'FREE' | 'PAID' | 'FREEMIUM' | 'SUBSCRIPTION'
  developerName?: string
  description?: string
  icon?: MediaResource
  currentVersion?: string
  fileSizeBytes?: string
  averageRating?: string
  ratingCount?: number
  whatsNewSummary?: string
  releasedAt?: string
  primaryCategoryId?: string
}

/** Localized public catalog category. */
export interface Category {
  id: string
  categoryCode?: string
  localizations: Array<{
    locale: string
    displayName: string
    description?: string
  }>
}

/** Public storefront home feed. */
export interface HomeFeedData {
  featuredSlots: Array<{ listingId: string }>
  collections: Array<{
    id: string
    collectionCode?: string
    localizations: Array<{
      locale: string
      displayName: string
      description?: string
    }>
    items: Array<{ listingId: string; sortOrder?: number }>
  }>
  charts: readonly unknown[]
}

/** A catalog collection returned by the storefront API. */
export interface CatalogCollection {
  id: string
  collectionCode?: string
  localizations: Array<{
    locale: string
    displayName: string
    description?: string
  }>
  items: Array<{ listingId: string; sortOrder?: number }>
}

/** A loosely typed event row returned by the current SDK endpoint. */
export interface CatalogEvent {
  id?: string
  title?: string
  subtitle?: string
  description?: string
  status?: string
  startsAt?: string
  endsAt?: string
  bannerColor?: string
}

/** Composed App Store client surface consumed by the mode. */
export interface AppStoreClient {
  readonly catalog: {
    getHome(): Promise<HomeFeedData>
    listCategories(params?: { limit?: number; locale?: string }): Promise<{ items: Category[] }>
    listCollections(params?: { limit?: number }): Promise<{ items: CatalogCollection[] }>
    listRecommendations(params?: { locale?: string; platform?: string; limit?: number }): Promise<{ items: ListingSummary[] }>
    listRecentlyUpdated(params?: { locale?: string; limit?: number }): Promise<{ items: ListingSummary[] }>
    listEvents(params?: { status?: string; limit?: number }): Promise<{ items: CatalogEvent[] }>
    searchListings(params?: { q?: string; categoryId?: string; ids?: string[]; limit?: number }): Promise<{ items: ListingSummary[] }>
  }
}

/** Create the composed App Store app client. */
export declare function createAppStoreClient(config: {
  baseUrl: string
  tokenManager: AuthTokenManager
}): AppStoreClient

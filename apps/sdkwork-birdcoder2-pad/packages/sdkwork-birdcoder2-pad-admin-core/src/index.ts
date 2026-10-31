/**
 * Public contract of `@sdkwork/birdcoder2-pad-admin-core`.
 *
 * Surface: `backend-admin` for the tablet root.
 * This is the only pad boundary allowed to export backend SDK wrappers.
 */
export * from './sdk/index.js'

export interface AdminOperatorContext {
  readonly operatorId: string
  readonly tenantId: string
  readonly permissions: readonly string[]
}

export interface AdminRouteGuard {
  readonly routeId: string
  readonly permissionHint: string
  readonly auditAction: string
}

export const packageId = '@sdkwork/birdcoder2-pad-admin-core' as const

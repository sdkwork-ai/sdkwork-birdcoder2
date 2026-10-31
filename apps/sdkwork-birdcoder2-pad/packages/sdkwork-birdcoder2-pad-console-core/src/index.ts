/**
 * Public contract of `@sdkwork/birdcoder2-pad-console-core`.
 *
 * Surface: user console for the tablet root.
 * Layer role: `frontend-core`.
 */
export interface ConsoleSdkProvider {
  readonly appApi: unknown
  readonly appbaseAppApi: unknown
}

export interface ConsolePermissionHint {
  readonly permission: string
  readonly scope: 'tenant' | 'organization' | 'self'
}

export const packageId = '@sdkwork/birdcoder2-pad-console-core' as const

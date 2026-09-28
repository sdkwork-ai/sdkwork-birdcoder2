import type { BirdCoder2H5RouteRegistry } from '@sdkwork/birdcoder2-h5-core'
import {
  birdCoder2H5RouteRegistry,
  type BirdCoder2H5ShellLabels,
} from '@sdkwork/birdcoder2-h5-shell'

import type { EnvironmentSelection } from './environment'
import { createIamRuntime, type IamRuntime } from './iamRuntime'
import { createShellLabels } from './routes'
import { createSdkClients, type SdkClients } from './sdkClients'
import { createTokenManager, type TokenManager } from './tokenManager'

/**
 * Everything the rendered app is given.
 *
 * Held as one object so `main.tsx` stays composition-only, and so the ordering
 * that matters — token manager before transport, transport before IAM — is
 * expressed in exactly one place.
 */
export interface AppRuntime {
  readonly environment: EnvironmentSelection
  readonly sdk: SdkClients
  readonly tokens: TokenManager
  readonly iam: IamRuntime
  /** The frozen route registry assembled from every installed capability. */
  readonly registry: BirdCoder2H5RouteRegistry
  /** Shell copy, aggregated here so the shell imports no capability catalog. */
  readonly labels: BirdCoder2H5ShellLabels
}

/**
 * H5 composition root: the only place that constructs the token manager, the
 * SDK clients, and the IAM runtime.
 *
 * The registry is built during bootstrap rather than at first render, so a
 * duplicated route identity or a path claimed twice fails the boot with a
 * message that names both capability packages.
 */
export async function createRuntime(options: { environment: EnvironmentSelection }): Promise<AppRuntime> {
  const tokens = createTokenManager()
  const sdk = await createSdkClients(options.environment, tokens)
  const iam = createIamRuntime(sdk, tokens)
  return {
    environment: options.environment,
    sdk,
    tokens,
    iam,
    registry: birdCoder2H5RouteRegistry(),
    labels: createShellLabels(),
  }
}

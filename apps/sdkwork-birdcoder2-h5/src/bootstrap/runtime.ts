import { resolveEnvironment } from './environment'
import { createIamRuntime } from './iamRuntime'
import { createSdkClients, type SdkClients } from './sdkClients'
import { createTokenManager } from './tokenManager'
import type { AppRoutesContribution } from './routes'

export interface AppRuntime {
  readonly environment: ReturnType<typeof resolveEnvironment>
  readonly sdk: SdkClients
  readonly tokens: ReturnType<typeof createTokenManager>
  readonly iam: ReturnType<typeof createIamRuntime>
  readonly routes: readonly AppRoutesContribution[]
}

/** H5 composition root: the only place that constructs SDK clients and the IAM runtime. */
export async function createRuntime(options: { environment: ReturnType<typeof resolveEnvironment> }): Promise<AppRuntime> {
  const sdk = await createSdkClients(options.environment)
  const tokens = createTokenManager()
  const iam = createIamRuntime(sdk, tokens)
  return { environment: options.environment, sdk, tokens, iam, routes: [] }
}

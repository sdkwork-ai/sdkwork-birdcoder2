import type { TabletHostAdapter } from '@sdkwork/birdcoder2-pad-core'

import { resolveEnvironment } from './environment'
import { createIamRuntime } from './iamRuntime'
import type { AppRoutesContribution } from './routes'
import { createSdkClients, type SdkClients } from './sdkClients'

export interface AppRuntime {
  readonly environment: ReturnType<typeof resolveEnvironment>
  readonly sdk: SdkClients
  readonly iam: ReturnType<typeof createIamRuntime>
  readonly host: TabletHostAdapter
  readonly routes: readonly AppRoutesContribution[]
}

/**
 * Composition root. The only place allowed to construct SDK clients, create the
 * appbase IAM runtime, bind the tablet host adapter, and register route
 * contributions. One runtime and one TokenManager back every window of the app.
 */
export async function createRuntime(options: {
  environment: ReturnType<typeof resolveEnvironment>
  host: TabletHostAdapter
}): Promise<AppRuntime> {
  const sdk = await createSdkClients(options.environment)
  const iam = createIamRuntime(sdk)
  return { environment: options.environment, sdk, iam, host: options.host, routes: [] }
}

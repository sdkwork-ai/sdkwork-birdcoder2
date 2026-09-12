import { resolveEnvironment } from './environment'
import { createIamRuntime } from './iamRuntime'
import type { AppRoutesContribution } from './routes'
import { createSdkClients, type SdkClients } from './sdkClients'

export interface AppRuntime {
  readonly environment: ReturnType<typeof resolveEnvironment>
  readonly sdk: SdkClients
  readonly iam: ReturnType<typeof createIamRuntime>
  readonly routes: readonly AppRoutesContribution[]
}

/**
 * Composition root. The only place allowed to construct SDK clients, create the
 * appbase IAM runtime, and register route contributions.
 */
export async function createRuntime(options: { environment: ReturnType<typeof resolveEnvironment> }): Promise<AppRuntime> {
  const sdk = await createSdkClients(options.environment)
  const iam = createIamRuntime(sdk)
  return { environment: options.environment, sdk, iam, routes: [] }
}

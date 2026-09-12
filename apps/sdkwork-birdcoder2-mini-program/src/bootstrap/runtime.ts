import { resolveEnvironment } from './environment'
import { createIamRuntime } from './iamRuntime'
import { createSdkClients, type SdkClients } from './sdkClients'
import type { AppRoutesContribution } from './routes'

export interface AppRuntime {
  readonly environment: ReturnType<typeof resolveEnvironment>
  readonly sdk: SdkClients
  readonly iam: ReturnType<typeof createIamRuntime>
  readonly routes: readonly AppRoutesContribution[]
}

/** Mini program composition root. */
export function createRuntime(options: { environment: ReturnType<typeof resolveEnvironment> }): AppRuntime {
  const sdk = createSdkClients(options.environment)
  const iam = createIamRuntime(sdk)
  return { environment: options.environment, sdk, iam, routes: [] }
}

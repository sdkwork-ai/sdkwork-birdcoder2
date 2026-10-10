/**
 * Declaration facade for `@sdkwork/iam-application-bootstrap`.
 *
 * The emit project resolves this facade instead of the sibling source, whose
 * closure cannot join a composite program portably (repository convention: emit
 * projects type the used surface, tests and runtime use the real package). The
 * members mirror {@link IamApplicationBootstrapModule}; keep them in step.
 */

import type { IamApplicationBootstrapModule } from '../src/sdkwork-module-types.ts'

export const bootstrapApplicationFromManifest: IamApplicationBootstrapModule['bootstrapApplicationFromManifest']
export const createFetchIamApplicationBootstrapClient: IamApplicationBootstrapModule['createFetchIamApplicationBootstrapClient']
export const createIamApplicationBootstrapClientFromAppbaseBackendSdk: IamApplicationBootstrapModule['createIamApplicationBootstrapClientFromAppbaseBackendSdk']
export const formatBootstrapEnvFile: IamApplicationBootstrapModule['formatBootstrapEnvFile']
export const hashManifestContent: IamApplicationBootstrapModule['hashManifestContent']
export const loadBootstrapAuthProfileFromHome: IamApplicationBootstrapModule['loadBootstrapAuthProfileFromHome']
export const resolveBootstrapAuth: IamApplicationBootstrapModule['resolveBootstrapAuth']
export const resolveBootstrapEnvironmentFromEnv: IamApplicationBootstrapModule['resolveBootstrapEnvironmentFromEnv']
export const writeRegisteredBootstrapEnvFiles: IamApplicationBootstrapModule['writeRegisteredBootstrapEnvFiles']

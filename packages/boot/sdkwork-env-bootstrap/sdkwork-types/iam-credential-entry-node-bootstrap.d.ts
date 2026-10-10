/**
 * Declaration facade for `@sdkwork/iam-credential-entry/node-bootstrap`.
 *
 * The emit project resolves this facade instead of the sibling source, whose
 * closure cannot join a composite program portably (repository convention: emit
 * projects type the used surface, tests and runtime use the real package). The
 * members mirror {@link CredentialEntryModule}; keep them in step.
 */

import type { CredentialEntryModule } from '../src/sdkwork-module-types.ts'

export const SDKWORK_ACCESS_TOKEN_ENV_KEY: CredentialEntryModule['SDKWORK_ACCESS_TOKEN_ENV_KEY']
export const readBootstrapAccessTokenEnvFile: CredentialEntryModule['readBootstrapAccessTokenEnvFile']
export const readApplicationManifest: CredentialEntryModule['readApplicationManifest']
export const resolveRepoApplicationManifestPath: CredentialEntryModule['resolveRepoApplicationManifestPath']
export const buildBootstrapAccessTokenEnvRecord: CredentialEntryModule['buildBootstrapAccessTokenEnvRecord']

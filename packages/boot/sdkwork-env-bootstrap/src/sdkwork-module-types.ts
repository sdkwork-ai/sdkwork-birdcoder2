/**
 * Structural types for the two optional SDKWork siblings this launcher calls.
 *
 * The emit project resolves those specifiers to the declaration facades in
 * `sdkwork-types/`, which are declared in terms of these types; the runtime
 * module is the real sibling. Keeping the used surface here means the package
 * neither pulls the sibling sources into a composite program nor duplicates the
 * member shapes in each facade.
 * @module @deepseek-ai/dsh-sdkwork-env-bootstrap/sdkwork-module-types
 */

/** The `@sdkwork/iam-application-bootstrap` surface this launcher calls. */
export interface IamApplicationBootstrapModule {
  /** Register the application from its manifest against the IAM backend. */
  bootstrapApplicationFromManifest: (input: Record<string, unknown>) => Promise<{
    env: Record<string, string | undefined>
  }>
  /** Registry client built on `fetch` (browser-safe sibling entry). */
  createFetchIamApplicationBootstrapClient: (config: { baseUrl: string; fetch?: typeof fetch }) => unknown
  /** Registry client built on the AppBase backend SDK (Node entry). */
  createIamApplicationBootstrapClientFromAppbaseBackendSdk: (config: { baseUrl: string }) => unknown
  /** Render the registration result as env-file contents. */
  formatBootstrapEnvFile: (input: Record<string, unknown>) => string
  /** Digest of a raw manifest, used to skip an unchanged re-registration. */
  hashManifestContent: (raw: string) => string
  /** Write the registration output; `undefined` in older siblings, which fall back to the registered env file. */
  writeRegisteredBootstrapEnvFiles:
    | ((repoRoot: string, contents: string, environment?: string) => Promise<string[]>)
    | undefined
  /** Read the operator's stored bootstrap credentials for one profile. */
  loadBootstrapAuthProfileFromHome: (options: Record<string, unknown>) => Promise<{
    profile: Record<string, unknown>
  } | null>
  /** Resolve the credentials a registration attempt authenticates with. */
  resolveBootstrapAuth: (options: {
    env?: Record<string, string | undefined>
    profile?: Record<string, unknown> | null
  }) => { authToken?: string; username?: string; password?: string; email?: string }
  /** Resolve the registration target from the launch environment and overrides. */
  resolveBootstrapEnvironmentFromEnv: (
    env: Record<string, string | undefined>,
    overrides: Record<string, unknown>,
  ) => { primaryDomain?: string }
}

/** The `@sdkwork/iam-credential-entry/node-bootstrap` surface this launcher calls. */
export interface CredentialEntryModule {
  /** Environment key carrying the bootstrap access token. */
  SDKWORK_ACCESS_TOKEN_ENV_KEY: string
  /** Read one bootstrap token env file. */
  readBootstrapAccessTokenEnvFile(path: string): string | undefined
  /** Read the application manifest from disk. */
  readApplicationManifest(path: string): unknown
  /** Resolve the manifest path a repository root owns. */
  resolveRepoApplicationManifestPath(repoRoot: string, manifestPath?: string): string
  /** Build the token env record written into the overlay. */
  buildBootstrapAccessTokenEnvRecord(existing: string, options: Record<string, unknown>): Record<string, string>
}

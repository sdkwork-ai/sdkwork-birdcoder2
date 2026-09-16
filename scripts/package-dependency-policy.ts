/** Explicit exceptions and Host packages for the published dependency policy. */

/** Packages treated as Client/Host packages without declaring `dsh.client`. */
const CLIENT_FACE_INCLUDE: readonly string[] = []

/** Packages exempted from automatic Client/Host treatment despite declaring `dsh.client`. */
const CLIENT_FACE_EXCLUDE: readonly string[] = [
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
]

/** Host-only packages whose peer relays are deliberately flattened. */
const HOST_DEPENDENCY_PACKAGES: readonly string[] = [
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
]

/** Development-only package relationships not represented by source imports. */
const CONFIGURATION_ONLY_DEV_DEPENDENCIES = {
  '@deepseek-ai/dsh-client-locale': ['@deepseek-ai/dsh-api-remotes'],
  '@deepseek-ai/dsh-client-ui-conversation': [
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-client-ui-workspace',
  ],
  '@deepseek-ai/dsh-client-ui-model-selection': ['@deepseek-ai/dsh-client-ui-input-trigger'],
  '@deepseek-ai/dsh-client-ui-sidebar': ['@deepseek-ai/dsh-client-ui-workspace'],
  '@deepseek-ai/dsh-client-ui-subagent': ['@deepseek-ai/dsh-client-ui-input-trigger'],
  '@deepseek-ai/dsh-client-ui-theme': ['@deepseek-ai/dsh-api-remotes'],
  '@deepseek-ai/dsh-client-ui-tool': ['@deepseek-ai/dsh-api-remotes'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** Workspace packages whose complete runtime surface is safe across duplicate installations. */
const DUPLICATE_SAFE_PACKAGES: readonly string[] = [
  '@deepseek-ai/dsh-brand',
  '@deepseek-ai/dsh-lazy-require',
  '@deepseek-ai/dsh-typert-protocol',
  '@deepseek-ai/dsh-util-crypto',
  '@deepseek-ai/dsh-util-values',
]

/**
 * Runtime exports whose values remain valid when npm installs another package copy.
 * New entries are forbidden by default. Automated agents must not add an
 * exception; every addition requires explicit human review and a dedicated,
 * prominent heading in the pull request description.
 */
const SAFE_HOST_DEPENDENCY_EXPORTS = {
  '@deepseek-ai/dsh-credentials': ['credentialKey'],
  '@deepseek-ai/dsh-deque': ['Deque'],
  '@deepseek-ai/dsh-llm': ['callConfigEquals'],
  '@deepseek-ai/dsh-session-format': ['sessionFormatLogFilename'],
  '@deepseek-ai/dsh-timeout': ['MAX_TIMER_DELAY_MS'],
  '@deepseek-ai/schemastery': ['default'],
} as const satisfies HostDependencyExports

/** Runtime exports that require every consumer to resolve the provider's shared peer instance. */
const PEER_REQUIRED_HOST_EXPORTS = {
  // FORK DIVERGENCE (upstream has no Client-face consumer of this package): the
  // fork's ui-sdkwork-env host face reads the launcher-owned
  // `ctx.get(DSH_LAUNCH_ENVIRONMENT_KEY)` snapshot to seed its settings base, so
  // the edge stays in matching peerDependencies + devDependencies. Every other
  // consumer is a Host-only package the policy does not select.
  '@deepseek-ai/dsh-launch-environment': ['launchEnvironmentOf'],
  '@deepseek-ai/dsh-subprocess': ['SubprocessExecutableNotFoundError'],
  '@deepseek-ai/dsh-scope': ['carrierKeyOf', 'scopeOf', 'scopeTarget'],
  '@deepseek-ai/dsh-session': ['SESSION_FORMAT_VERSION'],
  '@deepseek-ai/dsh-session-persistence': ['SessionPersistenceNotFoundError'],
} as const satisfies HostDependencyExports

/** Exact import specifier to reviewed runtime exports. */
type HostDependencyExports = Readonly<Record<string, readonly string[]>>

/**
 * Published sibling packages the browser bundle resolves from a tsconfig path
 * alias instead of from npm. Every declaration route is closed for these: they
 * are not workspace members, `private: true` forbids publishing them, a `link:`
 * or `file:` range would emit an uninstallable specifier in the published
 * manifest, and adding them as members would drag their `catalog:` entries and
 * whole package closure into this workspace. The policy therefore neither
 * expects nor classifies them; the alias is the only supported coupling.
 *
 * New entries are forbidden by default. Each addition requires explicit human
 * review: the exemption hides a runtime import from every dependency check, so
 * it must stay limited to packages that genuinely cannot be declared.
 */
const SOURCE_ALIAS_ONLY_PACKAGES: readonly string[] = [
  '@sdkwork/cloudrouter-pc-console-api-keys',
]

/** Complete configurable input to package dependency classification. */
export interface PackageDependencyPolicy {
  readonly clientFaceInclude: readonly string[]
  readonly clientFaceExclude: readonly string[]
  readonly hostPackages: readonly string[]
  readonly configurationOnlyDevDependencies: Readonly<Record<string, readonly string[]>>
  readonly duplicateSafePackages?: readonly string[]
  readonly safeHostDependencyExports: HostDependencyExports
  readonly peerRequiredHostExports: HostDependencyExports
  readonly sourceAliasOnlyPackages?: readonly string[]
}

/** Repository dependency policy consumed by verification and benchmarking. */
export const PACKAGE_DEPENDENCY_POLICY: PackageDependencyPolicy = {
  clientFaceInclude: CLIENT_FACE_INCLUDE,
  clientFaceExclude: CLIENT_FACE_EXCLUDE,
  hostPackages: HOST_DEPENDENCY_PACKAGES,
  configurationOnlyDevDependencies: CONFIGURATION_ONLY_DEV_DEPENDENCIES,
  duplicateSafePackages: DUPLICATE_SAFE_PACKAGES,
  safeHostDependencyExports: SAFE_HOST_DEPENDENCY_EXPORTS,
  peerRequiredHostExports: PEER_REQUIRED_HOST_EXPORTS,
  sourceAliasOnlyPackages: SOURCE_ALIAS_ONLY_PACKAGES,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a package manifest declares a dynamically loaded Client entry. */
export function hasClientDeclaration(dshField: unknown): boolean {
  return isRecord(dshField) && Object.hasOwn(dshField, 'client')
}

/** Whether the repository policy flattens one package's non-Cordis peers. */
export function usesFlattenedPackageDependencies(
  manifestPath: string,
  packageName: string,
  dshField: unknown,
  policy: PackageDependencyPolicy = PACKAGE_DEPENDENCY_POLICY,
): boolean {
  if (!manifestPath.startsWith('packages/') || manifestPath.startsWith('packages/experimental/')) return false
  if (policy.hostPackages.includes(packageName)) return true
  if (manifestPath.startsWith('packages/client/')) return true
  const included = hasClientDeclaration(dshField) || policy.clientFaceInclude.includes(packageName)
  return included && !policy.clientFaceExclude.includes(packageName)
}

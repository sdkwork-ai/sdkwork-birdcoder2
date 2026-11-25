/**
 * Pure planning and reporting helpers of `admin:repair:installation`.
 *
 * The CLI shell ([the `.mjs` entry](./repair-installation.mjs)) resolves the
 * environment and performs the request; everything that decides *what* is asked
 * for and *how* the answer reads lives here, so the repair contract can be
 * unit-tested without a backend.
 * @module scripts/bootstrap/installation-repair
 */

/** Parsed `--key value` / `--key=value` flags. */
export type RepairFlags = Record<string, string>

/** Bootstrap credential shapes the reconcile route accepts. */
export interface RepairAuth {
  authToken?: string
  username?: string
  email?: string
  password?: string
}

/** The manifest fields this command reads. */
export interface RepairManifest {
  backend?: {
    deployApplicationId?: string
    appId?: string
    tenantId?: string
  }
}

/** One reconcile step as the backend reports it. */
export interface RepairStep {
  field: string
  status: 'applied' | 'planned' | 'skipped'
  detail: string
}

/** One readiness defect as the backend reports it. */
export interface RepairDefect {
  code: string
  field: string
  message: string
  operation?: string
}

/** The subset of the reconcile response this command renders. */
export interface RepairOutcome {
  installationId?: string
  changed?: boolean
  steps?: RepairStep[]
  readinessAfter?: {
    ready?: boolean
    defects?: RepairDefect[]
  }
}

/** Resolved deploy-application anchor and the source that supplied it. */
export interface ResolvedAnchor {
  deployApplicationId: string
  source: string
}

/** Inputs of {@link buildReconcileBody}. */
export interface ReconcileBodyInput {
  tenantId: string
  auth?: RepairAuth | null
  deployApplicationId?: string
  runtimeConfig?: unknown
  enable?: boolean
  dryRun?: boolean
  idempotencyKey?: string
}

/** Inputs of {@link buildUpdateBody}. */
export interface UpdateBodyInput {
  tenantId: string
  auth?: RepairAuth | null
  deployApplicationId?: string
  runtimeConfig?: unknown
}

/** Anonymous authorization bootstrap the hosted page calls before any login. */
export const AUTHORIZE_BOOTSTRAP_PATH = '/app/v3/api/oauth/authorizations'

const NAME = 'admin:repair:installation'

/**
 * Parses `--key value` pairs, `--key=value`, and bare switches.
 *
 * A switch with no value (the next token is absent or another flag) is recorded
 * as `'true'`, which is what `--dry-run`, `--no-enable`, and `--verify-only`
 * rely on.
 * @param argv - the process arguments after the script name.
 * @returns the flag map; a repeated flag keeps its last value.
 */
export function parseFlags(argv: readonly string[]): RepairFlags {
  const flags: RepairFlags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined || !arg.startsWith('--')) continue
    const body = arg.slice(2)
    const separator = body.indexOf('=')
    const name = separator === -1 ? body : body.slice(0, separator)
    const inlineValue = separator === -1 ? undefined : body.slice(separator + 1)
    const next = argv[index + 1]
    const bare = separator === -1 && (next === undefined || next.startsWith('--'))
    const value = inlineValue ?? (bare ? 'true' : next)
    if (name !== '' && value !== undefined) {
      flags[name] = value
      if (!bare && inlineValue === undefined) index += 1
    }
  }
  return flags
}

/**
 * Resolves the deploy application anchor this checkout repairs its installation to.
 *
 * Order: the CLI flag, then the launch environment (the same variable a build
 * exports), then the manifest's explicit anchor, then the manifest's runtime
 * `appId` — the register/bootstrap contract's documented fallback. The value is
 * never synthesized: an installation is one-to-one with a deploy application, so
 * an empty answer must fail instead of inventing an id.
 * @param options - flag, environment, and manifest inputs.
 * @returns the anchor and the source that supplied it.
 * @throws Error when no source supplies one.
 */
export function resolveDeployApplicationId(options: {
  flag?: string
  env?: Readonly<Record<string, string | undefined>>
  manifest?: RepairManifest
}): ResolvedAnchor {
  const env = options.env ?? {}
  const manifest = options.manifest ?? {}
  const candidates: Array<[string, string | undefined]> = [
    ['--deploy-application-id', options.flag],
    ['SDKWORK_DEPLOY_APPLICATION_ID', env.SDKWORK_DEPLOY_APPLICATION_ID],
    ['backend.deployApplicationId', manifest.backend?.deployApplicationId],
    ['backend.appId', manifest.backend?.appId],
  ]
  for (const [source, value] of candidates) {
    if (typeof value === 'string' && value.trim() !== '') {
      return { deployApplicationId: value.trim(), source }
    }
  }
  throw new Error(
    `${NAME}: no deploy application anchor — pass --deploy-application-id, export `
    + 'SDKWORK_DEPLOY_APPLICATION_ID, or declare backend.deployApplicationId in agent.app.config.json',
  )
}

/**
 * Builds the reconcile request body.
 *
 * The anchor is included only when known so a dry run without one still reports
 * the lifecycle and relying-party defects. Bootstrap credentials are written as
 * `authToken` when the profile carries one, otherwise as `username`/`email` plus
 * `password` — the two shapes the route accepts.
 * @param input - identity, credential, and repair inputs.
 * @returns the JSON body to POST.
 * @throws Error when the tenant or the credential is missing.
 */
export function buildReconcileBody(input: ReconcileBodyInput): Record<string, unknown> {
  const tenantId = typeof input.tenantId === 'string' ? input.tenantId.trim() : ''
  if (tenantId === '') {
    throw new Error(`${NAME}: tenantId is required`)
  }
  const credential = resolveCredential(input.auth)
  const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : ''
  return {
    tenantId,
    ...credential,
    ...(input.deployApplicationId === undefined
      ? {}
      : { deployApplicationId: input.deployApplicationId }),
    ...(input.runtimeConfig === undefined ? {} : { runtimeConfig: input.runtimeConfig }),
    ...(idempotencyKey === '' ? {} : { idempotencyKey }),
    enable: input.enable ?? true,
    dryRun: input.dryRun ?? false,
  }
}

/**
 * Resolves the bootstrap credential field set.
 *
 * `authToken` wins when the profile carries one; otherwise `username`/`email`
 * plus `password` — the two shapes the bootstrap-body routes accept.
 * @param auth - the resolved bootstrap auth profile.
 * @returns the credential fields, ready to spread into a request body.
 * @throws Error when no usable credential exists.
 */
export function resolveCredential(auth?: RepairAuth | null): Record<string, unknown> {
  const authToken = typeof auth?.authToken === 'string' ? auth.authToken.trim() : ''
  if (authToken !== '') return { authToken }
  const username = typeof auth?.username === 'string' ? auth.username.trim() : ''
  const email = typeof auth?.email === 'string' ? auth.email.trim() : ''
  const password = auth?.password
  const account = username !== '' ? { username } : email !== '' ? { email } : undefined
  if (account === undefined || typeof password !== 'string' || password === '') {
    throw new Error(
      `${NAME}: no bootstrap credential — write ~/.sdkwork/iam-bootstrap/<stem>.json with `
      + 'username/password, or export SDKWORK_IAM_BOOTSTRAP_OPERATOR_USERNAME/_PASSWORD',
    )
  }
  return { ...account, password }
}

/**
 * Renders a reconcile outcome as the operator-facing report.
 *
 * The remaining defects come from the response's own `readinessAfter`, so the
 * report never claims a repair the backend did not observe.
 * @param outcome - the reconcile response.
 * @param options - whether the call was a dry run.
 * @returns one line per step, defect, and the final readiness verdict.
 */
export function renderReconcileReport(
  outcome: unknown,
  options: { dryRun: boolean },
): string[] {
  if (outcome === null || typeof outcome !== 'object') return []
  const value = outcome as RepairOutcome
  const steps = Array.isArray(value.steps) ? value.steps : []
  const after = value.readinessAfter ?? {}
  const defects = Array.isArray(after.defects) ? after.defects : []
  const verdict = options.dryRun
    ? 'dry run — nothing written'
    : value.changed === true ? 'repaired' : 'already satisfied'
  const lines = [`${NAME}: ${verdict} (installation ${value.installationId ?? 'unknown'})`]
  for (const step of steps) {
    lines.push(`  ${String(step.status).padEnd(8)} ${step.field}: ${step.detail}`)
  }
  for (const defect of defects) {
    lines.push(
      `  remaining ${defect.code} (${defect.field}): ${defect.message}`
      + defect.operation === undefined ? '' : ` → ${defect.operation}`,
    )
  }
  lines.push(`  ready: ${String(after.ready)}`)
  return lines
}

/**
 * Builds the `installations.update` (PATCH) body used when the deployment has no
 * reconcile operation yet.
 *
 * The update command carries `deployApplicationId` for exactly this repair: it
 * fills a **missing** anchor and refuses to re-point a bound row, so the weaker
 * operation is still the same additive write. It has no `dryRun`, so this path
 * writes on its first call.
 * @param input - identity, credential, and repair inputs.
 * @returns the JSON body to PATCH.
 * @throws Error when the tenant or the credential is missing.
 */
export function buildUpdateBody(input: UpdateBodyInput): Record<string, unknown> {
  const tenantId = typeof input.tenantId === 'string' ? input.tenantId.trim() : ''
  if (tenantId === '') {
    throw new Error(`${NAME}: tenantId is required`)
  }
  const credential = resolveCredential(input.auth)
  return {
    tenantId,
    ...credential,
    ...(input.deployApplicationId === undefined
      ? {}
      : { deployApplicationId: input.deployApplicationId }),
    ...(input.runtimeConfig === undefined ? {} : { runtimeConfig: input.runtimeConfig }),
  }
}

/**
 * Renders the installation a PATCH returned.
 * @param installation - the update response (`deployApplicationId`, `status`).
 * @param options - the anchor this run asked for.
 * @returns report lines.
 */
export function renderUpdateReport(
  installation: unknown,
  options: { deployApplicationId: string },
): string[] {
  if (installation === null || typeof installation !== 'object') return []
  const value = installation as { installationId?: string; deployApplicationId?: string; status?: string }
  return [
    `${NAME}: installations.update repaired installation ${value.installationId ?? 'unknown'}`,
    `  deployApplicationId: ${value.deployApplicationId ?? '(missing)'}`
    + value.deployApplicationId === options.deployApplicationId ? '' : ' — unexpected anchor',
    `  status: ${value.status ?? '(unknown)'}`,
  ]
}

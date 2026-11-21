#!/usr/bin/env node
/**
 * Record the deployment application id a remote SDKWork call returned into the
 * env layers this checkout's builds read.
 *
 * Two remote flows return that id: IAM application bootstrap answers with
 * `deployApplicationId` (`scripts/bootstrap/bootstrap-app.mjs`), and an issued
 * public access token carries the same value as its `app_id` claim. Writing it
 * once here is what lets `pnpm desktop:prod`, `pnpm build`, and the Web build
 * resolve the anchor without a per-shell `SDKWORK_DEPLOY_APPLICATION_ID` export
 * (README "Deploy application identity").
 *
 * Two layers are written, because the build reads exactly one of them:
 *
 * - the repository `.env` layer keeps the anchor the SDKWork materializer
 *   resolves for this surface (`SDKWORK_DEPLOY_APPLICATION_ID_<SURFACE>`, or the
 *   base variable for the repository-root surface);
 * - the surface root's `.env.local` keeps the base variable for that surface's
 *   Vite build. `apps/web/vite.config.ts` selects `apps/web/.env.<profile>` and
 *   loads its directory, so it never reads the repository `.env` layer.
 *
 * Both files are gitignored: a checkout records its own installation id and no
 * committed profile ever carries one.
 * @module scripts/bootstrap/record-deploy-anchor
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import {
  DEPLOY_APPLICATION_ID_ENV,
  PENDING_DEPLOY_APPLICATION_ID,
  deployApplicationIdFromToken,
  surfaceDeployApplicationIdEnvName,
} from '../../packages/boot/sdkwork-env-bootstrap/src/deploy-anchor.ts'

/** Remote response fields that carry a deployment application id. */
export const DEPLOY_ANCHOR_RESPONSE_KEYS = [
  'deployApplicationId',
  'deploy_application_id',
  'deployAppId',
  'deploy_app_id',
] as const

/** One env file this command wrote, and the variables it set there. */
export interface DeployAnchorWrite {
  /** Absolute path of the env file. */
  readonly file: string
  /** Variable names this write sets, in application order. */
  readonly variables: readonly string[]
  /** Whether the recorded value changed the file. */
  readonly changed: boolean
}

/** Arguments of {@link recordDeployAnchor}. */
export interface RecordDeployAnchorOptions {
  /** Repository root that owns the `.env` layer. */
  readonly repoRoot: string
  /** Deploy application id the remote call returned. */
  readonly appId: string
  /** Surface root, relative to the repository root; omitted records the root surface. */
  readonly surfaceRoot?: string
  /** Declared surface id (`sdkwork-birdcoder2-web-app`), required for a surface root. */
  readonly surfaceId?: string
  /** Report the writes without touching any file. */
  readonly dryRun?: boolean
}

/**
 * Read the deployment application id out of a remote response body.
 *
 * The IAM bootstrap response is nested behind several envelopes (`data`,
 * `result`, `provision`), so the search walks every object and stops at the
 * first non-empty deploy-id field. A plain `appId` is deliberately ignored: a
 * manifest `appId` is the application key, not the decimal deployment id.
 * @param value - parsed JSON response.
 * @returns the recorded id, or `''` when the response carries none.
 */
export function deployApplicationAnchorFromResponse(value: unknown): string {
  const seen = new Set<object>()
  const stack: unknown[] = [value]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === null || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    if (Array.isArray(current)) {
      stack.push(...current)
      continue
    }
    const record = current as Record<string, unknown>
    for (const key of DEPLOY_ANCHOR_RESPONSE_KEYS) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim()
    }
    stack.push(...Object.values(record))
  }
  return ''
}

/**
 * Set variables in dotenv text, keeping comments, ordering, and line endings.
 *
 * An existing `NAME=...` line is replaced in place; a missing variable is
 * appended. A variable recorded twice keeps its first position, which is the
 * layer Vite and the materializer read.
 * @param text - current file content, possibly empty.
 * @param variables - variables to set.
 * @returns the updated content with a trailing newline.
 */
export function upsertDotenvValues(text: string, variables: Readonly<Record<string, string>>): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text === '' ? [] : text.replace(/\r\n/gu, '\n').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  for (const [name, value] of Object.entries(variables)) {
    const rendered = `${name}=${value}`
    const index = lines.findIndex(line => line.startsWith(`${name}=`))
    if (index < 0) lines.push(rendered)
    else lines[index] = rendered
  }
  return `${lines.join(newline)}${newline}`
}

/**
 * Validate one deploy application id before it reaches a dotenv line.
 * @param value - id a remote response, token, or operator supplied.
 * @returns the trimmed id.
 * @throws When the value is empty, the placeholder, or not a plausible id.
 */
function deploymentApplicationId(value: string): string {
  const trimmed = String(value ?? '').trim()
  if (trimmed === '') throw new Error('record-deploy-anchor: a deploy application id is required')
  if (trimmed === PENDING_DEPLOY_APPLICATION_ID) {
    throw new Error(`record-deploy-anchor: ${PENDING_DEPLOY_APPLICATION_ID} is the placeholder, not a deploy application id`)
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(trimmed)) {
    throw new Error(`record-deploy-anchor: ${JSON.stringify(trimmed)} is not a deploy application id`)
  }
  return trimmed
}

/** One env file and the variables to record in it. */
interface EnvFileWrite {
  readonly file: string
  readonly variables: Readonly<Record<string, string>>
}

/**
 * Write the recorded variables into each env file.
 * @param entries - files and variables to set.
 * @param dryRun - report the outcome without writing.
 * @returns what each file would contain after the write.
 */
function writeEnvFiles(entries: readonly EnvFileWrite[], dryRun: boolean): DeployAnchorWrite[] {
  return entries.map((entry) => {
    const existing = existsSync(entry.file) ? readFileSync(entry.file, 'utf8') : ''
    const updated = upsertDotenvValues(existing, entry.variables)
    const changed = updated !== existing
    if (changed && !dryRun) {
      mkdirSync(dirname(entry.file), { recursive: true })
      writeFileSync(entry.file, updated, 'utf8')
    }
    return { file: entry.file, variables: Object.keys(entry.variables), changed }
  })
}

/**
 * Record one deployment application id into the env layers this checkout's
 * builds read.
 *
 * The repository-root surface owns the base variable in `.env`; any other
 * surface records its own `SDKWORK_DEPLOY_APPLICATION_ID_<SURFACE>` there, so one
 * surface's id never re-anchors another's token, and additionally writes the
 * base variable into its own `.env.local` for its Vite build.
 * @param options - repository root, id, and target surface.
 * @returns one entry per env file, with the variables it sets.
 * @throws When the id is not a deploy application id, the surface lies outside
 *   the repository, or a surface root is recorded without a surface id.
 */
export function recordDeployAnchor(options: RecordDeployAnchorOptions): DeployAnchorWrite[] {
  const repoRoot = resolve(options.repoRoot)
  const appId = deploymentApplicationId(options.appId)
  const surfaceRoot = options.surfaceRoot === undefined ? repoRoot : resolve(repoRoot, options.surfaceRoot)
  const surfacePath = relative(repoRoot, surfaceRoot)
  if (surfacePath === '') {
    return writeEnvFiles([{
      file: join(repoRoot, '.env'),
      variables: { [DEPLOY_APPLICATION_ID_ENV]: appId },
    }], options.dryRun === true)
  }
  if (surfacePath === '..' || surfacePath.startsWith(`..${sep}`) || isAbsolute(surfacePath)) {
    throw new Error(`record-deploy-anchor: surface root ${surfaceRoot} is outside ${repoRoot}`)
  }
  const surfaceVariable = surfaceDeployApplicationIdEnvName(DEPLOY_APPLICATION_ID_ENV, options.surfaceId ?? '')
  if (surfaceVariable === '') {
    throw new Error(`record-deploy-anchor: recording surface ${surfacePath.replaceAll(sep, '/')} needs --surface-id`)
  }
  return writeEnvFiles([
    { file: join(repoRoot, '.env'), variables: { [surfaceVariable]: appId } },
    { file: join(surfaceRoot, '.env.local'), variables: { [DEPLOY_APPLICATION_ID_ENV]: appId } },
  ], options.dryRun === true)
}

/**
 * Read one `--flag value` / `--flag=value` argument.
 * @param argv - arguments after the script path.
 * @param name - flag name including its leading dashes.
 * @returns the value, or undefined when the flag is absent or valueless.
 */
function flagValue(argv: readonly string[], name: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ''
    if (argument === name) {
      const value = argv[index + 1]
      return value === undefined || value.startsWith('--') ? undefined : value
    }
    if (argument.startsWith(`${name}=`)) return argument.slice(name.length + 1)
  }
  return undefined
}

/**
 * Resolve the id this invocation records, from the first source that names one.
 * @param argv - arguments after the script path.
 * @param repoRoot - repository root for relative `--from` paths.
 * @returns the id to record.
 * @throws When no source names an id, or the named source carries none.
 */
function requestedAppId(argv: readonly string[], repoRoot: string): string {
  const direct = flagValue(argv, '--deploy-application-id')
    ?? process.env[DEPLOY_APPLICATION_ID_ENV]
  if (direct !== undefined && direct.trim() !== '') return direct

  const responsePath = flagValue(argv, '--from')
  if (responsePath !== undefined) {
    const text = responsePath === '-'
      ? readFileSync(0, 'utf8')
      : readFileSync(resolve(repoRoot, responsePath), 'utf8')
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      throw new Error(`record-deploy-anchor: ${responsePath} is not JSON: ${String(error)}`)
    }
    const anchor = deployApplicationAnchorFromResponse(parsed)
    if (anchor === '') {
      throw new Error(`record-deploy-anchor: ${responsePath} carries no ${DEPLOY_ANCHOR_RESPONSE_KEYS.join('/')} field`)
    }
    return anchor
  }

  const token = flagValue(argv, '--access-token')
  if (token !== undefined) {
    const seeded = deployApplicationIdFromToken(token)
    if (seeded === '') throw new Error('record-deploy-anchor: --access-token carries no app_id claim')
    return seeded
  }

  throw new Error(
    'record-deploy-anchor: pass --deploy-application-id <id>, --from <response.json>, '
    + `--access-token <jwt>, or export ${DEPLOY_APPLICATION_ID_ENV}`,
  )
}

function main(): number {
  const argv = process.argv.slice(2)
  const repoRoot = resolve(flagValue(argv, '--repo-root') ?? process.cwd())
  const dryRun = argv.includes('--dry-run')
  const appId = deploymentApplicationId(requestedAppId(argv, repoRoot))
  const surfaceRoot = flagValue(argv, '--surface')
  const surfaceId = flagValue(argv, '--surface-id')
  const writes = recordDeployAnchor({
    repoRoot,
    appId,
    dryRun,
    ...surfaceRoot === undefined ? {} : { surfaceRoot },
    ...surfaceId === undefined ? {} : { surfaceId },
  })
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ appId, dryRun, writes }, null, 2)}\n`)
    return 0
  }
  process.stdout.write(`record-deploy-anchor: ${appId}${dryRun ? ' (dry run)' : ''}\n`)
  for (const write of writes) {
    process.stdout.write(
      `  ${write.changed ? 'wrote  ' : 'current'} ${relative(repoRoot, write.file).replaceAll(sep, '/')}`
      + ` (${write.variables.join(', ')})\n`,
    )
  }
  return 0
}

if (import.meta.main) {
  try {
    process.exitCode = main()
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

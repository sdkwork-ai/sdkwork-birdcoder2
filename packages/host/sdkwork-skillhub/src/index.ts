/**
 * Host half of the SDKWork skills page: the SkillHub catalog proxy and the
 * local installer behind five same-origin routes.
 *
 * The browser cannot call SkillHub directly (no CORS), and it cannot write the
 * Harness skill root either, so both live here. Installs follow the SkillHub
 * market's contract: version-pinned files, a per-file size and SHA-256 check, a
 * staged directory swapped in only after every file passes, and enable/disable
 * as a location under the Harness home. A published skill lands in
 * `$DSH_HOME/skills`, which is the root the bundled skill provider already
 * scans, so nothing else has to register it; `skills/change` tells the catalog
 * observers to re-read.
 * @module @deepseek-ai/dsh-sdkwork-skillhub
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-skill'
import { dshPath, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'
import { SkillhubInstaller } from './installer.ts'
import { SkillhubClient, SkillhubError } from './skillhub.ts'
import {
  SKILLHUB_DETAIL_PATH,
  SKILLHUB_ENABLED_PATH,
  SKILLHUB_INSTALL_PATH,
  SKILLHUB_INSTALLED_PATH,
  SKILLHUB_UNINSTALL_PATH,
  type SkillhubDetail,
  type SkillhubDetailPayload,
  type SkillhubEnabledPayload,
  type SkillhubEnabledResult,
  type SkillhubErrorPayload,
  type SkillhubInstallPayload,
  type SkillhubInstallResult,
  type SkillhubInstalledPayload,
  type SkillhubUninstallPayload,
  type SkillhubUninstallResult,
} from './shared.ts'

/** Plugin name. */
export const name = 'sdkwork-skillhub'

/** The routes need the web server; the skill catalog is invalidated through its event. */
export const inject = ['webServer']

const DIRECTORY_NAME = 'sdkwork-skillhub'
const MAX_BODY_BYTES = 64 * 1024

/** SkillHub install host configuration. */
export interface Config {
  /** Upstream origin serving the catalog, versions and files. */
  apiBaseUrl?: string
  /** Install root; defaults to the Harness skill root `$DSH_HOME/skills`. */
  skillsRoot?: string
  /** Where a disabled skill's directory is parked. */
  disabledRoot?: string
  /** Durable ledger of managed installs. */
  ledgerPath?: string
  /** Parallel file downloads per install. */
  concurrency?: number
  /** Per-request upstream timeout. */
  requestTimeoutMs?: number
}

/** Config schema: every deployment-varying choice is settable from cordis.yml. */
export const Config: z<Config> = z.object({
  apiBaseUrl: z.string().default('https://api.skillhub.cn'),
  skillsRoot: z.string(),
  disabledRoot: z.string(),
  ledgerPath: z.string(),
  concurrency: z.number().default(4),
  requestTimeoutMs: z.number().default(30_000),
})

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

function fail(res: ServerResponse, error: unknown): void {
  if (error instanceof SkillhubError) {
    const body: SkillhubErrorPayload = { code: error.code, message: error.message }
    sendJson(res, error.status, body)
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  sendJson(res, 500, { code: 'install-failed', message } satisfies SkillhubErrorPayload)
}

function allowOwner(res: ServerResponse, peer: { principal: { kind: string } } | undefined): boolean {
  if (peer?.principal.kind === 'owner') return true
  sendJson(res, 403, { code: 'forbidden', message: 'owner access required' } satisfies SkillhubErrorPayload)
  return false
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new SkillhubError('invalid-request', 'request body is too large', 413)
    chunks.push(buffer)
  }
  if (size === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SkillhubError('invalid-request', 'request body must be a JSON object', 400)
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof SkillhubError) throw error
    throw new SkillhubError('invalid-request', 'request body is not valid JSON', 400)
  }
}

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SkillhubError('invalid-request', `${field} is required`, 400)
  }
  return value.trim()
}

/**
 * Register the SkillHub catalog and installer routes.
 * @param ctx - the plugin context (needs `webServer`).
 * @param config - deployment choices; every omitted root resolves under the Harness home.
 */
export function apply(ctx: Context, config: Config): void {
  const installer = new SkillhubInstaller({
    skillsRoot: config.skillsRoot ?? join(resolveDshHome(), 'skills'),
    disabledRoot: config.disabledRoot ?? dshPath('data', DIRECTORY_NAME, 'disabled'),
    ledgerPath: config.ledgerPath ?? dshPath('data', DIRECTORY_NAME, 'installed.json'),
    client: new SkillhubClient({
      baseUrl: config.apiBaseUrl ?? 'https://api.skillhub.cn',
      ...(config.requestTimeoutMs === undefined ? {} : { timeoutMs: config.requestTimeoutMs }),
    }),
    ...(config.concurrency === undefined ? {} : { concurrency: config.concurrency }),
  })

  // A skill directory that appeared or moved changes what the providers list;
  // the registry ignores listener failures, so a stale observer cannot veto.
  const changed = (): void => { ctx.emit('skills/change') }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    auth: 'required',
    path: SKILLHUB_INSTALLED_PATH,
    handler: async (req, res, peer) => {
      if (!allowOwner(res, peer)) return
      if (req.method !== 'GET') {
        sendJson(res, 405, { code: 'invalid-request', message: 'GET required' } satisfies SkillhubErrorPayload)
        return
      }
      try {
        const body: SkillhubInstalledPayload = { skills: await installer.list() }
        sendJson(res, 200, body)
      } catch (error) {
        fail(res, error)
      }
    },
  }), `sdkwork-skillhub: GET ${SKILLHUB_INSTALLED_PATH}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    auth: 'required',
    path: SKILLHUB_DETAIL_PATH,
    handler: async (req, res, peer) => {
      if (!allowOwner(res, peer)) return
      if (req.method !== 'GET') {
        sendJson(res, 405, { code: 'invalid-request', message: 'GET required' } satisfies SkillhubErrorPayload)
        return
      }
      try {
        const url = new URL(String(req.url), 'http://localhost')
        const request: SkillhubDetailPayload = {
          packageKey: url.searchParams.get('packageKey') ?? '',
          ...(url.searchParams.get('version') === null ? {} : { version: url.searchParams.get('version')! }),
        }
        if (request.packageKey === '') throw new SkillhubError('invalid-request', 'packageKey is required', 400)
        const body: SkillhubDetail = await installer.detail(request.packageKey, request.version)
        sendJson(res, 200, body)
      } catch (error) {
        fail(res, error)
      }
    },
  }), `sdkwork-skillhub: GET ${SKILLHUB_DETAIL_PATH}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    auth: 'required',
    path: SKILLHUB_INSTALL_PATH,
    handler: async (req, res, peer) => {
      if (!allowOwner(res, peer)) return
      if (req.method !== 'POST') {
        sendJson(res, 405, { code: 'invalid-request', message: 'POST required' } satisfies SkillhubErrorPayload)
        return
      }
      try {
        const body = await readJson(req)
        const request: SkillhubInstallPayload = {
          packageKey: requireString(body, 'packageKey'),
          ...(typeof body.version === 'string' && body.version.trim() !== '' ? { version: body.version.trim() } : {}),
        }
        const skill = await installer.install(request.packageKey, request.version)
        changed()
        const result: SkillhubInstallResult = { skill, restartRequired: true }
        sendJson(res, 200, result)
      } catch (error) {
        fail(res, error)
      }
    },
  }), `sdkwork-skillhub: POST ${SKILLHUB_INSTALL_PATH}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    auth: 'required',
    path: SKILLHUB_UNINSTALL_PATH,
    handler: async (req, res, peer) => {
      if (!allowOwner(res, peer)) return
      if (req.method !== 'POST') {
        sendJson(res, 405, { code: 'invalid-request', message: 'POST required' } satisfies SkillhubErrorPayload)
        return
      }
      try {
        const body = await readJson(req)
        const request: SkillhubUninstallPayload = { packageKey: requireString(body, 'packageKey') }
        const removed = await installer.uninstall(request.packageKey)
        if (removed) changed()
        const result: SkillhubUninstallResult = { removed }
        sendJson(res, 200, result)
      } catch (error) {
        fail(res, error)
      }
    },
  }), `sdkwork-skillhub: POST ${SKILLHUB_UNINSTALL_PATH}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    auth: 'required',
    path: SKILLHUB_ENABLED_PATH,
    handler: async (req, res, peer) => {
      if (!allowOwner(res, peer)) return
      if (req.method !== 'POST') {
        sendJson(res, 405, { code: 'invalid-request', message: 'POST required' } satisfies SkillhubErrorPayload)
        return
      }
      try {
        const body = await readJson(req)
        const request: SkillhubEnabledPayload = {
          packageKey: requireString(body, 'packageKey'),
          enabled: body.enabled === true,
        }
        if (typeof body.enabled !== 'boolean') throw new SkillhubError('invalid-request', 'enabled must be a boolean', 400)
        const skill = await installer.setEnabled(request.packageKey, request.enabled)
        changed()
        const result: SkillhubEnabledResult = { skill }
        sendJson(res, 200, result)
      } catch (error) {
        fail(res, error)
      }
    },
  }), `sdkwork-skillhub: POST ${SKILLHUB_ENABLED_PATH}`)
}

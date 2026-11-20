/**
 * SDKWork access-token plugin, Host half: the durable `ui-sdkwork-access-token`
 * settings section (the remembered admin/operator logins) and its
 * operator-readable projection into `<DSH_HOME>/sdkwork/access-token.config.json`.
 *
 * The settings document is the single authority and already lives under the
 * harness home managed by the settings service; the projection is what a human
 * or a sibling tool can read, and it is rewritten at startup and after every
 * accepted commit of this namespace. A failed projection write is logged and
 * never fails the plugin: a read-only home must not take the dialog down.
 *
 * Every login is operator-grade private material. The projection directory is
 * created `0700` and the file is written `0600` (Windows ignores the mode), and
 * the browser never learns the password except for the login it just typed or
 * the one this section returns to its own dialog.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-access-token
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context, Volatile } from '@deepseek-ai/cordis'
// Type-only: brings `ctx.settings` and `settings/document-updated` into this program.
import type {} from '@deepseek-ai/dsh-settings'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import {
  ACCESS_TOKEN_CONFIG_DIRECTORY, ACCESS_TOKEN_CONFIG_FILE_GLOBAL, ACCESS_TOKEN_CONFIG_FILE_NAME,
  ACCESS_TOKEN_NAMESPACE, ACCOUNTS_FIELD, projectAccessTokenConfigDocument,
  serializeAccessTokenConfigDocument,
  type AccessTokenConfigFileTarget, type SdkworkAccessTokenAccount,
} from './access-token-settings.ts'

export {
  ACCESS_TOKEN_CONFIG_DIRECTORY, ACCESS_TOKEN_CONFIG_FILE_GLOBAL, ACCESS_TOKEN_CONFIG_FILE_KIND,
  ACCESS_TOKEN_CONFIG_FILE_NAME, ACCESS_TOKEN_CONFIG_FILE_SCHEMA_VERSION, ACCESS_TOKEN_NAMESPACE,
  ACCOUNTS_FIELD, DEFAULT_ACCESS_TOKEN_SETTINGS, decodeAccessTokenConfigPath, findAccessTokenAccount,
  projectAccessTokenConfigDocument, projectKeyOf, serializeAccessTokenConfigDocument, upsertAccessTokenAccount,
  type AccessTokenConfigFileTarget, type SdkworkAccessTokenAccount, type SdkworkAccessTokenConfigDocument,
  type SdkworkAccessTokenSettings,
} from './access-token-settings.ts'

/**
 * Live settings section.
 *
 * `accounts` is volatile, which is what lets the browser dialog commit a
 * remembered login through the configuration form without restarting the
 * plugin; `directory` stays ordinary configuration because a deployment's file
 * location is not a user preference.
 */
export interface Config {
  /** Remembered admin/operator logins. */
  accounts: Volatile<SdkworkAccessTokenAccount[]>
  /** Projection directory override; empty follows the harness home. */
  directory?: string
}

/** One remembered-login row. */
function accountSchema(): z<SdkworkAccessTokenAccount> {
  return z.object({
    project: z.string().required(),
    username: z.string().required(),
    password: z.string().required(),
    baseUrl: z.string().default(''),
    bootstrapAccessToken: z.string().default(''),
    environment: z.string().default(''),
    updatedAt: z.string().default(''),
  })
}

/** The section schema the settings service serves under the entry id. */
export const Config = z.object({
  accounts: z.array(accountSchema()).default([]).volatile(),
  directory: z.string().default(''),
})

/**
 * Resolve where the projection lives: the composition's `directory` when it
 * declares one, the harness home's `sdkwork` directory otherwise. The harness
 * home follows the rule the rest of the Host uses — `$DSH_HOME`, then `~/.dsh`.
 * @param config - the entry's configuration.
 * @returns the absolute document path and its parts.
 */
export function resolveAccessTokenConfigFile(config: Pick<Config, 'directory'>): AccessTokenConfigFileTarget {
  const declared = config.directory?.trim() ?? ''
  const home = process.env.DSH_HOME?.trim()
  const directory = declared !== ''
    ? declared
    : join(home !== undefined && home !== '' ? home : join(homedir(), '.dsh'), ACCESS_TOKEN_CONFIG_DIRECTORY)
  return { directory, fileName: ACCESS_TOKEN_CONFIG_FILE_NAME, path: join(directory, ACCESS_TOKEN_CONFIG_FILE_NAME) }
}

/** Rename refusals worth retrying when a reader briefly holds the target on Windows. */
const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])
const RENAME_ATTEMPTS = 6
const RENAME_BACKOFF_MS = 25

/**
 * Rename onto the target, retrying the refusals a concurrent reader causes on
 * Windows. Every other failure propagates.
 * @param from - the temporary sibling just written.
 * @param to - the document path.
 */
async function renameProjection(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error: unknown) {
      const code: string | undefined = (error as NodeJS.ErrnoException).code
      if (attempt >= RENAME_ATTEMPTS || code === undefined || !RENAME_RETRY_CODES.has(code)) throw error
      await new Promise(resolve => setTimeout(resolve, RENAME_BACKOFF_MS * attempt))
    }
  }
}

/**
 * Write the projection atomically: a temporary sibling is renamed over the
 * target, so a reader never observes a half-written document.
 * @param target - the resolved document path.
 * @param text - the serialized document.
 * @param sequence - this instance's write counter.
 */
export async function writeAccessTokenConfigFile(
  target: AccessTokenConfigFileTarget,
  text: string,
  sequence: number,
): Promise<void> {
  await mkdir(target.directory, { recursive: true, mode: 0o700 })
  const temporary = `${target.path}.${String(sequence)}.tmp`
  await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600 })
  await renameProjection(temporary, target.path)
}

/**
 * Register the section and keep the operator-facing projection current.
 * @param ctx - Host context that may acquire the settings service.
 * @param config - live section; read per use, never cached.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
  const target = resolveAccessTokenConfigFile(config)
  ctx.on('webserver/index-inject', (table: IndexInjection[]) => {
    table.push({ kind: 'global', name: ACCESS_TOKEN_CONFIG_FILE_GLOBAL, value: { ...target } })
  })
  // Writes are serialized through one chain: a commit arriving while startup's
  // projection is still landing must not interleave with it.
  let writes: Promise<void> = Promise.resolve()
  let sequence = 0
  const write = (): void => {
    const document = projectAccessTokenConfigDocument(
      { [ACCOUNTS_FIELD]: [...config.accounts.get()] },
      new Date().toISOString(),
    )
    sequence += 1
    writes = writes
      .then(async () => { await writeAccessTokenConfigFile(target, serializeAccessTokenConfigDocument(document), sequence) })
      .catch((error: unknown) => {
        console.error(`[${ACCESS_TOKEN_NAMESPACE}] cannot write ${target.path}:`, error)
      })
  }
  write()
  // The settings service announces a commit under the entry id, which is the
  // namespace the browser half binds; another namespace's commit is ignored.
  ctx.effect(
    () => ctx.on('settings/document-updated', (ns) => {
      if (ns === ACCESS_TOKEN_NAMESPACE) write()
    }),
    'ui-sdkwork-access-token: projection write',
  )
}

/**
 * Host registration for the SDKWork image model configuration.
 *
 * The entry owns two things and nothing else: the durable
 * `ui-sdkwork-image-models` settings section (its own Config, so the settings
 * service serves it without a `register` call), and the projection of that
 * section into `image-models.sdkwork.json` under the harness home's `sdkwork`
 * directory, which is what a skill reads.
 *
 * The projection is rewritten at startup and after every accepted commit of
 * this namespace. It is a projection, not a second store: the settings document
 * stays the one authority, and the file is what a reader outside this process
 * can see of it. A failed write is logged and never fails the plugin — a
 * read-only or absent home directory must not take a settings page down.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-image-models
 */

import { mkdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context, Volatile } from '@deepseek-ai/cordis'
// Type-only: brings `ctx.settings` and the `settings/document-updated` event
// into this program without importing either at runtime.
import type {} from '@deepseek-ai/dsh-settings'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_PROVIDER_FIELD, IMAGE_MODELS_FILE_GLOBAL, IMAGE_MODELS_FILE_NAME, IMAGE_MODELS_NAMESPACE,
  PROVIDERS_FIELD, SDKWORK_MODELS_DIRECTORY, WRITE_SECRETS_FIELD, SdkworkImageModelsFields,
  projectImageModelsDocument, serializeImageModelsDocument,
  type SdkworkImageModelsSnapshot, type SdkworkImageProvider,
} from './image-models-settings.ts'

export {
  DEFAULT_PROVIDER_FIELD, IMAGE_MODELS_FILE_GLOBAL, IMAGE_MODELS_FILE_KIND, IMAGE_MODELS_FILE_NAME,
  IMAGE_MODELS_NAMESPACE, PROVIDERS_FIELD, SDKWORK_MODELS_DIRECTORY, SDKWORK_MODELS_FILE_SCHEMA_VERSION,
  SdkworkImageModelsFields, SdkworkImageModelsSchema, WRITE_SECRETS_FIELD, defaultImageProviders,
  officialProviderId, projectImageModelsDocument, serializeImageModelsDocument,
  type SdkworkImageModel, type SdkworkImageModelsDocument, type SdkworkImageModelsSettings,
  type SdkworkImageModelsSnapshot, type SdkworkImageProvider, type SdkworkImageProviderDocument,
  type SdkworkImageProviderKind,
} from './image-models-settings.ts'
export { CATALOG_IMAGE_MODEL_PRESETS, OFFICIAL_IMAGE_VENDOR_PRESETS } from './model-presets.ts'
export type { SdkworkImageModelPreset, SdkworkImageVendorPreset } from './model-presets.ts'

/**
 * Live image model configuration. Every field is volatile, which is what makes
 * the section editable in place: this plugin's own `Config` *is* the durable
 * section, so the page reads and writes these fields directly.
 */
export interface Config {
  /** Provider used when a call names none. */
  defaultProviderId: Volatile<string>
  /** Provider rows: official vendor roots and relay stations. */
  providers: Volatile<SdkworkImageProvider[]>
  /** Whether the projected document carries literal API keys. */
  writeSecrets: Volatile<boolean>
  /** Directory the projection is written to; empty follows the harness home. */
  directory?: string
}

/**
 * Live image model fields. `directory` stays ordinary configuration: where a
 * deployment keeps its files is not a user preference, so it has no form field
 * and only a composition declares it.
 */
export const Config = z.object({
  [DEFAULT_PROVIDER_FIELD]: SdkworkImageModelsFields[DEFAULT_PROVIDER_FIELD].volatile(),
  [PROVIDERS_FIELD]: SdkworkImageModelsFields[PROVIDERS_FIELD].volatile(),
  [WRITE_SECRETS_FIELD]: SdkworkImageModelsFields[WRITE_SECRETS_FIELD].volatile(),
  directory: z.string().default(''),
})

/** The resolved projection target, as the page global and the writer both need it. */
export interface ImageModelsFileTarget {
  /** Directory the document is written to. */
  directory: string
  /** File name inside {@link directory}. */
  fileName: string
  /** Absolute path of the document. */
  path: string
}

/**
 * Resolve where the projection lives: the composition's `directory` when it
 * declares one, the harness home's `sdkwork` directory otherwise. The harness
 * home follows the same rule the rest of the Host uses — `$DSH_HOME`, then
 * `~/.dsh` — so a deployment that moved its home does not get a second one.
 * @param config - the entry's configuration.
 * @returns the absolute document path and its parts.
 */
export function resolveImageModelsFile(config: Config): ImageModelsFileTarget {
  const declared = config.directory?.trim() ?? ''
  const home = process.env.DSH_HOME?.trim()
  const directory = declared !== ''
    ? declared
    : join(home !== undefined && home !== '' ? home : join(homedir(), '.dsh'), SDKWORK_MODELS_DIRECTORY)
  return { directory, fileName: IMAGE_MODELS_FILE_NAME, path: join(directory, IMAGE_MODELS_FILE_NAME) }
}

/**
 * Write the projection atomically: a temporary sibling is renamed over the
 * target, so a reader never observes a half-written document. The temporary
 * name carries a counter, so two writes can never share it.
 * @param target - the resolved document path.
 * @param text - the serialized document.
 * @param sequence - this instance's write counter.
 */
export async function writeImageModelsFile(
  target: ImageModelsFileTarget,
  text: string,
  sequence: number,
): Promise<void> {
  await mkdir(target.directory, { recursive: true })
  const temporary = `${target.path}.${String(sequence)}.tmp`
  await writeFile(temporary, text, 'utf8')
  await renameProjection(temporary, target.path)
}

/**
 * Windows refuses a rename over a file another handle is reading; these are the
 * refusals worth retrying, the number of attempts, and the first backoff step
 * (each retry waits one step longer than the last).
 */
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
    } catch (error) {
      const code: string | undefined = (error as NodeJS.ErrnoException).code
      if (attempt >= RENAME_ATTEMPTS || code === undefined || !RENAME_RETRY_CODES.has(code)) throw error
      await new Promise(resolve => setTimeout(resolve, RENAME_BACKOFF_MS * attempt))
    }
  }
}

/**
 * Register the section and keep the skill-facing projection current.
 * @param ctx - Host context that may acquire the settings service.
 * @param config - live image model configuration; read per use, never cached.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
  const target = resolveImageModelsFile(config)
  ctx.on('webserver/index-inject', (table: IndexInjection[]) => {
    table.push({ kind: 'global', name: IMAGE_MODELS_FILE_GLOBAL, value: { ...target } })
  })
  // Writes are serialized through one chain: a commit arriving while startup's
  // projection is still landing must not interleave with it.
  let writes: Promise<void> = Promise.resolve()
  let sequence = 0
  const write = (): void => {
    const document = projectImageModelsDocument(snapshotOf(config), {
      updatedAt: new Date().toISOString(),
      writeSecrets: config.writeSecrets.get(),
    })
    sequence += 1
    writes = writes
      .then(async () => { await writeImageModelsFile(target, serializeImageModelsDocument(document), sequence) })
      .catch((error: unknown) => {
        console.error(`[${IMAGE_MODELS_NAMESPACE}] cannot write ${target.path}:`, error)
      })
  }
  write()
  // The settings service announces a commit under the entry id, which for this
  // plugin is the namespace the browser half binds; an unrelated namespace's
  // commit leaves this document alone.
  ctx.effect(
    () => ctx.on('settings/document-updated', (ns) => {
      if (ns === IMAGE_MODELS_NAMESPACE) write()
    }),
    'ui-sdkwork-image-models: projection write',
  )
}

/**
 * Read the effective section off the live config references.
 * @param config - live image model configuration.
 * @returns the section as the projection consumes it.
 */
function snapshotOf(config: Config): SdkworkImageModelsSnapshot {
  return {
    [DEFAULT_PROVIDER_FIELD]: config.defaultProviderId.get(),
    [PROVIDERS_FIELD]: config.providers.get(),
    [WRITE_SECRETS_FIELD]: config.writeSecrets.get(),
  }
}

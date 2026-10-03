/**
 * Host-face spec for the video model configuration: the seeded section, the
 * projection contract a skill reads, the `.sdkwork.` path, the atomic write, and
 * the commit that keeps the file current.
 *
 * The Host half is the only writer of the document, so its behavior — including
 * the write that must not fail the plugin — is asserted here rather than through
 * the browser.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, resolveVideoModelsFile, writeVideoModelsFile, type Config } from '../src/index.ts'
import {
  DEFAULT_PROVIDER_FIELD, PROVIDERS_FIELD, SDKWORK_MODELS_DIRECTORY, SDKWORK_MODELS_FILE_SCHEMA_VERSION,
  VIDEO_MODELS_FILE_GLOBAL, VIDEO_MODELS_FILE_KIND, VIDEO_MODELS_FILE_NAME, VIDEO_MODELS_NAMESPACE,
  WRITE_SECRETS_FIELD, SdkworkVideoModelsSchema, defaultVideoProviders, officialProviderId,
  projectVideoModelsDocument, serializeVideoModelsDocument,
  type SdkworkVideoModelsSnapshot, type SdkworkVideoProvider,
} from '../src/video-models-settings.ts'
import { CATALOG_VIDEO_MODEL_PRESETS } from '../src/model-presets.ts'

const directories: string[] = []

/** A temporary directory this spec owns and removes. */
async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sdkwork-video-models-'))
  directories.push(directory)
  return directory
}

/** One official row and one relay row, as the resolved section carries them. */
function rows(): SdkworkVideoProvider[] {
  return [
    {
      id: 'official-google-global',
      label: 'Google',
      kind: 'official',
      vendor: 'google',
      protocol: 'openai_compatible',
      region: 'global',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: 'sk-official',
      apiKeyEnv: '',
      enabled: true,
      models: [{
        id: 'veo-3.1-generate-preview', displayName: 'Veo 3.1 Generate Preview',
        catalogKey: 'google/veo-3.1-generate-preview', enabled: true, generationMode: 'image_to_video',
        resolution: '1080p', aspectRatio: '16:9', durationSeconds: 8, outputAudio: true,
      }],
    },
    {
      id: 'relay-1',
      label: '',
      kind: 'relay',
      vendor: '',
      protocol: 'openai_compatible',
      region: '',
      baseUrl: 'https://relay.example.com/v1',
      apiKey: 'sk-relay',
      apiKeyEnv: 'RELAY_API_KEY',
      enabled: false,
      models: [],
    },
  ]
}

/** A section snapshot the projection reads. */
function snapshotOf(overrides: Partial<SdkworkVideoModelsSnapshot> = {}): SdkworkVideoModelsSnapshot {
  return {
    [DEFAULT_PROVIDER_FIELD]: 'relay-1',
    [WRITE_SECRETS_FIELD]: false,
    [PROVIDERS_FIELD]: rows(),
    ...overrides,
  }
}

/**
 * A live config over fixed section values: the Host half reads `get()` per use,
 * so a spec drives the projection by handing it different values.
 * @param providers - the provider rows to resolve.
 * @param options - whether keys are projected, and the declared directory.
 * @returns the config the Host half reads.
 */
function configOf(
  providers: SdkworkVideoProvider[] = rows(),
  options: { writeSecrets?: boolean; directory?: string; defaultProviderId?: string } = {},
): Config {
  return {
    [DEFAULT_PROVIDER_FIELD]: { get: () => options.defaultProviderId ?? 'relay-1' },
    [PROVIDERS_FIELD]: { get: () => providers },
    [WRITE_SECRETS_FIELD]: { get: () => options.writeSecrets ?? false },
    directory: options.directory ?? '',
  }
}

/**
 * Mount the Host half over a stand-in settings service.
 * @param directory - the projection directory to declare.
 * @param providers - the live provider rows, which a spec may move between writes.
 * @returns the context and the page-policy spy the plugin registered.
 */
function bench(
  directory: string,
  providers: SdkworkVideoProvider[] = [],
): { ctx: Context; configure: ReturnType<typeof vi.fn> } {
  const ctx = new Context()
  const configure = vi.fn(() => () => {})
  ctx.provide('settings' as never, { configure } as never)
  apply(ctx, configOf(providers, { directory }))
  return { ctx, configure }
}

/** Let the plugin's injection callbacks and the first projection write settle. */
const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

/**
 * Wait for the projection to land, then report the instant it records.
 * @param path - the projection path.
 * @returns the document's `updatedAt`.
 */
async function updatedAtOf(path: string): Promise<string> {
  await vi.waitFor(async () => { await readFile(path, 'utf8') })
  return (JSON.parse(await readFile(path, 'utf8')) as { updatedAt: string }).updatedAt
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => { await rm(directory, { recursive: true, force: true }) }))
})

describe('video model section schema', () => {
  it('seeds every catalog video vendor once, disabled and key-less', () => {
    const providers = defaultVideoProviders()

    expect(providers.length).toBeGreaterThan(0)
    expect(new Set(providers.map(provider => provider.id)).size).toBe(providers.length)
    for (const provider of providers) {
      expect(provider.kind).toBe('official')
      expect(provider.enabled).toBe(false)
      expect(provider.apiKey).toBe('')
      expect(provider.apiKeyEnv).toBe('')
      expect(provider.models.length).toBeGreaterThan(0)
    }
  })

  it('seeds every catalog video model once, on the row for its own region', () => {
    const seeded = defaultVideoProviders().flatMap(provider => provider.models.map(model => model.id))

    expect(seeded).toHaveLength(CATALOG_VIDEO_MODEL_PRESETS.length)
    for (const provider of defaultVideoProviders()) {
      expect(provider.models.length).toBeGreaterThan(0)
    }
  })

  it('keys a vendor row by vendor and region, so two published roots stay distinct', () => {
    expect(officialProviderId('openai', 'global')).toBe('official-openai-global')
    expect(officialProviderId('bytedance', 'cn')).toBe('official-bytedance-cn')
    expect(officialProviderId('runway', '')).toBe('official-runway')
  })

  it('resolves the live config through the plugin schema, applying row defaults', () => {
    // `as never`: the schema's declared input is the resolved section, while the
    // runtime contract under test is a raw partial document.
    const resolved = SdkworkVideoModelsSchema({
      [PROVIDERS_FIELD]: [{
        id: 'relay-1', kind: 'relay', baseUrl: 'https://relay.example.com/v1', models: [{ id: 'kling-v3' }],
      }],
    } as never)
    const [provider] = resolved[PROVIDERS_FIELD]

    expect(provider?.label).toBe('')
    expect(provider?.enabled).toBe(false)
    expect(provider?.models[0]?.generationMode).toBe('')
    expect(provider?.models[0]?.resolution).toBe('')
    expect(provider?.models[0]?.aspectRatio).toBe('')
    expect(provider?.models[0]?.durationSeconds).toBe(0)
    expect(provider?.models[0]?.outputAudio).toBe(false)
    expect(provider?.models[0]?.enabled).toBe(true)
  })

  it('bounds a clip length to whole seconds inside the modality range', () => {
    const resolved = SdkworkVideoModelsSchema({
      [PROVIDERS_FIELD]: [{ id: 'relay-1', models: [{ id: 'kling-v3', durationSeconds: 600 }] }],
    } as never)
    expect(resolved[PROVIDERS_FIELD][0]?.models[0]?.durationSeconds).toBe(600)

    for (const durationSeconds of [601, -1, 2.5]) {
      expect(() => SdkworkVideoModelsSchema({
        [PROVIDERS_FIELD]: [{ id: 'relay-1', models: [{ id: 'kling-v3', durationSeconds }] }],
      } as never)).toThrow()
    }
  })

  it('refuses a provider row without an id', () => {
    expect(() => SdkworkVideoModelsSchema({ [PROVIDERS_FIELD]: [{ kind: 'relay' }] } as never)).toThrow()
  })
})

describe('projection document', () => {
  it('states the extension contract a skill reads', () => {
    const document = projectVideoModelsDocument(snapshotOf(), {
      updatedAt: '2026-10-02T00:00:00.000Z',
      writeSecrets: false,
    })

    expect(document.schemaVersion).toBe(SDKWORK_MODELS_FILE_SCHEMA_VERSION)
    expect(document.kind).toBe(VIDEO_MODELS_FILE_KIND)
    expect(document.plugin).toBe(VIDEO_MODELS_NAMESPACE)
    expect(document.modality).toBe('video')
    expect(document.updatedAt).toBe('2026-10-02T00:00:00.000Z')
    expect(document.defaultProviderId).toBe('relay-1')
    expect(document.writeSecrets).toBe(false)
    expect(document.providers.map(provider => provider.id)).toEqual(['official-google-global', 'relay-1'])
    expect(document.providers[0]?.models[0]?.generationMode).toBe('image_to_video')
    expect(document.providers[0]?.models[0]?.resolution).toBe('1080p')
    expect(document.providers[0]?.models[0]?.aspectRatio).toBe('16:9')
    expect(document.providers[0]?.models[0]?.durationSeconds).toBe(8)
    expect(document.providers[0]?.models[0]?.outputAudio).toBe(true)
  })

  it('reports where the credential comes from without copying it', () => {
    const document = projectVideoModelsDocument(snapshotOf(), {
      updatedAt: '2026-10-02T00:00:00.000Z',
      writeSecrets: false,
    })

    expect(document.providers[0]?.credential).toEqual({ env: '', stored: true })
    expect(document.providers[1]?.credential).toEqual({ env: 'RELAY_API_KEY', stored: true })
  })

  it('carries literal keys only when the section opts in', () => {
    const document = projectVideoModelsDocument(snapshotOf({ [WRITE_SECRETS_FIELD]: true }), {
      updatedAt: '2026-10-02T00:00:00.000Z',
      writeSecrets: true,
    })

    expect(document.providers[0]?.credential.value).toBe('sk-official')
    expect(document.writeSecrets).toBe(true)
  })

  it('omits the value of a provider with no stored key even when secrets are projected', () => {
    const [official] = rows()
    if (official === undefined) throw new Error('no official row to project')
    const document = projectVideoModelsDocument(snapshotOf({
      [WRITE_SECRETS_FIELD]: true,
      [PROVIDERS_FIELD]: [{ ...official, apiKey: '' }],
    }), { updatedAt: '2026-10-02T00:00:00.000Z', writeSecrets: true })

    expect(document.providers[0]?.credential).toEqual({ env: '', stored: false })
  })

  it('serializes as readable JSON with one trailing newline', () => {
    const text = serializeVideoModelsDocument(projectVideoModelsDocument(snapshotOf(), {
      updatedAt: '2026-10-02T00:00:00.000Z',
      writeSecrets: false,
    }))

    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('\n  "providers": [')
    expect(text.trimEnd().endsWith('}')).toBe(true)
  })
})

describe('projection file', () => {
  it('follows the harness home by default and an explicit directory when declared', () => {
    const declared = resolveVideoModelsFile(configOf([], { directory: join('C:', 'sdkwork-config') }))
    expect(declared.fileName).toBe(VIDEO_MODELS_FILE_NAME)
    expect(declared.path).toBe(join('C:', 'sdkwork-config', VIDEO_MODELS_FILE_NAME))

    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = join('C:', 'harness-home')
    try {
      const resolved = resolveVideoModelsFile(configOf())
      expect(resolved.directory).toBe(join('C:', 'harness-home', SDKWORK_MODELS_DIRECTORY))
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })

  it('creates the directory and replaces the document atomically', async () => {
    const directory = await temporaryDirectory()
    const target = {
      directory: join(directory, 'sdkwork'),
      fileName: VIDEO_MODELS_FILE_NAME,
      path: join(directory, 'sdkwork', VIDEO_MODELS_FILE_NAME),
    }

    await writeVideoModelsFile(target, '{"first":true}\n', 1)
    await writeVideoModelsFile(target, '{"second":true}\n', 2)

    expect(await readFile(target.path, 'utf8')).toBe('{"second":true}\n')
  })

  it('keeps its own section off the generated settings pages and projects it at startup', async () => {
    const directory = await temporaryDirectory()
    const { ctx, configure } = bench(directory)
    const path = join(directory, VIDEO_MODELS_FILE_NAME)

    await vi.waitFor(async () => { await readFile(path, 'utf8') })
    expect(configure).toHaveBeenCalledTimes(1)
    expect(configure.mock.calls[0]?.[0]).toEqual({ auto: false })
    const document = JSON.parse(await readFile(path, 'utf8')) as { kind: string; providers: unknown[] }
    expect(document.kind).toBe(VIDEO_MODELS_FILE_KIND)
    expect(document.providers).toEqual([])
    await ctx.fiber.dispose()
  })

  it('publishes the resolved path to the page before the browser activates', async () => {
    const directory = await temporaryDirectory()
    const { ctx } = bench(directory)
    const table: { kind: string; name: string; value: unknown }[] = []

    void ctx.events.parallel('webserver/index-inject', table)

    expect(table).toEqual([{
      kind: 'global',
      name: VIDEO_MODELS_FILE_GLOBAL,
      value: { directory, fileName: VIDEO_MODELS_FILE_NAME, path: join(directory, VIDEO_MODELS_FILE_NAME) },
    }])
    // Let the startup projection land before this spec's directory is removed.
    await vi.waitFor(async () => { await readFile(join(directory, VIDEO_MODELS_FILE_NAME), 'utf8') })
    await ctx.fiber.dispose()
  })

  it('rewrites the document when its own entry commits, and ignores another entry', async () => {
    const directory = await temporaryDirectory()
    const providers: SdkworkVideoProvider[] = []
    const { ctx } = bench(directory, providers)
    const path = join(directory, VIDEO_MODELS_FILE_NAME)
    const text = async (): Promise<string> => await readFile(path, 'utf8')
    await updatedAtOf(path)

    ctx.emit('settings/document-updated', 'ui-theme' as SettingsNamespace, 2)
    await flush()
    expect(await text()).not.toContain('official-google-global')

    // A commit is a re-read, not a replay: the document the next write produces
    // is built from the live config at that moment.
    providers.push(...rows())
    ctx.emit('settings/document-updated', VIDEO_MODELS_NAMESPACE as SettingsNamespace, 3)
    await vi.waitFor(async () => { expect(await text()).toContain('official-google-global') })
    await ctx.fiber.dispose()
  })

  it('reports a failed write instead of failing the plugin', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const directory = await temporaryDirectory()
    const blocker = join(directory, 'blocker')
    await writeFile(blocker, 'not a directory')

    bench(blocker)

    await vi.waitFor(() => { expect(error).toHaveBeenCalled() })
    error.mockRestore()
  })
})

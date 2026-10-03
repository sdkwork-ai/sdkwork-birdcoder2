/**
 * Host-face spec for the music model configuration: the seeded section, the
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
import { apply, resolveMusicModelsFile, writeMusicModelsFile, type Config } from '../src/index.ts'
import {
  DEFAULT_PROVIDER_FIELD, MUSIC_MODELS_FILE_GLOBAL, MUSIC_MODELS_FILE_KIND, MUSIC_MODELS_FILE_NAME,
  MUSIC_MODELS_NAMESPACE, PROVIDERS_FIELD, SDKWORK_MODELS_DIRECTORY, SDKWORK_MODELS_FILE_SCHEMA_VERSION,
  WRITE_SECRETS_FIELD, defaultMusicProviders, officialProviderId, projectMusicModelsDocument,
  serializeMusicModelsDocument, SdkworkMusicModelsSchema,
  type SdkworkMusicModelsSnapshot, type SdkworkMusicProvider,
} from '../src/music-models-settings.ts'
import { CATALOG_MUSIC_MODEL_PRESETS } from '../src/model-presets.ts'

const directories: string[] = []

/** A temporary directory this spec owns and removes. */
async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sdkwork-music-models-'))
  directories.push(directory)
  return directory
}

/** One official row and one relay row, as the resolved section carries them. */
function rows(): SdkworkMusicProvider[] {
  return [
    {
      id: 'official-minimax-cn',
      label: 'MiniMax',
      kind: 'official',
      vendor: 'minimax',
      protocol: 'openai_compatible',
      region: 'cn',
      baseUrl: 'https://api.minimaxi.com/v1',
      apiKey: 'sk-official',
      apiKeyEnv: '',
      enabled: true,
      models: [{
        id: 'music-3.0', displayName: 'MiniMax Music 3.0', catalogKey: 'minimax/music-3.0',
        enabled: true, instrumental: false, durationSeconds: 120, format: 'mp3',
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
function snapshotOf(overrides: Partial<SdkworkMusicModelsSnapshot> = {}): SdkworkMusicModelsSnapshot {
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
  providers: SdkworkMusicProvider[] = rows(),
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
  providers: SdkworkMusicProvider[] = [],
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

describe('music model section schema', () => {
  it('seeds every catalog music vendor once, disabled and key-less', () => {
    const providers = defaultMusicProviders()

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

  it('seeds every catalog music model once, on the row for its own region', () => {
    const seeded = defaultMusicProviders().flatMap(provider => provider.models.map(model => model.id))

    expect(seeded).toHaveLength(CATALOG_MUSIC_MODEL_PRESETS.length)
    for (const provider of defaultMusicProviders()) {
      expect(provider.models.length).toBeGreaterThan(0)
    }
  })

  it('keys a vendor row by vendor and region, so two published roots stay distinct', () => {
    expect(officialProviderId('minimax', 'cn')).toBe('official-minimax-cn')
    expect(officialProviderId('minimax', 'global')).toBe('official-minimax-global')
    expect(officialProviderId('suno', '')).toBe('official-suno')
  })

  it('resolves the live config through the plugin schema, applying row defaults', () => {
    // `as never`: the schema's declared input is the resolved section, while the
    // runtime contract under test is a raw partial document.
    const resolved = SdkworkMusicModelsSchema({
      [PROVIDERS_FIELD]: [{
        id: 'relay-1',
        kind: 'relay',
        baseUrl: 'https://relay.example.com/v1',
        models: [
          { id: 'music_v2' },
          { id: 'suno-v6', instrumental: true, durationSeconds: 180, format: 'wav' },
        ],
      }],
    } as never)
    const [provider] = resolved[PROVIDERS_FIELD]

    expect(provider?.label).toBe('')
    expect(provider?.enabled).toBe(false)
    expect(provider?.models[0]?.enabled).toBe(true)
    expect(provider?.models[0]?.instrumental).toBe(false)
    expect(provider?.models[0]?.durationSeconds).toBe(0)
    expect(provider?.models[0]?.format).toBe('')
    // A row that states its music parameters keeps them.
    expect(provider?.models[1]?.instrumental).toBe(true)
    expect(provider?.models[1]?.durationSeconds).toBe(180)
    expect(provider?.models[1]?.format).toBe('wav')
  })

  it('refuses a provider row without an id', () => {
    expect(() => SdkworkMusicModelsSchema({ [PROVIDERS_FIELD]: [{ kind: 'relay' }] } as never)).toThrow()
  })
})

describe('projection document', () => {
  it('states the extension contract a skill reads', () => {
    const document = projectMusicModelsDocument(snapshotOf(), {
      updatedAt: '2026-10-02T00:00:00.000Z',
      writeSecrets: false,
    })

    expect(document.schemaVersion).toBe(SDKWORK_MODELS_FILE_SCHEMA_VERSION)
    expect(document.kind).toBe(MUSIC_MODELS_FILE_KIND)
    expect(document.plugin).toBe(MUSIC_MODELS_NAMESPACE)
    expect(document.modality).toBe('music')
    expect(document.updatedAt).toBe('2026-10-02T00:00:00.000Z')
    expect(document.defaultProviderId).toBe('relay-1')
    expect(document.writeSecrets).toBe(false)
    expect(document.providers.map(provider => provider.id)).toEqual(['official-minimax-cn', 'relay-1'])
    expect(document.providers[0]?.models[0]?.durationSeconds).toBe(120)
    expect(document.providers[0]?.models[0]?.instrumental).toBe(false)
    expect(document.providers[0]?.models[0]?.format).toBe('mp3')
  })

  it('reports where the credential comes from without copying it', () => {
    const document = projectMusicModelsDocument(snapshotOf(), {
      updatedAt: '2026-10-02T00:00:00.000Z',
      writeSecrets: false,
    })

    expect(document.providers[0]?.credential).toEqual({ env: '', stored: true })
    expect(document.providers[1]?.credential).toEqual({ env: 'RELAY_API_KEY', stored: true })
  })

  it('carries literal keys only when the section opts in', () => {
    const document = projectMusicModelsDocument(snapshotOf({ [WRITE_SECRETS_FIELD]: true }), {
      updatedAt: '2026-10-02T00:00:00.000Z',
      writeSecrets: true,
    })

    expect(document.providers[0]?.credential.value).toBe('sk-official')
    expect(document.writeSecrets).toBe(true)
  })

  it('omits the value of a provider with no stored key even when secrets are projected', () => {
    const [official] = rows()
    if (official === undefined) throw new Error('fixture row missing')
    const document = projectMusicModelsDocument(snapshotOf({
      [WRITE_SECRETS_FIELD]: true,
      [PROVIDERS_FIELD]: [{ ...official, apiKey: '' }],
    }), { updatedAt: '2026-10-02T00:00:00.000Z', writeSecrets: true })

    expect(document.providers[0]?.credential).toEqual({ env: '', stored: false })
  })

  it('serializes as readable JSON with one trailing newline', () => {
    const text = serializeMusicModelsDocument(projectMusicModelsDocument(snapshotOf(), {
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
    const declared = resolveMusicModelsFile(configOf([], { directory: join('C:', 'sdkwork-config') }))
    expect(declared.fileName).toBe(MUSIC_MODELS_FILE_NAME)
    expect(declared.path).toBe(join('C:', 'sdkwork-config', MUSIC_MODELS_FILE_NAME))

    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = join('C:', 'harness-home')
    try {
      const resolved = resolveMusicModelsFile(configOf())
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
      fileName: MUSIC_MODELS_FILE_NAME,
      path: join(directory, 'sdkwork', MUSIC_MODELS_FILE_NAME),
    }

    await writeMusicModelsFile(target, '{"first":true}\n', 1)
    await writeMusicModelsFile(target, '{"second":true}\n', 2)

    expect(await readFile(target.path, 'utf8')).toBe('{"second":true}\n')
  })

  it('keeps its own section off the generated settings pages and projects it at startup', async () => {
    const directory = await temporaryDirectory()
    const { ctx, configure } = bench(directory)
    const path = join(directory, MUSIC_MODELS_FILE_NAME)

    await vi.waitFor(async () => { await readFile(path, 'utf8') })
    expect(configure).toHaveBeenCalledTimes(1)
    expect(configure.mock.calls[0]?.[0]).toEqual({ auto: false })
    const document = JSON.parse(await readFile(path, 'utf8')) as { kind: string; providers: unknown[] }
    expect(document.kind).toBe(MUSIC_MODELS_FILE_KIND)
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
      name: MUSIC_MODELS_FILE_GLOBAL,
      value: { directory, fileName: MUSIC_MODELS_FILE_NAME, path: join(directory, MUSIC_MODELS_FILE_NAME) },
    }])
    // Let the startup projection land before this spec's directory is removed.
    await vi.waitFor(async () => { await readFile(join(directory, MUSIC_MODELS_FILE_NAME), 'utf8') })
    await ctx.fiber.dispose()
  })

  it('rewrites the document when its own entry commits, and ignores another entry', async () => {
    const directory = await temporaryDirectory()
    const providers: SdkworkMusicProvider[] = []
    const { ctx } = bench(directory, providers)
    const path = join(directory, MUSIC_MODELS_FILE_NAME)
    const text = async (): Promise<string> => await readFile(path, 'utf8')
    await updatedAtOf(path)

    ctx.emit('settings/document-updated', 'ui-theme' as SettingsNamespace, 2)
    await flush()
    expect(await text()).not.toContain('official-minimax-cn')

    // A commit is a re-read, not a replay: the document the next write produces
    // is built from the live config at that moment.
    providers.push(...rows())
    ctx.emit('settings/document-updated', MUSIC_MODELS_NAMESPACE as SettingsNamespace, 3)
    await vi.waitFor(async () => { expect(await text()).toContain('official-minimax-cn') })
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

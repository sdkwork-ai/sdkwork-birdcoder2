/**
 * Host-face spec: the `$DSH_HOME` projection target, the section schema, the
 * atomic writer, and the settings commit that keeps the operator-facing file
 * current. A failed projection write is asserted not to fail the plugin.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  apply, Config, resolveAccessTokenConfigFile, writeAccessTokenConfigFile,
} from '../src/index.ts'
import {
  ACCESS_TOKEN_CONFIG_FILE_GLOBAL, ACCESS_TOKEN_CONFIG_FILE_NAME, ACCESS_TOKEN_CONFIG_FILE_KIND,
  ACCESS_TOKEN_CONFIG_FILE_SCHEMA_VERSION, ACCESS_TOKEN_CONFIG_DIRECTORY, ACCESS_TOKEN_NAMESPACE,
  ACCOUNTS_FIELD, projectAccessTokenConfigDocument, serializeAccessTokenConfigDocument,
  type SdkworkAccessTokenAccount,
} from '../src/access-token-settings.ts'

const directories: string[] = []

/** One temporary directory cleaned after the spec. */
async function temporary(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-access-token-'))
  directories.push(directory)
  return directory
}

/** One remembered row. */
function account(project: string, username = 'admin'): SdkworkAccessTokenAccount {
  return {
    project,
    username,
    password: 'secret',
    baseUrl: 'https://api.test',
    bootstrapAccessToken: 'bootstrap',
    environment: 'development',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/** The live config surface the Host half reads. */
function configOf(accounts: SdkworkAccessTokenAccount[], directory: string): Config {
  return { [ACCOUNTS_FIELD]: { get: () => accounts }, directory }
}

/** Mount the Host half over a stand-in settings service. */
function bench(directory: string, accounts: SdkworkAccessTokenAccount[] = []) {
  const ctx = new Context()
  const configure = vi.fn(() => () => {})
  ctx.provide('settings' as never, { configure } as never)
  apply(ctx, configOf(accounts, directory))
  return { ctx, configure, accounts }
}

/** Let the injection callbacks and the first projection write settle. */
const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => { await rm(directory, { recursive: true, force: true }) }))
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('projection target', () => {
  it('follows $DSH_HOME, then ~/.dsh, and honors a declared directory', async () => {
    const home = await temporary()
    vi.stubEnv('DSH_HOME', home)
    expect(resolveAccessTokenConfigFile({ directory: '' })).toEqual({
      directory: join(home, ACCESS_TOKEN_CONFIG_DIRECTORY),
      fileName: ACCESS_TOKEN_CONFIG_FILE_NAME,
      path: join(home, ACCESS_TOKEN_CONFIG_DIRECTORY, ACCESS_TOKEN_CONFIG_FILE_NAME),
    })
    expect(resolveAccessTokenConfigFile({ directory: join(home, 'custom') }).path)
      .toBe(join(home, 'custom', ACCESS_TOKEN_CONFIG_FILE_NAME))
    vi.stubEnv('DSH_HOME', '')
    expect(resolveAccessTokenConfigFile({ directory: '' }).directory)
      .toBe(join(homedir(), '.dsh', ACCESS_TOKEN_CONFIG_DIRECTORY))
  })
})

describe('section schema', () => {
  it('defaults a row and refuses one without its required facts', () => {
    const resolved = Config({
      [ACCOUNTS_FIELD]: [{ project: '/repo', username: 'admin', password: 'pw' }],
    } as never)
    expect(resolved[ACCOUNTS_FIELD].get()).toEqual([{
      project: '/repo', username: 'admin', password: 'pw',
      baseUrl: '', bootstrapAccessToken: '', environment: '', updatedAt: '',
    }])
    expect(() => Config({ [ACCOUNTS_FIELD]: [{ project: '/repo' }] } as never)).toThrow()
  })
})

describe('projection document', () => {
  it('states the extension contract and serializes deterministically', () => {
    const document = projectAccessTokenConfigDocument(
      { [ACCOUNTS_FIELD]: [account('/repo')] },
      '2026-01-02T00:00:00.000Z',
    )
    expect(document).toMatchObject({
      schemaVersion: ACCESS_TOKEN_CONFIG_FILE_SCHEMA_VERSION,
      kind: ACCESS_TOKEN_CONFIG_FILE_KIND,
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(serializeAccessTokenConfigDocument(document).endsWith('\n')).toBe(true)
    expect(serializeAccessTokenConfigDocument(document)).toBe(
      `${JSON.stringify(document, null, 2)}\n`,
    )
  })
})

describe('atomic writer', () => {
  it('creates the directory and leaves no temporary sibling behind', async () => {
    const home = await temporary()
    const target = resolveAccessTokenConfigFile({ directory: join(home, 'sdkwork') })
    await writeAccessTokenConfigFile(target, 'hello\n', 1)
    expect(await readFile(target.path, 'utf8')).toBe('hello\n')
    await expect(readFile(`${target.path}.1.tmp`, 'utf8')).rejects.toThrow()
  })
})

describe('settings commit', () => {
  it('publishes the projection path and rewrites after an accepted commit', async () => {
    const home = await temporary()
    const { ctx, configure, accounts } = bench(join(home, 'sdkwork'))
    const table: Array<{ kind: string; name: string; value: unknown }> = []
    ctx.emit('webserver/index-inject', table as never)
    expect(table).toEqual([{
      kind: 'global',
      name: ACCESS_TOKEN_CONFIG_FILE_GLOBAL,
      value: {
        directory: join(home, 'sdkwork'),
        fileName: ACCESS_TOKEN_CONFIG_FILE_NAME,
        path: join(home, 'sdkwork', ACCESS_TOKEN_CONFIG_FILE_NAME),
      },
    }])
    const path = join(home, 'sdkwork', ACCESS_TOKEN_CONFIG_FILE_NAME)
    await vi.waitFor(async () => {
      expect((JSON.parse(await readFile(path, 'utf8')) as { accounts: unknown }).accounts).toEqual([])
    })
    expect(configure).toHaveBeenCalledWith({ auto: false }, expect.anything())

    accounts.push(account('/repo', 'operator'))
    ctx.emit('settings/document-updated', ACCESS_TOKEN_NAMESPACE as SettingsNamespace, 2)
    await vi.waitFor(async () => {
      expect((JSON.parse(await readFile(path, 'utf8')) as { accounts: unknown }).accounts).toEqual([account('/repo', 'operator')])
    })
    // An unrelated namespace's commit leaves the document alone.
    const before = await readFile(path, 'utf8')
    ctx.emit('settings/document-updated', 'another-plugin' as SettingsNamespace, 3)
    await flush()
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('logs a failed projection write instead of failing the plugin', async () => {
    const home = await temporary()
    const blocker = join(home, 'blocked')
    await writeFile(blocker, 'not a directory')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    bench(blocker)
    await vi.waitFor(() => { expect(error).toHaveBeenCalled() })
  })
})

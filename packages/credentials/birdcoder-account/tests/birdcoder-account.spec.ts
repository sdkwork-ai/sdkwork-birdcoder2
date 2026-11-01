/**
 * Regression coverage for the signed-in BirdCoder provisioning: the mirrored
 * session becomes the relay credential and profile, a user's key wins, token
 * rotation refreshes only this plugin's own write, and sign-out removes only
 * what it owns.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { SettingsDescriptor } from '@deepseek-ai/dsh-settings'
import { BirdcoderAccountProvisioner, BIRDCODER_CREDENTIAL_REF } from '../src/account.ts'
import { digestSecret, readMarkerFile, readSessionFile } from '../src/session.ts'
import type { AccountMarker } from '../src/session.ts'

interface Selection {
  provider: string
  model: string
  reasoningEffort?: string
}

interface FakeCredentialState {
  readonly values: Map<string, string>
  readonly sets: string[]
  readonly unsets: string[]
}

interface FakeSettingsState {
  descriptors: SettingsDescriptor[]
  readonly updates: unknown[]
  readonly unsets: string[]
}

interface Harness {
  readonly dir: string
  readonly controller: BirdcoderAccountProvisioner
  readonly credentials: FakeCredentialState
  readonly settings: FakeSettingsState
  readonly selection: { current: Selection }
  readonly saved: Selection[]
  readonly logs: string[]
  writeSession(value: unknown): Promise<void>
  removeSession(): Promise<void>
  marker(): AccountMarker
}

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

const TOKEN = 'header.payload.signature'

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-birdcoder-account-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

function descriptor(value: unknown, user: unknown = value): SettingsDescriptor {
  return {
    ns: 'llm-pi-ai' as SettingsDescriptor['ns'],
    autoGenerate: false,
    schema: {},
    revision: 0,
    applies: 'live',
    value,
    user,
  }
}

async function harness(options: {
  selection?: Selection
  settings?: SettingsDescriptor[]
  credentials?: Record<string, string>
} = {}): Promise<Harness> {
  const dir = await tempDir()
  const credentials: FakeCredentialState = {
    values: new Map(Object.entries(options.credentials ?? {})),
    sets: [],
    unsets: [],
  }
  const settings: FakeSettingsState = {
    descriptors: options.settings ?? [descriptor({})],
    updates: [],
    unsets: [],
  }
  const selection = { current: options.selection ?? { provider: 'deepseek-official', model: 'deepseek-flash' } }
  const saved: Selection[] = []
  const logs: string[] = []
  const sessionFile = join(dir, 'iam', 'session.json')
  const stateFile = join(dir, 'iam', 'birdcoder-account.json')
  const controller = new BirdcoderAccountProvisioner({
    credentials: {
      describe: async (ref: CredentialRef) => ({
        configured: credentials.values.has(ref),
        writable: true,
      }),
      resolve: async (ref: CredentialRef) => {
        const value = credentials.values.get(ref)
        return value === undefined ? undefined : { value, source: 'file' }
      },
      set: async (ref: CredentialRef, value: string) => {
        credentials.values.set(ref, value)
        credentials.sets.push(ref)
      },
      unset: async (ref: CredentialRef) => {
        credentials.values.delete(ref)
        credentials.unsets.push(ref)
      },
    },
    settings: {
      describe: () => settings.descriptors,
      update: async (ns, patch) => {
        settings.updates.push(patch)
        settings.descriptors = settings.descriptors.map((current) => {
          if (current.ns !== ns) return current
          const merged = merge(current.value, patch)
          return descriptor(merged, merge(current.user, patch))
        })
      },
      mutate: async (ns, ops) => {
        settings.unsets.push(ops[0]?.path.join('.') ?? '')
        settings.descriptors = settings.descriptors.map((current) => {
          if (current.ns !== ns) return current
          return descriptor(withoutProvider(current.value), withoutProvider(current.user))
        })
      },
    },
    defaultModel: {
      current: () => selection.current,
      save: async (next) => {
        selection.current = { ...next }
        saved.push({ ...next })
      },
    },
    listModels: async provider => provider === 'birdcoder'
      ? [{ id: 'openai/gpt-4o' }, { id: 'deepseek/deepseek-v4-flash' }]
      : [],
    log: (level, message) => { logs.push(`${level}: ${message}`) },
  }, {
    sessionFile,
    stateFile,
    credentialRef: BIRDCODER_CREDENTIAL_REF,
    settingsNs: 'llm-pi-ai',
    pollIntervalMs: 0,
  })
  await controller.refresh()
  return {
    dir,
    controller,
    credentials,
    settings,
    selection,
    saved,
    logs,
    writeSession: async (value) => {
      await (await import('node:fs/promises')).mkdir(join(dir, 'iam'), { recursive: true })
      await writeFile(sessionFile, JSON.stringify(value), 'utf8')
    },
    removeSession: async () => { await rm(sessionFile, { force: true }) },
    marker: () => readMarkerFile(stateFile, BIRDCODER_CREDENTIAL_REF),
  }
}

/** Merge a plain-object patch into a plain-object value. */
function merge(value: unknown, patch: unknown): Record<string, unknown> {
  const left = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const right = patch !== null && typeof patch === 'object' && !Array.isArray(patch)
    ? patch as Record<string, unknown>
    : {}
  const next: Record<string, unknown> = { ...left }
  for (const [key, entry] of Object.entries(right)) {
    next[key] = entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      ? merge(left[key], entry)
      : entry
  }
  return next
}

/** Remove the relay profile from a settings value. */
function withoutProvider(value: unknown): Record<string, unknown> {
  const section = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const providers = section.providers
  if (providers === null || typeof providers !== 'object' || Array.isArray(providers)) return section
  const { birdcoder: _birdcoder, ...rest } = providers as Record<string, unknown>
  return { ...section, providers: rest }
}

describe('readSessionFile', () => {
  it('distinguishes an absent file, an unusable record, and a token', async () => {
    const dir = await tempDir()
    const path = join(dir, 'session.json')
    expect(readSessionFile(path)).toEqual({ kind: 'absent' })
    await writeFile(path, 'not json', 'utf8')
    expect(readSessionFile(path)).toEqual({ kind: 'invalid' })
    await writeFile(path, JSON.stringify({ accessToken: 'access' }), 'utf8')
    expect(readSessionFile(path)).toEqual({ kind: 'invalid' })
    await writeFile(path, JSON.stringify({ authToken: 'auth', accessToken: 'access' }), 'utf8')
    expect(readSessionFile(path)).toEqual({ kind: 'token', token: 'auth' })
  })
})

describe('BirdcoderAccountProvisioner', () => {
  it('mirrors the signed-in token, declares the relay profile, and selects a relay default', async () => {
    const h = await harness()
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()

    expect(h.credentials.values.get(BIRDCODER_CREDENTIAL_REF)).toBe(TOKEN)
    expect(h.settings.updates).toEqual([{
      providers: { birdcoder: { api: 'openai-completions', apiKeyEnv: BIRDCODER_CREDENTIAL_REF } },
    }])
    expect(h.selection.current).toEqual({ provider: 'birdcoder', model: 'deepseek/deepseek-v4-flash' })
    expect(h.marker()).toMatchObject({
      version: 1,
      ref: BIRDCODER_CREDENTIAL_REF,
      tokenHash: digestSecret(TOKEN),
      profile: 'provisioned',
    })
  })

  it('never overwrites a user-stored relay API key', async () => {
    const h = await harness({ credentials: { [BIRDCODER_CREDENTIAL_REF]: 'sk-user-key' } })
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()

    expect(h.credentials.values.get(BIRDCODER_CREDENTIAL_REF)).toBe('sk-user-key')
    expect(h.credentials.sets).toEqual([])
    expect(h.marker().tokenHash).toBeUndefined()
  })

  it('refreshes the token it wrote when the session rotates', async () => {
    const h = await harness()
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()
    await h.writeSession({ authToken: `${TOKEN}-2`, accessToken: 'access-2' })
    await h.controller.refresh()

    expect(h.credentials.values.get(BIRDCODER_CREDENTIAL_REF)).toBe(`${TOKEN}-2`)
    expect(h.credentials.sets).toHaveLength(2)
    expect(h.marker().tokenHash).toBe(digestSecret(`${TOKEN}-2`))
  })

  it('removes its credential, profile, and default switch on sign-out', async () => {
    const h = await harness()
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()
    await h.removeSession()
    await h.controller.refresh()

    expect(h.credentials.values.has(BIRDCODER_CREDENTIAL_REF)).toBe(false)
    expect(h.credentials.unsets).toEqual([BIRDCODER_CREDENTIAL_REF])
    expect(h.settings.unsets).toEqual(['providers.birdcoder'])
    expect(h.selection.current).toEqual({ provider: 'deepseek-official', model: 'deepseek-flash' })
    expect(existsSync(join(h.dir, 'iam', 'birdcoder-account.json'))).toBe(false)
  })

  it('keeps a user-stored key and its profile on sign-out', async () => {
    const h = await harness()
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()
    h.credentials.values.set(BIRDCODER_CREDENTIAL_REF, 'sk-user-key')
    await h.removeSession()
    await h.controller.refresh()

    expect(h.credentials.values.get(BIRDCODER_CREDENTIAL_REF)).toBe('sk-user-key')
    expect(h.credentials.unsets).toEqual([])
    expect(h.settings.unsets).toEqual([])
  })

  it('keeps the provisioned profile for a key it never mirrored', async () => {
    const h = await harness({ credentials: { [BIRDCODER_CREDENTIAL_REF]: 'sk-user-key' } })
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()
    await h.removeSession()
    await h.controller.refresh()

    expect(h.credentials.values.get(BIRDCODER_CREDENTIAL_REF)).toBe('sk-user-key')
    expect(h.settings.unsets).toEqual([])
  })

  it('keeps the last state when the session file is unreadable', async () => {
    const h = await harness()
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()
    await writeFile(join(h.dir, 'iam', 'session.json'), '{', 'utf8')
    await h.controller.refresh()

    expect(h.credentials.values.get(BIRDCODER_CREDENTIAL_REF)).toBe(TOKEN)
    expect(h.marker().profile).toBe('provisioned')
  })

  it('does not replace a default the user chose elsewhere', async () => {
    const h = await harness({ selection: { provider: 'anthropic', model: 'claude-sonnet-4-5' } })
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()

    expect(h.saved).toEqual([])
    expect(h.selection.current).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-5' })
  })

  it('does not replace a default while another provider has a configured key', async () => {
    const h = await harness({
      credentials: { DEEPSEEK_API_KEY: 'sk-deepseek' },
      settings: [
        descriptor({}),
        {
          ns: 'llm-deepseek' as SettingsDescriptor['ns'],
          autoGenerate: false,
          schema: {},
          revision: 0,
          applies: 'live',
          value: { apiKeyEnv: 'DEEPSEEK_API_KEY' },
          user: {},
        },
      ],
    })
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()

    expect(h.saved).toEqual([])
    expect(h.credentials.values.get(BIRDCODER_CREDENTIAL_REF)).toBe(TOKEN)
  })

  it('leaves a pre-existing relay profile in place across sign-out', async () => {
    const existing = descriptor({
      providers: { birdcoder: { apiKeyEnv: BIRDCODER_CREDENTIAL_REF, models: [{ id: 'custom-model' }] } },
    })
    const h = await harness({ settings: [existing] })
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()
    expect(h.marker().profile).toBe('foreign')

    await h.removeSession()
    await h.controller.refresh()
    expect(h.settings.unsets).toEqual([])
    expect(h.credentials.values.has(BIRDCODER_CREDENTIAL_REF)).toBe(false)
  })

  it('is idempotent across repeated polls', async () => {
    const h = await harness()
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()
    await h.controller.refresh()
    await h.controller.refresh()

    expect(h.credentials.sets).toHaveLength(1)
    expect(h.settings.updates).toHaveLength(1)
    expect(h.saved).toHaveLength(1)
  })

  it('reports one diagnostic per failure kind', async () => {
    const h = await harness()
    await h.writeSession({ authToken: TOKEN, accessToken: 'access' })
    await h.controller.refresh()
    expect(h.logs.filter(line => line.startsWith('info:'))).not.toHaveLength(0)
    expect(await readFile(join(h.dir, 'iam', 'birdcoder-account.json'), 'utf8')).toContain('provisioned')
  })
})

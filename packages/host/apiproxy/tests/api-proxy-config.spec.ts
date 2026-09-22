/**
 * Settings/credentials/llm RPC domains and their host-stream frames over
 * createApiProxy: layered redacted describe, write-path rejection mapping,
 * value-free credential views, the directory/live-route merge, and the three
 * invalidation frames (settings/credentials/models changed).
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { redactSecrets, SettingsConflictError } from '@deepseek-ai/dsh-settings'
import type {
  SettingsDescriptor, SettingsDescribeOptions, SettingsNamespace, SettingsPathOp,
} from '@deepseek-ai/dsh-settings'
import { settingsNamespace } from '../src/api/settings.ts'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type {
  CredentialInfo,
  CredentialKey,
  CredentialRecord,
  CredentialRecordEntry,
  CredentialRecordInfo,
  CredentialRef,
  ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import type { HostFrame } from '../src/api/index.ts'
import type { RpcRequest, RpcResponse } from '../src/api/rpc.ts'
import { RpcId } from '../src/api/rpc.ts'
import { createApiProxy } from '../src/api-proxy.ts'

/**
 * The default-model entry's id, which is also the namespace its form is
 * addressed by: a deployment names the entry after the package.
 */
const DEFAULT_MODEL_NS = settingsNamespace('agent-default-model')

const DEFAULTS = { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' }

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`req-${String(nextRpc++)}`), payload }
}

function expectOk<T>(response: RpcResponse<T>): T {
  expect(response.result.ok).toBe(true)
  if (!response.result.ok) throw new Error('unreachable')
  return response.result.value
}

function expectErr<T>(response: RpcResponse<T>): { code: string; message: string; details: unknown } {
  expect(response.result.ok).toBe(false)
  if (response.result.ok) throw new Error('unreachable')
  return response.result.error
}

/** One declared entry: its Config schema, the inherited base, and the raw snapshot last described. */
interface MemoryEntry {
  ns: SettingsNamespace
  schema: z
  base: Record<string, unknown> | undefined
  /** Raw form of the user layer at the last describe; `undefined` before the first one. */
  raw: string | undefined
  revision: number
}

/**
 * In-memory settings service double.
 *
 * The real service derives one form per profile plugin entry. This double keeps
 * that shape — the inherited base a declaration supplies, the user patch the
 * document holds, and the value resolved from both — and reproduces the
 * behaviors the proxy's mapping is asserted against: the revision fence and its
 * {@link SettingsConflictError}, secret redaction through the package's own
 * `redactSecrets`, `writable`/`documentPath`/`prepareDocument`, and the
 * `settings/document-updated` commit the host stream forwards.
 *
 * Three deliberate simplifications, so no assertion below is read as more than
 * it is. `declare` stands in for an entry the Loader would have created from a
 * profile patch — an entry, not a `register` call, is what owns a form now.
 * A write validates only the fields it names and projects defaults only into
 * the resolved value, where the real service resolves the whole configuration
 * through the config editor. And a field whose schema refuses an absent value
 * stays absent instead of failing, which is what a form shows as an empty slot.
 */
class MemorySettings {
  doc: Record<string, unknown>

  constructor(private readonly ctx: Context, options?: {
    doc?: Record<string, unknown>
    readOnly?: boolean
    documentPath?: string
    preparedPath?: string
  }) {
    this.doc = structuredClone(options?.doc ?? {})
    this.readOnly = options?.readOnly ?? false
    this.path = options?.documentPath
    this.preparedPath = options?.preparedPath
  }

  private readonly entries = new Map<string, MemoryEntry>()
  private readonly readOnly: boolean
  private readonly path: string | undefined
  private readonly preparedPath: string | undefined

  get writable(): boolean {
    return !this.readOnly
  }

  get documentPath(): string | undefined {
    return this.path
  }

  prepareDocument(): Promise<string | undefined> {
    return Promise.resolve(this.preparedPath ?? this.documentPath)
  }

  /**
   * Declare one entry's form, as a profile patch would.
   * @param ns - the entry id the browser addresses the section by.
   * @param schema - the entry's Config schema: the form's field list.
   * @param options.base - the inherited layer the profile override sits on.
   * @returns the write surface that entry owns.
   */
  declare(ns: SettingsNamespace, schema: z, options?: { base?: Record<string, unknown> }): {
    update: (patch: Record<string, unknown>) => Promise<void>
    replace: (section: Record<string, unknown>) => Promise<void>
  } {
    this.entries.set(ns, { ns, schema, base: options?.base, raw: undefined, revision: 0 })
    return {
      update: patch => this.update(ns, patch),
      replace: section => this.replace(ns, section),
    }
  }

  describe(options?: SettingsDescribeOptions): SettingsDescriptor[] {
    const descriptors: SettingsDescriptor[] = []
    for (const entry of this.entries.values()) {
      const userLayer = this.userLayer(entry.ns)
      const value = this.project(entry, { ...entry.base ?? {}, ...userLayer })
      const raw = JSON.stringify(userLayer)
      const changed = entry.raw !== raw
      entry.raw = raw
      entry.revision += changed ? 1 : 0
      // The real service announces the commit from the same place: the first
      // describe of an entry counts as a change, and so does every later one
      // whose user layer moved.
      if (changed) this.ctx.emit('settings/document-updated', entry.ns, entry.revision)
      // Every column the real service publishes is resolved through the form
      // and, for a remote caller, scrubbed by the same `redactSecrets` call:
      // `describe()` computes `base`/`user` with `projectForm(...)` and then
      // redacts all three of `value`, `base`, and `user`. A column that skipped
      // either step would publish a different shape (or a live secret) than the
      // service a client actually talks to.
      const base = this.project(entry, entry.base ?? {})
      const user = this.project(entry, userLayer)
      const redacted = redactSecrets(entry.schema as z<never>, value)
      descriptors.push({
        ns: entry.ns,
        autoGenerate: true,
        schema: entry.schema.toJSON(),
        revision: entry.revision,
        applies: 'live',
        value: options?.redactSecrets === true ? redacted.value : value,
        base: options?.redactSecrets === true ? redactSecrets(entry.schema as z<never>, base).value : base,
        user: options?.redactSecrets === true ? redactSecrets(entry.schema as z<never>, user).value : user,
        ...options?.redactSecrets === true ? { secrets: redacted.secrets } : {},
      })
    }
    return descriptors
  }

  async update(ns: string, patch: object, expectedRevision?: number): Promise<void> {
    await this.write(ns, 'update', patch as Record<string, unknown>, expectedRevision)
  }

  async replace(ns: string, section: object, expectedRevision?: number): Promise<void> {
    await this.write(ns, 'replace', section as Record<string, unknown>, expectedRevision)
  }

  async mutate(ns: string, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void> {
    const entry = this.expect(ns)
    this.fence(entry, expectedRevision)
    const next = this.userLayer(ns)
    for (const op of ops) {
      const parent = op.path.slice(0, -1).reduce<Record<string, unknown>>(
        (node, key) => (node[key] ??= {}) as Record<string, unknown>, next,
      )
      if (op.op === 'set') parent[op.path.at(-1) as string] = op.value
      else Reflect.deleteProperty(parent, op.path.at(-1) as string)
    }
    this.validate(entry, next)
    this.commit(entry, next)
  }

  private async write(
    ns: string,
    mode: 'update' | 'replace',
    payload: Record<string, unknown>,
    expectedRevision?: number,
  ): Promise<void> {
    // The read-only refusal is the seam's, so it names the seam's own state.
    if (this.readOnly) throw new Error(`the settings document is read-only: ${String(this.documentPath)}`)
    const entry = this.expect(ns)
    // The real service resolves the entry's descriptor from *inside* its write
    // path (`write()` fences the revision through `this.describe()`), and
    // `describe` is the one place that announces `settings/document-updated`.
    // Reading the descriptor here is therefore what a write does even when the
    // caller supplies no revision: without it a commit lands in silence, and an
    // external change — another tab, a hand-edited settings.yaml — would never
    // reach an open consumer's stream.
    this.describe()
    this.fence(entry, expectedRevision)
    this.validate(entry, payload)
    this.commit(entry, mode === 'update' ? { ...this.userLayer(ns), ...payload } : payload)
  }

  private commit(entry: MemoryEntry, section: Record<string, unknown>): void {
    this.doc[entry.ns] = structuredClone(section)
  }

  /** The user layer as stored; the form's `user` column. */
  private userLayer(ns: string): Record<string, unknown> {
    const section = this.doc[ns]
    return section === undefined ? {} : structuredClone(section) as Record<string, unknown>
  }

  private expect(ns: string): MemoryEntry {
    const entry = this.entries.get(ns)
    // The seam's own wording: a name no entry answers is refused by the
    // service, and this proxy adds no boundary of its own in front of it.
    if (entry === undefined) throw new Error(`No configurable plugin entry "${ns}"`)
    return entry
  }

  private fence(entry: MemoryEntry, expectedRevision?: number): void {
    if (expectedRevision === undefined) return
    const actual = this.describe().find(row => row.ns === entry.ns)?.revision ?? entry.revision
    if (actual !== expectedRevision) throw new SettingsConflictError(entry.ns, expectedRevision, actual)
  }

  /** Validate the fields a write names, leaving every unnamed field of the form alone. */
  private validate(entry: MemoryEntry, section: Record<string, unknown>): void {
    const fields = entry.schema.dict ?? {}
    for (const [key, value] of Object.entries(section)) {
      const field = fields[key]
      if (field === undefined) throw new Error(`Config field "${key}" is not volatile`)
      field(value)
    }
  }

  /** Resolve one layer against the entry's schema, filling the defaults it declares. */
  private project(entry: MemoryEntry, layer: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = { ...layer }
    for (const [key, field] of Object.entries(entry.schema.dict ?? {})) {
      const present = resolved[key]
      if (present === undefined) {
        try {
          resolved[key] = field(undefined)
        } catch {
          // A field that refuses an absent value stays absent: the form renders
          // its empty slot, and a write that names it is what validates it.
        }
        continue
      }
      resolved[key] = field(present)
    }
    return resolved
  }
}

/**
 * The settings double a harness mounted. Entries are declared through it because
 * a profile entry, not a registration call, is what owns a form.
 * @param ctx - a context a harness built.
 * @returns the mounted double.
 */
function settingsOf(ctx: Context): MemorySettings {
  return ctx.get('settings') as unknown as MemorySettings
}

/** In-memory credential provider with an env-shadow double for the rejection path. */
class MemoryCredentials extends CredentialProvider {
  private readonly values = new Map<string, string>()

  constructor(ctx: ConstructorParameters<typeof CredentialProvider>[0], options?: { shadowed?: string[] }) {
    super(ctx)
    this.shadowed = new Set(options?.shadowed ?? [])
  }

  private readonly shadowed: Set<string>

  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    if (this.shadowed.has(ref)) return Promise.resolve({ value: 'from-env', source: 'env' })
    const value = this.values.get(ref)
    return Promise.resolve(value === undefined ? undefined : { value, source: 'file' })
  }

  describe(ref: CredentialRef): Promise<CredentialInfo> {
    if (this.shadowed.has(ref)) return Promise.resolve({ configured: true, source: 'env', writable: false })
    const configured = this.values.has(ref)
    return Promise.resolve({ configured, ...configured ? { source: 'file' } : {}, writable: true })
  }

  set(ref: CredentialRef, value: string): Promise<void> {
    if (this.shadowed.has(ref)) {
      return Promise.reject(new Error(`credentials: ${ref} is shadowed by the read-only environment`))
    }
    this.values.set(ref, value)
    this.ctx.emit('credentials/reference-updated', ref)
    return Promise.resolve()
  }

  unset(ref: CredentialRef): Promise<void> {
    if (this.shadowed.has(ref)) {
      return Promise.reject(new Error(`credentials: ${ref} is shadowed by the read-only environment`))
    }
    this.values.delete(ref)
    this.ctx.emit('credentials/reference-updated', ref)
    return Promise.resolve()
  }

  // The record half has no wire face on this proxy, so the double answers the
  // empty store rather than modelling storage the tests never exercise.
  readRecord(): Promise<CredentialRecord | undefined> {
    return Promise.resolve(undefined)
  }

  describeRecord(): Promise<CredentialRecordInfo> {
    return Promise.resolve({ configured: false, writable: true })
  }

  listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return Promise.resolve([])
  }

  modifyRecord(
    _key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    return mutate(undefined)
  }

  deleteRecord(): Promise<void> {
    return Promise.resolve()
  }
}

/** Catalog-serving adapter stub for the llm.models path. */
class CatalogAdapter extends LlmAdapter {
  constructor(private readonly name: string, private readonly models: readonly string[]) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: this.name }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.models.map(id => ({ provider, id, name: id })))
  }


  async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('not exercised')
  }
}

class BrokenCatalogAdapter extends CatalogAdapter {
  override listModels(): Promise<readonly LlmModelInfo[]> {
    return Promise.reject(new Error('catalog backend down'))
  }
}

const NS = settingsNamespace('llm-deepseek')

const AdapterConfig = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().default('DEEPSEEK_API_KEY'),
  baseURL: z.string(),
})

async function harness(options?: {
  settings?: false | {
    doc?: Record<string, unknown>
    readOnly?: boolean
    documentPath?: string
    preparedPath?: string
  }
  credentials?: false | { shadowed?: string[] }
  /** Skip the directory registration to exercise a namespace the proxy does not expose. */
  configurableProviders?: false
}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LlmRuntime)
  if (options?.settings !== false) ctx.provide('settings' as never, new MemorySettings(ctx, options?.settings) as never)
  if (options?.credentials !== false) await ctx.plugin(MemoryCredentials, options?.credentials)
  // Model-provider namespaces plus the explicit Web preference and product
  // onboarding allowlists are the proxy's complete settings surface.
  if (options?.configurableProviders !== false) {
    ctx.llm.registerConfigurableProviders([
      { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] },
    ])
  }
  // Host-stream opener reads the committed-workspace baseline; the stub
  // suffices — the real workspace composition is api-proxy-workspace.spec's.
  ctx.provide('workspaceRegistry', { list: () => [] } as never)
  return ctx
}

/** Drain `count` host frames matching `types`, then abort the stream. */
async function collectHost(
  api: ReturnType<typeof createApiProxy>,
  types: string[],
  count: number,
  run: () => Promise<void>,
): Promise<HostFrame[]> {
  const abort = new AbortController()
  const frames: HostFrame[] = []
  const stream = api.events.host(request({}), abort.signal)
  const consume = (async () => {
    for await (const frame of stream) {
      if (!types.includes(frame.payload.type)) continue
      frames.push(frame.payload)
      if (frames.length >= count) abort.abort()
    }
  })()
  await run()
  await consume
  return frames
}

/**
 * One forwarded `settings/document-updated` frame for `ns`. The revision rides
 * the host's own argument list, so it is matched by shape rather than pinned to
 * a per-test count.
 * @param ns - the namespace whose stored section changed.
 * @returns the expected wrapper frame.
 */
function forwardedSettings(ns: string): HostFrame {
  return {
    type: 'host/remote-event',
    event: 'settings/document-updated',
    // The revision is the Host's own counter, so the matcher is the assertion.
    args: [ns, expect.any(Number)], // oxlint-disable-line typescript/no-unsafe-assignment
  }
}

describe('settings domain', () => {
  it('reports an actionable error when no settings provider is mounted', async () => {
    const ctx = await harness({ settings: false })
    const api = createApiProxy(ctx, DEFAULTS)
    const error = expectErr(await api.settings.describe(request({})))
    expect(error.code).toBe('internal')
    expect(error.message).toContain('dsh-settings-file')
  })

  it('describes layered redacted namespaces with their secret slots', async () => {
    const ctx = await harness({ settings: {
      doc: { 'llm-deepseek': { apiKey: 'user-secret', baseURL: 'https://user' } },
      documentPath: '/tmp/custom-settings.yaml',
    } })
    settingsOf(ctx).declare(NS, AdapterConfig, { base: { baseURL: 'https://base' } })
    const api = createApiProxy(ctx, DEFAULTS)
    const value = expectOk(await api.settings.describe(request({})))
    expect(value.writable).toBe(true)
    expect(value.hasDocument).toBe(true)
    expect(value.namespaces).toHaveLength(1)
    const view = value.namespaces[0]!
    expect(view.ns).toBe('llm-deepseek')
    expect(view.applies).toBe('live')
    expect((view.schema as { refs?: unknown }).refs).toBeDefined()
    expect(view.value).toEqual({ apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://user' })
    // Every column is resolved through the entry's form, so a declared default
    // (`apiKeyEnv`) appears in `base` and `user` as well: the service computes
    // all three columns with `projectForm(...)` and then redacts each one for a
    // remote caller, which is why the secret slot is reported through `secrets`
    // rather than carried as a value here.
    expect(view.base).toEqual({ apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://base' })
    expect(view.user).toEqual({ apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://user' })
    expect(view.secrets).toEqual([{ path: ['apiKey'], set: true }])
    expect(JSON.stringify(value)).not.toContain('user-secret')
  })

  it('opens the provider-resolved document without accepting a browser path', async () => {
    const ctx = await harness({ settings: {
      documentPath: '/tmp/described-settings.yaml',
      preparedPath: '/tmp/custom-settings.yaml',
    } })
    const opened: string[] = []
    const api = createApiProxy(ctx, {
      ...DEFAULTS,
      openTextFile: (path) => {
        opened.push(path)
        return Promise.resolve()
      },
    })

    expect(expectOk(await api.settings.openDocument(request({}), new AbortController().signal)))
      .toEqual({ opened: true })
    expect(opened).toEqual(['/tmp/custom-settings.yaml'])
  })

  it('refuses to open settings when the provider has no local document', async () => {
    const ctx = await harness()
    const api = createApiProxy(ctx, DEFAULTS)
    expect(expectOk(await api.settings.describe(request({}))).hasDocument).toBe(false)
    const error = expectErr(await api.settings.openDocument(request({}), new AbortController().signal))
    expect(error.code).toBe('internal')
    expect(error.message).toContain('no local document')
  })

  it('does not prepare or open a settings document after cancellation', async () => {
    const ctx = await harness({ settings: { documentPath: '/tmp/settings.yaml' } })
    const opened: string[] = []
    const api = createApiProxy(ctx, {
      ...DEFAULTS,
      openTextFile: (path) => {
        opened.push(path)
        return Promise.resolve()
      },
    })
    // Spy through the double, not through `ctx.settings`: the published
    // interface promises `Promise<string>` and this double models the narrower
    // case the proxy actually guards — a provider that resolves nothing.
    const prepare = vi.spyOn(settingsOf(ctx), 'prepareDocument')
    const cancelled = new AbortController()
    cancelled.abort()
    expect(expectErr(await api.settings.openDocument(request({}), cancelled.signal)).code)
      .toBe('cancelled')
    expect(prepare).not.toHaveBeenCalled()

    const pending = Promise.withResolvers<string | undefined>()
    prepare.mockReturnValueOnce(pending.promise)
    const duringPrepare = new AbortController()
    const opening = api.settings.openDocument(request({}), duringPrepare.signal)
    await vi.waitFor(() => { expect(prepare).toHaveBeenCalledOnce() })
    duringPrepare.abort()
    pending.resolve('/tmp/settings.yaml')
    expect(expectErr(await opening).code).toBe('cancelled')
    expect(opened).toEqual([])
  })

  it('serves every registered namespace, including one this repository never named', async () => {
    // Registering IS the exposure: a plugin distributed outside this
    // repository configures itself from the browser without a change here.
    // The plane stays loopback-only and secret-redacted, and which surface
    // renders a namespace is the browser's decision, not this proxy's.
    const ctx = await harness()
    settingsOf(ctx).declare(NS, AdapterConfig)
    settingsOf(ctx).declare(settingsNamespace('some-other-plugin'), z.object({ secretPath: z.string() }))
    settingsOf(ctx).declare(settingsNamespace('permission'), z.object({
      defaultPreset: z.union(['read-only', 'workspace-write']).required(),
    }), {
      base: { defaultPreset: 'read-only' },
    })
    settingsOf(ctx).declare(settingsNamespace('ui-theme'), z.object({
      preference: z.union(['light', 'dark', 'system']).default('system'),
    }))
    settingsOf(ctx).declare(settingsNamespace('locale'), z.object({
      preference: z.union(['zh', 'en']).required(false),
    }))
    settingsOf(ctx).declare(settingsNamespace('ui-conversation'), z.object({
      busyEnter: z.union(['queue', 'steer']).default('queue'),
    }))
    settingsOf(ctx).declare(settingsNamespace('shell'), z.object({
      timeoutMs: z.number().default(120_000),
    }))
    settingsOf(ctx).declare(settingsNamespace('agent-loop'), z.object({
      maxParallelToolCalls: z.number().default(10),
    }))
    settingsOf(ctx).declare(settingsNamespace('web-search-deepseek'), z.object({
      baseURL: z.string(),
    }))
    const api = createApiProxy(ctx, DEFAULTS)

    const value = expectOk(await api.settings.describe(request({})))
    expect(value.namespaces.map(view => view.ns)).toEqual([
      'llm-deepseek', 'some-other-plugin', 'permission', 'ui-theme', 'locale',
      'ui-conversation', 'shell', 'agent-loop', 'web-search-deepseek',
    ])
    const permission = expectOk(await api.settings.mutate(request({
      ns: 'permission',
      ops: [{ op: 'set', path: ['defaultPreset'], value: 'workspace-write' }],
    })))
    expect(permission.value).toEqual({ defaultPreset: 'workspace-write' })
    const theme = expectOk(await api.settings.mutate(request({
      ns: 'ui-theme',
      ops: [{ op: 'set', path: ['preference'], value: 'dark' }],
    })))
    expect(theme.value).toEqual({ preference: 'dark' })
    const locale = expectOk(await api.settings.mutate(request({
      ns: 'locale',
      ops: [{ op: 'set', path: ['preference'], value: 'en' }],
    })))
    expect(locale.value).toEqual({ preference: 'en' })
    const conversation = expectOk(await api.settings.mutate(request({
      ns: 'ui-conversation',
      ops: [{ op: 'set', path: ['busyEnter'], value: 'steer' }],
    })))
    expect(conversation.value).toEqual({ busyEnter: 'steer' })
    const bash = expectOk(await api.settings.mutate(request({
      ns: 'shell',
      ops: [{ op: 'set', path: ['timeoutMs'], value: 5_000 }],
    })))
    expect(bash.value).toEqual({ timeoutMs: 5_000 })
    const agentLoop = expectOk(await api.settings.mutate(request({
      ns: 'agent-loop',
      ops: [{ op: 'set', path: ['maxParallelToolCalls'], value: 2 }],
    })))
    expect(agentLoop.value).toEqual({ maxParallelToolCalls: 2 })
    const webSearch = expectOk(await api.settings.mutate(request({
      ns: 'web-search-deepseek',
      ops: [{ op: 'set', path: ['baseURL'], value: 'https://search.test/v1' }],
    })))
    expect(webSearch.value).toEqual({ baseURL: 'https://search.test/v1' })

    const other = expectOk(await api.settings.update(request({
      ns: 'some-other-plugin',
      patch: { secretPath: '/etc/shadow' },
    })))
    expect(other.value).toEqual({ secretPath: '/etc/shadow' })
    expect(ctx.settings.describe().find(d => String(d.ns) === 'some-other-plugin')?.value)
      .toEqual({ secretPath: '/etc/shadow' })
  })

  it('serves product preference namespaces without invalidating the model catalog', async () => {
    const ctx = await harness()
    settingsOf(ctx).declare(settingsNamespace('ui-onboarding'), z.object({ welcomeNoticeVersion: z.string() }))
    settingsOf(ctx).declare(settingsNamespace('ui-theme'), z.object({
      preference: z.union(['light', 'dark', 'system']).default('system'),
    }))
    const api = createApiProxy(ctx, DEFAULTS)
    expect(expectOk(await api.settings.describe(request({}))).namespaces.map(view => view.ns))
      .toEqual(['ui-onboarding', 'ui-theme'])
    const frames = await collectHost(api, ['host/remote-event'], 2, async () => {
      expectOk(await api.settings.mutate(request({
        ns: 'ui-onboarding',
        ops: [{ op: 'set', path: ['welcomeNoticeVersion'], value: 'v1' }],
      })))
      expectOk(await api.settings.mutate(request({
        ns: 'ui-theme',
        ops: [{ op: 'set', path: ['preference'], value: 'dark' }],
      })))
    })
    expect(frames).toEqual([forwardedSettings('ui-onboarding'), forwardedSettings('ui-theme')])
  })

  it('serves the agent-preset namespace, so a browser preset picker can persist its choice', async () => {
    const ctx = await harness()
    settingsOf(ctx).declare(settingsNamespace('agent-presets'), z.object({ default: z.string() }))
    const api = createApiProxy(ctx, DEFAULTS)

    expectOk(await api.settings.update(request({ ns: 'agent-presets', patch: { default: 'minimal' } })))

    // Both browser surfaces that offer the choice — the General row and the
    // management section — write the default through `settings.update`, so a
    // namespace outside this boundary makes the picker move and then silently
    // forget, which is worse than refusing the control.
    expect(ctx.settings.describe().find(view => String(view.ns) === 'agent-presets')?.value)
      .toEqual({ default: 'minimal' })
  })

  it('keeps serving a provider namespace whose directory entry is gone', async () => {
    // The configurable-provider directory says what the Models page can offer,
    // not what a user may configure: a dormant route's stored section is still
    // theirs to edit, and losing the entry must not strand it.
    const ctx = await harness({ configurableProviders: false })
    settingsOf(ctx).declare(NS, AdapterConfig)
    const api = createApiProxy(ctx, DEFAULTS)
    expect(expectOk(await api.settings.describe(request({}))).namespaces.map(view => view.ns))
      .toEqual(['llm-deepseek'])
    expect(expectOk(await api.settings.update(request({ ns: 'llm-deepseek', patch: { baseURL: 'https://x' } }))).value)
      .toMatchObject({ baseURL: 'https://x' })
  })

  it('forwards a provider settings change for model-catalog consumers', async () => {
    // Editing `models` changes no route, so llm/adapters-updated never fires
    // and an open model picker would keep serving the stale catalog. Storing
    // an override equal to the resolved value emits nothing on
    // settings/updated, so another tab would never learn the field became
    // overridden.
    const ctx = await harness()
    settingsOf(ctx).declare(NS, AdapterConfig, { base: { baseURL: 'https://base' } })
    const api = createApiProxy(ctx, DEFAULTS)
    // Two announcements, both real. The first `describe` of an entry counts as
    // a change — the service publishes a revision the first time it reads a
    // form, because `previous?.raw !== raw` is trivially true when there is no
    // previous — and the write's own commit moves the layer again. The write
    // path reads the descriptor before it commits, so both reach the stream.
    const frames = await collectHost(api, ['host/remote-event'], 2, async () => {
      await api.settings.update(request({ ns: 'llm-deepseek', patch: { baseURL: 'https://base' } }))
    })
    expect(frames).toEqual([forwardedSettings('llm-deepseek'), forwardedSettings('llm-deepseek')])
    // The resolved value never moved: base already said https://base.
    expect(expectOk(await api.settings.describe(request({}))).namespaces[0]!.value)
      .toEqual({ apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://base' })
  })

  it('broadcasts a permission change without invalidating the model catalog', async () => {
    const ctx = await harness()
    const permission = settingsOf(ctx).declare(settingsNamespace('permission'), z.object({
      defaultPreset: z.union(['read-only', 'workspace-write']).required(),
    }), {
      base: { defaultPreset: 'read-only' },
    })
    const api = createApiProxy(ctx, DEFAULTS)
    const frames = await collectHost(api, ['host/remote-event'], 1, async () => {
      await permission.update({ defaultPreset: 'workspace-write' })
    })
    expect(frames).toEqual([forwardedSettings('permission')])
  })

  it('forwards an Agent-default settings change for model-catalog consumers', async () => {
    const ctx = await harness()
    const defaultModel = settingsOf(ctx).declare(DEFAULT_MODEL_NS, z.object({
      provider: z.string().required(),
      model: z.string().required(),
    }), { base: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } })
    const api = createApiProxy(ctx, DEFAULTS)
    // The shared section names the selection every blank session resolves to,
    // so an externally edited default — another tab, a
    // hand-edited settings.yaml — has to reach an open selector as well.
    const frames = await collectHost(api, ['host/remote-event'], 1, async () => {
      await defaultModel.replace({ provider: 'deepseek-official', model: 'deepseek-reasoner' })
    })
    expect(frames).toEqual([forwardedSettings('agent-default-model')])
  })

  it('maps a stale expectedRevision to settings-conflict carrying both revisions', async () => {
    const ctx = await harness()
    settingsOf(ctx).declare(NS, AdapterConfig)
    const api = createApiProxy(ctx, DEFAULTS)
    const opened = expectOk(await api.settings.describe(request({}))).namespaces[0]!.revision
    expect(expectOk(await api.settings.update(request({ ns: 'llm-deepseek', patch: { baseURL: 'https://first' }, expectedRevision: opened })))
      .revision).toBe(opened + 1)
    const error = expectErr(await api.settings.update(request({ ns: 'llm-deepseek', patch: { baseURL: 'https://second' }, expectedRevision: opened })))
    expect(error.code).toBe('settings-conflict')
    expect(error.details).toEqual({ ns: 'llm-deepseek', expected: opened, actual: opened + 1 })
    // The refused write changed nothing.
    expect(expectOk(await api.settings.describe(request({}))).namespaces[0]!.user)
      .toEqual({ apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://first' })
  })

  it('updates the user layer, answers with the new redacted view, and broadcasts the frame', async () => {
    const ctx = await harness()
    settingsOf(ctx).declare(NS, AdapterConfig, { base: { baseURL: 'https://base' } })
    const api = createApiProxy(ctx, DEFAULTS)
    const frames = await collectHost(api, ['host/remote-event'], 2, async () => {
      const view = expectOk(await api.settings.update(request({ ns: 'llm-deepseek', patch: { apiKey: 'sk-new', baseURL: 'https://next' } })))
      expect(view.value).toEqual({ apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://next' })
      expect(view.user).toEqual({ apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://next' })
      expect(view.secrets).toEqual([{ path: ['apiKey'], set: true }])
      expect(JSON.stringify(view)).not.toContain('sk-new')
    })
    // Same pair as the provider-change case above: the entry's first read
    // publishes a revision, and the commit publishes the next one.
    expect(frames).toEqual([forwardedSettings('llm-deepseek'), forwardedSettings('llm-deepseek')])
  })

  it('replace resets the user layer wholesale', async () => {
    const ctx = await harness({ settings: { doc: { 'llm-deepseek': { baseURL: 'https://user' } } } })
    settingsOf(ctx).declare(NS, AdapterConfig)
    const api = createApiProxy(ctx, DEFAULTS)
    const view = expectOk(await api.settings.replace(request({ ns: 'llm-deepseek', section: {} })))
    expect(view.value).toEqual({ apiKeyEnv: 'DEEPSEEK_API_KEY' })
    // A wholesale reset empties the stored section, and the form still resolves
    // the entry's own default into the column it is read through.
    expect(view.user).toEqual({ apiKeyEnv: 'DEEPSEEK_API_KEY' })
  })

  it.each([
    ['an invalid namespace name', 'Not A Namespace', {}],
    ['a schema-invalid patch', 'llm-deepseek', { baseURL: 42 }],
  ])('rejects %s as settings-rejected', async (_case, ns, patch) => {
    const ctx = await harness()
    settingsOf(ctx).declare(NS, AdapterConfig)
    const api = createApiProxy(ctx, DEFAULTS)
    const error = expectErr(await api.settings.update(request({ ns, patch })))
    expect(error.code).toBe('settings-rejected')
    expect(error.details).toEqual({ ns })
  })

  it('answers an unregistered namespace as the seam does, and a malformed one alike', async () => {
    // A name no registration answers and a name no registration could answer
    // fold into the same rejection: the proxy adds no boundary of its own, so
    // the seam's own refusal is the whole answer.
    const ctx = await harness()
    settingsOf(ctx).declare(NS, AdapterConfig)
    const api = createApiProxy(ctx, DEFAULTS)
    const unknown = expectErr(await api.settings.update(request({ ns: 'unknown-ns', patch: {} })))
    const malformed = expectErr(await api.settings.update(request({ ns: 'Not A Namespace', patch: {} })))
    expect(unknown.code).toBe('settings-rejected')
    // The seam's own wording, verbatim (`settings/src/index.ts`: "No
    // configurable plugin entry \"${ns}\""): the proxy adds no boundary of its
    // own, so the assertion pins that string rather than paraphrasing it.
    expect(unknown.message).toContain('No configurable plugin entry')
    expect(malformed.code).toBe(unknown.code)
  })

  it('maps a read-only provider refusal onto the same rejection', async () => {
    const ctx = await harness({ settings: { readOnly: true } })
    settingsOf(ctx).declare(NS, AdapterConfig)
    const api = createApiProxy(ctx, DEFAULTS)
    const value = expectOk(await api.settings.describe(request({})))
    expect(value.writable).toBe(false)
    const error = expectErr(await api.settings.update(request({ ns: 'llm-deepseek', patch: {} })))
    expect(error.code).toBe('settings-rejected')
    expect(error.message).toContain('read-only')
  })
})

describe('credentials domain', () => {
  it('reports an actionable error when no credential provider is mounted', async () => {
    const ctx = await harness({ credentials: false })
    const api = createApiProxy(ctx, DEFAULTS)
    const error = expectErr(await api.credentials.describe(request({ refs: ['A'] })))
    expect(error.code).toBe('internal')
    expect(error.message).toContain('dsh-credentials-local')
  })

  it('describes value-free views and flips state through set/unset with frames', async () => {
    const ctx = await harness()
    const api = createApiProxy(ctx, DEFAULTS)
    const before = expectOk(await api.credentials.describe(request({ refs: ['OPENAI_API_KEY'] })))
    expect(before.credentials).toEqual({ OPENAI_API_KEY: { configured: false, writable: true } })
    const frames = await collectHost(api, ['host/remote-event'], 2, async () => {
      expectOk(await api.credentials.set(request({ ref: 'OPENAI_API_KEY', value: 'sk-secret' })))
      const after = expectOk(await api.credentials.describe(request({ refs: ['OPENAI_API_KEY'] })))
      expect(after.credentials).toEqual({ OPENAI_API_KEY: { configured: true, source: 'file', writable: true } })
      expect(JSON.stringify(after)).not.toContain('sk-secret')
      expectOk(await api.credentials.unset(request({ ref: 'OPENAI_API_KEY' })))
    })
    expect(frames).toEqual([
      { type: 'host/remote-event', event: 'credentials/reference-updated', args: ['OPENAI_API_KEY'] },
      { type: 'host/remote-event', event: 'credentials/reference-updated', args: ['OPENAI_API_KEY'] },
    ])
  })

  it('maps a shadowed write onto credential-rejected for set and unset alike', async () => {
    const ctx = await harness({ credentials: { shadowed: ['DEEPSEEK_API_KEY'] } })
    const api = createApiProxy(ctx, DEFAULTS)
    const described = expectOk(await api.credentials.describe(request({ refs: ['DEEPSEEK_API_KEY'] })))
    expect(described.credentials['DEEPSEEK_API_KEY']).toEqual({ configured: true, source: 'env', writable: false })
    const setError = expectErr(await api.credentials.set(request({ ref: 'DEEPSEEK_API_KEY', value: 'x' })))
    expect(setError.code).toBe('credential-rejected')
    expect(setError.details).toEqual({ ref: 'DEEPSEEK_API_KEY' })
    const unsetError = expectErr(await api.credentials.unset(request({ ref: 'DEEPSEEK_API_KEY' })))
    expect(unsetError.code).toBe('credential-rejected')
  })
})

describe('llm domain', () => {
  it('merges the configurable directory with live routes and appends undeclared ones', async () => {
    const ctx = await harness({ configurableProviders: false })
    ctx.llm.registerConfigurableProviders([
      { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] },
      { provider: 'openai', displayName: 'openai', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'] },
    ])
    ctx.llm.registerAdapter(['deepseek-official'], new CatalogAdapter('DeepSeek', ['deepseek-v4-flash']))
    ctx.llm.registerAdapter(['undeclared'], new CatalogAdapter('Undeclared', ['u-1']))
    // Only one namespace can answer an interrogation, so the flag follows the
    // entry's namespace rather than being assumed for every row.
    ctx.llm.registerModelDiscovery('llm-pi-ai', () => Promise.resolve([]))
    const api = createApiProxy(ctx, DEFAULTS)
    const value = expectOk(await api.llm.providers(request({})))
    expect(value.providers).toEqual([
      { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [], active: true },
      { provider: 'openai', displayName: 'openai', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'], active: false },
      // An undeclared live route has no settings address, so nothing can be
      // interrogated on its behalf either.
      { provider: 'undeclared', displayName: 'Undeclared', settingsNs: '', settingsPath: [], active: true },
    ])
  })

  it('serves the host-scoped catalog with per-provider failures contained', async () => {
    const ctx = await harness()
    ctx.llm.registerAdapter(['deepseek-official'], new CatalogAdapter('DeepSeek', ['deepseek-v4-flash', 'deepseek-v4-pro']))
    ctx.llm.registerAdapter(['broken'], new BrokenCatalogAdapter('Broken', []))
    const api = createApiProxy(ctx, DEFAULTS)
    const value = expectOk(await api.llm.models(request({})))
    expect(value.groups).toEqual([{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' },
        { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro' },
      ],
    }])
    expect(value.failures).toEqual([{ id: 'broken', name: 'Broken', message: 'catalog backend down' }])
  })

  it('forwards llm/adapters-updated at every topology commit point', async () => {
    const ctx = await harness()
    const api = createApiProxy(ctx, DEFAULTS)
    const frames = await collectHost(api, ['host/remote-event'], 2, async () => {
      const dispose = ctx.llm.registerAdapter(['deepseek-official'], new CatalogAdapter('DeepSeek', []))
      dispose()
      return Promise.resolve()
    })
    expect(frames).toEqual([
      { type: 'host/remote-event', event: 'llm/adapters-updated', args: [] },
      { type: 'host/remote-event', event: 'llm/adapters-updated', args: [] },
    ])
  })
})

describe('llm.discoverModels', () => {
  it('carries a draft to its namespace and returns candidates without storing anything', async () => {
    const ctx = await harness()
    const seen: unknown[] = []
    ctx.llm.registerModelDiscovery('llm-pi-ai', (probe) => {
      seen.push({ baseURL: probe.baseURL, api: probe.api, apiKey: probe.apiKey })
      return Promise.resolve([
        { id: 'acme-large', name: 'Acme Large', contextWindow: 65_536, maxTokens: 4096 },
        { id: 'acme-small' },
      ])
    })
    const api = createApiProxy(ctx, DEFAULTS)

    const value = expectOk(await api.llm.discoverModels(request({
      settingsNs: 'llm-pi-ai',
      baseURL: 'https://gateway.acme.example/v1',
      api: 'openai-completions',
      apiKey: 'probe-key',
    })))

    expect(value.models).toEqual([
      { id: 'acme-large', name: 'Acme Large', contextWindow: 65_536, maxTokens: 4096 },
      { id: 'acme-small' },
    ])
    expect(seen).toEqual([{
      baseURL: 'https://gateway.acme.example/v1',
      api: 'openai-completions',
      apiKey: 'probe-key',
    }])
    // Interrogating a draft is a read: no namespace gained a section, and no
    // credential reference was written.
    expect(expectOk(await api.settings.describe(request({}))).namespaces.map(view => view.ns))
      .not.toContain('llm-pi-ai')
  })

  it('carries the route being edited so an adapter can answer from its own registry', async () => {
    const ctx = await harness()
    let probe: unknown
    ctx.llm.registerModelDiscovery('llm-pi-ai', (request_) => {
      probe = request_
      return Promise.resolve([{ id: 'from-registry', contextWindow: 65_536, maxTokens: 4096 }])
    })
    const api = createApiProxy(ctx, DEFAULTS)

    const value = expectOk(await api.llm.discoverModels(request({
      settingsNs: 'llm-pi-ai',
      provider: 'deepseek',
    })))

    // No endpoint at all: a route the adapter already describes needs none.
    expect(probe).toEqual({ provider: 'deepseek' })
    expect(value.models).toEqual([{ id: 'from-registry', contextWindow: 65_536, maxTokens: 4096 }])
  })

  it('omits a credential and protocol the draft does not name', async () => {
    const ctx = await harness()
    let probe: unknown
    ctx.llm.registerModelDiscovery('llm-pi-ai', (request_) => {
      probe = request_
      return Promise.resolve([])
    })
    const api = createApiProxy(ctx, DEFAULTS)

    expectOk(await api.llm.discoverModels(request({
      settingsNs: 'llm-pi-ai',
      baseURL: 'https://gateway.acme.example/v1',
    })))

    // Absent fields stay absent rather than crossing as explicit undefined:
    // the adapter distinguishes "no protocol named" from "protocol undefined".
    expect(probe).toEqual({ baseURL: 'https://gateway.acme.example/v1' })
  })

  it('reports a failed interrogation as the form\'s next move, naming no credential', async () => {
    const ctx = await harness()
    ctx.llm.registerModelDiscovery('llm-pi-ai', () =>
      Promise.reject(new Error('https://gateway.acme.example/v1/models answered 401; check the API key')))
    const api = createApiProxy(ctx, DEFAULTS)

    const error = expectErr(await api.llm.discoverModels(request({
      settingsNs: 'llm-pi-ai',
      baseURL: 'https://gateway.acme.example/v1',
      apiKey: 'wrong',
    })))

    expect(error.code).toBe('model-discovery-failed')
    expect(error.message).toContain('answered 401; check the API key')
    expect(error.details).toEqual({ settingsNs: 'llm-pi-ai', baseURL: 'https://gateway.acme.example/v1' })
    expect(JSON.stringify(error)).not.toContain('wrong')
  })

  it('reports a namespace no adapter family serves', async () => {
    const ctx = await harness()
    const api = createApiProxy(ctx, DEFAULTS)

    const error = expectErr(await api.llm.discoverModels(request({
      settingsNs: 'llm-deepseek',
      baseURL: 'https://api.deepseek.com',
    })))

    expect(error.code).toBe('model-discovery-failed')
    expect(error.message).toContain('no model discovery is registered')
  })
})

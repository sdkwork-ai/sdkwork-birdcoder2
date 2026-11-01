/**
 * Provisioning of the BirdCoder relay from the signed-in SDKWork IAM session.
 *
 * BirdCoder accepts the IAM `authToken` as its API key, so a signed-in user
 * needs no separate relay credential. This controller reads the session the
 * desktop shell mirrors under the Harness home and:
 *
 * 1. stores `authToken` under the relay's credential reference, unless the
 *    user already stored a key there;
 * 2. declares the `llm-pi-ai` BirdCoder profile when the settings document has
 *    none, so the relay route registers and its models reach the picker;
 * 3. moves the default model from the unauthenticated official DeepSeek route
 *    to the first BirdCoder model when no other provider has a key.
 *
 * Every write is recorded in a marker beside the session. Sign-out removes
 * exactly those writes: a key or profile the user changed is left untouched,
 * and the previous default selection is restored when the current one still is
 * the BirdCoder selection this controller saved.
 *
 * @module @deepseek-ai/dsh-birdcoder-account/account
 */

import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { SettingsDescriptor, SettingsForms } from '@deepseek-ai/dsh-settings'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import {
  digestSecret, readMarkerFile, readSessionFile, removeMarkerFile, writeMarkerFile,
} from './session.ts'
import type { AccountMarker, SelectionSnapshot } from './session.ts'

/** One diagnostic sink; the plugin binds it to the Host logger. */
export type AccountLog = (level: 'info' | 'warn', message: string, error?: unknown) => void

/** The default-model service this controller steers, when the composition mounts one. */
export interface DefaultModelPort {
  /** Current deployment or user default selection. */
  current(): SelectionSnapshot
  /** Persist a replacement selection. */
  save(next: SelectionSnapshot): Promise<void>
}

/** Services and optional collaborators the controller drives. */
export interface BirdcoderAccountPorts {
  /** Credential seam the relay token is stored through. */
  credentials: Pick<CredentialProvider, 'describe' | 'resolve' | 'set' | 'unset'>
  /** Settings seam the relay profile is declared through; absence keeps the credential-only behavior. */
  settings?: Pick<SettingsForms, 'describe' | 'update' | 'mutate'>
  /** Default-model seam; absence leaves the saved default untouched. */
  defaultModel?: DefaultModelPort
  /** Lists the registered models of one route; absence disables the default-model switch. */
  listModels?: (provider: string) => Promise<readonly { readonly id: string }[]>
  /** Diagnostic sink; defaults to no output. */
  log?: AccountLog
}

/** Resolved controller parameters. */
export interface BirdcoderAccountOptions {
  /** Absolute path of the mirrored IAM session. */
  sessionFile: string
  /** Absolute path of this controller's ownership marker. */
  stateFile: string
  /** Credential reference the relay token is stored under. */
  credentialRef: string
  /** Settings namespace owning the `llm-pi-ai` provider profiles. */
  settingsNs: string
  /** Poll interval in milliseconds; `0` disables the timer and leaves manual refreshes only. */
  pollIntervalMs: number
}

/** The relay provider route this controller provisions. */
export const BIRDCODER_PROVIDER = 'birdcoder'

/** The credential reference a shipped BirdCoder relay profile names. */
export const BIRDCODER_CREDENTIAL_REF = 'BIRDCODER_API_KEY'

/** The official DeepSeek route whose unauthenticated default this controller replaces. */
const OFFICIAL_PROVIDER = 'deepseek-official'

/**
 * Wire protocol the signed-in credential works on. BirdCoder's login-token
 * channel is its OpenAI-compatible `/v1` face, where a non-`sk-` bearer value is
 * resolved as an IAM auth token; its Anthropic `/anthropic` face accepts API
 * keys only. A user-configured profile keeps whatever protocol it named.
 */
const RELAY_API = 'openai-completions'

/** Model id fragment preferred when choosing the relay default. */
const PREFERRED_MODEL = 'deepseek'

/**
 * Read one member of a narrowed JSON object without an `any` cast.
 * @param value - plain object under inspection.
 * @param key - member name.
 * @returns the member value, typed as unknown for validation.
 */
function member(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key]
}

/**
 * Read the BirdCoder profile from one settings layer.
 * @param value - settings value, user layer, or base layer.
 * @returns the profile object, or undefined when the layer has none.
 */
function relayProfile(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const providers = member(value, 'providers')
  if (providers === null || typeof providers !== 'object' || Array.isArray(providers)) return undefined
  return member(providers, BIRDCODER_PROVIDER)
}

/** The descriptor of the settings namespace that owns provider profiles. */
function descriptorOf(descriptors: readonly SettingsDescriptor[], ns: string): SettingsDescriptor | undefined {
  return descriptors.find(descriptor => descriptor.ns === ns)
}

/**
 * The default model and profile provisioner for one BirdCoder relay route.
 *
 * Construction wires the seams; {@link start} performs the first reconciliation
 * and installs the poll timer, and {@link dispose} stops it.
 */
export class BirdcoderAccountProvisioner {
  private timer: ReturnType<typeof setInterval> | undefined
  private pending: Promise<void> = Promise.resolve()
  private disposed = false
  private readonly warned = new Set<string>()

  /**
   * @param ports - credential, settings, and optional model collaborators.
   * @param options - file locations, references, and the poll interval.
   */
  constructor(
    private readonly ports: BirdcoderAccountPorts,
    private readonly options: BirdcoderAccountOptions,
  ) {}

  /** Reconcile once and, when configured, keep reconciling on the poll interval. */
  start(): void {
    void this.refresh()
    if (this.options.pollIntervalMs <= 0) return
    this.timer = setInterval(() => { void this.refresh() }, this.options.pollIntervalMs)
    this.timer.unref()
  }

  /** Stop polling; a reconciliation already in flight settles without publishing. */
  dispose(): void {
    this.disposed = true
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  /**
   * Reconcile the session and the provisioned state once. Concurrent callers
   * share the serialized chain, so the last observed session always wins.
   * @returns settlement after the reconciliation this call observes.
   */
  refresh(): Promise<void> {
    const next = this.pending.then(() => this.reconcileSafely(), () => this.reconcileSafely())
    this.pending = next
    return next
  }

  /** One reconciliation pass whose seam failures are diagnostics, not rejected callers. */
  private async reconcileSafely(): Promise<void> {
    try {
      await this.reconcile()
    } catch (error: unknown) {
      this.warnOnce('reconcile', 'birdcoder-account: session reconciliation failed', error)
    }
  }

  /** One reconciliation pass over the session file. */
  private async reconcile(): Promise<void> {
    if (this.disposed) return
    const session = readSessionFile(this.options.sessionFile)
    if (session.kind === 'invalid') {
      // A malformed record is not a sign-out: the desktop shell writes the file
      // atomically, so this is a foreign or transient read. Keeping the last
      // state avoids dropping a live credential on one bad parse.
      this.warnOnce('invalid-session', 'birdcoder-account: ignored an unreadable IAM session file')
      return
    }
    if (session.kind === 'absent') {
      await this.signOut()
      return
    }
    await this.signIn(session.token)
  }

  /** Mirror one token and its provider configuration. */
  private async signIn(token: string): Promise<void> {
    if (this.disposed) return
    const original = readMarkerFile(this.options.stateFile, this.options.credentialRef)
    let marker: AccountMarker = { ...original }
    const hash = digestSecret(token)
    const stored = await this.readStoredCredential()
    if (this.stopped()) return
    if (stored === undefined) {
      await this.ports.credentials.set(credentialRef(this.options.credentialRef), token)
      marker = { ...marker, tokenHash: hash }
      this.info('birdcoder-account: stored the signed-in relay token')
    } else if (stored === token) {
      marker = { ...marker, tokenHash: hash }
    } else if (marker.tokenHash !== undefined && digestSecret(stored) === marker.tokenHash) {
      // The stored value is the token this controller wrote earlier; a refreshed
      // session replaces it while the user owns nothing at this reference.
      await this.ports.credentials.set(credentialRef(this.options.credentialRef), token)
      marker = { ...marker, tokenHash: hash }
      this.info('birdcoder-account: refreshed the signed-in relay token')
    }
    // Otherwise the reference holds a user's API key. It wins over the login
    // token and this controller never overwrites it.

    marker = await this.ensureProfile(marker)
    marker = await this.ensureDefaultModel(marker)
    if (this.stopped()) return
    this.commitMarker(original, marker)
  }

  /** Remove only the writes this controller owns. */
  private async signOut(): Promise<void> {
    if (this.disposed) return
    const marker = readMarkerFile(this.options.stateFile, this.options.credentialRef)
    if (marker.tokenHash === undefined && marker.profile === 'none' && marker.switchedDefault === undefined) {
      return
    }
    await this.restoreDefaultModel(marker)
    const userCredential = await this.removeMirroredCredential(marker)
    await this.removeProvisionedProfile(marker, userCredential)
    if (this.stopped()) return
    removeMarkerFile(this.options.stateFile)
    this.info('birdcoder-account: cleared the signed-in relay configuration')
  }

  /**
   * Whether disposal happened while this reconciliation was awaiting a seam.
   * A method rather than a field read so the check survives control-flow
   * narrowing: `dispose` can run between any two awaits.
   * @returns whether the controller has been disposed.
   */
  private stopped(): boolean {
    return this.disposed
  }

  /** Current value at the relay credential reference, when one is configured. */
  private async readStoredCredential(): Promise<string | undefined> {
    const ref = credentialRef(this.options.credentialRef)
    const info = await this.ports.credentials.describe(ref)
    if (!info.configured) return undefined
    return (await this.ports.credentials.resolve(ref))?.value
  }

  /** Declare the relay profile when the settings document has none yet. */
  private async ensureProfile(marker: AccountMarker): Promise<AccountMarker> {
    if (this.disposed || marker.profile !== 'none') return marker
    const settings = this.ports.settings
    if (settings === undefined) return marker
    let descriptor: SettingsDescriptor | undefined
    try {
      descriptor = descriptorOf(settings.describe(), this.options.settingsNs)
    } catch {
      this.warnOnce('describe', 'birdcoder-account: could not read the provider settings')
      return marker
    }
    if (descriptor === undefined) {
      // The adapter is not mounted (or not configurable) in this composition;
      // leave the profile undecided so a later poll can provision it.
      return marker
    }
    if (relayProfile(descriptor.value) !== undefined) return { ...marker, profile: 'foreign' }
    try {
      await settings.update(this.options.settingsNs, {
        providers: { [BIRDCODER_PROVIDER]: { api: RELAY_API, apiKeyEnv: this.options.credentialRef } },
      })
    } catch (error: unknown) {
      this.warnOnce('provision', 'birdcoder-account: could not declare the BirdCoder provider profile', error)
      return marker
    }
    this.info('birdcoder-account: declared the BirdCoder provider profile')
    return { ...marker, profile: 'provisioned' }
  }

  /** Point the default model at the relay when no other provider is authenticated. */
  private async ensureDefaultModel(marker: AccountMarker): Promise<AccountMarker> {
    if (this.disposed || marker.switchedDefault !== undefined) return marker
    const defaults = this.ports.defaultModel
    const listModels = this.ports.listModels
    const settings = this.ports.settings
    if (defaults === undefined || listModels === undefined || settings === undefined) return marker
    const current = defaults.current()
    if (current.provider !== OFFICIAL_PROVIDER) return marker
    if (await this.hasOtherProviderCredential(settings)) return marker
    let models: readonly { readonly id: string }[]
    try {
      models = await listModels(BIRDCODER_PROVIDER)
    } catch (error: unknown) {
      this.warnOnce('list-models', 'birdcoder-account: could not list the BirdCoder models', error)
      return marker
    }
    const preferred = models.find(model => model.id.toLowerCase().includes(PREFERRED_MODEL)) ?? models[0]
    if (preferred === undefined) return marker
    const next: SelectionSnapshot = { provider: BIRDCODER_PROVIDER, model: preferred.id }
    try {
      await defaults.save(next)
    } catch (error: unknown) {
      this.warnOnce('default-model', 'birdcoder-account: could not save the BirdCoder default model', error)
      return marker
    }
    this.info('birdcoder-account: selected the BirdCoder relay as the default model')
    return { ...marker, switchedDefault: { previous: snapshotOf(current), next: snapshotOf(next) } }
  }

  /** Restore the selection this controller replaced, when the user has not moved on. */
  private async restoreDefaultModel(marker: AccountMarker): Promise<void> {
    if (marker.switchedDefault === undefined) return
    const defaults = this.ports.defaultModel
    if (defaults === undefined) return
    if (defaults.current().provider !== BIRDCODER_PROVIDER) return
    try {
      await defaults.save(marker.switchedDefault.previous)
    } catch (error: unknown) {
      this.warnOnce('restore-default', 'birdcoder-account: could not restore the previous default model', error)
    }
  }

  /**
   * Remove the credential this controller wrote.
   * @returns whether a different, user-owned credential remains configured.
   */
  private async removeMirroredCredential(marker: AccountMarker): Promise<boolean> {
    const stored = await this.readStoredCredential()
    if (marker.tokenHash === undefined) {
      // Nothing here belongs to the account mirror; a configured value is the
      // user's key, and the profile that serves it must survive sign-out.
      return stored !== undefined
    }
    if (stored === undefined) return false
    if (digestSecret(stored) !== marker.tokenHash) return true
    await this.ports.credentials.unset(credentialRef(this.options.credentialRef))
    return false
  }

  /** Remove the profile only when it is still exactly the one this controller declared. */
  private async removeProvisionedProfile(marker: AccountMarker, userCredential: boolean): Promise<void> {
    if (marker.profile !== 'provisioned' || userCredential) return
    const settings = this.ports.settings
    if (settings === undefined) return
    let descriptor: SettingsDescriptor | undefined
    try {
      descriptor = descriptorOf(settings.describe(), this.options.settingsNs)
    } catch {
      return
    }
    if (descriptor === undefined) return
    const userProfile = relayProfile(descriptor.user)
    if (!deepEqualJson(userProfile, { api: RELAY_API, apiKeyEnv: this.options.credentialRef })) return
    try {
      await settings.mutate(this.options.settingsNs, [{
        op: 'unset',
        path: ['providers', BIRDCODER_PROVIDER],
      }])
    } catch (error: unknown) {
      this.warnOnce('remove-profile', 'birdcoder-account: could not remove the BirdCoder provider profile', error)
    }
  }

  /** Whether any provider other than the relay resolves a configured credential reference. */
  private async hasOtherProviderCredential(settings: Pick<SettingsForms, 'describe'>): Promise<boolean> {
    let descriptors: readonly SettingsDescriptor[]
    try {
      descriptors = settings.describe()
    } catch {
      return false
    }
    for (const descriptor of descriptors) {
      const value = descriptor.value
      if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
      const direct = member(value, 'apiKeyEnv')
      if (typeof direct === 'string' && await this.isConfigured(direct)) return true
      const providers = member(value, 'providers')
      if (providers === null || typeof providers !== 'object' || Array.isArray(providers)) continue
      for (const [provider, profile] of Object.entries(providers as Record<string, unknown>)) {
        if (provider === BIRDCODER_PROVIDER) continue
        if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) continue
        const ref = member(profile, 'apiKeyEnv')
        if (typeof ref === 'string' && await this.isConfigured(ref)) return true
      }
    }
    return false
  }

  /** Whether one reference reports a configured credential. */
  private async isConfigured(ref: string): Promise<boolean> {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(ref)) return false
    try {
      return (await this.ports.credentials.describe(credentialRef(ref))).configured
    } catch {
      return false
    }
  }

  /** Persist the marker when a reconciliation changed it. */
  private commitMarker(original: AccountMarker, next: AccountMarker): void {
    if (deepEqualJson(original, next)) return
    try {
      writeMarkerFile(this.options.stateFile, next)
    } catch (error: unknown) {
      this.warnOnce('marker', 'birdcoder-account: could not record the provisioning marker', error)
    }
  }

  /** Report one informational transition. */
  private info(message: string): void {
    this.ports.log?.('info', message)
  }

  /** Report one failure at most once per key, so a persistent failure does not flood the log. */
  private warnOnce(key: string, message: string, error?: unknown): void {
    if (this.warned.has(key)) return
    this.warned.add(key)
    this.ports.log?.('warn', message, error)
  }
}

/** Detach a selection into a plain snapshot. */
function snapshotOf(selection: { provider: string; model: string; reasoningEffort?: unknown }): SelectionSnapshot {
  const effort = typeof selection.reasoningEffort === 'string' ? selection.reasoningEffort : undefined
  return {
    provider: selection.provider,
    model: selection.model,
    ...effort === undefined ? {} : { reasoningEffort: effort },
  }
}

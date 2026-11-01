/**
 * The persona service behind the picker.
 *
 * The IAM account is the authority: the role, the followed interest directions,
 * and the first-run prompt answer live on the signed-in user's account, so they
 * follow the person across devices and app surfaces. The account also owns the
 * selectable taxonomy, so a role or direction disabled server-side disappears
 * from the picker without a client release. The Host settings section
 * (`ui-sdkwork-persona`) is kept as the offline cache and as the store for a
 * signed-out local session.
 *
 * Reads prefer the freshest account snapshot, fall back to the cache while the
 * account is unavailable or its read failed, and migrate a cache-only choice
 * upward the first time the account reports no selection. Writes go to the
 * account when it is available and to the cache otherwise; a failed account
 * write is reported to the dialog instead of being reported as saved.
 */

import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DEFAULT_PERSONA_SETTINGS, isPersonaRoleId, PERSONA_ROLE_IDS,
  type PersonaRoleId, type PersonaSettings,
} from '../persona-settings.ts'
import { normalizeInterests, PERSONA_INTEREST_IDS, type PersonaInterestId } from './catalog.ts'

/** The settings-menu projection of the persona state. */
export interface PersonaMenuProfile {
  /** Whether the persona section is served and editable (the row renders only then). */
  available: boolean
  /** Localized label of the chosen role; undefined while unchosen. */
  roleLabel?: string
}

/** The modal open/close actions, bound by the overlay registration. */
export interface PersonaModalActions {
  open: () => void
  close: () => void
}

/** What the service needs from the locale domain to project a menu label. */
export type PersonaRoleLabelResolver = (role: PersonaRoleId) => string

/** The selectable ids the picker may render, narrowed by the account catalog. */
export interface PersonaCatalogSelection {
  /** Selectable role ids, in picker order. */
  roleIds: readonly PersonaRoleId[]
  /** Selectable interest ids, in picker order. */
  interestIds: readonly PersonaInterestId[]
}

/** The picker offers every id this build knows until the account catalog says otherwise. */
const FULL_SELECTION: PersonaCatalogSelection = {
  roleIds: PERSONA_ROLE_IDS,
  interestIds: PERSONA_INTEREST_IDS,
}

/**
 * The account-side persona store (the IAM user profile).
 *
 * Implemented over `ctx.iam`; a signed-out runtime reports
 * {@link PersonaAccountPort.available} as false and never calls the transport.
 */
export interface PersonaAccountPort {
  /** Whether the account store is usable (signed in and configured). */
  available(): boolean
  /** Read the account persona. */
  retrieve(): Promise<PersonaSettings>
  /** Replace the account persona. */
  save(choices: PersonaSettings): Promise<PersonaSettings>
  /** Read the account's selectable role and interest ids. */
  catalog(): Promise<PersonaCatalogSelection>
  /** Observe sign-in and account changes. */
  subscribe(listener: () => void): () => void
}

/**
 * Persona service: account store + local cache + first-run gate + picker dispatch.
 * Construction is side-effect free; {@link start} installs the subscriptions.
 */
export class PersonaService {
  private readonly scope: ConfigForm<PersonaSettings>
  private readonly account: PersonaAccountPort
  private readonly roleLabel: PersonaRoleLabelResolver
  private readonly listeners = new Set<() => void>()
  private modal: PersonaModalActions | undefined
  private openPending = false
  /** Freshest account snapshot; undefined while signed out or before the first read. */
  private accountChoices: PersonaSettings | undefined
  private accountAvailable = false
  private accountSyncFailed = false
  private syncInFlight = false
  /** Invalidates an in-flight read when the account changes underneath it. */
  private syncGeneration = 0
  private selection: PersonaCatalogSelection = FULL_SELECTION
  /** Cached menu projection: the observable contract requires a stable reference. */
  private profile: PersonaMenuProfile = { available: false }

  /**
   * @param scope - the shared form over the `ui-sdkwork-persona` cache section.
   * @param account - the IAM account store.
   * @param roleLabel - localizes a role id for the settings-menu row.
   */
  constructor(
    scope: ConfigForm<PersonaSettings>,
    account: PersonaAccountPort,
    roleLabel: PersonaRoleLabelResolver,
  ) {
    this.scope = scope
    this.account = account
    this.roleLabel = roleLabel
  }

  /**
   * Install the cache and account subscriptions and run the first account sync.
   * @returns the disposer removing both subscriptions.
   */
  start(): () => void {
    const offScope = this.scope.subscribe(() => { this.emit() })
    const offAccount = this.account.subscribe(() => {
      const available = this.account.available()
      if (available === this.accountAvailable) {
        this.emit()
        return
      }
      this.accountAvailable = available
      if (available) {
        void this.syncAccount()
        return
      }
      // Invalidate an in-flight read and fall back to the local cache.
      this.syncGeneration += 1
      this.accountChoices = undefined
      this.accountSyncFailed = false
      this.selection = FULL_SELECTION
      this.emit()
    })
    this.accountAvailable = this.account.available()
    if (this.accountAvailable) void this.syncAccount()
    return () => {
      offScope()
      offAccount()
    }
  }

  /**
   * The current choices: the freshest account snapshot, else the cache, else
   * schema defaults. The reference is stable between changes.
   * @returns the current persona choices.
   */
  currentSettings(): PersonaSettings {
    if (this.accountAvailable && this.accountChoices !== undefined) return this.accountChoices
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status === 'ready' && snapshot.value !== undefined) return snapshot.value
    return DEFAULT_PERSONA_SETTINGS
  }

  /**
   * The ids the picker may render: the account catalog when it resolved, every
   * id this build knows otherwise. The reference is stable between changes.
   * @returns the current selectable ids.
   */
  selectable(): PersonaCatalogSelection {
    return this.selection
  }

  /**
   * Whether a role has been chosen and is still offered by the account catalog:
   * the first-run prompt is no longer owed. A role the catalog dropped counts as
   * unchosen, so disabling a role re-opens onboarding instead of leaving the
   * person on a role the picker no longer renders.
   * @returns whether a selectable role has been chosen.
   */
  isConfigured(): boolean {
    const role = this.currentSettings().role
    return role !== '' && this.selection.roleIds.includes(role)
  }

  /**
   * Whether the picker can persist a choice: the account accepts writes, or
   * the local cache section is served and writable.
   * @returns whether a save would be attempted.
   */
  isWritable(): boolean {
    if (this.account.available()) return true
    const snapshot = this.scope.getSnapshot()
    return snapshot.status === 'ready' && snapshot.writable
  }

  /**
   * Whether the first-run prompt is still owed: something is resolved, no role
   * is chosen, and the person has not dismissed the prompt before.
   * @returns whether the startup gate should open the picker.
   */
  shouldPrompt(): boolean {
    if (!this.isResolved() || !this.isWritable()) return false
    return !this.isConfigured() && !this.currentSettings().promptDismissed
  }

  /**
   * Observe choices, account availability, and catalog changes.
   * @param listener - change listener.
   * @returns the disposer removing the listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * The settings-menu row projection. A fresh object is published only when the
   * availability or the localized role label moves, so the row neither
   * re-renders every read nor keeps a stale label after a locale switch.
   * @returns the current menu projection (stable reference between changes).
   */
  menuProfile(): PersonaMenuProfile {
    const settings = this.currentSettings()
    const available = this.isWritable()
    const roleLabel = isPersonaRoleId(settings.role) && this.isConfigured()
      ? this.roleLabel(settings.role)
      : undefined
    if (this.profile.available !== available || this.profile.roleLabel !== roleLabel) {
      this.profile = roleLabel === undefined ? { available } : { available, roleLabel }
    }
    return this.profile
  }

  /**
   * Open the picker. Called before the overlay binds its actions, the request
   * is replayed by {@link attachModal}; a still-owed account read is retried.
   */
  open(): void {
    if (this.account.available() && this.accountChoices === undefined) void this.syncAccount()
    if (this.modal === undefined) {
      this.openPending = true
      return
    }
    this.modal.open()
  }

  /** Close the picker (the overlay's own dismissal path calls the store). */
  close(): void {
    this.openPending = false
    this.modal?.close()
  }

  /**
   * The picker's dismissal gesture: close it, and while no role is chosen,
   * record that the prompt was answered so later launches stay quiet. The write
   * is fire-and-forget — a failure simply leaves the prompt owed.
   */
  dismiss(): void {
    if (!this.isConfigured()) void this.dismissPrompt()
    this.close()
  }

  /**
   * Adopt the modal actions the overlay registration bound, replaying a
   * request that arrived first.
   * @param actions - the bound open/close actions.
   */
  attachModal(actions: PersonaModalActions): void {
    this.modal = actions
    if (!this.openPending) return
    this.openPending = false
    actions.open()
  }

  /**
   * Store a complete choice: the role and the followed directions in one write,
   * so a reader never sees a role with stale interests.
   *
   * The account write wins when available; a rejected account write is reported
   * so the dialog keeps the draft instead of implying the choice was saved.
   * @param role - the chosen role id.
   * @param interests - the chosen interest ids; unknown ids are dropped.
   * @returns whether the write was accepted.
   */
  async save(role: PersonaRoleId, interests: readonly PersonaInterestId[]): Promise<boolean> {
    const next: PersonaSettings = {
      role,
      interests: normalizeInterests(interests),
      promptDismissed: this.currentSettings().promptDismissed,
    }
    if (this.account.available()) {
      try {
        const stored = await this.account.save(next)
        this.accountChoices = stored
        await this.writeCache(stored)
        this.emit()
        return true
      } catch {
        return false
      }
    }
    return this.writeCache(next)
  }

  /**
   * Record that the person dismissed the prompt without choosing a role, so the
   * startup gate stays quiet on later launches. A failed account write leaves
   * the prompt owed, which is the honest state.
   * @returns whether the write was accepted.
   */
  async dismissPrompt(): Promise<boolean> {
    const current = this.currentSettings()
    if (current.promptDismissed) return true
    const next: PersonaSettings = { ...current, promptDismissed: true }
    if (this.account.available()) {
      try {
        const stored = await this.account.save(next)
        this.accountChoices = stored
        await this.writeCache(stored)
        this.emit()
        return true
      } catch {
        return false
      }
    }
    return this.writeCache(next)
  }

  /**
   * Whether a source that can answer the first-run question has resolved. A
   * failed account read falls back to the cache, so an offline start still
   * prompts instead of staying silent forever.
   * @returns whether the account or the cache is ready.
   */
  private isResolved(): boolean {
    if (this.account.available() && !this.accountSyncFailed) {
      return this.accountChoices !== undefined
    }
    const snapshot = this.scope.getSnapshot()
    return snapshot.status === 'ready'
  }

  /**
   * Read the account persona and catalog and reconcile them with the cache.
   *
   * A cache-only choice made while signed out (or before this build stored the
   * persona on the account) is uploaded once, because the account reporting no
   * role while the cache holds one is exactly the migration case. A failed read
   * keeps the cache authoritative and is retried when the picker opens or the
   * account changes.
   */
  private async syncAccount(): Promise<void> {
    if (this.syncInFlight || !this.account.available()) return
    const generation = ++this.syncGeneration
    this.syncInFlight = true
    const [personaResult, catalogResult] = await Promise.allSettled([
      this.account.retrieve(),
      this.account.catalog(),
    ])
    if (generation !== this.syncGeneration || !this.account.available()) {
      this.syncInFlight = false
      return
    }
    if (catalogResult.status === 'fulfilled') this.applySelection(catalogResult.value)
    if (personaResult.status === 'rejected') {
      this.accountSyncFailed = true
      this.syncInFlight = false
      this.emit()
      return
    }
    try {
      const remote = personaResult.value
      const cache = this.readCache()
      // Migrate a cached role only when the catalog still offers it (uploading a
      // rejected role would only loop on 422), and migrate a cached dismissal
      // even without a role, so a signed-out "later" survives the first sign-in.
      const cacheRoleAllowed = cache.role !== '' && this.selection.roleIds.includes(cache.role)
      const cacheAnswered = cache.promptDismissed && !remote.promptDismissed
      const migrate = remote.role === '' && (cacheRoleAllowed || cacheAnswered)
      const migration: PersonaSettings = cacheRoleAllowed
        ? { ...cache, promptDismissed: remote.promptDismissed || cache.promptDismissed }
        : { ...DEFAULT_PERSONA_SETTINGS, promptDismissed: true }
      const reconciled = migrate ? await this.account.save(migration) : remote
      if (generation !== this.syncGeneration || !this.account.available()) {
        this.syncInFlight = false
        return
      }
      this.accountChoices = reconciled
      this.accountSyncFailed = false
      await this.writeCache(reconciled)
    } catch {
      this.accountSyncFailed = true
    } finally {
      this.syncInFlight = false
      this.emit()
    }
  }

  /**
   * Narrow the selectable ids onto the account catalog, keeping this build's
   * order. An empty or unreadable catalog keeps the full local list so a
   * taxonomy outage never blanks the picker.
   * @param catalog - the account catalog.
   */
  private applySelection(catalog: PersonaCatalogSelection): void {
    const roleIds = PERSONA_ROLE_IDS.filter(id => catalog.roleIds.includes(id))
    const interestIds = PERSONA_INTEREST_IDS.filter(id => catalog.interestIds.includes(id))
    if (roleIds.length === 0 || interestIds.length === 0) {
      this.selection = FULL_SELECTION
      return
    }
    if (
      roleIds.length === this.selection.roleIds.length
      && interestIds.length === this.selection.interestIds.length
      && roleIds.every((id, index) => id === this.selection.roleIds[index])
      && interestIds.every((id, index) => id === this.selection.interestIds[index])
    ) {
      return
    }
    this.selection = { roleIds, interestIds }
  }

  /** The cache snapshot, falling back to schema defaults. */
  private readCache(): PersonaSettings {
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status === 'ready' && snapshot.value !== undefined) return snapshot.value
    return DEFAULT_PERSONA_SETTINGS
  }

  /** Mirror a choice into the local cache. */
  private async writeCache(choices: PersonaSettings): Promise<boolean> {
    const accepted = await this.scope.mutate([
      { op: 'set', path: ['role'], value: choices.role },
      { op: 'set', path: ['interests'], value: choices.interests },
      { op: 'set', path: ['promptDismissed'], value: choices.promptDismissed },
    ])
    if (accepted) this.emit()
    return accepted
  }

  /** Publish a change to subscribers and the menu projection. */
  private emit(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

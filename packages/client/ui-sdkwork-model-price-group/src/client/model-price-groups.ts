/**
 * User-level model → account-group ("price group") adapter.
 *
 * The browser half owns one {@link ModelPriceGroupService}: it reads the groups
 * that can serve the selected relay model and the signed-in user's stored
 * per-model rule from the SDKWork CloudRouter app-api, and writes the rule back
 * through the same generated SDK. Everything the model menu renders is a
 * projection of the service's snapshot store, so the root summary and the
 * detail pane always agree.
 *
 * The app-api is the user-scoped surface: reads resolve the caller's tenant,
 * organization, and user from the IAM session, and a write upserts the ordered
 * group list for one `model` scope. The database stores that scope as
 * one-to-many (`ai_user_account_group_route`, ordered by `priority`), so this
 * picker's single choice is the list's head and a saved failover list set
 * elsewhere survives until this picker replaces it.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-model-price-group/model-price-groups
 */

import type {
  AppRoutingModelGroupDefault,
  AppRoutingModelGroupOption,
} from '@sdkwork/cloudrouter-app-sdk'
import { createClient } from '@sdkwork/cloudrouter-app-sdk'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'

/** Provider route whose models carry account-group (price-group) pools. */
export const BIRDCODER_PROVIDER = 'birdcoder'

/** Registration key shared by the root row and the detail pane. */
export const PANE_KEY = 'model-price-group'

/** One selectable account group for a model. */
export interface PriceGroupOption {
  /** Stable account-group code the app-api accepts on write. */
  readonly code: string
  /** Operator-authored group name. */
  readonly name: string
  /** Whether the account level declares this group as its default. */
  readonly isDefault: boolean
  /** Whether this group is the caller's effective default for the model. */
  readonly selected: boolean
}

/**
 * What the picker shows for one model. Fields are mutable because the declared
 * store mutates an immer draft; readers treat the snapshot as immutable.
 */
export interface PriceGroupState {
  /** Load lifecycle of the current model's groups. */
  status: 'idle' | 'loading' | 'ready' | 'failed'
  /** Model id the state describes; null before the first load. */
  model: string | null
  /** Groups that can serve the model, in the app-api's order. */
  groups: PriceGroupOption[]
  /** The user's explicit rule for the model; null means "follow the account default". */
  pinned: string | null
  /** Whether a write is in flight. */
  saving: boolean
  /** Failure text from the last read or write, when one failed. */
  error: string | null
}

/** Minimal environment face the adapter reads at call time. */
export interface PriceGroupEnvironment {
  /** @returns the active SDKWork gateway origin. */
  apiBaseUrl(): string
  /** @returns the deployment's static access token, if any. */
  accessToken(): string
}

/** Minimal IAM face the adapter mirrors into the shared token manager. */
export interface PriceGroupIam {
  controller: {
    getState(): {
      /** Current session; the adapter only reads its credential fields. */
      session: { authToken?: string; accessToken?: string; refreshToken?: string } | null
    }
  }
}

/** The app-api operations the picker needs, separated for tests. */
export interface PriceGroupApi {
  /** @returns the account groups that can serve the model. */
  listGroups(model: string): Promise<readonly AppRoutingModelGroupOption[]>
  /** @returns every stored rule of the signed-in user. */
  listDefaults(): Promise<readonly AppRoutingModelGroupDefault[]>
  /** Replace the model scope's ordered group list; an empty list clears it. */
  saveDefault(input: { model: string; vendorCode: string; accountGroups: readonly string[] }): Promise<void>
}

/** Options for {@link ModelPriceGroupService}. */
export interface ModelPriceGroupServiceOptions {
  env: PriceGroupEnvironment
  iam: PriceGroupIam
  /** Transport factory; defaults to the generated CloudRouter app client. */
  createApi?: (env: PriceGroupEnvironment, iam: PriceGroupIam) => PriceGroupApi
}

const IDLE: PriceGroupState = {
  status: 'idle',
  model: null,
  groups: [],
  pinned: null,
  saving: false,
  error: null,
}

/**
 * The vendor segment of a relay catalog key (`<vendor>/<modelId>`).
 * @param model - relay model id as the harness catalog spells it.
 * @returns the vendor code, or an empty string when the id has no vendor prefix.
 */
export function vendorCodeOf(model: string): string {
  const separator = model.indexOf('/')
  return separator <= 0 ? '' : model.slice(0, separator)
}

/**
 * Build the generated CloudRouter app client from the shared runtime services.
 *
 * The gateway origin is the SDK's base URL; the generated client prepends its
 * own `/app/v3/api` prefix to every operation path. The shared browser token
 * manager carries the IAM session's auth and access tokens into every request,
 * exactly as the relay api-key and deploy plugins do.
 * @param env - active environment service.
 * @param iam - IAM service holding the current session.
 * @returns the app-api operations the picker needs.
 * @throws when the deployment names no gateway origin.
 */
export function createCloudRouterPriceGroupApi(
  env: PriceGroupEnvironment,
  iam: PriceGroupIam,
): PriceGroupApi {
  const origin = env.apiBaseUrl().trim().replace(/\/+$/u, '')
  if (origin === '') throw new Error('the SDKWork gateway origin is not configured')
  syncSdkworkGlobalTokenManager(iam.controller.getState().session, env.accessToken())
  const client = createClient({
    baseUrl: origin,
    platform: 'pc',
    tokenManager: getSdkworkGlobalTokenManager(),
  })
  return {
    async listGroups(model) {
      const item = await client.ai.routing.modelGroups.retrieve({ model })
      return item.groups ?? []
    },
    async listDefaults() {
      const item = await client.ai.routing.modelGroupDefaults.retrieve()
      return item.defaults ?? []
    },
    async saveDefault({ model, vendorCode, accountGroups }) {
      await client.ai.routing.modelGroupDefaults.update({
        scope: 'model',
        model,
        ...(vendorCode === '' ? {} : { vendorCode }),
        accountGroups: [...accountGroups],
      })
    },
  }
}

/**
 * Explicit model-scope rule at the list's head: the app-api orders rules by
 * priority, so the first row is the group requests try first.
 * @param defaults - every stored rule of the user.
 * @param model - model id to match.
 * @returns the pinned group code, or null when the model inherits.
 */
export function pinnedGroupOf(
  defaults: readonly AppRoutingModelGroupDefault[],
  model: string,
): string | null {
  const rule = defaults.find(entry => entry.scope === 'model' && entry.model === model)
  return rule === undefined || rule.accountGroupCode === '' ? null : rule.accountGroupCode
}

/**
 * One user's model price-group state, shared by the menu summary and its pane.
 */
export class ModelPriceGroupService {
  /** Observable state consumed by the model-menu contributions. */
  readonly state: SnapshotStore<PriceGroupState> = createSnapshotStore<PriceGroupState>(IDLE)

  readonly #options: ModelPriceGroupServiceOptions
  /** Highest started load; results of older loads are dropped. */
  #generation = 0
  /** Model whose load is in flight, when one is. */
  #loading: string | undefined
  #disposed = false

  /** @param options - runtime services and an optional transport override. */
  constructor(options: ModelPriceGroupServiceOptions) {
    this.#options = options
  }

  /** Whether the service has released its state and refuses further work. */
  get disposed(): boolean {
    return this.#disposed
  }

  /** Release the service; late network results are ignored. */
  dispose(): void {
    this.#disposed = true
    this.#generation += 1
  }

  /**
   * Load one model's groups unless they are already current.
   * Concurrent requests for the same model share the in-flight attempt; a
   * different model supersedes it (its result is dropped).
   * @param model - relay model id.
   * @returns the settled state, or undefined when the service is disposed.
   */
  async ensure(model: string): Promise<PriceGroupState | undefined> {
    if (this.#disposed) return undefined
    const current = this.state.getSnapshot()
    if (current.model === model && current.status === 'ready') return current
    if (this.#loading === model) return current.model === model ? current : undefined
    return this.#load(model)
  }

  /** Re-read the current model after a write or a user retry. */
  async refresh(model: string): Promise<PriceGroupState | undefined> {
    if (this.#disposed) return undefined
    return this.#load(model)
  }

  /**
   * Replace the user's rule for one model.
   *
   * A group code pins that group; null clears the rule so the model follows the
   * account-level default again. The whole scope list is replaced, which is the
   * app-api's documented write shape.
   * @param model - relay model id.
   * @param groupCode - group code to pin, or null to inherit.
   * @throws when the app-api rejects the write or the service is disposed.
   */
  async select(model: string, groupCode: string | null): Promise<void> {
    if (this.#disposed) throw new Error('the model price-group service is disposed')
    const api = this.#api()
    this.state.update((state) => {
      state.saving = true
      state.error = null
    })
    try {
      await api.saveDefault({
        model,
        vendorCode: vendorCodeOf(model),
        accountGroups: groupCode === null ? [] : [groupCode],
      })
    } catch (error) {
      const message = messageOf(error)
      this.state.update((state) => {
        state.error = message
      })
      throw error
    } finally {
      if (!this.#disposed) {
        this.state.update((state) => {
          state.saving = false
        })
      }
    }
    if (this.#disposed) return
    await this.#load(model)
  }

  #api(): PriceGroupApi {
    return (this.#options.createApi ?? createCloudRouterPriceGroupApi)(this.#options.env, this.#options.iam)
  }

  async #load(model: string): Promise<PriceGroupState | undefined> {
    if (this.#disposed) return undefined
    const generation = ++this.#generation
    this.#loading = model
    this.state.update((state) => {
      state.status = 'loading'
      state.model = model
      state.error = null
    })
    try {
      const api = this.#api()
      const [groups, defaults] = await Promise.all([api.listGroups(model), api.listDefaults()])
      if (this.#disposed || generation !== this.#generation) return this.state.getSnapshot()
      const options = groups.map(toOption)
      this.state.update((state) => {
        state.status = 'ready'
        state.model = model
        state.groups = options
        state.pinned = pinnedGroupOf(defaults, model)
      })
      return this.state.getSnapshot()
    } catch (error) {
      if (this.#disposed || generation !== this.#generation) return this.state.getSnapshot()
      this.state.update((state) => {
        state.status = 'failed'
        state.model = model
        state.groups = []
        state.pinned = null
        state.error = messageOf(error)
      })
      return this.state.getSnapshot()
    } finally {
      if (this.#loading === model) this.#loading = undefined
    }
  }
}

function toOption(group: AppRoutingModelGroupOption): PriceGroupOption {
  return {
    code: group.groupCode,
    name: group.groupName === '' ? group.groupCode : group.groupName,
    isDefault: group.isDefault,
    selected: group.selected,
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

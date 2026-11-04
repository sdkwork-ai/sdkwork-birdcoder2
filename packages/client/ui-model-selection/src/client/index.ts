/**
 * Model selection plugin, browser half — TWO entries over ONE per-session
 * directory owned by ModelDirectoryResolver (`ctx.modelDirectories`). The /model popupSelect
 * contribution and the composer's named `conversation.input.model` seat share
 * one Host-generation `session/modelCatalog` catalog, combine it with the Session's
 * durable model-selection projection, and submit through `session.selectModel`.
 * A switch made in either entry is what the other shows next. Failures
 * ride each entry's own retry surface (popup shell error/retry; seat menu
 * inline error) without forking the state. Addressed subagent sessions expose
 * neither entry because those Agent-bound RPCs would activate persisted
 * history outside the direct-parent continuation path.
 */
// Type-only: the carrier types, the forwarded Host-event face and the ctx.remote merge.
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { CommandUiContract, SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.model seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the SDKWork IAM service face (`ctx.iam`) into this program.
// Model selection needs it only to ask for a session when the Host advertises a
// provider's models as a sign-in preview.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { IconDataOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelDirectory, ModelDirectoryState } from './directory.ts'
import { ModelDirectoryResolver } from './service.ts'
import type { ModelSelectInjected } from './slots.ts'
import { requiresSignIn, waitForSignedInModel } from './sign-in.ts'
import { ModelSelect } from './ModelSelect.tsx'
import { en, ja, es, fr, de, ru, pt, zh, type ModelKey } from './locales.ts'
import { orderModelProviders } from './provider-order.ts'

export { ModelDirectory } from './directory.ts'
export type { ModelDirectoryState } from './directory.ts'
export { ModelDirectoryResolver } from './service.ts'
export type { ModelLabelOwner, ModelSelectInjected } from './slots.ts'
export type { ModelKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The model selection surfaces' copy (/model popup + composer seat). */
    model: ModelKey
  }
}

/** One selectable row's id: an opaque row key (resolved by lookup, never parsed). */
function rowId(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`
}

/**
 * Flatten the directory into popup rows; failure rows are listed for visibility but never selectable.
 * @param directory - the session's directory snapshot.
 * @param t - bound `model` dictionary.
 * @param signInAvailable - whether the product mounts a sign-in surface for preview rows.
 */
function optionsOf(directory: ModelDirectoryState, t: TranslateNS<'model'>, signInAvailable: boolean): SelectOption[] {
  const rows: SelectOption[] = []
  for (const group of orderModelProviders(directory.groups)) {
    const name = group.id === 'deepseek-account' ? t('provider.account') : group.name
    for (const model of group.models) {
      rows.push({
        id: rowId(group.id, model.id),
        label: model.name,
        group: { name: group.id, label: name },
        ...signInAvailable && group.requiresSignIn === true ? { detail: t('option.signInRequired') } : {},
        ...(directory.current !== null
          && directory.current.provider === group.id
          && directory.current.model === model.id
          ? { active: true } : {}),
      })
    }
  }
  for (const failure of directory.failures) {
    rows.push({
      id: `failure/${failure.id}`,
      label: failure.id === 'deepseek-account' ? t('provider.account') : failure.name,
      detail: t('option.loadError', { message: failure.message }),
    })
  }
  return rows
}

/**
 * Resolve a picked row back to its model selection by matching against the loaded
 * groups (the same data the rows were built from — ids stay opaque).
 * @param state - the session's directory snapshot.
 * @param id - the picked row id.
 * @returns the row's model selection, or undefined for failure rows / stale ids.
 */
function selectionOf(state: ModelDirectoryState, id: string): ModelSelection | undefined {
  for (const group of state.groups) {
    for (const model of group.models) {
      if (rowId(group.id, model.id) !== id) continue
      const sameRoute = state.current?.provider === group.id && state.current.model === model.id
      const reasoningEffort = sameRoute
        ? state.current?.reasoningEffort ?? model.reasoning?.defaultEffort
        : model.reasoning?.defaultEffort
      return {
        provider: group.id,
        model: model.id,
        ...reasoningEffort === undefined ? {} : { reasoningEffort },
      }
    }
  }
  return undefined
}

/** Dictionary namespace owned by this plugin. */
const NS = 'model'

/** Required services: the contribution registry, the seat's slot registry, locale, and the service's own faces. */
export const inject = ['commandUi', 'locale', 'sessions', 'slots', 'remote', 'remote.session']

/**
 * Client plugin body: mount ModelDirectoryResolver, register the `model` dictionaries,
 * then register the /model popup contribution and the composer model seat
 * over the service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-model-selection: dictionaries')

  // Non-slot faces (the command description, the popup option builder) read
  // through the bound translate; the seat component reads the standard seat.
  const t = ctx.locale.bind(NS)

  ctx.plugin(ModelDirectoryResolver)

  /**
   * Demand a session when the Host advertises the picked model as a sign-in
   * preview, then wait for the credential the sign-in installs to reach the
   * shared catalog. Compositions without the IAM service keep the Host's own
   * refusal for the selection.
   * @param directory - the session's shared directory.
   * @param selection - the model the user picked.
   */
  const signInForSelection = async (directory: ModelDirectory, selection: ModelSelection): Promise<void> => {
    if (!requiresSignIn(directory.store.getSnapshot(), selection)) return
    const iam = ctx.get('iam')
    if (iam === undefined) return
    const signedIn = await iam.requestSignIn()
    // A welcome page can end with a stored credential instead of a session, so
    // a declined login still gets a short window for the route to appear.
    const ready = await waitForSignedInModel(directory, selection, signedIn ? {} : { timeoutMs: 3_000 })
    if (!ready) throw new Error(t(signedIn ? 'error.signInUnavailable' : 'error.signInCancelled'))
  }

  // Entry 1: the /model popupSelect over the shared directory.
  ctx.inject(['commandUi', 'modelDirectories'], (scope: ClientContext) => {
    const command = scope.get('commandUi') as CommandUiContract
    const models = scope.modelDirectories
    const sessions = scope.sessions
    scope.effect(() => command.register({
      name: 'model',
      label: () => t('command.label'),
      description: () => t('command.description'),
      icon: IconDataOutlineRegular,
      available: session => sessions.subagentAddress(session.sessionId) === undefined,
      ui: {
        kind: 'popupSelect',
        searchMode: 'fuzzy-label',
        searchLabels: () => ({
          placeholder: t('search.placeholder'),
          empty: t('empty.models'),
          noResults: t('search.empty'),
        }),
        options: async (session) => {
          if (sessions.subagentAddress(session.sessionId) !== undefined) {
            throw new Error('model selection is unavailable for addressed subagent sessions')
          }
          return optionsOf(await models.directoryFor(session.sessionId).load(), t, ctx.get('iam') !== undefined)
        },
        onSelect: async (option, session) => {
          if (sessions.subagentAddress(session.sessionId) !== undefined) {
            throw new Error('model selection is unavailable for addressed subagent sessions')
          }
          const directory = models.directoryFor(session.sessionId)
          const selection = selectionOf(directory.store.getSnapshot(), option.id)
          if (selection === undefined) {
            throw new Error('this provider\'s catalog failed to load — pick a model from a loaded group')
          }
          await signInForSelection(directory, selection)
          const result = await directory.select(selection)
          if (!result.ok) {
            if (result.error.code === 'session/writer-held') throw new Error(t('error.sessionInUse'))
            throw result.error
          }
        },
      },
    }), 'ui-model-selection: /model contribution')
  })

  // Entry 2: the composer's named model seat over the SAME directory.
  ctx.inject(['slots', 'modelDirectories'], (scope: ClientContext) => {
    const models = scope.modelDirectories
    const sessions = scope.sessions
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model',
      locale: NS,
      children: {
        'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true },
        'conversation.input.model.options': { kind: 'list', scope: 'session' },
      },
      inject: (sessionId): ModelSelectInjected => {
        const directory = models.directoryFor(sessionId)
        const available = sessions.subagentAddress(sessionId) === undefined
        const iam = ctx.get('iam')
        return {
          available,
          directory: directory.store,
          load: () => {
            if (available) directory.load().catch(() => { /* surfaced on the store */ })
          },
          resolveText: text => ctx.locale.resolveText(text),
          select: (selection: ModelSelection) => available
            ? directory.select(selection)
            : Promise.resolve(undefined),
          ...iam === undefined ? {} : {
            requestSignIn: () => iam.requestSignIn(),
            waitForSignedInModel: (selection: ModelSelection, timeoutMs?: number) => available
              ? waitForSignedInModel(directory, selection, timeoutMs === undefined ? {} : { timeoutMs })
              : Promise.resolve(false),
          },
        }
      },
    }, ModelSelect))
  })
}

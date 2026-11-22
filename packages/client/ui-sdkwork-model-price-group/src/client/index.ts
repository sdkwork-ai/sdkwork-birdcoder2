/**
 * Model price-group plugin, browser half: one summary row in the composer's
 * model menu and its detail pane. Both read the Session's shared model
 * selection projection and only appear for the BirdCoder relay provider, where
 * the CloudRouter app-api can answer which account groups serve the model.
 *
 * The plugin owns no Host state: the generated CloudRouter app client talks to
 * the app-api from the browser with the shared IAM credential transport, so a
 * selection is persisted on the user's account and survives restarts.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-model-price-group
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { ModelPriceGroupPane } from './ModelPriceGroupPane.tsx'
import { ModelPriceGroupRow } from './ModelPriceGroupRow.tsx'
import { ModelPriceGroupService } from './model-price-groups.ts'
import type { ModelPriceGroupInjected } from './face.ts'
import { en, NS, zh } from './locales.ts'
import type { PriceGroupKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Model price-group picker copy. */
    'model-price-group': PriceGroupKey
  }
}

/** Required services for the locale, the app-api adapter, and the menu slots. */
export const inject = ['slots', 'locale', 'env', 'iam']

/**
 * Register the dictionaries, the app-api adapter, and the model-menu
 * contributions.
 * @param ctx - Client Context carrying the declared services.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-model-price-group: dictionaries')

  const service = new ModelPriceGroupService({
    env: ctx.get('env'),
    iam: ctx.get('iam'),
  })
  ctx.effect(() => () => { service.dispose() }, 'ui-sdkwork-model-price-group: app-api adapter')

  // One stable face: the components' load/select identities are effect
  // dependencies, so a per-render object would restart the read on every
  // re-render (and loop while the read is failing).
  const face: ModelPriceGroupInjected = {
    hooks: { priceGroup: service.state },
    load: (model) => { void service.ensure(model) },
    select: async ({ model, groupCode }) => {
      try {
        await service.select(model, groupCode)
        return null
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
  }

  ctx.slots.inject('conversation.input.model.afterModel', () => ctx.slots.register({
    name: 'conversation.input.model.afterModel',
    id: 'model-price-group',
    locale: NS,
    inject: () => face,
  }, ModelPriceGroupRow))

  ctx.slots.inject('conversation.input.model.pane', () => ctx.slots.register({
    name: 'conversation.input.model.pane',
    key: 'model-price-group',
    locale: NS,
    inject: () => face,
  }, ModelPriceGroupPane))
}

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-iam/client'
import { TokenPlanRailEntry, type TokenPlanRailEntryInjected } from './RailEntry.tsx'
import { TokenPlanPage, type TokenPlanPageInjected } from './TokenPlanPage.tsx'
import { en, zh, type TokenPlanKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { tokenPlan: TokenPlanKey } }
const NS = 'tokenPlan'
export const inject = ['slots', 'locale']
export type { TokenPlanKey, TokenPlanPageInjected, TokenPlanRailEntryInjected }

/** Register Token Plan navigation, page, and commerce host dependencies. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-token-plan: dictionaries')
  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({ name: 'mode.rail.entry', key: 'token-plan', locale: NS, inject: (): TokenPlanRailEntryInjected => ({ mode: 'token-plan' }) }, TokenPlanRailEntry))
  ctx.slots.inject('mode.page', () => ctx.slots.register({ name: 'mode.page', key: 'token-plan', locale: NS, inject: (): TokenPlanPageInjected => ({ mode: 'token-plan', env: ctx.get('env'), iam: ctx.get('iam') }) }, TokenPlanPage))
}

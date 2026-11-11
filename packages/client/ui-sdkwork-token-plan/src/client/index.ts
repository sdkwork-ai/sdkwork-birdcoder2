import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { TokenPlanRailEntry, type TokenPlanRailEntryInjected } from './RailEntry.tsx'
import { TokenPlanPage, type TokenPlanPageInjected, type TokenPlanTheme } from './TokenPlanPage.tsx'
import type { EnvServiceLike } from './token-plan-service.ts'
import type { IamServiceLike } from './token-plan-service.ts'
import { TokenPlanService } from './token-plan-service.ts'
import { SettingsMenuPlanCard, type SettingsMenuPlanInjected } from './SettingsMenuPlanCard.tsx'
import { SettingsPointsSection, type SettingsPointsSectionInjected } from './SettingsPointsSection.tsx'
import { en, zh, type TokenPlanKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { tokenPlan: TokenPlanKey } }
const NS = 'tokenPlan'
export const inject = ['slots', 'locale', 'env', 'iam', 'theme', 'layout']
export type { TokenPlanKey, TokenPlanPageInjected, TokenPlanRailEntryInjected, TokenPlanTheme }

/** Register Token Plan navigation, page, and commerce host dependencies. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-token-plan: dictionaries')
  const themeRuntime = ctx.get('theme') as ThemeRuntime
  const theme: TokenPlanTheme = {
    getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
    subscribe: listener => ctx.on('theme/change', listener),
  }
  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'token-plan',
    locale: NS,
    inject: (): TokenPlanRailEntryInjected => ({ mode: 'token-plan' }),
  }, TokenPlanRailEntry))
  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'token-plan',
    locale: NS,
    inject: (): TokenPlanPageInjected => ({
      mode: 'token-plan',
      env: ctx.get('env') as EnvServiceLike,
      iam: ctx.get('iam') as IamServiceLike,
      theme,
    }),
  }, TokenPlanPage))

  // The settings-menu wallet card is the same commerce account shown on the
  // Token Plan page. One service instance serves the card across menu opens;
  // the settings shell owns placement and passes its close gesture.
  const t = ctx.locale.bind(NS)
  const walletEnv = ctx.get('env') as EnvServiceLike
  const walletIam = ctx.get('iam') as IamServiceLike
  const walletService = new TokenPlanService(
    walletEnv,
    walletIam,
    () => t('commerce.signInRequired'),
  )
  const layout = ctx.get('layout') as { setMode: (mode: 'token-plan') => void }
  const openTokenPlan = (): void => { layout.setMode('token-plan') }
  ctx.slots.inject('settings.menu.plan', () => ctx.slots.register({
    name: 'settings.menu.plan',
    locale: NS,
    inject: (): SettingsMenuPlanInjected => ({
      signedIn: () => walletIam.controller.getState().session !== null,
      readSummary: () => walletService.readAccountSummary(),
      openTokenPlan,
    }),
  }, SettingsMenuPlanCard))

  // The settings center page shows the full plan/points picture the popover
  // card summarizes. It shares the same service and the same upgrade route.
  const signedInSource = {
    getSnapshot: (): boolean => walletIam.controller.getState().session !== null,
    subscribe: (listener: () => void): (() => void) => walletIam.controller.subscribe(listener),
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'points',
    order: -5,
    label: () => t('settings.nav'),
    locale: NS,
    inject: (): SettingsPointsSectionInjected => ({
      readPoints: () => walletService.readPointsSnapshot(),
      openTokenPlan,
      signIn: () => { walletIam.openSignIn() },
      hooks: { signedIn: signedInSource },
    }),
  }, SettingsPointsSection))
}

/**
 * SDKWork 个人主页 plugin, browser half: registers the `个人主页` settings
 * section (id `profile`) directly below General. The section presents the
 * signed-in account as a personal page — the personal account and the
 * enterprise organization it belongs to — and hosts the second sign-out entry
 * point beside the settings popover's footer row.
 *
 * The account facts come from the `iam` service's profile snapshot; the section
 * never touches an auth runtime itself, so a composition without
 * `ui-sdkwork-iam` simply does not mount this plugin.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the client runtime Context (ctx.slots) into this program.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the `ctx.iam` service declaration (`IamService`).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { IamProfileSnapshot, IamService } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { ProfileSection, type ProfileSectionInjected } from './ProfileSection.tsx'
import { en, zh, type ProfileKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The 个人主页 section's copy. */
    'settings.profile': ProfileKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.profile'

/**
 * Required services (cordis fiber inject). `iam` is provided by
 * `ui-sdkwork-iam`: the profile page is an account surface, so it waits for
 * the account service instead of rendering a page without one.
 */
export const inject = ['slots', 'locale', 'iam']

/**
 * Register the profile dictionaries and the `个人主页` settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-profile: dictionaries')

  const iam = ctx.get('iam') as IamService
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'profile',
    // Directly below General (-200) and above every feature page: the account
    // page answers "who am I signed in as" before the pages that configure
    // what that account can do.
    order: -190,
    label: () => t('nav'),
    locale: NS,
    inject: (): ProfileSectionInjected => ({
      requestSignOut: () => { iam.requestSignOut() },
      signIn: () => { iam.openSignIn() },
      openExternal: (url: string) => { iam.openExternalUrl(url) },
      hooks: {
        profile: {
          getSnapshot: (): IamProfileSnapshot => iam.profileSnapshot(),
          subscribe: listener => iam.subscribe(listener),
        },
      },
    }),
  }, ProfileSection))
}

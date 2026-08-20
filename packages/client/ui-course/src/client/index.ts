/**
 * Course mode plugin, browser half: registers its rail entry into the keyed
 * `mode.rail.entry` seat (declared by ui-app-modes' rail shell) and its
 * SDKWork-backed page into the keyed `mode.page` seat (declared by
 * ui-layout's frame), both keyed by the `course` mode id. The host adapter is
 * configured from the shared environment, IAM, locale, and theme services before the
 * page can mount.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { injectAuthenticatedModePage } from '@deepseek-ai/dsh-client-ui-iam/client'
import type {
  CourseHostAdapter,
  CourseHostIam,
  CourseHostTheme,
} from './courseHost.ts'
import { configureCourseHost } from './courseHost.ts'
import { CourseRailEntry, type CourseRailEntryInjected } from './RailEntry.tsx'
import { CoursePage, type CoursePageInjected } from './CoursePage.tsx'
import { en, zh, type CourseKey } from './locales.ts'

export type {
  CoursePageInjected, CoursePageProps,
} from './CoursePage.tsx'
export type {
  CourseRailEntryInjected, CourseRailEntryProps,
} from './RailEntry.tsx'
export type { CourseKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Course mode's copy (rail entry + page). */
    course: CourseKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'course'

/** Services required by the Course mode plugin. */
export const inject = ['slots', 'locale', 'env', 'iam', 'theme']

/**
 * Configure the SDKWork host adapter through an injectable test seam.
 * @param env - active BirdCoder deployment environment service.
 * @param iam - active BirdCoder IAM session provider.
 * @param locale - BirdCoder locale runtime.
 * @param theme - BirdCoder theme runtime bridge.
 * @returns Configured SDKWork host adapter and its disposer.
 */
export function createCourseAdapter(
  env: EnvService,
  iam: CourseHostIam,
  locale: LocaleRuntime,
  theme: CourseHostTheme,
): CourseHostAdapter {
  return configureCourseHost({ env, iam, locale, theme })
}

/**
 * Register the Course host adapter, rail entry, and page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-course: dictionaries')
  const themeRuntime = ctx.get('theme') as ThemeRuntime
  const theme: CourseHostTheme = {
    getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
    subscribe: listener => ctx.on('theme/change', listener),
  }
  const adapter = createCourseAdapter(
    ctx.get('env') as EnvService,
    ctx.get('iam') as CourseHostIam,
    ctx.locale,
    theme,
  )
  ctx.effect(() => () => { adapter.dispose() }, 'ui-course: SDKWork host adapter')

  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'course',
    locale: NS,
    inject: (): CourseRailEntryInjected => ({ mode: 'course' }),
  }, CourseRailEntry))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'course',
    locale: NS,
    inject: (): CoursePageInjected => injectAuthenticatedModePage(ctx, 'course'),
  }, CoursePage))
}

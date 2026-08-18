/**
 * Video generation mode plugin, browser half: registers its rail entry into
 * the keyed `mode.rail.entry` seat (declared by ui-app-modes' rail shell)
 * and its SDKWork Agents-backed page into the keyed `mode.page` seat
 * (declared by ui-layout's frame), both keyed by the `video` mode id. The
 * generation adapter is configured from the shared environment and IAM
 * services before the page can submit requests.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the rail-entry slot contract (ui-app-modes' declaration) and
// the AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.locale (locale Context merge) into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.env and ctx.iam into this program.
import type {} from '@deepseek-ai/dsh-client-ui-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-iam/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'
import { VideoGenerationsPage, type VideoGenerationsPageInjected } from './GenerationsPage.tsx'
import { VideoGenerationsRailEntry, type VideoGenerationsRailEntryInjected } from './RailEntry.tsx'
import {
  VideoGenerationsService,
  type GenerationIamService,
} from './generations-service.ts'
import { en, zh, type VideoGenerationsKey } from './locales.ts'

export type {
  VideoGenerationsPageInjected, VideoGenerationsPageProps,
} from './GenerationsPage.tsx'
export type {
  VideoGenerationsRailEntryInjected, VideoGenerationsRailEntryProps,
} from './RailEntry.tsx'
export type {
  VideoGenerationResult,
  VideoGenerationSnapshot,
  GenerationIamService,
} from './generations-service.ts'
export type { VideoGenerationsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The video generation mode's copy (rail entry + page). */
    generationsVideo: VideoGenerationsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'generationsVideo'

/** Services required by the video generation mode plugin. */
export const inject = ['slots', 'locale', 'env', 'iam']

/**
 * Register the video generation adapter, rail entry, and page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-generations-video: dictionaries')

  const service = new VideoGenerationsService(
    ctx.get('env') as EnvService,
    ctx.get('iam') as GenerationIamService,
  )
  ctx.effect(() => service.start(), 'ui-generations-video: environment and IAM synchronization')

  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'video',
    locale: NS,
    inject: (): VideoGenerationsRailEntryInjected => ({ mode: 'video' }),
  }, VideoGenerationsRailEntry))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'video',
    locale: NS,
    inject: (): VideoGenerationsPageInjected => ({
      mode: 'video',
      generate: (prompt) => { void service.generate(prompt) },
      hooks: {
        generation: {
          getSnapshot: () => service.getSnapshot(),
          subscribe: listener => service.subscribe(listener),
        },
      },
    }),
  }, VideoGenerationsPage))
}

/**
 * Image generation mode plugin, browser half: registers its rail entry into
 * the keyed `mode.rail.entry` seat (declared by ui-app-modes' rail shell)
 * and its SDKWork Agents-backed page into the keyed `mode.page` seat
 * (declared by ui-layout's frame), both keyed by the `image` mode id. The
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
import { ImageGenerationsPage, type ImageGenerationsPageInjected } from './GenerationsPage.tsx'
import { ImageGenerationsRailEntry, type ImageGenerationsRailEntryInjected } from './RailEntry.tsx'
import {
  ImageGenerationsService,
  type GenerationIamService,
} from './generations-service.ts'
import { en, zh, type ImageGenerationsKey } from './locales.ts'

export type {
  ImageGenerationsPageInjected, ImageGenerationsPageProps,
} from './GenerationsPage.tsx'
export type {
  ImageGenerationsRailEntryInjected, ImageGenerationsRailEntryProps,
} from './RailEntry.tsx'
export type {
  ImageGenerationResult,
  ImageGenerationSnapshot,
  GenerationIamService,
} from './generations-service.ts'
export type { ImageGenerationsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The image generation mode's copy (rail entry + page). */
    generationsImage: ImageGenerationsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'generationsImage'

/** Services required by the image generation mode plugin. */
export const inject = ['slots', 'locale', 'env', 'iam']

/**
 * Register the image generation adapter, rail entry, and page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-generations-image: dictionaries')

  const service = new ImageGenerationsService(
    ctx.get('env') as EnvService,
    ctx.get('iam') as GenerationIamService,
  )
  ctx.effect(() => service.start(), 'ui-generations-image: environment and IAM synchronization')

  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'image',
    locale: NS,
    inject: (): ImageGenerationsRailEntryInjected => ({ mode: 'image' }),
  }, ImageGenerationsRailEntry))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'image',
    locale: NS,
    inject: (): ImageGenerationsPageInjected => ({
      mode: 'image',
      generate: (prompt) => { void service.generate(prompt) },
      hooks: {
        generation: {
          getSnapshot: () => service.getSnapshot(),
          subscribe: listener => service.subscribe(listener),
        },
      },
    }),
  }, ImageGenerationsPage))
}

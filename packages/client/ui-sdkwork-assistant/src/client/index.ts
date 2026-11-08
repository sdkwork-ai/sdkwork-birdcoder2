/**
 * SDKWork assistant surface, browser half: the 助理 rail entry and the two-way
 * binding between that rail selection and the Bot team's surface preference.
 *
 * The Bot team (`ds-bot`) is a shell skin, not a page: in Bot mode it shadows
 * the sidebar and the conversation cells of the Session the frame is showing.
 * So the assistant mode is a shell mode of the frame (`ui-layout`), and this
 * plugin owns only the rail entry plus the fact that ties the two: the 助理
 * entry shows the Bot surface, every other mode shows the plain agent surface.
 *
 * The Bot plugin publishes that preference as `ctx.botSurface`; while the
 * service is absent this plugin contributes nothing, so a deployment without
 * the plugin never offers a dead 助理 icon and never forces a surface.
 * Both directions are reconciled through idempotent writes, so the two
 * subscriptions settle in one step whichever side the user moved — the rail
 * here, or the Bot plugin's own return control.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer's ctx.slots service declaration into this program
// and the locale plugin's ctx.locale merge.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the slots service declaration and the rail-entry slot contract.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: ui-layout's AppModeId vocabulary and the ctx.layout service declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the mode-rail entry seat this package registers into.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { AssistantRailEntry } from './RailEntry.tsx'
import { en, zh, type AssistantKey } from './locales.ts'

export type { AssistantRailEntryProps } from './RailEntry.tsx'
export type { AssistantKey } from './locales.ts'

/** The assistant rail entry's mode id, and the frame mode that shows the Bot surface. */
export const ASSISTANT_MODE: AppModeId = 'assistant'

/** The frame mode the Bot surface yields to: the DSH workbench. */
const HOME_MODE: AppModeId = 'code'

/** The Bot team's surface choice: `bot` paints the team interface, `agent` withdraws it. */
export type BotSurfaceMode = 'bot' | 'agent'

/**
 * The Bot team's surface preference as the `ds-bot` client half publishes it
 * through `ctx.botSurface`. The contract is soft — the plugin is an external
 * package — and this interface is its single description on this side.
 */
export interface BotSurface {
  /** The current surface choice. */
  readonly mode: HostObservable<BotSurfaceMode>
  /**
   * Switch the surface. The plugin closes whatever the previous surface had
   * open, so this is the only supported way to change it from outside.
   * @param mode - the surface to show.
   */
  set(mode: BotSurfaceMode): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The Bot team's surface preference, provided by the `ds-bot` client half. */
    botSurface: BotSurface
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The assistant rail entry's copy. */
    assistant: AssistantKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'assistant'

/** Services required by the assistant surface. */
export const inject = ['slots', 'locale', 'layout']

/**
 * Register the 助理 rail entry and keep the rail selection and the Bot surface
 * in step.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-assistant: dictionaries')

  // Optional by construction: a profile that does not compose the Bot plugin
  // never resolves `botSurface`, and this fiber then contributes nothing.
  ctx.inject(['botSurface'], (botCtx) => {
    const surface = botCtx.botSurface
    const mode = ctx.layout.mode

    /** Move the Bot surface to the rail's choice. */
    const followRail = (): void => {
      const wanted: BotSurfaceMode = mode.getSnapshot() === ASSISTANT_MODE ? 'bot' : 'agent'
      if (surface.mode.getSnapshot() !== wanted) surface.set(wanted)
    }
    /** Move the rail to the Bot surface's choice (the plugin's own controls). */
    const followSurface = (): void => {
      const wanted: AppModeId = surface.mode.getSnapshot() === 'bot' ? ASSISTANT_MODE : HOME_MODE
      if (mode.getSnapshot() !== wanted) ctx.layout.setMode(wanted)
    }

    botCtx.effect(() => {
      const offMode = mode.subscribe(followRail)
      const offSurface = surface.mode.subscribe(followSurface)
      // The boot state: the frame starts on Home, so a remembered Bot surface
      // is withdrawn in the same step the plugin mounts.
      followRail()
      return () => {
        offMode()
        offSurface()
      }
    }, 'ui-sdkwork-assistant: surface and rail')

    ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
      name: 'mode.rail.entry',
      key: ASSISTANT_MODE,
      locale: NS,
      inject: () => ({ mode: ASSISTANT_MODE }),
    }, AssistantRailEntry))
  })
}

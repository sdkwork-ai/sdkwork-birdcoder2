/**
 * Input history plugin, browser half: records every accepted composer message
 * in this browser and makes the composer's ↑/↓ walk that ledger.
 *
 * The plugin owns three contributions, all registered through the documented
 * seams:
 * - the `settings.section` page that controls recall scope and retention;
 * - a fixed-input observer (shortcuts service) that turns a bare, unconsumed
 *   arrow inside a composer into a recall step;
 * - a listener for `conversation/input-accepted`, the conversation plugin's
 *   typed event for the message the Host accepted.
 *
 * The ledger is browser-local (localStorage) and pruned against the configured
 * retention; nothing here reaches the Host or the model.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.sessions service merge and Session facts.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.shortcuts and its fixed-input face.
import type {} from '@deepseek-ai/dsh-client-shortcuts/client'
// Type-only: pulls the ctx.conversation service merge and the accepted-input event.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls ctx.slots (SlotRegistry) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the settings.section slot declaration this page is mounted from.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { InputHistorySection } from './InputHistorySection.tsx'
import type { InputHistorySettingsInjected } from './InputHistorySection.tsx'
import { InputHistoryController } from './input-history-controller.ts'
import { createInputHistoryStore } from './input-history-store.ts'
import { en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'inputHistory'

/** How often the ledger sweeps expired entries while the page stays open. */
const RETENTION_SWEEP_MS = 60 * 60 * 1000

/** Services this plugin consumes. */
export const inject = ['slots', 'locale', 'sessions', 'conversation', 'shortcuts']

/**
 * Register the settings page, the composer gesture, and the accepted-input
 * recorder.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-input-history: dictionaries')

  const store = createInputHistoryStore()
  const controller = new InputHistoryController({
    store,
    sessions: ctx.sessions,
    conversation: ctx.conversation,
  })

  ctx.effect(
    () => ctx.shortcuts.observeFixedInput((input) => { controller.handleFixedInput(input) }),
    'ui-sdkwork-input-history: composer gesture',
  )
  ctx.effect(
    () => ctx.on('conversation/input-accepted', (input) => { controller.recordAccepted(input) }),
    'ui-sdkwork-input-history: accepted inputs',
  )
  // Expiry is enforced on every read and write as well; this sweep clears the
  // stored document while the app stays open across a retention boundary.
  ctx.effect(() => {
    const timer = globalThis.setInterval(() => { controller.purgeExpired() }, RETENTION_SWEEP_MS)
    return () => { globalThis.clearInterval(timer) }
  }, 'ui-sdkwork-input-history: retention sweep')
  // A preference or ledger change can move every cursor; live walks start over
  // from the newest entry instead of continuing against a different slice.
  ctx.effect(() => store.state.subscribe(() => { controller.reset() }), 'ui-sdkwork-input-history: walk reset')

  const historyInjected = (): InputHistorySettingsInjected => ({
    hooks: { history: store.state },
    setEnabled: (enabled) => { store.updateSettings({ enabled }) },
    setScope: (scope) => { store.updateSettings({ scope }) },
    setRetentionDays: (days) => { store.updateSettings({ retentionDays: days }) },
    clear: () => { store.clear() },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    // After the shared Models page (10), the fork's Skills page (12), and the
    // Agent presets page (20): input history is a composer preference, not a
    // model or preset choice, so it closes that block.
    id: 'input-history',
    order: 25,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    inject: historyInjected,
  }, InputHistorySection))
}

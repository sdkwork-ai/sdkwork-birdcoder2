/**
 * @deepseek-ai/dsh-sdkwork-desktop-app — the desktop bundle's runtime glue plugin plus
 * the bundle patch (`cordis.patch.yml`, declared by the `dsh.bundle.patch`
 * manifest field). The plugin owns the desktop surface: the harness-source
 * section and the desktop-surface prompt section that orients a session run
 * inside the Electron shell (the web bundle's URL-based surface text is
 * disabled by the patch, because a desktop shell has no server URL).
 * @module @deepseek-ai/dsh-sdkwork-desktop-app
 */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { addHarnessSourceSection } from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Stable Cordis plugin name. */
export const name = 'sdkwork-desktop-app'

/** Services required before the glue can mount (systemPrompt arrives via ctx.inject). */
export const inject: string[] = []

/** This dsh installation's root, from either this package's source or built entry. */
const SOURCE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

/**
 * Model-visible orientation and acceptance boundary for sessions created
 * through the desktop shell. Mirrors the web surface text minus every
 * server-URL and browser fact.
 */
function desktopSurfacePrompt(): string {
  return 'You are interacting with the user through the DeepSeek Harness desktop application. '
    + 'When the user refers to "this window", "this app", or "this desktop app" without naming another target, they mean this desktop shell. '
    + 'The desktop shell is the local Electron window of this harness process: there is no server URL and no browser. '
    + 'Client-plugin changes require rebuilding the affected Web artifacts and reloading the window; '
    + 'a rebuild watcher (pnpm run dev:web) does not hot-reload this window until desktop dev HMR exists.'
}

/**
 * Mount the desktop surface glue: the harness-source section (shared with the
 * web runtime) plus the desktop-surface prompt section.
 * @param ctx - plugin context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['systemPrompt'], (promptCtx) => {
    addHarnessSourceSection(promptCtx, SOURCE_ROOT)
    promptCtx.systemPrompt.section({
      name: 'app:desktop-surface',
      order: -98,
      text: desktopSurfacePrompt,
    })
  })
}

/**
 * SDKWork explorer plugin, node half. Registers the durable explorer settings
 * section when a settings provider exists (same contract as ui-chat's
 * transcript preference); the browser half ships via exports["./client"],
 * discovered through the package.json dshClient declaration.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import {
  EXPLORER_SETTINGS_NAMESPACE, ExplorerSettingsSchema,
} from './explorer-settings.ts'

export {
  DEFAULT_FILE_OPEN_MODE, DEFAULT_LINK_OPEN_MODE, EXPLORER_SETTINGS_NAMESPACE,
  FILE_OPEN_FIELD, LINK_OPEN_FIELD, OPEN_MODES,
  type ExplorerOpenMode, type ExplorerSettings,
} from './explorer-settings.ts'

/** Register the durable explorer settings section when a provider exists. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      EXPLORER_SETTINGS_NAMESPACE,
      ExplorerSettingsSchema,
    )
  })
}

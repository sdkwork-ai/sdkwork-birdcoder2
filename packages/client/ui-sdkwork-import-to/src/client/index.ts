/**
 * SDKWork relay API-key "导入到" plugin, browser half: registers the sixteen
 * tool rows into the CloudRouter console's quick-import extension slot.
 *
 * The console keeps its built-in three rows when nothing registers, so a
 * composition without this plugin (or before the console bundle loads) is
 * unchanged.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { installQuickImportExtension } from './extension.tsx'

export type {
  QuickImportEndpoints,
  QuickImportExtension,
  QuickImportExtensionKey,
  QuickImportExtensionSelection,
  QuickImportExtensionTarget,
} from './extension.tsx'
export { installQuickImportExtension, readQuickImportExtension } from './extension.tsx'
export type { ImportFile, ImportInput, ImportPlan, ImportTargetId, InstallScript, TargetDescriptor } from './types.ts'
export { apiFormatFrom, isImportTargetId, menuTargets, TARGETS, targetById } from './targets.ts'
export { planImport } from './ccSwitch/project.ts'
export { providerDeeplink } from './ccSwitch/deeplink.ts'
export { buildInstallScript } from './ccSwitch/script.ts'

/**
 * Client plugin body: publish the menu rows and open the import dialog when
 * the console reports a selection.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => installQuickImportExtension(() => ctx.locale.getSnapshot().active),
    'ui-sdkwork-import-to: quick-import extension',
  )
}

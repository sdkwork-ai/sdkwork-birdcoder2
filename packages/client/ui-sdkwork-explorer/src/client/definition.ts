/**
 * Stage one of this package's registration: what the `sdkwork-explorer` tab
 * type IS.
 *
 * The type is a page, not a viewer: it claims no address, because gestures
 * reach it through the package's own DOM bus (see ./bus.ts), whose open-mode
 * policy the address resolver cannot express. The page's body is the package's
 * ExplorerPanel, whose internal strip starts empty and fills as the bus
 * claims file, diff, and link gestures.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from './locales.ts'

/** The tab kind this package owns. */
export const EXPLORER_KIND = 'sdkwork-explorer'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const EXPLORER_ID = '@deepseek-ai/dsh-client-ui-sdkwork-explorer'

/**
 * The explorer type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function explorerDefinition(t: TranslateNS<'explorer'>): SidebarRightTabDefinition {
  return {
    id: EXPLORER_ID,
    kind: EXPLORER_KIND,
    priority: 'builtin',
    title: () => t('type.label'),
  }
}

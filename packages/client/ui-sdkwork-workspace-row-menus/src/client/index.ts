/**
 * SDKWork workspace row menus plugin, browser half: registers the plugin-owned
 * row-menu renderer into the `sidebar.workspaces.rowMenus` hole that the
 * ui-workspace WorkspaceBrowser registration declares. The renderer serves
 * both the workspace (project) ellipsis menu, the session ellipsis menu, and
 * the project-row context menu; unoccupied holes fall back to the owner's
 * built-in upstream menus inside ui-workspace.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { RowMenusEntry } from './RowMenusEntry.tsx'
import { en, NS, zh, type SdkworkRowMenusKey } from './locales.ts'

export type {
  RowMenuItem, SessionRowMenuOwnerProps, SessionRowMenuProps, WorkspaceRowMenuActions,
  WorkspaceRowMenuOwnerProps, WorkspaceRowMenuProps, WorkspaceRowMenusSlotName,
} from './contract/slots.ts'
export type { SdkworkRowMenusKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork workspace row menus copy. */
    'sdkwork-workspace-row-menus': SdkworkRowMenusKey
  }
}

/** Required services for locale registration and the row-menu hole contribution. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionary and the row-menu renderer.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-workspace-row-menus: dictionaries')

  ctx.slots.inject(
    'sidebar.workspaces.rowMenus',
    () => ctx.slots.register({
      name: 'sidebar.workspaces.rowMenus',
      id: 'sdkwork-row-menus',
      order: 0,
      locale: NS,
    }, RowMenusEntry),
  )
}

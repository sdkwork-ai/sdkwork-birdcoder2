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
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.session.header.utilities' SlotMap row (declared
// by the slot's owning package) must be in the program for the register call to
// type. No runtime edge is created — the slot declaration is resolved by
// `ctx.slots.inject`, which simply waits while the conversation package is
// absent, so a composition without it mounts these menus unchanged.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createAppBuildService } from './appBuild/index.ts'
import { BuildIndicator } from './appBuild/BuildIndicator.tsx'
import type { AppBuildRemoteNamespace } from './appBuild/contract.ts'
import type {
  RowMenusAccessTokenPort, RowMenusDeployPublishPort, RowMenusSessionLogDownloadPort,
  RowMenusWorkspacesPort,
} from './contract/slots.ts'
import { RowMenusEntry } from './appBuild/RowMenusEntry.tsx'
import { en, NS, zh, type SdkworkRowMenusKey } from './locales.ts'

export type {
  RowMenuItem, SessionRowMenuOwnerProps, SessionRowMenuProps, WorkspaceRowMenuActions,
  WorkspaceRowMenuOwnerProps, WorkspaceRowMenuProps, WorkspaceRowMenusSlotName,
} from './contract/slots.ts'
export type {
  RowMenusDeployPublishPort, RowMenusSessionLogDownloadPort, RowMenusWorkspacesPort,
} from './contract/slots.ts'
export type { SdkworkRowMenusKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork workspace row menus copy. */
    'sdkwork-workspace-row-menus': SdkworkRowMenusKey
  }
}

/**
 * Required services: the slot registry and the dictionaries. Every other
 * capability the menus draw from is optional and read through `ctx.get` when a
 * menu renders:
 *
 * - `workspaces` (path actions), `sessionLogDownload` (export), and
 *   `deployPublish` (publish rows) are provided by other plugins;
 * - `remote.sdkworkAppBuild` (compile/package rows) is a dotted child service
 *   the remotes assembly mounts asynchronously.
 *
 * Declaring them as inject would park this whole plugin until each one
 * appeared, so one unrelated plugin's failure would remove the path actions
 * from every workspace and session row. The render-time reads keep the menus
 * mounted and degrade only the rows whose service is absent.
 */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionary, the app-build service, and the
 * row-menu renderer.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-workspace-row-menus: dictionaries')

  // App-build capability (probe + run + output panel). Owned here and shared
  // through a service so the menus stay decoupled from the transport and the
  // build panel outlives the menu component that started a build.
  const appBuild = createAppBuildService({
    remote: () => ctx.get('remote.sdkworkAppBuild') as AppBuildRemoteNamespace | undefined,
    locale: {
      // `bind` keys its translate function to this namespace's literal key
      // union; the panel widens it to `string` because its call sites assemble
      // keys dynamically (`family.${id}`, `absent.${reason}`).
      translate: () => ctx.locale.bind(NS) as unknown as (key: string, params?: Record<string, string>) => string,
      subscribe: listener => ctx.locale.subscribe(listener),
    },
  })
  ctx.effect(() => () => { appBuild.dispose() }, 'ui-sdkwork-workspace-row-menus: app build panel')
  ctx.provide('appBuild', appBuild.service)

  // The build indicator lives in the conversation header's right-aligned
  // utility cluster. Registering through `slots.inject` (not a bare register)
  // is what keeps this optional: the declaration arrives from ui-conversation,
  // and a composition without it leaves the entry dormant instead of failing
  // the plugin.
  ctx.slots.inject(
    'conversation.session.header.utilities',
    () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'sdkwork-app-build-indicator',
      order: 10,
      locale: NS,
      inject: () => ({
        indicator: appBuild.indicator,
        onOpenDetail: (id: string): void => { appBuild.expand(id) },
      }),
    }, BuildIndicator),
  )

  ctx.slots.inject(
    'sidebar.workspaces.rowMenus',
    () => ctx.slots.register({
      name: 'sidebar.workspaces.rowMenus',
      id: 'sdkwork-row-menus',
      order: 0,
      locale: NS,
      // `ctx.get` reads the live service store at each render, so a plugin
      // that registers after this one (or one that failed) decides only its
      // own rows: the path actions never wait on the publish or build rows.
      inject: (): {
        workspaces?: RowMenusWorkspacesPort | undefined
        sessionLogDownload?: RowMenusSessionLogDownloadPort | undefined
        deployPublish?: RowMenusDeployPublishPort | undefined
        appBuild?: typeof appBuild.service | undefined
        accessToken?: RowMenusAccessTokenPort | undefined
      } => ({
        workspaces: ctx.get('workspaces') as RowMenusWorkspacesPort | undefined,
        sessionLogDownload: ctx.get('sessionLogDownload') as RowMenusSessionLogDownloadPort | undefined,
        deployPublish: ctx.get('deployPublish') as RowMenusDeployPublishPort | undefined,
        appBuild: appBuild.service,
        // Optional service: the access-token initializer is a separate plugin,
        // so a composition without it keeps every other row and simply has no
        // access-token verb.
        accessToken: ctx.get('accessTokenInitializer') as RowMenusAccessTokenPort | undefined,
      }),
    }, RowMenusEntry),
  )
}

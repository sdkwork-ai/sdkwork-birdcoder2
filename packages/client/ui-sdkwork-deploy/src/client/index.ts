/**
 * SDKWork deploy publishing plugin, browser half: registers a publish icon
 * into the session-header utilities seat (the header's right cluster, just
 * left of the Session-log ellipsis icon) that opens the shared
 * create-deploy-app dialog from @sdkwork/deployments-pc-console-publishing.
 *
 * The host adapter constructs the generated deploy/drive clients from the
 * shared ui-sdkwork-env and ui-sdkwork-iam services (via the global token
 * manager), so the dialog stays host-agnostic and reusable.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { DeployPublishAction, type DeployLocaleFace, type DeployPublishThemePort } from './DeployPublishAction.tsx'
import { DeployPublishDialog, type DeployPublishDialogProps } from './DeployPublishDialog.tsx'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  DeployHost,
  type DeployHostBuild,
  type DeployHostBuildFrame,
  type DeployHostEnvironment,
  type DeployHostIam,
  type DeployHostWorkspace,
  type DeployWorkspaceListing,
} from './deployHost.ts'
import { en, NS, zh, type DeployKey } from './locales.ts'

export type { DeployPublishActionProps } from './DeployPublishAction.tsx'
export type { DeployPublishDialogProps } from './DeployPublishDialog.tsx'
export { DeployPublishDialog } from './DeployPublishDialog.tsx'
export type { DeployLocaleFace, DeployPublishThemePort } from './DeployPublishAction.tsx'
export type {
  DeployDirectoryInspection,
  DeployHost,
  DeployHostBuild,
  DeployHostBuildFrame,
  DeployHostClients,
  DeployHostEnvironment,
  DeployHostIam,
  DeployHostIamSession,
  DeployHostWorkspace,
  DeployWorkspaceListing,
} from './deployHost.ts'
export type { DeployKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork publish plugin copy. */
    deploy: DeployKey
  }
}

/**
 * The publish-project service this plugin provides for sibling surfaces (the
 * workspace/session row menus) to open the shared create-deploy-app dialog
 * with a default source directory. Exposes the host adapter plus the reactive
 * theme/locale ports the dialog consumes; `open` mounts the dialog into the
 * body so callers stay decoupled from the @sdkwork component tree.
 */
export interface DeployPublishService {
  /** Host adapter producing the deploy/drive clients and build/workspace ports. */
  host: DeployHost
  /** Reactive theme port for the shared dialog surface. */
  theme: DeployPublishThemePort
  /** Reactive locale face driving the dialog's locale mapping. */
  locale: DeployLocaleFace
  /** Open the publish-project dialog with an optional default source directory. */
  open(options?: { defaultDirectory?: string | undefined }): void
  /** Close the publish-project dialog if it is open. */
  close(): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** SDKWork publish-project service; absent when this plugin is not loaded. */
    deployPublish: DeployPublishService
  }
}

/**
 * Build the reactive theme/locale ports shared by the header action and the
 * publish service. Closure-wrapped on purpose: useSyncExternalStore invokes
 * both members unbound, so a bare method extraction would crash the render.
 */
function deployPublishThemePort(ctx: ClientContext, themeRuntime: ThemeRuntime): DeployPublishThemePort {
  return {
    getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
    subscribe: listener => ctx.on('theme/change', listener),
  }
}
function deployPublishLocalePort(ctx: ClientContext): DeployLocaleFace {
  return {
    getSnapshot: () => ctx.locale.getSnapshot(),
    subscribe: listener => ctx.locale.subscribe(listener),
  }
}

/**
 * Minimal sessions service face the workspace port reads the cwd from.
 * Structural slice of `SessionListState` (dsh-client-runtime): `current` is a
 * SESSION ID — the cwd lives on the row under `byId` — so reading
 * `current.cwd` off the raw snapshot is always undefined (the historical
 * "source directory is empty" regression).
 */
interface DeployHostSessions {
  list: {
    getSnapshot(): {
      byId: Readonly<Record<string, { cwd?: string; updatedAt?: number } | undefined>>
      current: string | undefined
    }
    subscribe(listener: () => void): () => void
  }
}

/** Structural slice of the sessions list snapshot the cwd resolver consumes. */
export interface DeploySessionsSnapshot {
  byId: Readonly<Record<string, { cwd?: string; updatedAt?: number } | undefined>>
  current: string | undefined
}

/**
 * Resolve the publish dialog's default source directory from the sessions
 * snapshot: the CURRENT session's workspace cwd first ("当前选中的项目"),
 * falling back to the most recently updated cwd-carrying row for the
 * just-booted app where nothing is selected yet. Empty/blank cwd values are
 * skipped in both paths; without any candidate the dialog stays empty.
 * @param snapshot - sessions list snapshot (structural minimum accepted).
 * @returns the resolved workspace cwd, or undefined without a usable row.
 */
export function sessionCwdOf(
  snapshot: DeploySessionsSnapshot | undefined,
): string | undefined {
  const currentId = snapshot?.current
  const fromCurrent = currentId === undefined ? undefined : snapshot?.byId[currentId]?.cwd
  if (fromCurrent !== undefined && fromCurrent.trim() !== '') return fromCurrent
  let latest: { cwd: string; updatedAt: number } | undefined
  for (const row of Object.values(snapshot?.byId ?? {})) {
    const cwd = row?.cwd
    if (cwd === undefined || cwd.trim() === '') continue
    const updatedAt = row?.updatedAt ?? 0
    if (latest === undefined || updatedAt > latest.updatedAt) latest = { cwd, updatedAt }
  }
  return latest?.cwd
}

/** Minimal uiWorkspace face the workspace port delegates browsing to. */
interface DeployHostUiWorkspace {
  pickDirectory(): Promise<string | null | undefined>
  listDirectory(path?: string): Promise<DeployWorkspaceListing>
  readTextFile(path: string, signal?: AbortSignal): Promise<string>
  writeTextFile(path: string, content: string): Promise<string>
}

/** Required services for locale registration, the workspace port, and the header-slot contribution. */
export const inject = ['slots', 'locale', 'env', 'iam', 'theme', 'sessions', 'uiWorkspace', 'remote', 'remote.sdkworkAppBuild']

/**
 * Client plugin body: register the dictionaries, the host adapter, and the
 * session-header publish action.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-deploy: dictionaries')

  const themeRuntime = ctx.get('theme') as ThemeRuntime
  const uiWorkspace = ctx.get('uiWorkspace') as DeployHostUiWorkspace | undefined
  const sessions = ctx.get('sessions') as DeployHostSessions | undefined
  const workspace: DeployHostWorkspace | undefined =
    uiWorkspace === undefined
      ? undefined
      : {
        pickDirectory: () => uiWorkspace.pickDirectory(),
        listDirectory: path => uiWorkspace.listDirectory(path),
        currentDirectory: () => sessionCwdOf(sessions?.list.getSnapshot() as DeploySessionsSnapshot | undefined),
        readTextFile: (path, signal) => uiWorkspace.readTextFile(path, signal),
        writeTextFile: (path, content) => uiWorkspace.writeTextFile(path, content),
      }
  const build: DeployHostBuild | undefined = (() => {
    const namespace = (ctx.remote as ClientRemote).sdkworkAppBuild
    if (namespace === undefined) return undefined
    return {
      async start(request) {
        const result = await namespace.start(request)
        if (!result.ok) {
          throw new Error(`sdkworkAppBuild.start failed: ${result.error.code}: ${result.error.message}`)
        }
        return result.value
      },
      async follow(buildId, onFrame, signal) {
        for await (const frame of namespace.follow(buildId, signal)) {
          onFrame(frame as DeployHostBuildFrame)
        }
      },
      async cancel(buildId) {
        const result = await namespace.cancel({ buildId })
        if (!result.ok) {
          throw new Error(`sdkworkAppBuild.cancel failed: ${result.error.code}: ${result.error.message}`)
        }
      },
    }
  })()
  const host = new DeployHost({
    env: ctx.get('env') as DeployHostEnvironment,
    iam: ctx.get('iam') as DeployHostIam,
    workspace,
    build,
  })
  host.mount()
  ctx.effect(() => () => { host.dispose() }, 'ui-sdkwork-deploy: SDKWork host adapter')

  // Shared reactive theme/locale ports for the header action and the
  // publish-project service (see the port helpers above).
  const theme = deployPublishThemePort(ctx, themeRuntime)
  const locale = deployPublishLocalePort(ctx)
  // Expose the publish service so sibling surfaces (workspace/session row
  // menus) can open the shared create-deploy-app dialog with a default cwd.
  // `open` mounts the dialog into the body through an isolated React root so
  // callers stay decoupled from the @sdkwork component tree and the slot
  // renderer; `close` tears it down. A single root is reused across opens.
  let publishRoot: Root | undefined
  let publishContainer: HTMLDivElement | undefined
  const renderPublish = (defaultDirectory: string | undefined): void => {
    if (publishRoot !== undefined) {
      // Already open: just refresh the default directory.
      publishRoot.render(createElement(DeployPublishDialog, {
        host, theme, locale, defaultDirectory, onClose: closePublish,
      } satisfies DeployPublishDialogProps))
      return
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    publishContainer = container
    publishRoot = createRoot(container)
    publishRoot.render(createElement(DeployPublishDialog, {
      host, theme, locale, defaultDirectory, onClose: closePublish,
    } satisfies DeployPublishDialogProps))
  }
  const closePublish = (): void => {
    publishRoot?.unmount()
    publishRoot = undefined
    publishContainer?.remove()
    publishContainer = undefined
  }
  ctx.provide('deployPublish', {
    host, theme, locale,
    open: (options) => { renderPublish(options?.defaultDirectory) },
    close: closePublish,
  })

  ctx.slots.inject(
    // The conversation header's right utility cluster: the publish icon sits
    // LEFT of the Session-log ellipsis icon (the session-log-download "…"
    // more-button at the default order 0), after the open-in-app split
    // button (order -10).
    'conversation.session.header.utilities',
    () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'sdkwork-deploy-publish',
      order: -8,
      locale: NS,
      inject: (): DeployPublishService => ({
        host,
        theme,
        locale,
      }),
    }, DeployPublishAction),
  )
}

/**
 * SDKWork deploy publishing plugin, browser half: registers a publish icon
 * into the session-header action seat (right of the session log) that opens
 * the shared create-deploy-app dialog from @sdkwork/deployments-pc-console-publishing.
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
import { DeployPublishAction } from './DeployPublishAction.tsx'
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

  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'sdkwork-deploy-publish',
      // After the subagent catalog and the job list: publish sits at the far
      // end of the session-log action strip.
      order: 40,
      locale: NS,
      inject: (): {
        host: DeployHost
        theme: { getColorScheme(): 'light' | 'dark'; subscribe(listener: () => void): () => void }
        locale: { getSnapshot(): { active: string }; subscribe(listener: () => void): () => void }
      } => ({
        host,
        theme: {
          getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
          subscribe: listener => ctx.on('theme/change', listener),
        },
        // The locale service doubles as the reactive LocaleFace (uSES-safe
        // getSnapshot/subscribe) the action maps onto the dialog locale.
        // Closure-wrapped on purpose: useSyncExternalStore invokes both
        // members unbound, and the service's getSnapshot reads `this.snapshot`
        // — a bare method extraction (`locale: ctx.locale`) crashes the slot
        // render with "Cannot read properties of undefined (reading
        // 'snapshot')" and the publish icon never mounts.
        locale: {
          getSnapshot: () => ctx.locale.getSnapshot(),
          subscribe: listener => ctx.locale.subscribe(listener),
        },
      }),
    }, DeployPublishAction),
  )
}

/** React-free Client Workspace service and command facade. */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { WorkspaceView } from '../types.ts'
import type { ClientWorkspaceModel, WorkspaceSnapshot } from './model.ts'

/** Structured create failure for callers that distinguish Host business errors. */
export class WorkspaceCreateError extends Error {
  override readonly name = 'WorkspaceCreateError'

  /** @param rpcError - Host business or folded carrier failure. */
  constructor(readonly rpcError: RemoteFailure) {
    super(`workspace create failed: ${rpcError.code}: ${rpcError.message}`)
  }
}

/** Bare observable source for the Workspace Controller snapshot. */
export interface WorkspaceSource {
  /** Read the identity-stable current snapshot. */
  getSnapshot(): WorkspaceSnapshot
  /**
   * Subscribe to snapshot changes.
   * @param listener - invalidation callback.
   * @returns unsubscribe function.
   */
  subscribe(listener: () => void): () => void
}

/** Workspace Controller's Client service face. */
export interface IWorkspaces {
  /** Host-authoritative Workspace rows, order, archive set, and follow lifecycle. */
  readonly list: WorkspaceSource
  /**
   * Register an existing path as a Workspace.
   * @param input - Host create payload.
   * @returns the created or idempotently resolved Workspace.
   */
  create(input: { path: string }): Promise<WorkspaceView>
  /**
   * Rename a Workspace.
   * @param workspaceId - target Workspace.
   * @param title - new display title.
   * @returns the renamed Workspace.
   */
  rename(workspaceId: WorkspaceId, title: string): Promise<WorkspaceView>
  /**
   * Delete a Workspace registration without deleting Sessions or files.
   * @param workspaceId - target Workspace.
   */
  delete(workspaceId: WorkspaceId): Promise<void>
  /**
   * Move a Workspace within the Host registry order.
   * @param workspaceId - Workspace to move.
   * @param beforeWorkspaceId - anchor Workspace; omitted appends.
   */
  insertBefore(workspaceId: WorkspaceId, beforeWorkspaceId?: WorkspaceId): Promise<void>
  /**
   * Archive a Session from Workspace grouping surfaces.
   * @param sessionId - Session to archive.
   */
  archiveSession(sessionId: SessionId): Promise<void>
  /**
   * Move a Session within one Workspace account.
   * @param workspaceId - owning Workspace.
   * @param sessionId - Session to move.
   * @param beforeSessionId - anchor Session; omitted appends.
   * @returns the changed Workspace.
   */
  insertSessionBefore(
    workspaceId: WorkspaceId,
    sessionId: SessionId,
    beforeSessionId?: SessionId,
  ): Promise<WorkspaceView>
  /**
   * Open a filesystem path with the Host operating system's default
   * application (Finder / Explorer / xdg-open). The Host resolves the path and
   * hands it to its default opener; the `/api` trust fence gates this
   * privileged method to loopback authority, so the web and desktop carriers
   * enforce the same boundary.
   * @param path - absolute or Host-resolvable path.
   */
  openPath(path: string): Promise<void>
  /**
   * Open a new system terminal window whose initial working directory is the
   * given path (Windows `cmd /k`, macOS Terminal.app, Linux xdg-terminal-exec).
   * Privileged the same way as {@link openPath} (loopback-gated).
   * @param path - absolute or Host-resolvable directory path.
   */
  openTerminal(path: string): Promise<void>
}

/** Owns the bare Workspace snapshot and Workspace-only commands. */
export class WorkspaceController extends Service implements IWorkspaces {
  readonly list: WorkspaceSource

  /**
   * @param ctx - Client root Context.
   * @param model - Remote-backed Workspace state model.
   * @param rpc - Connection unary-RPC caller used to reach the Host's
   * privileged `host.openPath`/`host.openTerminal` endpoints over the shared
   * `/api` channel. Both the desktop IPC and the served-web fetch carriers
   * provide it, so the open-folder/terminal actions work in Electron and the
   * browser alike (the `/api` trust fence gates these privileged methods to
   * loopback authority on both surfaces).
   */
  constructor(
    ctx: Context,
    private readonly model: ClientWorkspaceModel,
    private readonly rpc: ClientConnectionRpc,
  ) {
    super(ctx, 'workspaces')
    this.list = model
  }

  async create(input: { path: string }): Promise<WorkspaceView> {
    const result = await this.model.create(input)
    if (!result.ok) throw new WorkspaceCreateError(result.error)
    return result.value.workspace
  }

  async rename(workspaceId: WorkspaceId, title: string): Promise<WorkspaceView> {
    const result = await this.model.rename(workspaceId, title)
    if (!result.ok) throw commandError('rename', result.error)
    return result.value.workspace
  }

  async delete(workspaceId: WorkspaceId): Promise<void> {
    const result = await this.model.delete(workspaceId)
    if (!result.ok) throw commandError('delete', result.error)
  }

  async insertBefore(workspaceId: WorkspaceId, beforeWorkspaceId?: WorkspaceId): Promise<void> {
    const result = await this.model.insertBefore(workspaceId, beforeWorkspaceId)
    if (!result.ok) throw commandError('reorder', result.error)
  }

  async archiveSession(sessionId: SessionId): Promise<void> {
    const result = await this.model.archiveSession(sessionId)
    if (!result.ok) throw commandError('session archive', result.error)
  }

  async insertSessionBefore(
    workspaceId: WorkspaceId,
    sessionId: SessionId,
    beforeSessionId?: SessionId,
  ): Promise<WorkspaceView> {
    const result = await this.model.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
    if (!result.ok) throw commandError('move', result.error)
    return result.value.workspace
  }

  /**
   * Open a filesystem path with the Host's default application through the
   * privileged `host.openPath` endpoint (loopback-gated by the `/api` trust
   * fence on both the desktop IPC and served-web carriers).
   * @param path - absolute or Host-resolvable path.
   */
  async openPath(path: string): Promise<void> {
    const result = await this.rpc.call('/api', 'host.openPath', { path })
    if (!result.ok) throw hostError('path open', result.error)
  }

  /**
   * Open a new system terminal window in the given directory through the
   * privileged `host.openTerminal` endpoint (loopback-gated the same way).
   * @param path - absolute or Host-resolvable directory path.
   */
  async openTerminal(path: string): Promise<void> {
    const result = await this.rpc.call('/api', 'host.openTerminal', { path })
    if (!result.ok) throw hostError('terminal open', result.error)
  }
}

function commandError(operation: string, failure: RemoteFailure): Error {
  return new Error(`workspace ${operation} failed: ${failure.code}: ${failure.message}`)
}

function hostError(operation: string, failure: { code: string; message: string }): Error {
  return new Error(`${operation} failed: ${failure.code}: ${failure.message}`)
}

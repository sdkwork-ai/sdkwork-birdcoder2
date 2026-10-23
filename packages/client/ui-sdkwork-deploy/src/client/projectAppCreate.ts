/**
 * Project app creation: the single path that turns an unlinked project into a
 * registered `deploy_app`.
 *
 * Creation is deliberately one operation with three persisted facts, in this
 * order:
 *
 * 1. the `deploy_app` record (name, kind, description) via the shared
 *    publishing service;
 * 2. the project manifest linkage, so a second click can never create a
 *    duplicate app even when an intermediate step fails;
 * 3. the app's platform target for the card the manifest resolved, which is
 *    what makes the app publishable — the create dialog alone intentionally
 *    writes no target.
 *
 * A recorded app id that is still present refuses creation before any network
 * call. A stale id (the app was deleted) may be replaced only when the caller
 * names it as acknowledged.
 */
import type { AppResponse } from '@sdkwork/deployments-app-sdk'
import type { DeployAppConfigLink } from './deployAppConfig.ts'
import type { ProjectAppDraft, ProjectAppState } from './projectApp.ts'

/** One `deploy_app` record to register. */
export interface CreateProjectAppRecordInput {
  /** `deploy_app.name`. */
  readonly name: string
  /** Console type-card id whose app kind the record stores. */
  readonly cardId?: string | undefined
  /** `deploy_app.description`. */
  readonly description?: string | undefined
}

/** Ports the creation operation performs side effects through. */
export interface CreateProjectAppPorts {
  /** Register the app record and return it. */
  createRecord(input: CreateProjectAppRecordInput): Promise<AppResponse>
  /** Register the app's platform target for one type card. */
  createTarget(appId: string, cardId: string): Promise<void>
  /** Merge the linkage into the project manifest; false when the write failed. */
  writeLink(patch: Partial<DeployAppConfigLink>): Promise<boolean>
}

/** Input to one creation run. */
export interface CreateProjectAppRequest {
  /** The project state re-read immediately before the click. */
  readonly state: ProjectAppState
  /** The draft derived from the manifest. */
  readonly draft: ProjectAppDraft
  /**
   * The recorded id the user explicitly chose to replace (a stale linkage
   * whose app no longer resolves). Any other recorded id refuses creation.
   */
  readonly replaceLinkedAppId?: string | undefined
}

/** Result of one creation run. */
export type CreateProjectAppOutcome =
  | {
    /** The project already owns an app; nothing was created. */
    readonly status: 'already-linked'
    /** The app id the project already records. */
    readonly appId: string
  }
  | {
    /** The app record was created. */
    readonly status: 'created'
    readonly app: AppResponse
    /** The project manifest now records the linkage. */
    readonly linked: boolean
    /** The platform target was registered (false without a card or on failure). */
    readonly targetCreated: boolean
  }

/**
 * Create the project's deploy app and register its linkage and platform target.
 * @param ports - the side effects: record creation, target registration, manifest write.
 * @param request - the freshly read project state, the manifest-derived draft,
 *   and the stale id the user agreed to replace, when any.
 * @returns `already-linked` without touching the network when the project
 *   records another app; otherwise the created app plus which later facts landed.
 * @throws when the app record itself cannot be created.
 */
export async function createProjectApp(
  ports: CreateProjectAppPorts,
  request: CreateProjectAppRequest,
): Promise<CreateProjectAppOutcome> {
  const recorded = request.state.linkedAppId
  if (recorded !== undefined && recorded !== request.replaceLinkedAppId) {
    return { status: 'already-linked', appId: recorded }
  }
  const { draft } = request
  const app = await ports.createRecord({
    name: draft.name,
    ...(draft.cardId === undefined ? {} : { cardId: draft.cardId }),
    ...(draft.description === undefined ? {} : { description: draft.description }),
  })
  const linked = await ports.writeLink({
    appId: app.id,
    appName: app.name,
    appSlug: app.slug,
    ...(draft.appKey === undefined ? {} : { appKey: draft.appKey }),
    ...(request.state.directory === undefined ? {} : { sourceDirectory: request.state.directory }),
  })
  let targetCreated = false
  if (draft.cardId !== undefined) {
    try {
      await ports.createTarget(app.id, draft.cardId)
      targetCreated = true
    } catch {
      // The app and its project linkage already landed; the surface target is
      // the one fact a later publish or the console can add without a
      // duplicate app, so the failure reports through `targetCreated`.
      targetCreated = false
    }
  }
  return { status: 'created', app, linked, targetCreated }
}

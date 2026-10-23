/**
 * Target-app resolution for the publish entry points.
 *
 * Two resolutions run from the project manifest:
 *
 * - {@link resolveLinkedApp} reads the recorded linkage and fetches the app —
 *   the publish-as-template flow's step.
 * - {@link resolveProjectApp} reads the whole project app state first, so the
 *   publish action can tell "no app yet" (offer creation) apart from "app
 *   recorded but gone" (offer re-creation and relinking) without a second read.
 */
import type { AppResponse, SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import type { DeployAppConfigLink } from './deployAppConfig.ts'
import type { ProjectAppState } from './projectApp.ts'

/** Outcome of resolving the linked app for a flow. */
export interface LinkedAppResolution {
  /** The manifest linkage as read (undefined without a recorded link). */
  link?: DeployAppConfigLink
  /** The linked app when the persisted ID still resolves. */
  app?: AppResponse
  /** True when a persisted ID exists but no longer resolves (deleted app). */
  staleLink: boolean
}

/** Outcome of resolving a project's published app. */
export type ProjectAppResolution =
  | { readonly status: 'unlinked' }
  | { readonly status: 'linked'; readonly app: AppResponse; readonly link?: DeployAppConfigLink }
  | { readonly status: 'stale'; readonly link?: DeployAppConfigLink }

/**
 * Resolve the linked app by the persisted manifest ID.
 * @param readLink - reads the project manifest's deploy linkage.
 * @param retrieveApp - fetches one app by ID through the deploy SDK.
 * @returns the read linkage plus the app when it resolves; `staleLink` marks
 *   a recorded ID that no longer resolves so the caller can clear it and open
 *   its picker.
 */
export async function resolveLinkedApp(
  readLink: () => Promise<DeployAppConfigLink | undefined>,
  retrieveApp: (appId: string) => Promise<AppResponse>,
): Promise<LinkedAppResolution> {
  let link: DeployAppConfigLink | undefined
  try {
    link = await readLink()
  } catch {
    link = undefined
  }
  if (link?.appId === undefined) {
    return { staleLink: false }
  }
  try {
    return { link, app: await retrieveApp(link.appId), staleLink: false }
  } catch {
    return { link, staleLink: true }
  }
}

/**
 * Resolve a project's deploy app from its manifest state.
 * @param readState - reads the project's app state (manifest presence + link).
 * @param retrieveApp - fetches one app by ID through the deploy SDK.
 * @returns `unlinked` without a recorded id, `linked` with the fetched app, or
 *   `stale` when the recorded id no longer resolves (the app was deleted).
 */
export async function resolveProjectApp(
  readState: () => Promise<ProjectAppState>,
  retrieveApp: (appId: string) => Promise<AppResponse>,
): Promise<ProjectAppResolution> {
  let state: ProjectAppState | undefined
  try {
    state = await readState()
  } catch {
    state = undefined
  }
  const appId = state?.linkedAppId
  if (appId === undefined) return { status: 'unlinked' }
  try {
    return { status: 'linked', app: await retrieveApp(appId), ...(state?.link === undefined ? {} : { link: state.link }) }
  } catch {
    return { status: 'stale', ...(state?.link === undefined ? {} : { link: state.link }) }
  }
}

/** Convenience overload bound to a constructed deploy client. */
export function resolveLinkedAppWith(
  deployClient: SdkworkDeployAppClient,
): (readLink: () => Promise<DeployAppConfigLink | undefined>) => Promise<LinkedAppResolution> {
  return async readLink =>
    resolveLinkedApp(readLink, appId => deployClient.app.retrieve(appId))
}

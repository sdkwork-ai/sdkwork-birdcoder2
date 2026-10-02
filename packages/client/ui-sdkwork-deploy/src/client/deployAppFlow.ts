/**
 * Target-app resolution for the upload-code and publish-as-template flows:
 * the persisted manifest ID is authoritative while it still resolves; a
 * stale ID (deleted app) falls through to the caller's picker step.
 */

import type { AppResponse, SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import type { DeployAppConfigLink } from './deployAppConfig.ts'

/** Outcome of resolving the linked app for a flow. */
export interface LinkedAppResolution {
  /** The manifest linkage as read (undefined without a recorded link). */
  link?: DeployAppConfigLink
  /** The linked app when the persisted ID still resolves. */
  app?: AppResponse
  /** True when a persisted ID exists but no longer resolves (deleted app). */
  staleLink: boolean
}

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

/** Convenience overload bound to a constructed deploy client. */
export function resolveLinkedAppWith(
  deployClient: SdkworkDeployAppClient,
): (readLink: () => Promise<DeployAppConfigLink | undefined>) => Promise<LinkedAppResolution> {
  return async readLink =>
    resolveLinkedApp(readLink, appId => deployClient.app.retrieve(appId))
}

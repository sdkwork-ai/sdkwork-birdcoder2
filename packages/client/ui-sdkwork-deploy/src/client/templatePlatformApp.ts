/**
 * Platform-app registration adapter for the template publish ports.
 *
 * The publishing service's factory is imported in its own module (the same
 * arrangement `DeployProjectAppFlow` uses) so the template port module keeps
 * one SDK surface per file: client listing and template writes here, one
 * `createAppRecord`/`createPlatformTargetForCard` call each in this module.
 */
import { createDeployAppPublishingService } from '@sdkwork/deployments-pc-console-publishing'
import type { AppKind, SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import type { SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk'
import type { OwnedPlatformApp } from './templatePublish.ts'

/** The platform-app side effects one publish run needs. */
export interface PlatformAppRecorder {
  /** Register one account-owned platform app from the manifest identity. */
  create(input: {
    readonly name: string
    readonly slug: string
    readonly appKind: string
    readonly description?: string
  }): Promise<OwnedPlatformApp>
  /** Register the app's console-card platform target (best effort). */
  createTarget(appId: string, cardId: string): Promise<void>
}

/**
 * Build the platform-app recorder over one deploy/drive client pair.
 * @param deployClient - the generated deploy client.
 * @param driveClient - the generated drive client (the publishing service owns media).
 * @returns the two write operations the publish ports expose.
 */
export function createPlatformAppRecorder(
  deployClient: SdkworkDeployAppClient,
  driveClient: SdkworkDriveAppClient,
): PlatformAppRecorder {
  const publishing = createDeployAppPublishingService({ deployClient, driveClient })
  return {
    async create(input) {
      const created = await publishing.createAppRecord({
        name: input.name,
        slug: input.slug,
        appKind: input.appKind as AppKind,
        ...(input.description === undefined ? {} : { description: input.description }),
      })
      return { id: created.id, name: created.name, slug: created.slug, appKind: created.appKind }
    },
    async createTarget(appId, cardId) {
      await publishing.createPlatformTargetForCard(appId, cardId)
    },
  }
}

/**
 * Ports binding the scaffold center's pure planning/execution modules to the
 * generated deploy/drive clients and the Host workspace bridge.
 *
 * Keeping this adapter separate from {@link scaffoldPublish} and
 * {@link scaffoldDownload} means those modules stay plain data with stub
 * ports in tests, while every SDK method and host bridge call lives here in
 * one composed place.
 */
import type { AppResponse, SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import type { SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk'
import {
  createDeployAppOperationsService,
  createDeployAppPublishingService,
} from '@sdkwork/deployments-pc-console-publishing'
import { createPlatformAppRecorder } from './scaffoldPlatformApp.ts'
import type { DeployHost } from './deployHost.ts'
import { packScaffoldApp } from './hostArchive.ts'
import { installScaffoldVersion, type ScaffoldInstallProgress } from './installScaffold.ts'
import { maxBytesForPackageType } from './scaffoldPlatforms.ts'
import type {
  CreateScaffoldListingInput,
  CreateScaffoldVersionInput,
  OwnedPlatformApp,
  OwnedScaffold,
  ScaffoldPublishPorts,
  UpdateScaffoldListingInput,
} from './scaffoldPublish.ts'
import type { CustomScaffoldAppPort } from './scaffoldCustomApp.ts'
import type { ScaffoldCatalogRow, ScaffoldInstallPorts } from './scaffoldDownload.ts'

/** `deploy_artifact.package_type` used for a source scaffold archive. */
const SCAFFOLD_PACKAGE_TYPE = 5

/**
 * Adapt the Host scaffold bridge to the custom-directory detector.
 * @param host - the workspace bridge carrying listFiles/readFiles.
 * @returns the detector's structural port.
 */
export function createCustomScaffoldAppPort(host: DeployHost): CustomScaffoldAppPort {
  return {
    listFiles: directory => host.listScaffoldFiles(directory),
    readFiles: (directory, paths) => host.readScaffoldFiles(directory, paths),
  }
}

/** Pages read from one account listing before declaring a truncation. */
const LISTING_PAGE_CEILING = 5

/** Rows requested per account listing page. */
const LISTING_PAGE_SIZE = 100

/** The account/scaffold catalog size ceiling the panel can show. */
export const SCAFFOLD_CATALOG_CEILING = LISTING_PAGE_CEILING * LISTING_PAGE_SIZE

/** The generated clients one adapter pair consumes. */
export interface ScaffoldClientPair {
  readonly deployClient: SdkworkDeployAppClient
  readonly driveClient: SdkworkDriveAppClient
}

/**
 * Build the publish ports over one client pair and host adapter.
 * @param pair - the generated deploy/drive clients.
 * @param host - the workspace/manifest bridge.
 * @returns ports for {@link publishScaffoldApp}.
 */
export function createScaffoldPublishPorts(pair: ScaffoldClientPair, host: DeployHost): ScaffoldPublishPorts {
  const platformApp = createPlatformAppRecorder(pair.deployClient, pair.driveClient)
  const operations = createDeployAppOperationsService(pair)
  const publishing = createDeployAppPublishingService(pair)
  return {
    listPlatformApps: () => listOwnedPlatformApps(pair.deployClient),
    createPlatformApp: input => platformApp.create(input),
    createPlatformTarget: (appId, cardId) => platformApp.createTarget(appId, cardId),
    uploadMedia: async ({ file, appId }) => {
      const ref = await publishing.uploadMedia({
        file,
        fileName: file.name,
        contentType: file.type,
      }, appId)
      return `drive://spaces/${ref.driveSpaceId}/nodes/${ref.driveNodeId}`
    },
    listScaffolds: () => listOwnedScaffolds(pair.deployClient),
    createScaffold: input => createScaffoldListing(pair.deployClient, input),
    updateScaffold: (templateId, input) => updateScaffoldListing(pair.deployClient, templateId, input),
    createVersion: (templateId, input) => createScaffoldVersion(pair.deployClient, templateId, input),
    submitScaffold: async (templateId) => {
      await pair.deployClient.app.scaffolds.submit(templateId)
    },
    packApp: (directory, onProgress) => packScaffoldApp(host, directory, maxBytesForPackageType(SCAFFOLD_PACKAGE_TYPE), {
      onReadProgress: (progress) => { onProgress(progress.read, progress.total) },
    }),
    uploadArchive: async (input) => {
      const uploaded = await operations.uploadCodeFromArchive({
        appId: input.appId,
        packageType: SCAFFOLD_PACKAGE_TYPE,
        archive: {
          file: input.file,
          fileName: input.fileName,
          contentType: 'application/zip',
          checksumSha256: input.checksumSha256,
        },
        onProgress: (progress) => {
          if (progress.totalBytes <= 0) return
          input.onProgress(Math.min(100, Math.round((progress.uploadedBytes / progress.totalBytes) * 100)))
        },
      })
      return { artifactId: uploaded.artifactId }
    },
    writeAppLink: async (directory, patch) => host.writeDeployLink(patch, directory),
  }
}

/**
 * Build the install ports over one client pair and host adapter.
 * @param pair - the generated deploy/drive clients.
 * @param host - the workspace/manifest bridge.
 * @returns ports for {@link installScaffoldIntoProject}.
 */
export function createScaffoldInstallPorts(pair: ScaffoldClientPair, host: DeployHost): ScaffoldInstallPorts {
  return {
    listApps: async (projectDirectory) => {
      const listing = await host.listDirectory(`${trimSeparators(projectDirectory)}/apps`)
      if (listing === undefined) return undefined
      return listing.entries.filter(entry => !entry.hidden).map(entry => entry.name)
    },
    createDirectory: (parent, name) => host.createDirectory(parent, name),
    readTextFile: path => host.readTextFile(path),
    writeTextFile: (path, content) => host.writeTextFile(path, content),
    installInto: async (templateId, targetDirectory, onProgress) => {
      const outcome = await installScaffoldVersion({
        scaffolds: {
          appScaffolds: pair.deployClient.app.scaffolds,
          appScaffoldVersions: pair.deployClient.app.scaffolds.versions,
        },
        artifacts: pair.deployClient,
        drive: pair.driveClient,
        writeFile: request => host.writeScaffoldFile(request),
        reportProgress: (progress: ScaffoldInstallProgress) => { onProgress?.(progress) },
      }, { templateId, targetDirectory })
      return {
        fileCount: outcome.fileCount,
        totalBytes: outcome.totalBytes,
        version: outcome.version,
        displayName: outcome.templateName,
      }
    },
    writeScaffoldLink: (directory, patch) => host.writeDeployLink(patch, directory),
  }
}

/**
 * List every platform app owned by the current account.
 * @param deployClient - the generated deploy client.
 * @returns the account's apps (up to the listing ceiling).
 */
export async function listOwnedPlatformApps(deployClient: SdkworkDeployAppClient): Promise<OwnedPlatformApp[]> {
  const apps: OwnedPlatformApp[] = []
  for (let page = 1; page <= LISTING_PAGE_CEILING; page += 1) {
    const result = await deployClient.app.list({ page, pageSize: LISTING_PAGE_SIZE, scope: 'USER' })
    for (const row of result.items) apps.push(toOwnedPlatformApp(row))
    if (result.pageInfo.hasMore !== true || result.items.length === 0) break
  }
  return apps
}

/**
 * List every scaffold owned by the current account.
 * @param deployClient - the generated deploy client.
 * @returns the account's listings (up to the listing ceiling).
 */
export async function listOwnedScaffolds(deployClient: SdkworkDeployAppClient): Promise<OwnedScaffold[]> {
  const scaffolds: OwnedScaffold[] = []
  for (let page = 1; page <= LISTING_PAGE_CEILING; page += 1) {
    const result = await deployClient.app.scaffolds.list({ page, pageSize: LISTING_PAGE_SIZE })
    for (const row of result.items) scaffolds.push(toOwnedScaffold(row))
    if (result.pageInfo.hasMore !== true || result.items.length === 0) break
  }
  return scaffolds
}

/**
 * List the scaffolds the download panel shows.
 * @param deployClient - the generated deploy client.
 * @param source - the caller's own listings or the public marketplace.
 * @param keyword - optional search text (marketplace only; the owned list is short).
 * @returns the catalog rows.
 */
export async function listScaffoldCatalog(
  deployClient: SdkworkDeployAppClient,
  source: 'mine' | 'market',
  keyword: string,
): Promise<ScaffoldCatalogRow[]> {
  if (source === 'mine') {
    const rows: ScaffoldCatalogRow[] = []
    for (let page = 1; page <= LISTING_PAGE_CEILING; page += 1) {
      const result = await deployClient.app.scaffolds.list({ page, pageSize: LISTING_PAGE_SIZE })
      for (const row of result.items) {
        rows.push({
          id: row.id,
          appUuid: row.appUuid,
          templateKey: row.templateKey,
          displayName: row.displayName,
          summary: row.summary,
          // The listing row's `version` is an optimistic-lock counter, not a
          // semantic scaffold version; the panel shows no number rather than
          // a misleading one.
          version: '',
          status: row.status,
          installCount: row.installCount,
          updatedAt: row.updatedAt,
        })
      }
      if (result.pageInfo.hasMore !== true || result.items.length === 0) break
    }
    return rows
  }
  const result = await deployClient.app.marketplace.scaffolds.list({
    page: 1,
    pageSize: 50,
    ...(keyword.trim() === '' ? {} : { keyword: keyword.trim() }),
  })
  return result.items.map(row => ({
    id: row.id,
    appUuid: '',
    templateKey: row.templateKey,
    displayName: row.displayName,
    summary: row.summary,
    version: '',
    status: row.status,
    installCount: row.installCount,
    updatedAt: row.updatedAt,
  }))
}

/** Map one deploy_app row into the planning shape. */
function toOwnedPlatformApp(row: AppResponse): OwnedPlatformApp {
  return { id: row.id, name: row.name, slug: row.slug, appKind: row.appKind }
}

/** Map one scaffold row into the planning shape. */
function toOwnedScaffold(row: {
  readonly id: string
  readonly appUuid: string
  readonly templateKey: string
  readonly displayName: string
  readonly summary?: string
  readonly description?: string
  readonly iconMediaRef?: string
  readonly coverMediaRef?: string
  readonly screenshots?: readonly {
    readonly mediaRef: string
    readonly device?: string
    readonly caption?: string
    readonly sortOrder?: number
  }[]
  readonly status: string
  readonly latestVersionUuid?: string
}): OwnedScaffold {
  return {
    id: row.id,
    appUuid: row.appUuid,
    templateKey: row.templateKey,
    displayName: row.displayName,
    ...(row.summary === undefined ? {} : { summary: row.summary }),
    ...(row.description === undefined ? {} : { description: row.description }),
    ...(row.iconMediaRef === undefined ? {} : { iconMediaRef: row.iconMediaRef }),
    ...(row.coverMediaRef === undefined ? {} : { coverMediaRef: row.coverMediaRef }),
    ...(row.screenshots === undefined
      ? {}
      : {
        screenshots: row.screenshots.map((screenshot, index) => ({
          mediaRef: screenshot.mediaRef,
          ...(screenshot.device === undefined ? {} : { device: screenshot.device }),
          ...(screenshot.caption === undefined ? {} : { caption: screenshot.caption }),
          sortOrder: screenshot.sortOrder ?? index,
        })),
      }),
    status: row.status,
    ...(row.latestVersionUuid === undefined ? {} : { latestVersionUuid: row.latestVersionUuid }),
  }
}

/** Create one listing with its first version. */
async function createScaffoldListing(
  deployClient: SdkworkDeployAppClient,
  input: CreateScaffoldListingInput,
): Promise<OwnedScaffold> {
  const created = await deployClient.app.scaffolds.create({
    appUuid: input.appUuid,
    templateType: 'APP',
    categoryUuid: input.categoryUuid,
    templateKey: input.templateKey.trim(),
    displayName: input.displayName.trim(),
    summary: input.summary.trim(),
    description: input.description.trim(),
    ...(input.iconMediaRef === undefined ? {} : { iconMediaRef: input.iconMediaRef }),
    ...(input.coverMediaRef === undefined ? {} : { coverMediaRef: input.coverMediaRef }),
    ...(input.screenshots.length === 0
      ? {}
      : { screenshots: input.screenshots.map(screenshot => ({ ...screenshot })) }),
    visibility: input.visibility,
    initialVersion: versionBody(input),
  }, { idempotencyKey: newIdempotencyKey() })
  return toOwnedScaffold(created)
}

/** Update one listing's metadata. */
async function updateScaffoldListing(
  deployClient: SdkworkDeployAppClient,
  templateId: string,
  input: UpdateScaffoldListingInput,
): Promise<OwnedScaffold> {
  const updated = await deployClient.app.scaffolds.update(templateId, {
    displayName: input.displayName.trim(),
    summary: input.summary.trim(),
    description: input.description.trim(),
    ...(input.iconMediaRef === undefined ? {} : { iconMediaRef: input.iconMediaRef }),
    ...(input.coverMediaRef === undefined ? {} : { coverMediaRef: input.coverMediaRef }),
    screenshots: input.screenshots.map(screenshot => ({ ...screenshot })),
    visibility: input.visibility,
    categoryUuid: input.categoryUuid,
  }, { idempotencyKey: newIdempotencyKey() })
  return toOwnedScaffold(updated)
}

/** Append one version to an existing listing. */
async function createScaffoldVersion(
  deployClient: SdkworkDeployAppClient,
  templateId: string,
  input: CreateScaffoldVersionInput,
): Promise<void> {
  await deployClient.app.scaffolds.versions.create(templateId, versionBody(input), {
    idempotencyKey: newIdempotencyKey(),
  })
}

/** The version payload shared by create-listing and append-version. */
function versionBody(input: CreateScaffoldVersionInput): {
  version: string
  changelog?: string
  artifactUuid: string
  platformTargets: string[]
  packageSizeBytes: string
  checksumSha256: string
} {
  return {
    version: input.version.trim(),
    ...(input.changelog.trim() === '' ? {} : { changelog: input.changelog.trim() }),
    artifactUuid: input.artifactUuid,
    platformTargets: [...input.platformTargets],
    packageSizeBytes: String(input.packageSizeBytes),
    checksumSha256: input.checksumSha256,
  }
}

/** Idempotency key for the scaffold writes (browser crypto with a fallback). */
function newIdempotencyKey(): string {
  const cryptoRef = (globalThis as { crypto?: Crypto }).crypto
  if (cryptoRef !== undefined && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID()
  }
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Strip trailing separators so joined paths stay stable. */
function trimSeparators(path: string): string {
  return path.replace(/[/\\]+$/u, '')
}

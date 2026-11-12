/**
 * Ports binding the template center's pure planning/execution modules to the
 * generated deploy/drive clients and the Host workspace bridge.
 *
 * Keeping this adapter separate from {@link templatePublish} and
 * {@link templateDownload} means those modules stay plain data with stub
 * ports in tests, while every SDK method and host bridge call lives here in
 * one composed place.
 */
import type { AppResponse, SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import type { SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk'
import { createDeployAppOperationsService } from '@sdkwork/deployments-pc-console-publishing'
import { createPlatformAppRecorder } from './templatePlatformApp.ts'
import type { DeployHost } from './deployHost.ts'
import { packTemplateApp } from './hostArchive.ts'
import { installTemplateVersion, type TemplateInstallProgress } from './installTemplate.ts'
import { maxBytesForPackageType } from './templatePlatforms.ts'
import type {
  CreateTemplateListingInput,
  CreateTemplateVersionInput,
  OwnedPlatformApp,
  OwnedTemplate,
  TemplatePublishPorts,
  UpdateTemplateListingInput,
} from './templatePublish.ts'
import type { CustomTemplateAppPort } from './templateCustomApp.ts'
import type { TemplateCatalogRow, TemplateInstallPorts } from './templateDownload.ts'

/** `deploy_artifact.package_type` used for a source scaffold archive. */
const SCAFFOLD_PACKAGE_TYPE = 5

/**
 * Adapt the Host template bridge to the custom-directory detector.
 * @param host - the workspace bridge carrying listFiles/readFiles.
 * @returns the detector's structural port.
 */
export function createCustomTemplateAppPort(host: DeployHost): CustomTemplateAppPort {
  return {
    listFiles: directory => host.listTemplateFiles(directory),
    readFiles: (directory, paths) => host.readTemplateFiles(directory, paths),
  }
}

/** Pages read from one account listing before declaring a truncation. */
const LISTING_PAGE_CEILING = 5

/** Rows requested per account listing page. */
const LISTING_PAGE_SIZE = 100

/** The account/template catalog size ceiling the panel can show. */
export const TEMPLATE_CATALOG_CEILING = LISTING_PAGE_CEILING * LISTING_PAGE_SIZE

/** The generated clients one adapter pair consumes. */
export interface TemplateClientPair {
  readonly deployClient: SdkworkDeployAppClient
  readonly driveClient: SdkworkDriveAppClient
}

/**
 * Build the publish ports over one client pair and host adapter.
 * @param pair - the generated deploy/drive clients.
 * @param host - the workspace/manifest bridge.
 * @returns ports for {@link publishTemplateApp}.
 */
export function createTemplatePublishPorts(pair: TemplateClientPair, host: DeployHost): TemplatePublishPorts {
  const platformApp = createPlatformAppRecorder(pair.deployClient, pair.driveClient)
  const operations = createDeployAppOperationsService(pair)
  return {
    listPlatformApps: () => listOwnedPlatformApps(pair.deployClient),
    createPlatformApp: input => platformApp.create(input),
    createPlatformTarget: (appId, cardId) => platformApp.createTarget(appId, cardId),
    listTemplates: () => listOwnedTemplates(pair.deployClient),
    createTemplate: input => createTemplateListing(pair.deployClient, input),
    updateTemplate: (templateId, input) => updateTemplateListing(pair.deployClient, templateId, input),
    createVersion: (templateId, input) => createTemplateVersion(pair.deployClient, templateId, input),
    submitTemplate: async (templateId) => {
      await pair.deployClient.template.appTemplates.submit(templateId)
    },
    packApp: (directory, onProgress) => packTemplateApp(host, directory, maxBytesForPackageType(SCAFFOLD_PACKAGE_TYPE), {
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
 * @returns ports for {@link installTemplateIntoProject}.
 */
export function createTemplateInstallPorts(pair: TemplateClientPair, host: DeployHost): TemplateInstallPorts {
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
      const outcome = await installTemplateVersion({
        templates: pair.deployClient.template,
        artifacts: pair.deployClient,
        drive: pair.driveClient,
        writeFile: request => host.writeTemplateFile(request),
        reportProgress: (progress: TemplateInstallProgress) => { onProgress?.(progress) },
      }, { templateId, targetDirectory })
      return {
        fileCount: outcome.fileCount,
        totalBytes: outcome.totalBytes,
        version: outcome.version,
        displayName: outcome.templateName,
      }
    },
    writeTemplateLink: (directory, patch) => host.writeDeployLink(patch, directory),
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
 * List every template owned by the current account.
 * @param deployClient - the generated deploy client.
 * @returns the account's listings (up to the listing ceiling).
 */
export async function listOwnedTemplates(deployClient: SdkworkDeployAppClient): Promise<OwnedTemplate[]> {
  const templates: OwnedTemplate[] = []
  for (let page = 1; page <= LISTING_PAGE_CEILING; page += 1) {
    const result = await deployClient.template.appTemplates.list({ page, pageSize: LISTING_PAGE_SIZE })
    for (const row of result.items) templates.push(toOwnedTemplate(row))
    if (result.pageInfo.hasMore !== true || result.items.length === 0) break
  }
  return templates
}

/**
 * List the templates the download panel shows.
 * @param deployClient - the generated deploy client.
 * @param source - the caller's own listings or the public marketplace.
 * @param keyword - optional search text (marketplace only; the owned list is short).
 * @returns the catalog rows.
 */
export async function listTemplateCatalog(
  deployClient: SdkworkDeployAppClient,
  source: 'mine' | 'market',
  keyword: string,
): Promise<TemplateCatalogRow[]> {
  if (source === 'mine') {
    const rows: TemplateCatalogRow[] = []
    for (let page = 1; page <= LISTING_PAGE_CEILING; page += 1) {
      const result = await deployClient.template.appTemplates.list({ page, pageSize: LISTING_PAGE_SIZE })
      for (const row of result.items) {
        rows.push({
          id: row.id,
          appUuid: row.appUuid,
          templateKey: row.templateKey,
          displayName: row.displayName,
          summary: row.summary,
          // The listing row's `version` is an optimistic-lock counter, not a
          // semantic template version; the panel shows no number rather than
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
  const result = await deployClient.template.marketplaceTemplates.list({
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

/** Map one template row into the planning shape. */
function toOwnedTemplate(row: {
  readonly id: string
  readonly appUuid: string
  readonly templateKey: string
  readonly displayName: string
  readonly status: string
  readonly latestVersionUuid?: string
}): OwnedTemplate {
  return {
    id: row.id,
    appUuid: row.appUuid,
    templateKey: row.templateKey,
    displayName: row.displayName,
    status: row.status,
    ...(row.latestVersionUuid === undefined ? {} : { latestVersionUuid: row.latestVersionUuid }),
  }
}

/** Create one listing with its first version. */
async function createTemplateListing(
  deployClient: SdkworkDeployAppClient,
  input: CreateTemplateListingInput,
): Promise<OwnedTemplate> {
  const created = await deployClient.template.appTemplates.create({
    appUuid: input.appUuid,
    templateType: 'APP',
    categoryUuid: input.categoryUuid,
    templateKey: input.templateKey.trim(),
    displayName: input.displayName.trim(),
    summary: input.summary.trim(),
    visibility: input.visibility,
    initialVersion: versionBody(input),
  }, { idempotencyKey: newIdempotencyKey() })
  return toOwnedTemplate(created)
}

/** Update one listing's metadata. */
async function updateTemplateListing(
  deployClient: SdkworkDeployAppClient,
  templateId: string,
  input: UpdateTemplateListingInput,
): Promise<OwnedTemplate> {
  const updated = await deployClient.template.appTemplates.update(templateId, {
    displayName: input.displayName.trim(),
    summary: input.summary.trim(),
    visibility: input.visibility,
    categoryUuid: input.categoryUuid,
  }, { idempotencyKey: newIdempotencyKey() })
  return toOwnedTemplate(updated)
}

/** Append one version to an existing listing. */
async function createTemplateVersion(
  deployClient: SdkworkDeployAppClient,
  templateId: string,
  input: CreateTemplateVersionInput,
): Promise<void> {
  await deployClient.template.appTemplateVersions.create(templateId, versionBody(input), {
    idempotencyKey: newIdempotencyKey(),
  })
}

/** The version payload shared by create-listing and append-version. */
function versionBody(input: CreateTemplateVersionInput): {
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

/** Idempotency key for the template writes (browser crypto with a fallback). */
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

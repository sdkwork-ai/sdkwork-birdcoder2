/**
 * Use-template install service: turn one published template version into
 * files under a caller-picked directory. The chain is the consume-side
 * counterpart of the publish flow — resolve the template's latest artifact
 * version, download the artifact bytes through the Drive content API, plan
 * the install (screening + text/binary split), and execute one bounded write
 * per planned file through the injected Host port.
 *
 * The dependencies are structural faces so the whole chain runs against
 * plain stubs in tests and against the generated clients in production.
 */
import {
  downloadArtifactBytes,
  planTemplateInstall,
  type DriveContentReader,
} from './templateInstall.ts'

/** Minimal template-marketplace face the installer resolves the version through. */
export interface TemplateInstallTemplatesFace {
  appTemplates: {
    retrieve(templateId: string): Promise<AppTemplateRow>
  }
  appTemplateVersions: {
    list(templateId: string, params?: { page?: number; pageSize?: number }): Promise<{
      items: AppTemplateVersionRow[]
    }>
  }
}

/** The template listing row the installer consumes. */
export interface AppTemplateRow {
  readonly id: string
  readonly displayName: string
  readonly version: string
  readonly latestVersionUuid?: string
}

/** One template version row; only an artifact-carrying version installs. */
export interface AppTemplateVersionRow {
  readonly id: string
  readonly version: string
  readonly artifactUuid?: string
}

/** Minimal artifact face: the installer only needs the Drive node reference. */
export interface TemplateInstallArtifactFace {
  artifact: {
    retrieve(artifactId: string): Promise<{ driveNodeId?: string }>
  }
}

/** One bounded write the Host port executes. */
export interface TemplateInstallWritePort {
  writeFile(request: {
    targetDirectory: string
    relativePath: string
    contentBase64: string
  }): Promise<{ absolutePath: string; bytes: number }>
}

/** Progress reported while the install runs. */
export type TemplateInstallProgress =
  | { kind: 'download'; percent: number }
  | { kind: 'write'; file: string; index: number; total: number }

/** Facts of one completed install. */
export interface TemplateInstallOutcome {
  readonly templateName: string
  readonly version: string
  readonly fileCount: number
  readonly textCount: number
  readonly binaryCount: number
  readonly totalBytes: number
}

/** The template version records no installable artifact. */
export class TemplateNotInstallableError extends Error {
  constructor(templateId: string) {
    super(`template ${templateId} has no artifact version to install`)
    this.name = 'TemplateNotInstallableError'
  }
}

/** Dependencies the installer consumes, all structural. */
export interface InstallTemplateVersionDeps {
  readonly templates: TemplateInstallTemplatesFace
  readonly artifacts: TemplateInstallArtifactFace
  readonly drive: DriveContentReader
  readonly writeFile: TemplateInstallWritePort['writeFile']
  readonly reportProgress?: ((progress: TemplateInstallProgress) => void) | undefined
}

/**
 * Install one template's latest artifact version into the target directory.
 * @param deps - structural clients plus the Host write port.
 * @param request - the template to install and the picked target directory.
 * @returns the install facts for the caller's acknowledgement copy.
 * @throws TemplateNotInstallableError when no version carries an artifact,
 *   and any download/write failure propagates after the report.
 */
export async function installTemplateVersion(
  deps: InstallTemplateVersionDeps,
  request: { templateId: string; targetDirectory: string },
): Promise<TemplateInstallOutcome> {
  const template = await deps.templates.appTemplates.retrieve(request.templateId)
  const page = await deps.templates.appTemplateVersions.list(request.templateId, { page: 1, pageSize: 50 })
  const version =
    page.items.find(item => item.id === template.latestVersionUuid && item.artifactUuid !== undefined)
    ?? page.items.find(item => item.artifactUuid !== undefined)
  if (version?.artifactUuid === undefined) {
    throw new TemplateNotInstallableError(request.templateId)
  }
  const artifact = await deps.artifacts.artifact.retrieve(version.artifactUuid)
  if (artifact.driveNodeId === undefined) {
    throw new TemplateNotInstallableError(request.templateId)
  }

  const bytes = await downloadArtifactBytes(deps.drive, artifact.driveNodeId, (percent) => {
    deps.reportProgress?.({ kind: 'download', percent })
  })
  const plan = planTemplateInstall(bytes)

  let index = 0
  for (const file of plan.files) {
    index += 1
    deps.reportProgress?.({ kind: 'write', file: file.path, index, total: plan.files.length })
    await deps.writeFile({
      targetDirectory: request.targetDirectory,
      relativePath: file.path,
      contentBase64: bytesToBase64(file.bytes),
    })
  }
  return {
    templateName: template.displayName,
    version: version.version,
    fileCount: plan.files.length,
    textCount: plan.textCount,
    binaryCount: plan.binaryCount,
    totalBytes: plan.totalBytes,
  }
}

/** Encode bytes as standard base64 in 0x8000-byte slices (the btoa arg limit). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

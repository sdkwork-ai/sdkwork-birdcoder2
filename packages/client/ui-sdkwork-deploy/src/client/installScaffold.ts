/**
 * Use-scaffold install service: turn one published scaffold version into
 * files under a caller-picked directory. The chain is the consume-side
 * counterpart of the publish flow — resolve the scaffold's latest artifact
 * version, download the artifact bytes through the Drive content API, plan
 * the install (screening + text/binary split), and execute one bounded write
 * per planned file through the injected Host port.
 *
 * The dependencies are structural faces so the whole chain runs against
 * plain stubs in tests and against the generated clients in production.
 */
import {
  downloadArtifactBytes,
  planScaffoldInstall,
  type DriveContentReader,
} from './scaffoldInstall.ts'

/** Minimal scaffold-marketplace face the installer resolves the version through. */
export interface ScaffoldInstallScaffoldsFace {
  appScaffolds: {
    retrieve(templateId: string): Promise<AppScaffoldRow>
  }
  appScaffoldVersions: {
    list(templateId: string, params?: { page?: number; pageSize?: number }): Promise<{
      items: AppScaffoldVersionRow[]
    }>
  }
}

/** The scaffold listing row the installer consumes. */
export interface AppScaffoldRow {
  readonly id: string
  readonly displayName: string
  readonly templateKey: string
  readonly version: string
  readonly latestVersionUuid?: string
}

/** One scaffold version row; only an artifact-carrying version installs. */
export interface AppScaffoldVersionRow {
  readonly id: string
  /**
   * Semantic scaffold version (`templateVersion` on the wire). The generated
   * row also carries an optimistic-lock `version` counter, which is not a
   * version number.
   */
  readonly templateVersion?: string
  readonly artifactUuid?: string
}

/** Minimal artifact face: the installer only needs the Drive node reference. */
export interface ScaffoldInstallArtifactFace {
  artifact: {
    retrieve(artifactId: string): Promise<{ driveNodeId?: string }>
  }
}

/** One bounded write the Host port executes. */
export interface ScaffoldInstallWritePort {
  writeFile(request: {
    targetDirectory: string
    relativePath: string
    contentBase64: string
  }): Promise<{ absolutePath: string; bytes: number }>
}

/** Progress reported while the install runs. */
export type ScaffoldInstallProgress =
  | { kind: 'download'; percent: number }
  | { kind: 'write'; file: string; index: number; total: number }

/** Facts of one completed install. */
export interface ScaffoldInstallOutcome {
  readonly templateName: string
  readonly templateKey: string
  readonly version: string
  readonly fileCount: number
  readonly textCount: number
  readonly binaryCount: number
  readonly totalBytes: number
}

/** The scaffold version records no installable artifact. */
export class ScaffoldNotInstallableError extends Error {
  constructor(templateId: string) {
    super(`scaffold ${templateId} has no artifact version to install`)
    this.name = 'ScaffoldNotInstallableError'
  }
}

/** Dependencies the installer consumes, all structural. */
export interface InstallScaffoldVersionDeps {
  readonly scaffolds: ScaffoldInstallScaffoldsFace
  readonly artifacts: ScaffoldInstallArtifactFace
  readonly drive: DriveContentReader
  readonly writeFile: ScaffoldInstallWritePort['writeFile']
  readonly reportProgress?: ((progress: ScaffoldInstallProgress) => void) | undefined
}

/**
 * Install one scaffold's latest artifact version into the target directory.
 * @param deps - structural clients plus the Host write port.
 * @param request - the scaffold to install and the picked target directory.
 * @returns the install facts for the caller's acknowledgement copy.
 * @throws ScaffoldNotInstallableError when no version carries an artifact,
 *   and any download/write failure propagates after the report.
 */
export async function installScaffoldVersion(
  deps: InstallScaffoldVersionDeps,
  request: { templateId: string; targetDirectory: string },
): Promise<ScaffoldInstallOutcome> {
  const scaffold = await deps.scaffolds.appScaffolds.retrieve(request.templateId)
  const page = await deps.scaffolds.appScaffoldVersions.list(request.templateId, { page: 1, pageSize: 50 })
  const version =
    page.items.find(item => item.id === scaffold.latestVersionUuid && item.artifactUuid !== undefined)
    ?? page.items.find(item => item.artifactUuid !== undefined)
  if (version?.artifactUuid === undefined) {
    throw new ScaffoldNotInstallableError(request.templateId)
  }
  const artifact = await deps.artifacts.artifact.retrieve(version.artifactUuid)
  if (artifact.driveNodeId === undefined) {
    throw new ScaffoldNotInstallableError(request.templateId)
  }

  const bytes = await downloadArtifactBytes(deps.drive, artifact.driveNodeId, (percent) => {
    deps.reportProgress?.({ kind: 'download', percent })
  })
  const plan = planScaffoldInstall(bytes)

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
    templateName: scaffold.displayName,
    templateKey: scaffold.templateKey,
    version: version.templateVersion ?? '',
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

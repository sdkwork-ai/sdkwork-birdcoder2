/**
 * SDKWork template install capability: bounded, confinement-checked
 * project-file writes under a caller-picked directory. One verb — write one
 * regular file — is all "use a template" scaffolding needs: the browser
 * plans the install (download, unzip, screening — `ui-sdkwork-deploy`'s
 * `templateInstall.ts`) and drives the writes one small file at a time.
 *
 * Security posture: the target directory is chosen by the local operator, so
 * the capability trusts the directory but never the entry names. Every write
 * re-checks that the resolved path stays inside the target, rejects
 * traversal/absolute/NUL names and Windows-reserved device segments outright,
 * and refuses anything above the per-file byte cap. Parent directories are
 * created on demand — an install of a few hundred files must not need a
 * mkdir round trip per directory.
 *
 * The wire face over this seam is the `sdkwork-template-install-controller`
 * Remote; this package owns none of the wire vocabulary.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { isAbsolute, dirname, relative, resolve } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { SdkworkTemplateInstallError } from './errors.ts'
import type {
  SdkworkTemplateInstallWriteRequest,
  SdkworkTemplateInstallWriteValue,
} from './types.ts'

export type * from './types.ts'
export { SdkworkTemplateInstallError } from './errors.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** SDKWork template install capability: bounded project-file writes. */
    sdkworkTemplateInstall: SdkworkTemplateInstallInstaller
  }
}

/** Inclusive per-file byte ceiling; the controller's wire cap stays below it. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024

/** One decoded write, shared by validation and the file system step. */
interface DecodedWrite {
  readonly base: string
  readonly target: string
  readonly bytes: Buffer
}

export class SdkworkTemplateInstallInstaller extends Service {
  private readonly maxFileBytes: number

  /**
   * @param ctx - host context.
   * @param maxFileBytes - inclusive per-file ceiling; tests shrink it, the
   *   deployment default is {@link MAX_FILE_BYTES}.
   */
  constructor(ctx: Context, maxFileBytes: number = MAX_FILE_BYTES) {
    super(ctx, 'sdkworkTemplateInstall')
    this.maxFileBytes = maxFileBytes
  }

  /**
   * Write one regular file under the target directory, creating parents.
   * @param request - target directory, target-relative path, base64 content.
   * @returns the absolute path written and the byte count.
   * @throws SdkworkTemplateInstallError with the closed code for every refusal.
   */
  async writeFile(request: SdkworkTemplateInstallWriteRequest): Promise<SdkworkTemplateInstallWriteValue> {
    const decoded = this.prepare(request)
    try {
      await mkdir(dirname(decoded.target), { recursive: true })
      await writeFile(decoded.target, decoded.bytes)
    } catch (cause: unknown) {
      throw new SdkworkTemplateInstallError(
        'write-failed',
        `cannot write "${request.relativePath}": ${cause instanceof Error ? cause.message : String(cause)}`,
        request.relativePath,
      )
    }
    return { absolutePath: decoded.target, bytes: decoded.bytes.length }
  }

  /**
   * Validate the request and resolve it into a base/target/bytes triple.
   * Every refusal in one place, before the file system is touched.
   */
  private prepare(request: SdkworkTemplateInstallWriteRequest): DecodedWrite {
    const { targetDirectory, relativePath } = request
    if (targetDirectory.trim() === '' || !isAbsolute(targetDirectory)) {
      throw new SdkworkTemplateInstallError('target-unreadable', 'target directory must be an absolute path', targetDirectory)
    }
    let base: string
    try {
      base = realpathSync(targetDirectory)
    } catch {
      throw new SdkworkTemplateInstallError('target-unreadable', `target directory does not exist: ${targetDirectory}`, targetDirectory)
    }
    if (relativePath.includes('\0')) {
      throw new SdkworkTemplateInstallError('path-unsafe', 'path contains a NUL byte', relativePath)
    }
    if (isAbsolute(relativePath) || /^[a-z]:/iu.test(relativePath)) {
      throw new SdkworkTemplateInstallError('path-unsafe', 'path must be target-relative', relativePath)
    }
    const segments = relativePath.split(/[/\\]/)
    if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
      throw new SdkworkTemplateInstallError('path-unsafe', 'path must be a clean relative chain of single names', relativePath)
    }
    if (segments.some(isReservedSegment)) {
      throw new SdkworkTemplateInstallError('path-unsafe', `segment is a reserved device name: ${relativePath}`, relativePath)
    }
    // The request arrives base64; decode AFTER the path screens so hostile
    // names never cost a decode. Size cap checked on the decoded length.
    const bytes = base64ToBuffer(request.contentBase64)
    if (bytes.length > this.maxFileBytes) {
      throw new SdkworkTemplateInstallError(
        'content-too-large',
        `${bytes.length} bytes exceed the ${this.maxFileBytes} byte per-file cap`,
        relativePath,
      )
    }
    const target = resolve(base, ...segments)
    const containment = relative(base, target)
    /* v8 ignore next 3 -- defence in depth: the segment screen already
       rejects traversal, so no public request reaches this throw. */
    if (containment === '' || containment.startsWith('..') || isAbsolute(containment)) {
      throw new SdkworkTemplateInstallError('path-unsafe', 'path escapes the target directory', relativePath)
    }
    return { base, target, bytes }
  }
}

/**
 * Windows keeps device names at any directory level and rejects segments
 * ending in a dot or space; both are refused rather than rewritten, because a
 * silently renamed file is worse than a rejected one.
 */
function isReservedSegment(segment: string): boolean {
  if (/[. ]$/u.test(segment)) return true
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/iu.test(segment)
}

/** Decode one base64 string, tolerating standard padding only. */
function base64ToBuffer(content: string): Buffer {
  return Buffer.from(content, 'base64')
}

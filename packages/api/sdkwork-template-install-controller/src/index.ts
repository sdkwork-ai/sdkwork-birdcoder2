/**
 * Host SDKWork template Remote owner: the wire vocabulary over the
 * `ctx.sdkworkTemplateInstall` seam.
 *
 * Two verbs serve app development scaffold templates:
 *
 * - `writeFile` installs one bounded, confinement-checked project file at a
 *   time (the caller plans download, unzip, and screening).
 * - `listFiles` / `readFiles` publish one app root under the project's
 *   `apps/` directory: the caller lists the packaging-eligible files and
 *   reads bounded batches, then packs the archive with the same
 *   `.gitignore`-aware packer it uses for a locally picked directory.
 */

import type { Context } from '@deepseek-ai/cordis'
import { SdkworkTemplateInstallError } from '@deepseek-ai/dsh-sdkwork-template-install'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteErrorCode } from '@deepseek-ai/dsh-typert-protocol'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type {
  SdkworkTemplateInstallWriteRequest,
  SdkworkTemplateInstallWriteValue,
  SdkworkTemplateListFilesRequest,
  SdkworkTemplateListFilesValue,
  SdkworkTemplateReadFilesRequest,
  SdkworkTemplateReadFilesValue,
} from './types.ts'

export type * from './types.ts'

/** Wire segment rule: one clean chain of single names. Dotfiles are legal
 * (a template ships `.gitignore`); refused here are the shapes no rename can
 * make safe plus the Windows pitfalls. The capability re-checks behind this —
 * the wire refuses first, cheaply. */
function isCleanRelativePath(path: string): boolean {
  if (path === '' || path.includes('\\') || path.includes('\0') || path.startsWith('/')) return false
  return path.split('/').every(segment =>
    segment !== ''
    && segment !== '.'
    && segment !== '..'
    && !/[. ]$/u.test(segment)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/iu.test(segment))
}

/** Inclusive per-file byte cap on the wire; the capability's ceiling stays above it. */
const MAX_WIRE_FILE_BYTES = 32 * 1024 * 1024

/** Longest base64 payload admitted: the encoded form of the wire cap plus padding slack. */
const MAX_WIRE_BASE64_CHARS = Math.ceil(MAX_WIRE_FILE_BYTES / 3) * 4

/** Inclusive file count of one wire listing or read batch. */
const MAX_WIRE_FILES = 64

const writeRequestSchema = z.object({
  targetDirectory: z.string().refine(path => isAbsolute(path), {
    message: 'target directory must be an absolute path',
  }),
  relativePath: z.string().max(512).refine(isCleanRelativePath, {
    message: 'relative path must be a clean chain of single names',
  }),
  contentBase64: z.string().max(MAX_WIRE_BASE64_CHARS).regex(/^[A-Za-z0-9+/]*={0,2}$/, {
    message: 'content must be standard base64',
  }),
})

const listFilesRequestSchema = z.object({
  directory: z.string().refine(path => isAbsolute(path), {
    message: 'source directory must be an absolute path',
  }),
})

const readFilesRequestSchema = z.object({
  directory: z.string().refine(path => isAbsolute(path), {
    message: 'source directory must be an absolute path',
  }),
  paths: z.array(z.string().max(512).refine(isCleanRelativePath, {
    message: 'relative path must be a clean chain of single names',
  })).max(MAX_WIRE_FILES),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host SDKWork template Remote namespace owner. */
    sdkworkTemplateInstallController: SdkworkTemplateInstallController
  }
}

/** Wire codes answered for each seam failure code. */
const FAILURE_CODES = {
  'target-unreadable': 'template-install/target-unreadable',
  'source-unreadable': 'template-install/source-unreadable',
  'path-unsafe': 'template-install/path-unsafe',
  'content-too-large': 'template-install/content-too-large',
  'write-failed': 'template-install/write-failed',
  'read-failed': 'template-install/read-failed',
} as const satisfies Record<SdkworkTemplateInstallError['code'], RemoteErrorCode>

/**
 * Host service backing the generated `ctx.remote.sdkworkTemplateInstall`
 * namespace. The capability owns the file system and the confinement checks;
 * this controller owns the wire vocabulary and the request validation.
 */
export class SdkworkTemplateInstallController extends TypertRemoteService {
  static inject = ['sdkworkTemplateInstall']

  /** @param ctx - host context carrying the template capability. */
  constructor(ctx: Context) {
    super(ctx, 'sdkworkTemplateInstallController', { namespace: 'sdkworkTemplateInstall' })
  }

  /**
   * Write one regular file under the target directory, creating parents.
   * @param request - absolute target directory, target-relative path, base64 content.
   * @returns the absolute path written and the byte count.
   */
  @Remote('writeFile')
  async writeFile(request: SdkworkTemplateInstallWriteRequest): Promise<SdkworkTemplateInstallWriteValue> {
    const parsed = writeRequestSchema.safeParse(request)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkTemplateInstall.writeFile',
        { issues: parsed.error.issues },
      )
    }
    try {
      return await this.ctx.sdkworkTemplateInstall.writeFile(parsed.data)
    } catch (error: unknown) {
      throw templateInstallFailure(error)
    }
  }

  /**
   * List every packaging-eligible regular file under one app directory.
   * @param request - the absolute app directory.
   * @returns the files with sizes plus whether a bound truncated the walk.
   */
  @Remote('listFiles')
  async listFiles(request: SdkworkTemplateListFilesRequest): Promise<SdkworkTemplateListFilesValue> {
    const parsed = listFilesRequestSchema.safeParse(request)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkTemplateInstall.listFiles',
        { issues: parsed.error.issues },
      )
    }
    try {
      return await this.ctx.sdkworkTemplateInstall.listFiles(parsed.data)
    } catch (error: unknown) {
      throw templateInstallFailure(error)
    }
  }

  /**
   * Read one bounded batch of regular files under an app directory.
   * @param request - the absolute app directory and relative paths.
   * @returns each file's base64 bytes in request order.
   */
  @Remote('readFiles')
  async readFiles(request: SdkworkTemplateReadFilesRequest): Promise<SdkworkTemplateReadFilesValue> {
    const parsed = readFilesRequestSchema.safeParse(request)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkTemplateInstall.readFiles',
        { issues: parsed.error.issues },
      )
    }
    try {
      return await this.ctx.sdkworkTemplateInstall.readFiles(parsed.data)
    } catch (error: unknown) {
      throw templateInstallFailure(error)
    }
  }
}

/** Project a seam rejection onto the `template-install/*` wire vocabulary. */
function templateInstallFailure(error: unknown): RemoteError {
  if (error instanceof SdkworkTemplateInstallError) {
    return new RemoteError(
      FAILURE_CODES[error.code],
      error.message,
      { code: error.code, ...(error.path === undefined ? {} : { path: error.path }) },
      { cause: error },
    )
  }
  return new RemoteError(
    'gateway/internal',
    error instanceof Error ? error.message : String(error),
    {},
    { cause: error },
  )
}

export default SdkworkTemplateInstallController

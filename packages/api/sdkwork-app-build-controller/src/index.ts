/**
 * Host SDKWork app build Remote owner: validated build starts, streamed
 * output frames, and cancellation over the `ctx.sdkworkAppBuild` seam.
 */

import type { Context } from '@deepseek-ai/cordis'
import { SdkworkAppBuildError } from '@deepseek-ai/dsh-sdkwork-app-build'
import type { SdkworkAppBuildErrorCode } from '@deepseek-ai/dsh-sdkwork-app-build/types'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteErrorCode } from '@deepseek-ai/dsh-typert-protocol'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type {
  SdkworkAppBuildCancelRequest, SdkworkAppBuildCancelValue,
  SdkworkAppBuildFrame, SdkworkAppBuildStartRequest, SdkworkAppBuildStartValue,
} from './types.ts'

export type * from './types.ts'

/** npm script-name subset accepted across the wire (no spaces or shell metacharacters). */
const SCRIPT_NAME = /^[A-Za-z0-9:@_/-]+$/

/** Argument charset safe to join into a shell command without quoting. */
const SAFE_ARGUMENT = /^[A-Za-z0-9_@%+=:,./\\-]+$/

const startRequestSchema = z.object({
  cwd: z.string().refine(path => isAbsolute(path), { message: 'build cwd must be an absolute path' }),
  script: z.string().regex(SCRIPT_NAME).max(64).optional(),
  args: z.array(z.string().regex(SAFE_ARGUMENT).max(256)).max(8).optional(),
})

const buildIdSchema = z.string().refine(id => id.trim() !== '', { message: 'build id must be non-blank' })

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host SDKWork app build Remote namespace owner. */
    sdkworkAppBuildController: SdkworkAppBuildController
  }
}

/** Wire codes answered for each seam failure code. */
const FAILURE_CODES = {
  'cwd-unreadable': 'app-build/cwd-unreadable',
  'no-package-json': 'app-build/no-package-json',
  'script-missing': 'app-build/script-missing',
  'build-unknown': 'app-build/build-unknown',
  'concurrency-exceeded': 'app-build/concurrency-exceeded',
} as const satisfies Record<SdkworkAppBuildErrorCode, RemoteErrorCode>

/**
 * Host service backing the generated `ctx.remote.sdkworkAppBuild` namespace.
 * The composed `sdkworkAppBuild` seam spawns and owns the processes; this
 * controller owns the wire vocabulary and the request validation.
 */
export class SdkworkAppBuildController extends TypertRemoteService {
  static inject = ['sdkworkAppBuild']

  /** @param ctx - host context carrying the build seam. */
  constructor(ctx: Context) {
    super(ctx, 'sdkworkAppBuildController', { namespace: 'sdkworkAppBuild' })
  }

  /**
   * Spawn one package-manager build in an absolute directory.
   * @param request - build directory, optional script name (default `build`),
   *   optional script arguments.
   * @returns the spawn facts to follow by build id.
   */
  @Remote('start')
  async start(request: SdkworkAppBuildStartRequest): Promise<SdkworkAppBuildStartValue> {
    const parsed = startRequestSchema.safeParse(request)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkAppBuild.start',
        { issues: parsed.error.issues },
      )
    }
    try {
      return await this.ctx.sdkworkAppBuild.start(parsed.data)
    } catch (error: unknown) {
      throw buildFailure(error)
    }
  }

  /**
   * Stream one build's frames: buffered history first, then live frames,
   * ending right after the exit frame.
   * @param buildId - a build id returned by a previous start.
   * @param signal - follower lifetime; abort ends the stream without
   *   affecting the build.
   */
  @Remote({ mode: 'stream' })
  follow(buildId: string, signal: AbortSignal): AsyncIterable<SdkworkAppBuildFrame> {
    const parsed = buildIdSchema.safeParse(buildId)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkAppBuild.follow',
        { issues: parsed.error.issues },
      )
    }
    // The seam's follow rejects unknown ids on first pull; the Remote codec
    // carries that rejection to the follower as-is.
    return this.ctx.sdkworkAppBuild.follow(parsed.data, signal)
  }

  /**
   * Cancel one running build (tree kill). The build's exit frame still
   * arrives on any open follow stream.
   * @param request - the build to cancel.
   * @returns whether a running build was found.
   */
  @Remote('cancel')
  async cancel(request: SdkworkAppBuildCancelRequest): Promise<SdkworkAppBuildCancelValue> {
    const parsed = buildIdSchema.safeParse(request.buildId)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkAppBuild.cancel',
        { issues: parsed.error.issues },
      )
    }
    return { cancelled: this.ctx.sdkworkAppBuild.cancel(parsed.data) }
  }
}

/** Project a seam rejection onto the `app-build/*` wire vocabulary. */
function buildFailure(error: unknown): RemoteError {
  if (error instanceof SdkworkAppBuildError) {
    return new RemoteError(FAILURE_CODES[error.code], error.message, { code: error.code }, { cause: error })
  }
  return new RemoteError(
    'gateway/internal',
    error instanceof Error ? error.message : String(error),
    {},
    { cause: error },
  )
}

export default SdkworkAppBuildController

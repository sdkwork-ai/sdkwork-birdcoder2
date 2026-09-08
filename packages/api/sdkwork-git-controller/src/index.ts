/**
 * Host SDKWork git Remote owner: repository status, local branches, graph
 * log, branch checkout, and commit/push over the `ctx.sdkworkGit` seam.
 */

import type { Context } from '@deepseek-ai/cordis'
import { SdkworkGitError } from '@deepseek-ai/dsh-sdkwork-git'
import type { SdkworkGitErrorCode } from '@deepseek-ai/dsh-sdkwork-git/types'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteErrorCode } from '@deepseek-ai/dsh-typert-protocol'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type {
  SdkworkGitBranches, SdkworkGitBranchesRequest, SdkworkGitCheckoutRequest, SdkworkGitCheckoutValue,
  SdkworkGitCommitRequest, SdkworkGitCommitValue, SdkworkGitCreateRequest, SdkworkGitCreateValue,
  SdkworkGitLog, SdkworkGitLogRequest, SdkworkGitPushRequest, SdkworkGitPushValue,
  SdkworkGitStatus, SdkworkGitStatusRequest,
} from './types.ts'

export type * from './types.ts'

/** Absolute-path constraint shared by every request. */
const cwdSchema = z.object({
  cwd: z.string().refine(path => isAbsolute(path), { message: 'git cwd must be an absolute path' }),
})

/** Branch-name constraint: no whitespace or leading dash (git's check runs at the seam). */
const branchNameSchema = z.string().min(1).max(200).refine(
  name => !name.startsWith('-') && !/\s/.test(name),
  { message: 'branch name must not start with "-" or contain whitespace' },
)

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host SDKWork git Remote namespace owner. */
    sdkworkGitController: SdkworkGitController
  }
}

/** Wire codes answered for each seam failure code. */
const FAILURE_CODES = {
  'cwd-unreadable': 'git/cwd-unreadable',
  'not-a-repo': 'git/not-a-repo',
  'branch-name-invalid': 'git/branch-name-invalid',
  'checkout-failed': 'git/checkout-failed',
  'commit-failed': 'git/commit-failed',
  'push-failed': 'git/push-failed',
  'command-failed': 'git/command-failed',
} as const satisfies Record<SdkworkGitErrorCode, RemoteErrorCode>

/**
 * Host service backing the generated `ctx.remote.sdkworkGit` namespace. The
 * composed `sdkworkGit` seam runs the git CLI through simple-git; this
 * controller owns the wire vocabulary and the request validation.
 */
export class SdkworkGitController extends TypertRemoteService {
  static inject = ['sdkworkGit']

  /** @param ctx - host context carrying the git seam. */
  constructor(ctx: Context) {
    super(ctx, 'sdkworkGitController', { namespace: 'sdkworkGit' })
  }

  /**
   * Read one repository's working-tree state.
   * @param request - the repository directory.
   * @returns branch, HEAD commit, uncommitted file count, and ahead/behind counts.
   */
  @Remote('status')
  async status(request: SdkworkGitStatusRequest): Promise<SdkworkGitStatus> {
    const parsed = cwdSchema.safeParse(request)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkGit.status',
        { issues: parsed.error.issues },
      )
    }
    try {
      return await this.ctx.sdkworkGit.status(parsed.data)
    } catch (error: unknown) {
      throw gitFailure(error)
    }
  }

  /**
   * List one repository's local branches.
   * @param request - the repository directory.
   * @returns the current branch plus the local branch rows, current first then name order.
   */
  @Remote('branches')
  async branches(request: SdkworkGitBranchesRequest): Promise<SdkworkGitBranches> {
    const parsed = cwdSchema.safeParse(request)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkGit.branches',
        { issues: parsed.error.issues },
      )
    }
    try {
      return await this.ctx.sdkworkGit.branches(parsed.data)
    } catch (error: unknown) {
      throw gitFailure(error)
    }
  }

  /**
   * Switch one repository to an existing local branch.
   * @param request - the repository directory and the target branch.
   * @returns the branch now checked out.
   */
  @Remote('checkout')
  async checkout(request: SdkworkGitCheckoutRequest): Promise<SdkworkGitCheckoutValue> {
    const parsed = cwdSchema.extend({ branch: branchNameSchema }).safeParse(request)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkGit.checkout',
        { issues: parsed.error.issues },
      )
    }
    try {
      return await this.ctx.sdkworkGit.checkout(parsed.data)
    } catch (error: unknown) {
      throw gitFailure(error)
    }
  }

  /**
   * Create one new local branch at HEAD and switch to it.
   * @param request - the repository directory and the new branch name.
   * @returns the branch now checked out.
   */
  @Remote('createAndCheckout')
  async createAndCheckout(request: SdkworkGitCreateRequest): Promise<SdkworkGitCreateValue> {
    const parsed = cwdSchema.extend({ name: branchNameSchema }).safeParse(request)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkGit.createAndCheckout',
        { issues: parsed.error.issues },
      )
    }
    try {
      return await this.ctx.sdkworkGit.createAndCheckout(parsed.data)
    } catch (error: unknown) {
      throw gitFailure(error)
    }
  }

  /**
   * Read one repository's recent commit rows with parent topology and ref
   * decorations (HEAD, local branches, remote-tracking refs, tags).
   * @param request - the repository directory and an optional row bound.
   * @returns the rows in git's listing order (newest first).
   */
  @Remote('log')
  async log(request: SdkworkGitLogRequest): Promise<SdkworkGitLog> {
    const parsed = cwdSchema.extend({ limit: z.number().int().min(1).max(200).optional() }).safeParse(request)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkGit.log',
        { issues: parsed.error.issues },
      )
    }
    try {
      return await this.ctx.sdkworkGit.log(parsed.data)
    } catch (error: unknown) {
      throw gitFailure(error)
    }
  }

  /**
   * Record the working tree into one new commit on HEAD, optionally staging
   * every unstaged and untracked path first.
   * @param request - the repository directory, the message, and the staging scope.
   * @returns the new commit hash and the branch it landed on.
   */
  @Remote('commit')
  async commit(request: SdkworkGitCommitRequest): Promise<SdkworkGitCommitValue> {
    const parsed = cwdSchema.extend({
      message: z.string().min(1).max(2000),
      includeUnstaged: z.boolean(),
    }).safeParse(request)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkGit.commit',
        { issues: parsed.error.issues },
      )
    }
    try {
      return await this.ctx.sdkworkGit.commit(parsed.data)
    } catch (error: unknown) {
      throw gitFailure(error)
    }
  }

  /**
   * Push the checked-out branch to its upstream.
   * @param request - the repository directory.
   * @returns the branch pushed and its upstream name.
   */
  @Remote('push')
  async push(request: SdkworkGitPushRequest): Promise<SdkworkGitPushValue> {
    const parsed = cwdSchema.safeParse(request)
    if (!parsed.success) {
      throw new RemoteError(
        'gateway/bad-request',
        'invalid payload for sdkworkGit.push',
        { issues: parsed.error.issues },
      )
    }
    try {
      return await this.ctx.sdkworkGit.push(parsed.data)
    } catch (error: unknown) {
      throw gitFailure(error)
    }
  }
}

/** Project a seam rejection onto the `git/*` wire vocabulary. */
function gitFailure(error: unknown): RemoteError {
  if (error instanceof SdkworkGitError) {
    return new RemoteError(FAILURE_CODES[error.code], error.message, { code: error.code }, { cause: error })
  }
  return new RemoteError(
    'gateway/internal',
    error instanceof Error ? error.message : String(error),
    {},
    { cause: error },
  )
}

export default SdkworkGitController

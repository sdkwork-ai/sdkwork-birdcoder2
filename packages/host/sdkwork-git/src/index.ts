/**
 * SDKWork git capability: local repository reads (status, local branches,
 * graph log) and branch checkout over the installed git CLI through
 * simple-git. Every call validates the directory and its repository status
 * before running git; rejections use the closed `SdkworkGitErrorCode`
 * vocabulary. The wire face over this seam is the `sdkwork-git-controller`
 * Remote.
 */

import { open as openAsync } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git'
import { SdkworkGitError } from './errors.ts'
import type {
  SdkworkGitBranch, SdkworkGitBranches, SdkworkGitBranchesRequest, SdkworkGitCheckoutRequest,
  SdkworkGitCheckoutValue, SdkworkGitCommitRequest, SdkworkGitCommitValue, SdkworkGitCreateRequest,
  SdkworkGitCreateValue, SdkworkGitLog, SdkworkGitLogEntry, SdkworkGitLogRefs, SdkworkGitLogRequest,
  SdkworkGitPushRequest, SdkworkGitPushValue, SdkworkGitStatus, SdkworkGitStatusRequest,
} from './types.ts'

export type * from './types.ts'
export { SdkworkGitError } from './errors.ts'
export type { SdkworkGitErrorCode } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** SDKWork git capability: local repository reads and branch checkout. */
    sdkworkGit: SdkworkGit
  }
}

/** Wall-clock bound for one git subprocess; every git call must settle inside it. */
const GIT_BLOCK_TIMEOUT_MS = 15_000

/** Default graph-log row bound when a request omits `limit`. */
const DEFAULT_LOG_LIMIT = 100

/** Maximum graph-log rows one request may ask for. */
const MAX_LOG_LIMIT = 200

/** Unit separator between the pretty-format fields of one log row (git `%x1f`). */
const FIELD_SEPARATOR = String.fromCharCode(0x1f)

/** Record separator opening one log row (git `%x1e`). */
const RECORD_SEPARATOR = String.fromCharCode(0x1e)

/** The git capability service. Stateless over per-call SimpleGit instances. */
export class SdkworkGit extends Service {
  /** Per-directory SimpleGit cache: skips the repeated checkIsRepo spawn. */
  private readonly handles = new Map<string, SimpleGit>()

  /** @param ctx - host context. */
  constructor(ctx: Context) {
    super(ctx, 'sdkworkGit')
  }

  /**
   * Read one repository's point-in-time working-tree state.
   * @param request - the repository directory.
   * @returns branch, HEAD commit, uncommitted file count, ahead/behind counts,
   * and the unstaged diff's added/deleted line totals.
   *
   * Degraded mode: when the full read fails but the directory IS a git
   * repository (corrupt object store, broken pack files, unborn HEAD on an
   * empty init), the branch name is still answered from `symbolic-ref` — a
   * ref-store read that never touches the object database — with every
   * counter zeroed, instead of rejecting and hiding the session-header git
   * pill. The pill must appear for every repository; degraded is still
   * informative (branch name) where an error would be a blank header.
   */
  async status(request: SdkworkGitStatusRequest): Promise<SdkworkGitStatus> {
    const git = await this.open(request.cwd)
    try {
      const [state, commit] = await Promise.all([
        git.status(),
        git.raw(['rev-parse', 'HEAD']).then(hash => hash.trim()),
      ])
      const diff = await readDiffTotals(git, request.cwd, state)
      return {
        branch: state.current === undefined || state.current === '' ? null : state.current,
        commit,
        dirtyCount: state.files.length,
        behind: state.behind,
        ahead: state.ahead,
        additions: diff.additions,
        deletions: diff.deletions,
      }
    } catch (error: unknown) {
      // Degraded fallback: the ref store alone still names the checked-out
      // branch even while the object database is unreadable, and an unborn
      // HEAD (fresh `git init`, no commit yet) degrades to the null branch.
      const branch = await readRefStoreBranch(git)
      if (branch === undefined) throw commandFailure(error)
      return {
        branch,
        commit: '',
        dirtyCount: 0,
        behind: 0,
        ahead: 0,
        additions: 0,
        deletions: 0,
      }
    }
  }

  /**
   * List one repository's local branches.
   * @param request - the repository directory.
   * @returns the current branch plus the local branch rows, current first then name order.
   */
  async branches(request: SdkworkGitBranchesRequest): Promise<SdkworkGitBranches> {
    const git = await this.open(request.cwd)
    try {
      // One spawn total: the listing's %(HEAD) marker already identifies the
      // checked-out branch, so no separate rev-parse round-trip is needed.
      const listing = await git.raw(['branch', '--format=%(refname:short) %(objectname) %(HEAD)'])
      const branches = listing
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '')
        // Detached HEAD adds a `(HEAD detached at <sha>)` pseudo-row (the
        // refname slot holds it; the trailing %(HEAD) marker is ` *`); it is
        // not a branch, so drop it and report current: null.
        .filter(line => !line.startsWith('(HEAD '))
        .map(parseBranchRow)
        .sort((left, right) => (left.current === right.current
          ? left.name.localeCompare(right.name)
          : left.current ? -1 : 1))
      const current = branches.find(branch => branch.current)?.name ?? null
      return { current, branches }
    } catch (error: unknown) {
      throw commandFailure(error)
    }
  }

  /**
   * Switch one repository to an existing local branch.
   * @param request - the repository directory and the target branch.
   * @returns the branch now checked out.
   */
  async checkout(request: SdkworkGitCheckoutRequest): Promise<SdkworkGitCheckoutValue> {
    const git = await this.open(request.cwd)
    try {
      const listed = await git.raw(['branch', '--list', request.branch, '--format=%(refname:short)'])
      if (listed.trim() === '') {
        throw new SdkworkGitError('checkout-failed', `no local branch "${request.branch}"`)
      }
      await git.checkout([request.branch])
      const branch = await readCurrentBranch(git)
      if (branch === null) {
        throw new SdkworkGitError('checkout-failed', 'HEAD is detached after checkout')
      }
      return { branch }
    } catch (error: unknown) {
      if (error instanceof SdkworkGitError) throw error
      throw new SdkworkGitError(
        'checkout-failed',
        `checkout of "${request.branch}" failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  /**
   * Create one new local branch at HEAD and switch to it.
   * @param request - the repository directory and the new branch name.
   * @returns the branch now checked out.
   */
  async createAndCheckout(request: SdkworkGitCreateRequest): Promise<SdkworkGitCreateValue> {
    const git = await this.open(request.cwd)
    try {
      await git.raw(['check-ref-format', '--branch', request.name])
    } catch (error: unknown) {
      throw new SdkworkGitError(
        'branch-name-invalid',
        `"${request.name}" is not a valid branch name`,
        { cause: error },
      )
    }
    try {
      await git.checkout(['-b', request.name])
      const branch = await readCurrentBranch(git)
      if (branch === null) {
        throw new SdkworkGitError('checkout-failed', 'HEAD is detached after branch create')
      }
      return { branch }
    } catch (error: unknown) {
      throw new SdkworkGitError(
        'checkout-failed',
        `branch create "${request.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  /**
   * Read one repository's recent commit rows with parent topology and ref
   * decorations (HEAD branch, local branches, remote-tracking refs, tags).
   * @param request - the repository directory and an optional row bound.
   * @returns the rows in git's listing order (newest first).
   */
  async log(request: SdkworkGitLogRequest): Promise<SdkworkGitLog> {
    const git = await this.open(request.cwd)
    const limit = request.limit ?? DEFAULT_LOG_LIMIT
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LOG_LIMIT) {
      throw new SdkworkGitError('command-failed', `log limit must be an integer in [1, ${MAX_LOG_LIMIT}]`)
    }
    try {
      const [output, remoteRefs, headBranch, headCommit] = await Promise.all([
        git.raw([
          'log', `--max-count=${limit}`,
          '--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%at%x1f%D%x1f%s',
        ]),
        git.raw(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/']),
        readCurrentBranch(git),
        git.raw(['rev-parse', 'HEAD']).then(hash => hash.trim()),
      ])
      const entries = parseLogRows(output, new Set(splitRefNames(remoteRefs)), headBranch, headCommit)
      return { entries, truncated: entries.length >= limit }
    } catch (error: unknown) {
      throw commandFailure(error)
    }
  }

  /**
   * Record the working tree into one new commit on HEAD. With
   * `includeUnstaged` every unstaged and untracked path is staged first
   * (git add -A); otherwise whatever the index already holds is committed.
   * @param request - the repository directory, the message, and the staging scope.
   * @returns the new commit hash and the branch it landed on.
   */
  async commit(request: SdkworkGitCommitRequest): Promise<SdkworkGitCommitValue> {
    const message = request.message.trim()
    if (message === '') {
      throw new SdkworkGitError('commit-failed', 'commit message must not be empty')
    }
    const git = await this.open(request.cwd)
    try {
      if (request.includeUnstaged) await git.add(['-A'])
      // The empty-tree guard: a commit with nothing staged is a failure the
      // product dialog reports inline (git itself exits nonzero here).
      const summary = await git.commit(message)
      const [commit, branch] = await Promise.all([
        git.revparse(['HEAD']),
        readCurrentBranch(git),
      ])
      if (summary.commit === '' || summary.commit.length < 7) {
        throw new SdkworkGitError('commit-failed', 'git created no commit (nothing staged?)')
      }
      return { commit: commit.trim(), branch }
    } catch (error: unknown) {
      if (error instanceof SdkworkGitError) throw error
      throw new SdkworkGitError(
        'commit-failed',
        `commit failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  /**
   * Push the checked-out branch to its upstream. Pushing without an upstream
   * is rejected at the seam (checked through the branch's config keys, which
   * answers instantly instead of parsing `@{upstream}` stderr output).
   * @param request - the repository directory.
   * @returns the branch pushed and its upstream name.
   */
  async push(request: SdkworkGitPushRequest): Promise<SdkworkGitPushValue> {
    const git = await this.open(request.cwd)
    try {
      const branch = await readCurrentBranch(git)
      if (branch === null) {
        throw new SdkworkGitError('push-failed', 'cannot push a detached HEAD')
      }
      const remote = (await git.raw(['config', `branch.${branch}.remote`])).trim()
      const merge = (await git.raw(['config', `branch.${branch}.merge`])).trim()
      if (remote === '' || merge === '') {
        throw new SdkworkGitError(
          'push-failed',
          `branch "${branch}" has no upstream; push with --set-upstream first`,
        )
      }
      // shortname(refs/heads/<name>) strips the refs/heads/ prefix.
      const upstream = `${remote}/${merge.replace(/^refs\/heads\//, '')}`
      await git.push()
      return { branch, upstream }
    } catch (error: unknown) {
      if (error instanceof SdkworkGitError) throw error
      throw new SdkworkGitError(
        'push-failed',
        `push failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  /**
   * Validate the directory and repository status, and return the git handle
   * for it. Handles are cached per resolved directory: `checkIsRepo` spawns a
   * git subprocess, and the pill's hot refresh path would otherwise pay one
   * extra spawn per call. Cached handles are inert configuration (baseDir +
   * timeout + config), safe to reuse across calls.
   */
  private async open(cwd: string): Promise<SimpleGit> {
    if (!isAbsolute(cwd)) {
      throw new SdkworkGitError('cwd-unreadable', `git cwd must be absolute, got "${cwd}"`)
    }
    const resolved = resolve(cwd)
    const cached = this.handles.get(resolved)
    if (cached !== undefined) return cached
    const directory = statSync(resolved, { throwIfNoEntry: false })
    if (directory === undefined || !directory.isDirectory()) {
      throw new SdkworkGitError('cwd-unreadable', `git cwd does not exist or is not a directory: "${resolved}"`)
    }
    const git = simpleGit({
      baseDir: resolved,
      timeout: { block: GIT_BLOCK_TIMEOUT_MS },
      config: ['core.quotepath=false'],
    })
    if (!await git.checkIsRepo()) {
      throw new SdkworkGitError('not-a-repo', `"${resolved}" is not inside a git repository`)
    }
    this.handles.set(resolved, git)
    return git
  }
}

export default SdkworkGit

/** Project a non-seam git rejection onto the command-failed code. */
function commandFailure(error: unknown): SdkworkGitError {
  if (error instanceof SdkworkGitError) return error
  return new SdkworkGitError(
    'command-failed',
    `git command failed: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  )
}

/** Read the checked-out branch name; null on detached HEAD. */
async function readCurrentBranch(git: SimpleGit): Promise<string | null> {
  const abbreviated = (await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  return abbreviated === 'HEAD' ? null : abbreviated
}

/**
 * Branch name from the ref store alone (`symbolic-ref`), for the degraded
 * status path: unlike `rev-parse` it never resolves the HEAD object, so it
 * still answers while the object database is corrupt or the HEAD commit is
 * missing. Returns null when the ref store itself rejects (detached HEAD) and
 * undefined when even the ref store is unreadable (caller rethrows the
 * original failure).
 */
async function readRefStoreBranch(git: SimpleGit): Promise<string | null | undefined> {
  try {
    const ref = (await git.raw(['symbolic-ref', '--short', 'HEAD'])).trim()
    return ref === '' || ref === 'HEAD' ? null : ref
  } catch {
    return undefined
  }
}

/**
 * Added/deleted line totals across the working-tree diff. Tracked changes
 * come from one `git diff HEAD --numstat` read; untracked files are invisible
 * to it, so their line counts are read directly through Node file I/O instead
 * of spawning one `git diff --numstat --no-index` subprocess per file — that
 * per-file spawn pattern was the dominant status latency on Windows (each
 * git process launch costs tens of milliseconds; a worktree with many new
 * files turned one status read into dozens of sequential spawns).
 */
const DIFF_SNIFF_BYTES = 8_000

/** Upper bound on one untracked file's counted content (matches git's numstat
    treatment of huge files well enough for a summary pill). */
const DIFF_MAX_FILE_LINES = 100_000

async function readDiffTotals(git: SimpleGit, cwd: string, state: StatusResult): Promise<{
  additions: number
  deletions: number
}> {
  const numstat = await git.raw(['diff', 'HEAD', '--numstat'])
  let additions = 0
  let deletions = 0
  const sumRows = (output: string): void => {
    for (const line of output.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '') continue
      const [added = '-', removed = '-'] = trimmed.split('\t')
      // Binary files report '-' in numstat; they contribute nothing to line counts.
      if (added !== '-') additions += Number(added)
      if (removed !== '-') deletions += Number(removed)
    }
  }
  sumRows(numstat)
  // Untracked counts read concurrently through async file I/O: the previous
  // synchronous loop blocked the host event loop for the whole scan (the
  // app froze while the pill refreshed on repos with many new files).
  const untrackedCounts = await Promise.all(
    state.files
      .filter(f => f.index === '?' && f.working_dir === '?')
      .map(file => countTextLines(join(resolve(cwd), file.path.replaceAll('/', sep())))),
  )
  for (const counts of untrackedCounts) {
    additions += counts.additions
    deletions += counts.deletions
  }
  return { additions, deletions }
}

/**
 * Count an untracked file's text lines as additions the way git numstat
 * would. Returns zeros for binary files (a NUL byte inside the sniffed
 * prefix — the same heuristic git applies) and for unreadable paths. Async
 * so a large untracked set never blocks the host event loop.
 */
async function countTextLines(path: string): Promise<{ additions: number; deletions: number }> {
  let handle: Awaited<ReturnType<typeof openAsync>> | undefined
  try {
    handle = await openAsync(path, 'r')
    const sniff = Buffer.alloc(DIFF_SNIFF_BYTES)
    const { bytesRead: sniffed } = await handle.read(sniff, 0, DIFF_SNIFF_BYTES, 0)
    if (sniff.subarray(0, sniffed).includes(0)) return { additions: 0, deletions: 0 }
    let additions = 0
    let last = -1
    let at = 0
    const buffer = Buffer.alloc(DIFF_SNIFF_BYTES)
    while (additions < DIFF_MAX_FILE_LINES) {
      const { bytesRead: read, buffer: filled } = await handle.read(buffer, 0, DIFF_SNIFF_BYTES, at)
      if (read === 0) break
      for (let index = 0; index < read; index += 1) {
        if (filled[index] === 0x0a) {
          additions += 1
          last = at + index
        }
      }
      at += read
      if (read < DIFF_SNIFF_BYTES) break
    }
    // A trailing character without a final newline still terminates one line,
    // matching git's numstat behavior.
    if (last === -1 || at - 1 !== last) additions += 1
    return { additions, deletions: 0 }
  } catch {
    return { additions: 0, deletions: 0 }
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** Platform path separator shim over node:path (kept local for readability). */
function sep(): string {
  return process.platform === 'win32' ? '\\' : '/'
}

/** Split a `for-each-ref` listing into trimmed, non-empty ref names. */
function splitRefNames(listing: string): string[] {
  return listing.split('\n').map(line => line.trim()).filter(line => line !== '')
}

/**
 * Parse one `branch --format=%(refname:short) %(objectname) %(HEAD)` row.
 * Refnames never contain spaces, so the row is `<name> <sha>` with an
 * optional trailing ` *` HEAD marker (the marker renders blank otherwise).
 */
function parseBranchRow(line: string): SdkworkGitBranch {
  const trimmed = line.replace(/\s+$/, '')
  const current = trimmed.endsWith(' *')
  const withoutMarker = current ? trimmed.slice(0, -2) : trimmed
  const spaceAt = withoutMarker.lastIndexOf(' ')
  const name = spaceAt < 0 ? withoutMarker : withoutMarker.slice(0, spaceAt)
  return { name, current }
}

/**
 * Parse one commit's decorations from `log --pretty=format:%D` into the refs
 * groups. Decorations arrive comma-space separated: `origin/main`, `tag:
 * v1.0`, and (git-version dependent) `HEAD -> main`. HEAD parts are skipped
 * either way — the head branch is attributed separately from rev-parse, which
 * does not depend on the decoration format. The remote set classifies
 * decorations that are remote-tracking refs (a local branch may legitimately
 * contain a slash, so the name alone cannot decide it).
 */
function parseDecoration(
  raw: string,
  remoteRefs: ReadonlySet<string>,
): Omit<SdkworkGitLogRefs, 'head'> {
  const branches: string[] = []
  const remotes: string[] = []
  const tags: string[] = []
  for (const part of raw.split(', ')) {
    const decoration = part.trim()
    if (decoration === '' || decoration === 'HEAD' || decoration.startsWith('HEAD -> ')) continue
    if (decoration.startsWith('tag: ')) {
      tags.push(decoration.slice('tag: '.length))
    } else if (remoteRefs.has(decoration)) {
      remotes.push(decoration)
    } else {
      branches.push(decoration)
    }
  }
  return { branches, remotes, tags }
}

/** Parse `log --pretty=format:%x1e…` output: one record per line, newest first. */
function parseLogRows(
  output: string,
  remoteRefs: ReadonlySet<string>,
  headBranch: string | null,
  headCommit: string,
): SdkworkGitLogEntry[] {
  const entries: SdkworkGitLogEntry[] = []
  for (const line of output.split('\n')) {
    const recordAt = line.indexOf(RECORD_SEPARATOR)
    if (recordAt < 0) continue
    const [hash = '', parents = '', author = '', time = '', decorations = '', subject = ''] =
      line.slice(recordAt + 1).split(FIELD_SEPARATOR)
    const refs = parseDecoration(decorations, remoteRefs)
    // The head branch rides the commit HEAD points at. git's %D folds it into
    // the leading `HEAD -> <branch>` part (skipped above), so attribute it
    // explicitly from rev-parse and drop the bare branch name if %D also
    // listed it separately.
    const isHeadRow = hash === headCommit
    const branches = isHeadRow && headBranch !== null
      ? refs.branches.filter(name => name !== headBranch)
      : refs.branches
    entries.push({
      hash,
      parents: parents === '' ? [] : parents.split(' '),
      refs: {
        branches,
        remotes: refs.remotes,
        tags: refs.tags,
        head: isHeadRow ? headBranch : null,
      },
      author,
      time: Number(time) * 1000,
      subject,
    })
  }
  return entries
}

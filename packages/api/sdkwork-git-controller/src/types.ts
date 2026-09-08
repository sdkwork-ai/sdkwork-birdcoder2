/**
 * Wire vocabulary of the SDKWork git Remote namespace. The request shapes are
 * declared here (not re-exported from the seam) so the typert generator
 * resolves every frame member inside the owning package — the same discipline
 * sdkwork-app-build-controller applies. The seam mirrors these shapes
 * structurally; the duplicated block below is that deliberate mirror.
 */
/* jscpd:ignore-start -- deliberate mirror of the sdkwork-git seam vocabulary;
   the typert generator requires every frame member to resolve in-package. */

/** Status request: the repository directory to read. */
export interface SdkworkGitStatusRequest {
  readonly cwd: string
}

/** Branches request: the repository directory to read. */
export interface SdkworkGitBranchesRequest {
  readonly cwd: string
}

/** One local branch row of a repository listing. */
export interface SdkworkGitBranch {
  /** Branch name as git reports it (no `refs/heads/` prefix). */
  readonly name: string
  /** Whether this branch is the currently checked-out one. */
  readonly current: boolean
}

/** Local branch listing of one repository. */
export interface SdkworkGitBranches {
  /** Current checked-out branch, or null on detached HEAD. */
  readonly current: string | null
  /** Local branches; the current branch first, then name order. */
  readonly branches: readonly SdkworkGitBranch[]
}

/** Point-in-time working-tree state of one repository. */
export interface SdkworkGitStatus {
  /** Current checked-out branch, or null on detached HEAD. */
  readonly branch: string | null
  /** Commit hash HEAD points at (full). */
  readonly commit: string
  /** Uncommitted file count: every staged, modified, and untracked path one git status reports. */
  readonly dirtyCount: number
  /** Commits the upstream has that HEAD lacks; 0 without an upstream. */
  readonly behind: number
  /** Commits HEAD has that the upstream lacks; 0 without an upstream. */
  readonly ahead: number
  /** Added lines across the working-tree diff (tracked plus untracked content). */
  readonly additions: number
  /** Deleted lines across the working-tree diff (tracked plus untracked content). */
  readonly deletions: number
}

/** Checkout request: switch one repository to an existing local branch. */
export interface SdkworkGitCheckoutRequest {
  readonly cwd: string
  /** Existing local branch to check out. */
  readonly branch: string
}

/** Checkout acknowledgement: the branch now checked out. */
export interface SdkworkGitCheckoutValue {
  readonly branch: string
}

/** Create-and-checkout request: create one new local branch at HEAD and switch to it. */
export interface SdkworkGitCreateRequest {
  readonly cwd: string
  /** New branch name; must pass git's ref-format check. */
  readonly name: string
}

/** Create-and-checkout acknowledgement: the branch now checked out. */
export interface SdkworkGitCreateValue {
  readonly branch: string
}

/** Ref decorations of one commit (HEAD, local branches, remotes, tags). */
export interface SdkworkGitLogRefs {
  /** Branch name HEAD points at, or null on detached HEAD / no HEAD here. */
  readonly head: string | null
  /** Local branch names decorating the commit. */
  readonly branches: readonly string[]
  /** Remote-tracking ref names (e.g. `origin/main`) decorating the commit. */
  readonly remotes: readonly string[]
  /** Tag names decorating the commit (the `tag: ` prefix stripped). */
  readonly tags: readonly string[]
}

/** One commit row of the graph log. */
export interface SdkworkGitLogEntry {
  /** Commit hash (full). */
  readonly hash: string
  /** Parent hashes, first parent first. */
  readonly parents: readonly string[]
  /** Ref decorations pointing at the commit. */
  readonly refs: SdkworkGitLogRefs
  /** Author name. */
  readonly author: string
  /** Commit time (epoch milliseconds). */
  readonly time: number
  /** Subject line. */
  readonly subject: string
}

/** Graph-log listing of one repository. */
export interface SdkworkGitLog {
  /** Log rows in git's listing order (newest first). */
  readonly entries: readonly SdkworkGitLogEntry[]
  /** True when more commits exist beyond the requested row bound. */
  readonly truncated: boolean
}

/** Graph-log request: one repository's recent commit rows with topology and ref decorations. */
export interface SdkworkGitLogRequest {
  readonly cwd: string
  /** Maximum rows returned; defaults to the capability's bound. */
  readonly limit?: number | undefined
}

/** Commit request: record the working tree into one new commit on HEAD. */
export interface SdkworkGitCommitRequest {
  readonly cwd: string
  /** Commit message as given; whitespace-trimmed before the git call. */
  readonly message: string
  /** Also stage unstaged and untracked paths (git add -A) before committing. */
  readonly includeUnstaged: boolean
}

/** Commit acknowledgement: the new commit hash and the branch it landed on. */
export interface SdkworkGitCommitValue {
  /** Full hash of the commit just created. */
  readonly commit: string
  /** Branch the commit landed on, or null on detached HEAD. */
  readonly branch: string | null
}

/** Push request: update the upstream of the checked-out branch. */
export interface SdkworkGitPushRequest {
  readonly cwd: string
}

/** Push acknowledgement: the branch pushed and its upstream name. */
export interface SdkworkGitPushValue {
  /** The branch that was pushed. */
  readonly branch: string
  /** Upstream ref pushed to (e.g. `origin/main`), or null when unset. */
  readonly upstream: string | null
}

/* jscpd:ignore-end */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The git cwd is missing, not a directory, or not absolute. */
    'git/cwd-unreadable': { readonly code: string }
    /** The git cwd is not inside a git repository. */
    'git/not-a-repo': { readonly code: string }
    /** The requested branch name fails git's ref-format check. */
    'git/branch-name-invalid': { readonly code: string }
    /** The checkout or branch create failed (missing branch, dirty conflicts, unborn HEAD). */
    'git/checkout-failed': { readonly code: string }
    /** The commit failed (empty message, nothing staged, identity missing). */
    'git/commit-failed': { readonly code: string }
    /** The push failed (no upstream, detached HEAD, rejected non-fast-forward, no network). */
    'git/push-failed': { readonly code: string }
    /** A git read command failed or timed out. */
    'git/command-failed': { readonly code: string }
  }
}

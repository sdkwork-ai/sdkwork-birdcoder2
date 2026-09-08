/**
 * Typed port over the generated `sdkworkGit` Remote namespace. The UI
 * component consumes this structural port (never the namespace directly), so
 * focused tests drive a fake while the plugin body maps the wire results onto
 * it — mirroring ui-sdkwork-deploy's build port.
 */
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  SdkworkGitBranches, SdkworkGitLogEntry, SdkworkGitStatus,
} from '@deepseek-ai/dsh-api-sdkwork-git-controller/types'

/** Structural face the branch pill drives over the host git capability. */
export interface SdkworkGitPort {
  /** Read one repository's working-tree state (branch, dirty count, ahead/behind, diff totals). */
  status(cwd: string): Promise<SdkworkGitStatus>
  /** List one repository's local branches, current first. */
  branches(cwd: string): Promise<SdkworkGitBranches>
  /** Check out an existing local branch; resolves with the branch now checked out. */
  checkout(cwd: string, branch: string): Promise<string>
  /** Create a new local branch at HEAD and check it out. */
  createAndCheckout(cwd: string, name: string): Promise<string>
  /** Read recent commit rows with their topology (newest first). */
  log(cwd: string, limit?: number): Promise<readonly SdkworkGitLogEntry[]>
  /** Commit the working tree; optionally stage unstaged and untracked paths first. */
  commit(cwd: string, message: string, includeUnstaged: boolean): Promise<{ commit: string; branch: string | null }>
  /** Push the checked-out branch to its upstream. */
  push(cwd: string): Promise<{ branch: string; upstream: string | null }>
}

/** Wire failure with the Remote result fields flattened into one Error. */
function wireFailure(namespace: string, error: { code: string; message: string }): Error {
  return new Error(`sdkworkGit.${namespace} failed: ${error.code}: ${error.message}`)
}

/**
 * Build the git port from the Client Remote mount, or undefined when the
 * api-remotes assembly carries no `sdkworkGit` namespace (a composition
 * without the controller keeps the pill hidden instead of failing).
 * @param ctx - client root context holding the mounted `remote` service.
 * @returns the port, or undefined when the namespace is absent.
 */
export function sdkworkGitPortOf(ctx: { remote?: unknown }): SdkworkGitPort | undefined {
  const namespace = (ctx.remote as ClientRemote | undefined)?.sdkworkGit
  if (namespace === undefined) return undefined
  return {
    async status(cwd) {
      const result = await namespace.status({ cwd })
      if (!result.ok) throw wireFailure('status', result.error)
      return result.value
    },
    async branches(cwd) {
      const result = await namespace.branches({ cwd })
      if (!result.ok) throw wireFailure('branches', result.error)
      return result.value
    },
    async checkout(cwd, branch) {
      const result = await namespace.checkout({ cwd, branch })
      if (!result.ok) throw wireFailure('checkout', result.error)
      return result.value.branch
    },
    async createAndCheckout(cwd, name) {
      const result = await namespace.createAndCheckout({ cwd, name })
      if (!result.ok) throw wireFailure('createAndCheckout', result.error)
      return result.value.branch
    },
    async log(cwd, limit) {
      const result = await namespace.log(limit === undefined ? { cwd } : { cwd, limit })
      if (!result.ok) throw wireFailure('log', result.error)
      return result.value.entries
    },
    async commit(cwd, message, includeUnstaged) {
      const result = await namespace.commit({ cwd, message, includeUnstaged })
      if (!result.ok) throw wireFailure('commit', result.error)
      return result.value
    },
    async push(cwd) {
      const result = await namespace.push({ cwd })
      if (!result.ok) throw wireFailure('push', result.error)
      return result.value
    },
  }
}

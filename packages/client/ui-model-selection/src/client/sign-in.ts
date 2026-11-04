/**
 * The sign-in gate both model-selection entries share.
 *
 * A provider group the Host marks `requiresSignIn` documents its models while
 * no credential reaches the route — the product obtains that credential when
 * the user signs in. Selecting one of those models therefore asks for the
 * sign-in first, and only submits the selection once the shared catalog has
 * republished the route as routable. The credential can arrive a moment after
 * the sign-in gesture (the Host mirrors the session, then the adapter reloads
 * its catalog), so the wait is a bounded refresh loop rather than one read.
 */

import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from './directory.ts'

/** The product sign-in surface a selection may demand a session from. */
export interface ModelSignInGate {
  /**
   * Ask the user to sign in.
   * @returns true once a session exists, false when the user dismissed the surface.
   */
  requestSignIn(): Promise<boolean>
}

/** The directory state the wait loop reads and reloads. */
export interface SignedInModelDirectory {
  /** The shared directory snapshot the selector renders. */
  readonly store: SnapshotStore<ModelDirectoryState>
  /** Re-read the Host-generation catalog. */
  refresh(): Promise<ModelDirectoryState>
}

/** One route/model pair a selector wants to submit. */
export type ModelRoute = Pick<ModelSelection, 'provider' | 'model'>

/** Bounded wait for the signed-in route to reach the shared catalog. */
export interface SignedInModelWaitOptions {
  /** Longest total wait in milliseconds. */
  timeoutMs?: number
  /** Delay between two catalog reads in milliseconds. */
  pollMs?: number
  /** Minimum delay between two forced catalog reloads in milliseconds. */
  refreshMs?: number
}

/** How long a completed sign-in may take to reach the loaded catalog. */
const DEFAULT_TIMEOUT_MS = 15_000
/** Catalog reads are cheap snapshots; forced reloads are Host round trips. */
const DEFAULT_POLL_MS = 250
/** One forced reload per second covers the Host's mirrored-session poll. */
const DEFAULT_REFRESH_MS = 1_000

/**
 * Whether the loaded catalog still withholds this route behind a sign-in.
 * @param state - the session's directory snapshot.
 * @param route - provider and model the user wants.
 * @returns true when the route is advertised only as a sign-in preview.
 */
export function requiresSignIn(state: ModelDirectoryState, route: ModelRoute): boolean {
  const group = state.groups.find(candidate => candidate.id === route.provider)
  if (group === undefined) return false
  return group.requiresSignIn === true && group.models.some(model => model.id === route.model)
}

/** Whether the loaded catalog advertises the route as ordinarily selectable. */
function isRoutable(state: ModelDirectoryState, route: ModelRoute): boolean {
  const group = state.groups.find(candidate => candidate.id === route.provider)
  if (group === undefined || group.requiresSignIn === true) return false
  return group.models.some(model => model.id === route.model)
}

/**
 * Wait until a model the user picked stops being a sign-in preview.
 *
 * A route the catalog never listed at all is left to the Host to reject: only
 * the `requiresSignIn` state is this gate's business.
 *
 * @param directory - the session's shared directory.
 * @param route - provider and model the user picked.
 * @param options - bounded wait knobs; defaults cover a mirrored-session poll.
 * @returns true once the catalog advertises the route as selectable.
 */
export async function waitForSignedInModel(
  directory: SignedInModelDirectory,
  route: ModelRoute,
  options: SignedInModelWaitOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const refreshMs = options.refreshMs ?? DEFAULT_REFRESH_MS
  const deadline = Date.now() + timeoutMs
  let nextRefresh = 0
  for (;;) {
    const state = directory.store.getSnapshot()
    if (isRoutable(state, route)) return true
    if (Date.now() >= deadline) return false
    if (Date.now() >= nextRefresh) {
      nextRefresh = Date.now() + refreshMs
      await directory.refresh()
    }
    await new Promise<void>((resolve) => { setTimeout(resolve, pollMs) })
  }
}

/**
 * Reactive Token Bank account state shared by the Token Plan page and the
 * points dialogs.
 *
 * The catalog page only knows the Membership points asset; BirdCoder's points
 * are the Token Bank compute-credit account, so the balance has to be read from
 * the account-app client. A store keeps that read outside React render, lets
 * every surface subscribe to one settled figure, and gives the recharge and
 * redemption paths a single refresh point after the gateway has credited the
 * account.
 */

import { useSyncExternalStore } from 'react'
import type { TokenPlanComputeAccount } from './token-plan-service.ts'

/** Lifecycle of the account read that backs the points surfaces. */
export type TokenPlanAccountStatus = 'signed-out' | 'loading' | 'ready' | 'error'

/** One immutable view of the account read. */
export interface TokenPlanAccountSnapshot {
  /** Whether the read belongs to a guest, is in flight, settled, or failed. */
  status: TokenPlanAccountStatus
  /** Spendable points; `null` while unknown or unreported. */
  points: number | null
  /** Full wallet facts for surfaces that need the available/frozen split. */
  account: TokenPlanComputeAccount | undefined
}

/** Observable Token Bank account read consumed by the page and dialogs. */
export interface TokenPlanAccountStore {
  /** Current immutable snapshot. */
  getSnapshot(): TokenPlanAccountSnapshot
  /** Observe snapshot changes. */
  subscribe(listener: () => void): () => void
  /**
   * Re-read the account. A signed-out caller settles to `signed-out` without a
   * request; a signed-in caller keeps its last settled balance on screen while
   * the new read is in flight.
   */
  refresh(): Promise<void>
}

/** Inputs the store needs from the Token Plan service. */
export interface CreateTokenPlanAccountStoreOptions {
  /** Read the signed-in account's Token Bank wallet. */
  read: () => Promise<TokenPlanComputeAccount | undefined>
  /** Whether an IAM session exists right now. */
  signedIn: () => boolean
}

const SIGNED_OUT_SNAPSHOT: TokenPlanAccountSnapshot = {
  account: undefined,
  points: null,
  status: 'signed-out',
}

const LOADING_SNAPSHOT: TokenPlanAccountSnapshot = {
  account: undefined,
  points: null,
  status: 'loading',
}

/**
 * Create a Token Bank account store.
 * @param options - the wallet read and the live session predicate.
 * @returns the observable account store.
 */
export function createTokenPlanAccountStore(
  options: CreateTokenPlanAccountStoreOptions,
): TokenPlanAccountStore {
  const listeners = new Set<() => void>()
  let snapshot: TokenPlanAccountSnapshot = options.signedIn()
    ? LOADING_SNAPSHOT
    : SIGNED_OUT_SNAPSHOT
  let sequence = 0

  function publish(next: TokenPlanAccountSnapshot): void {
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  async function refresh(): Promise<void> {
    const request = ++sequence
    if (!options.signedIn()) {
      publish(SIGNED_OUT_SNAPSHOT)
      return
    }
    // A settled balance stays visible while a re-read runs; only a read that
    // starts from an error or a previous account shows the loading state.
    if (snapshot.status !== 'ready' && snapshot.status !== 'loading') {
      publish(LOADING_SNAPSHOT)
    }
    try {
      const account = await options.read()
      if (request !== sequence) return
      if (account === undefined) {
        publish(SIGNED_OUT_SNAPSHOT)
        return
      }
      publish({
        account,
        points: account.available ?? null,
        status: 'ready',
      })
    } catch {
      if (request !== sequence) return
      // Keep the last settled figure on a failed refresh so a transient gateway
      // error does not blank a balance the user just saw.
      publish({
        account: snapshot.account,
        points: snapshot.points,
        status: 'error',
      })
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refresh,
  }
}

function subscribeNever(): () => void {
  return () => undefined
}

function getSignedOutSnapshot(): TokenPlanAccountSnapshot {
  return SIGNED_OUT_SNAPSHOT
}

/**
 * Subscribe a component to a store, falling back to the signed-out snapshot
 * when the host did not provide one.
 * @param store - the account store, when configured.
 * @returns the current snapshot.
 */
export function useTokenPlanAccount(
  store: TokenPlanAccountStore | undefined,
): TokenPlanAccountSnapshot {
  return useSyncExternalStore(
    store?.subscribe ?? subscribeNever,
    store?.getSnapshot ?? getSignedOutSnapshot,
    store?.getSnapshot ?? getSignedOutSnapshot,
  )
}

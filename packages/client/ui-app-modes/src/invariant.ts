/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-app-modes`.
 * @module @deepseek-ai/dsh-client-ui-app-modes/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-app-modes'

/** Cordis companion plugin name. */
export const name = 'client-ui-app-modes-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the mode state lives in the layout store's declared
 * action set (the store spec is the write gate), the settings scope validates
 * and publishes the durable section, and the rail's active entry follows the
 * same store channel AppFrame reads. Store/mode agreement is covered directly
 * by this package's client and Host behavior specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */

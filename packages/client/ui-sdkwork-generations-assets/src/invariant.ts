/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-sdkwork-generations-assets`.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-generations-assets/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-sdkwork-generations-assets'

/** Cordis companion plugin name. */
export const name = 'client-ui-sdkwork-generations-assets-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package contributes keyed rail and page entries
 * whose ownership is already authoritative in the slot registry, while the
 * assets adapter has no independent host relationship to compare against.
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

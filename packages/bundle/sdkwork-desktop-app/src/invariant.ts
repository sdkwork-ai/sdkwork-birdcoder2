/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-sdkwork-desktop-app`.
 * @module @deepseek-ai/dsh-sdkwork-desktop-app/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-sdkwork-desktop-app'

/** Cordis companion plugin name. */
export const name = 'desktop-app-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the bundle is a patch layer plus prompt-section glue —
 * it owns no mutable cross-plugin relation of its own (the carrier swap's
 * route/fallback symmetry is audited by the sdkwork-desktop-carrier package's
 * invariant, and prompt-section lifecycle belongs to the systemPrompt
 * service). Its real-composition behavior is exercised by the bundle's
 * composition spec.
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

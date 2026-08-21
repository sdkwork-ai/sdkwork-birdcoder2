/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-sdkwork-updater`.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-updater/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-sdkwork-updater'

/** Cordis companion plugin name. */
export const name = 'client-ui-sdkwork-updater-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure presentation plugin — it emits no cordis events
 * and owns no cross-plugin mutable state; the bridge surface it renders is
 * asserted by the component specs and the registrations by the plugin spec.
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

/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-sdkwork-feedback`.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-feedback/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-sdkwork-feedback'

/** Cordis companion plugin name. */
export const name = 'client-ui-sdkwork-feedback-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the feedback seam swap is a service call
 * (`ctx.feedback.setSource`) whose contract the settings menu consumes
 * unchanged, submission outcomes flow through the appstore client's own
 * error envelope, and the dialog mounts through the standard keyed overlay
 * slot. Availability/session agreement is covered directly by this
 * package's client behavior specs.
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

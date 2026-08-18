/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-sdkwork-env-bootstrap`.
 * @module @deepseek-ai/dsh-sdkwork-env-bootstrap/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-sdkwork-env-bootstrap'

/** Cordis companion plugin name. */
export const name = 'sdkwork-env-bootstrap-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package owns no durable package-local event
 * stream; the overlay file effect is covered by unit tests, and env-file
 * parsing stays in the canonical `@sdkwork/iam-credential-entry` package.
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

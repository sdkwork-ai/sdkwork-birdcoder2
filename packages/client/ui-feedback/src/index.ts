/** Host registration for the ui-feedback plugin. */

import type { Context } from '@deepseek-ai/cordis'

/**
 * The feedback plugin owns no settings namespace: the collector base URL,
 * app key, and static access token come from the shared ui-env profile (see
 * @deepseek-ai/dsh-client-ui-env), so a deployment switches environments in
 * one place. Nothing to register on the host plane.
 * @param ctx - Host context (unused; kept for the plugin contract).
 */
export function apply(ctx: Context): void {
  void ctx
}

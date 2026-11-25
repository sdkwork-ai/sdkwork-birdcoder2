/**
 * Host Loader entry for the SDKWork message-center plugin: it declares the
 * polling interval and page size the browser half receives through its synced
 * Config. The Host performs no notification I/O; the browser calls the app
 * notification API directly with the signed-in session's credentials.
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { MessageCenterConfig } from './types.ts'

/** Host Config type: both fields volatile so a `cordis.yml` change reaches open pages. */
export type Config = MessageCenterConfig

/** Validated runtime settings shared with the browser face. */
export const Config = Schema.object({
  pollIntervalMs: Schema.natural().min(1).max(2_147_483_647).default(60_000).volatile(),
  pageSize: Schema.natural().min(1).max(200).default(20).volatile(),
})

/**
 * Register the browser plugin without Host behavior; the Loader validates the
 * entry's Config, and the browser face receives its volatile fields.
 * @param _ctx - Host context; unused.
 * @param _config - validated Config; unused on the Host.
 */
export function apply(_ctx: Context, _config: Config): void {}

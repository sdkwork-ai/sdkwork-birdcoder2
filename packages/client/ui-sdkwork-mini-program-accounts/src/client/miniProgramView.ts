/**
 * Compatibility re-exports for the mini-program account view helpers.
 *
 * The record model, the tolerant row projection, and the panel copy now live in
 * `@sdkwork/iam-pc-mini-program` (the shared component). This module stays as a
 * thin host-facing alias so the plugin keeps one import surface for the pieces
 * a harness test or a host adapter may read.
 */
export {
  MINI_PROGRAM_ACCOUNT_KIND,
  MINI_PROGRAM_PROVIDER_CODE,
  resolveMiniProgramMessages,
  toMiniProgramAccount,
  type MiniProgramAccount,
  type MiniProgramProviderConfig,
} from '@sdkwork/iam-pc-mini-program'

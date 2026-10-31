/**
 * Public contract of `@sdkwork/birdcoder2-pad-core`.
 *
 * Surface: `pad`. Layer role: `frontend-core`.
 * App SDK and appbase app SDK wrappers live here; backend SDK wrappers never do
 * (APP_PAD_ARCHITECTURE_SPEC.md section 8).
 */
export * from './host/index.js'
export * from './session/index.js'
export * from './sdk/index.js'
export * from './window-class.js'

export const packageId = '@sdkwork/birdcoder2-pad-core' as const

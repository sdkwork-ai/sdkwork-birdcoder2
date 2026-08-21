import { clientBundle, type BuildFaceConfig } from '../tsdown.client.ts'

const base = clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-feedback', ['lib/types/index.js', 'lib/types/invariant.js'])

/**
 * The package tsconfig maps `@sdkwork/*` to local declaration facades
 * (sdkwork-types/) so the tsc emit never pulls the sdkwork source. The
 * bundle must inline the REAL packages instead, so it swaps in a tsconfig
 * without those paths (node_modules resolution).
 */
const withRealSdkwork: BuildFaceConfig = (env) => base(env).map(config => ({
  ...config,
  tsconfig: 'tsconfig.bundle.json',
}))

export default withRealSdkwork

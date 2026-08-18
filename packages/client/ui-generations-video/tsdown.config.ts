import { clientBundle, type BuildFaceConfig } from '../tsdown.client.ts'

const base = clientBundle('@deepseek-ai/dsh-client-ui-generations-video', ['lib/types/index.js', 'lib/types/invariant.js'])

/** Bundle against the real SDKWork packages instead of declaration facades. */
const withRealSdkwork: BuildFaceConfig = env => base(env).map(config => ({
  ...config,
  tsconfig: 'tsconfig.bundle.json',
}))

export default withRealSdkwork

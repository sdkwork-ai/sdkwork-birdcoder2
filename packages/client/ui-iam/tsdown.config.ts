import { fileURLToPath } from 'node:url'
import { clientBundle, type BuildFaceConfig } from '../tsdown.client.ts'

/**
 * The package tsconfig maps `@sdkwork/*` to local declaration facades
 * (sdkwork-types/) so the tsc emit never pulls the sdkwork source. The
 * bundle must inline the REAL packages instead, so both phases swap in a
 * tsconfig without those paths (node_modules resolution).
 */
const base = clientBundle('@deepseek-ai/dsh-client-ui-iam', ['lib/types/index.js', 'lib/types/invariant.js'])

/** Virtual id for plain (non-module) stylesheets inside the sdkwork closure. */
const PLAIN_CSS_PREFIX = '\0dsh-sdkwork-css:'
// tsdown's css guard matches ids ending in .css, so the virtual id must not.
const PLAIN_CSS_SUFFIX = '.mjs'

const withRealSdkwork: BuildFaceConfig = (env) => base(env).map(config => ({
  ...config,
  tsconfig: 'tsconfig.bundle.json',
  plugins: [
    ...(config.plugins ?? []),
    {
      // qrcode's package browser field (entry remap + fs:false) is not
      // applied by rolldown's resolution for this closure; the node
      // renderers would drag fs/stream/zlib requires into the browser
      // bundle and the module-table loader rejects them. Pin the browser
      // entry explicitly.
      name: 'dsh-sdkwork-qrcode-browser',
      resolveId(source: string) {
        if (source !== 'qrcode') return null
        return fileURLToPath(new URL('./node_modules/qrcode/lib/browser.js', import.meta.url))
      },
    },
    {
      // The sdkwork closure ships one plain stylesheet (appbase-pc-react's
      // AppErrorPage). Its page never mounts in this harness, the auth
      // surfaces' classes are Tailwind utilities, and the client pipeline
      // virtualizes module css only — so plain sdkwork css resolves to an
      // empty module instead of tripping the tsdown css guard.
      name: 'dsh-sdkwork-plain-css-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
        if (importer === undefined || !importer.includes('sdkwork')) return null
        return PLAIN_CSS_PREFIX + source + PLAIN_CSS_SUFFIX
      },
      load(id: string) {
        if (!id.startsWith(PLAIN_CSS_PREFIX)) return null
        return ''
      },
    },
  ],
}))

export default withRealSdkwork

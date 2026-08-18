import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientBundle, type BuildFaceConfig } from '../tsdown.client.ts'

const base = clientBundle('@deepseek-ai/dsh-client-ui-token-plan', ['lib/types/index.js', 'lib/types/invariant.js'])
const PLAIN_CSS_PREFIX = '\0dsh-token-plan-css:'
const PLAIN_CSS_SUFFIX = '.mjs'

const withRealSdkwork: BuildFaceConfig = (env) => base(env).map(config => ({
  ...config,
  tsconfig: 'tsconfig.bundle.json',
  plugins: [
    ...(config.plugins ?? []),
    {
      name: 'dsh-token-plan-qrcode-browser',
      resolveId(source: string) {
        if (source !== 'qrcode') return null
        return fileURLToPath(new URL('../ui-iam/node_modules/qrcode/lib/browser.js', import.meta.url))
      },
    },
    {
      name: 'dsh-token-plan-plain-css-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
        if (importer === undefined || !importer.includes('sdkwork')) return null
        const cssPath = isAbsolute(source) ? source : resolvePath(dirname(importer), source)
        return PLAIN_CSS_PREFIX + cssPath + PLAIN_CSS_SUFFIX
      },
      async load(id: string) {
        if (!id.startsWith(PLAIN_CSS_PREFIX)) return null
        const cssPath = id.slice(PLAIN_CSS_PREFIX.length, -PLAIN_CSS_SUFFIX.length)
        const css = await readFile(cssPath, 'utf8')
        return `const css = ${JSON.stringify(css)}\nif (typeof document !== 'undefined') {\n  const style = document.createElement('style')\n  style.dataset.plugin = '@deepseek-ai/dsh-client-ui-token-plan'\n  style.textContent = css\n  document.head.append(style)\n}\nexport default css\n`
      },
    },
  ],
}))

export default withRealSdkwork

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { clientBundle } from '../tsdown.client.ts'

// fflate's Node entry probes `worker_threads` through createRequire at module
// evaluation; the browser module table has no `module` row, so the probe kills
// the whole client bundle. The deps inliner resolves with Node semantics and
// would inline that entry regardless of resolve conditions — mark the
// specifier neverBundle and hand the browser entry to the bundler explicitly.
const require = createRequire(import.meta.url)
const fflateBrowserEntry = join(dirname(require.resolve('fflate')), '../esm/browser.js')

const base = clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-deploy', ['lib/types/index.js'])

export default (inlineConfig: unknown, meta: unknown) => {
  const configs = (base as (inlineConfig: unknown, meta: unknown) => Array<Record<string, any>>)(
    inlineConfig, meta,
  )
  return configs.map((config) => {
    if (config.name !== '@deepseek-ai/dsh-client-ui-sdkwork-deploy/client') return config
    return {
      ...config,
      plugins: [
        ...(config.plugins ?? []),
        {
          name: 'dsh-deploy-fflate-browser',
          resolveId: {
            order: 'pre' as const,
            handler(source: string) {
              if (source !== 'fflate') return null
              return fflateBrowserEntry
            },
          },
        },
      ],
    }
  })
}

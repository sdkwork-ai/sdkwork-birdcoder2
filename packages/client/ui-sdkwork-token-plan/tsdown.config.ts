import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, optimize } from '@tailwindcss/node'
import { Scanner, type SourceEntry } from '@tailwindcss/oxide'
import { clientBundle, tailwindResolvers, type BuildFaceConfig } from '../tsdown.client.ts'
import { createSdkworkBrowserBuiltinsPlugin } from '../sdkwork-browser-builtins.ts'

const tailwindResolver = tailwindResolvers(import.meta.url)

const base = clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-token-plan', ['lib/types/index.js', 'lib/types/invariant.js'])
const PACKAGE_ROOT = fileURLToPath(new URL('./', import.meta.url))
const TOKEN_PLAN_CSS = resolvePath(PACKAGE_ROOT, 'src/client/tokenPlan.css')
const SPACE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const TAILWIND_PREFIX = '\0dsh-token-plan-tailwind:'
const BROWSER_BUILTIN_PREFIX = '\0dsh-token-plan-browser-builtin:'
const PLAIN_CSS_PREFIX = '\0dsh-token-plan-css:'
const VIRTUAL_SUFFIX = '.mjs'

const TOKEN_PLAN_SOURCE_ROOTS = [
  resolvePath(PACKAGE_ROOT, 'src/client'),
  resolvePath(SPACE_ROOT, 'sdkwork-membership/apps/sdkwork-membership-pc/packages/sdkwork-membership-pc-subscription/src'),
  resolvePath(SPACE_ROOT, 'sdkwork-order/apps/sdkwork-order-pc/packages/sdkwork-order-pc-checkout/src'),
  resolvePath(SPACE_ROOT, 'sdkwork-order/apps/sdkwork-order-pc/packages/sdkwork-order-pc-recharge/src'),
  resolvePath(SPACE_ROOT, 'sdkwork-ui/sdkwork-ui-pc-react/src'),
]

interface ResolverContext {
  addWatchFile(id: string): void
  resolve(source: string, importer?: string, options?: { skipSelf?: boolean }): Promise<{ id: string } | null>
}

function virtualStyleModule(id: string, css: string): string {
  return [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(id)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    "  tag.dataset.plugin = '@deepseek-ai/dsh-client-ui-sdkwork-token-plan';",
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    'export default css;',
  ].join('\n')
}

function physicalCssPath(source: string, importer: string | undefined): string | undefined {
  const normalizedSource = source.replaceAll('\\', '/')
  // The page imports `./tokenPlan.css`; match the file name regardless of the
  // spelling (relative, directory-qualified, or absolute) the bundler passes.
  if (normalizedSource.endsWith('tokenPlan.css')) {
    return TOKEN_PLAN_CSS
  }
  if (isAbsolute(source)) return source
  if (source.startsWith('.') && importer !== undefined) return resolvePath(dirname(importer), source)
  return undefined
}

async function readPlainCss(cssPath: string, seen: Set<string>): Promise<string> {
  if (seen.has(cssPath)) return ''
  seen.add(cssPath)
  const source = await readFile(cssPath, 'utf8')
  const imported = source.replaceAll(
    /@import\s+["']([^"']+)["']\s*;/g,
    (match, specifier: string) => {
      if (!specifier.startsWith('.')) return match
      return readPlainCss(resolvePath(dirname(cssPath), specifier), seen)
    },
  )
  return imported
    .replaceAll(/^@source\s+[^;]+;/gmu, '')
    .replaceAll(/^@variant\s+[^;]+;/gmu, '')
    .replaceAll(/^@custom-variant\s+[^;]+;/gmu, '')
}

const withRealSdkwork: BuildFaceConfig = (env) => base(env).map(config => ({
  ...config,
  tsconfig: 'tsconfig.bundle.json',
  define: config.platform === 'browser'
    ? {
        ...config.define,
        'import.meta.hot': 'undefined',
        'import.meta.url': 'globalThis.location.href',
      }
    : config.define,
  outputOptions: config.platform === 'browser'
    ? { ...config.outputOptions, codeSplitting: false }
    : config.outputOptions,
  plugins: [
    // These run before the preset's CSS plugins: dsh-css-global-inline would
    // claim tokenPlan.css first and emit its Tailwind @imports verbatim, which
    // the packaged app serves as a 404.
    createSdkworkBrowserBuiltinsPlugin('dsh-token-plan-browser-builtins', BROWSER_BUILTIN_PREFIX, VIRTUAL_SUFFIX),
    {
      name: 'dsh-token-plan-qrcode-browser',
      resolveId(source: string) {
        if (source !== 'qrcode') return null
        return fileURLToPath(new URL('../ui-sdkwork-iam/node_modules/qrcode/lib/browser.js', import.meta.url))
      },
    },
    {
      name: 'dsh-token-plan-tailwind-css',
      resolveId(source: string, importer: string | undefined) {
        const physical = physicalCssPath(source, importer)
        if (physical !== TOKEN_PLAN_CSS) return null
        return TAILWIND_PREFIX + TOKEN_PLAN_CSS + VIRTUAL_SUFFIX
      },
      async load(this: ResolverContext, id: string) {
        if (!id.startsWith(TAILWIND_PREFIX)) return null
        const cssPath = id.slice(TAILWIND_PREFIX.length, -VIRTUAL_SUFFIX.length)
        const dependencies = new Set<string>([cssPath])
        const source = await readFile(cssPath, 'utf8')
        const compiler = await compile(source, {
          base: dirname(cssPath),
          customCssResolver: tailwindResolver.css,
          customJsResolver: tailwindResolver.js,
          onDependency: dependency => { dependencies.add(dependency) },
        })
        const sources: SourceEntry[] = [
          ...compiler.sources,
          ...TOKEN_PLAN_SOURCE_ROOTS.map(root => ({ base: root, pattern: '**/*', negated: false })),
        ]
        const scanner = new Scanner({ sources })
        const candidates = scanner.scan()
        const compiled = optimize(compiler.build(candidates), { minify: true }).code
        for (const file of scanner.files) dependencies.add(file)
        for (const glob of scanner.globs) dependencies.add(glob.base)
        for (const entry of sources) dependencies.add(entry.base)
        for (const dependency of dependencies) this.addWatchFile(dependency)
        return virtualStyleModule('@deepseek-ai/dsh-client-ui-sdkwork-token-plan/token-plan.css', compiled)
      },
    },
    {
      name: 'dsh-token-plan-plain-css-inline',
      async resolveId(this: ResolverContext, source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
        const physical = physicalCssPath(source, importer)
        const resolved = physical === undefined
          ? await this.resolve(source, importer, { skipSelf: true })
          : { id: physical }
        if (resolved === null || resolved.id === TOKEN_PLAN_CSS) return null
        if (importer === undefined || !importer.includes('sdkwork')) return null
        return PLAIN_CSS_PREFIX + resolved.id + VIRTUAL_SUFFIX
      },
      async load(this: ResolverContext, id: string) {
        if (!id.startsWith(PLAIN_CSS_PREFIX)) return null
        const cssPath = id.slice(PLAIN_CSS_PREFIX.length, -VIRTUAL_SUFFIX.length)
        this.addWatchFile(cssPath)
        return virtualStyleModule(
          '@deepseek-ai/dsh-client-ui-sdkwork-token-plan/' + cssPath,
          await readPlainCss(cssPath, new Set()),
        )
      },
    },
    ...(config.plugins ?? []),
  ],
}))

export default withRealSdkwork

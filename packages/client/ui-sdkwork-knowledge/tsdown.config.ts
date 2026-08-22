import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, optimize } from '@tailwindcss/node'
import { Scanner, type SourceEntry } from '@tailwindcss/oxide'
import { clientBundle, tailwindResolvers, type BuildFaceConfig } from '../tsdown.client.ts'
import { createSdkworkBrowserBuiltinsPlugin } from '../sdkwork-browser-builtins.ts'

const tailwindResolver = tailwindResolvers(import.meta.url)

const base = clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-knowledge', ['lib/types/index.js', 'lib/types/invariant.js'])
const SDKWORK_ROOT = fileURLToPath(new URL('../../../../sdkwork-knowledgebase/', import.meta.url))
const KNOWLEDGEBASE_CSS = resolvePath(SDKWORK_ROOT, 'apps/sdkwork-knowledgebase-pc/src/index.css')
const KNOWLEDGEBASE_COMPONENT_PACKAGE = resolvePath(
  SDKWORK_ROOT,
  'apps/sdkwork-knowledgebase-pc/packages/sdkwork-knowledgebase-pc-knowledgebase/package.json',
)
const sdkworkRequire = createRequire(KNOWLEDGEBASE_COMPONENT_PACKAGE)
const sdkworkRouterDom = sdkworkRequire.resolve('react-router-dom')
const sdkworkRouter = createRequire(sdkworkRouterDom).resolve('react-router')
const SDKWORK_CONTEXT_ALIASES = {
  i18next: sdkworkRequire.resolve('i18next'),
  'react-i18next': sdkworkRequire.resolve('react-i18next'),
  'react-router': sdkworkRouter,
  'react-router-dom': sdkworkRouterDom,
}
const TAILWIND_PREFIX = '\0dsh-knowledge-tailwind:'
const PDF_WORKER_PREFIX = '\0dsh-knowledge-pdf-worker:'
const BROWSER_BUILTIN_PREFIX = '\0dsh-knowledge-browser-builtin:'
const PLAIN_CSS_PREFIX = '\0dsh-knowledge-css:'
const VIRTUAL_SUFFIX = '.mjs'

const KNOWLEDGEBASE_SOURCE_ROOTS = [
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-knowledgebase-pc/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-knowledgebase-pc/packages/sdkwork-knowledgebase-pc-knowledgebase/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-knowledgebase-pc/packages/sdkwork-knowledgebase-pc-commons/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-knowledgebase-pc/packages/sdkwork-knowledgebase-pc-knowledge/src'),
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
    "  tag.dataset.plugin = '@deepseek-ai/dsh-client-ui-sdkwork-knowledge';",
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    'export default css;',
  ].join('\n')
}

function physicalCssPath(source: string, importer: string | undefined): string | undefined {
  const normalizedSource = source.replaceAll('\\', '/')
  if (normalizedSource.endsWith('/sdkwork-knowledgebase/apps/sdkwork-knowledgebase-pc/src/index.css')) {
    return KNOWLEDGEBASE_CSS
  }
  if (isAbsolute(source)) return source
  if (source.startsWith('.') && importer !== undefined) return resolvePath(dirname(importer), source)
  return undefined
}

const withRealSdkwork: BuildFaceConfig = (env) => base(env).map(config => ({
  ...config,
  tsconfig: 'tsconfig.bundle.json',
  alias: config.platform === 'browser'
    ? { ...config.alias, ...SDKWORK_CONTEXT_ALIASES }
    : config.alias,
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
    ...(config.plugins ?? []),
    createSdkworkBrowserBuiltinsPlugin('dsh-knowledge-browser-builtins', BROWSER_BUILTIN_PREFIX, VIRTUAL_SUFFIX),
    {
      name: 'dsh-knowledge-pdf-worker-url',
      async resolveId(this: ResolverContext, source: string, importer: string | undefined) {
        if (source !== 'pdfjs-dist/build/pdf.worker.min.mjs?url') return null
        const resolved = await this.resolve(source.slice(0, -'?url'.length), importer, { skipSelf: true })
        if (resolved === null) throw new Error('ui-sdkwork-knowledge: pdf.js worker module is not resolvable')
        return PDF_WORKER_PREFIX + resolved.id + VIRTUAL_SUFFIX
      },
      async load(this: ResolverContext, id: string) {
        if (!id.startsWith(PDF_WORKER_PREFIX)) return null
        const workerPath = id.slice(PDF_WORKER_PREFIX.length, -VIRTUAL_SUFFIX.length)
        this.addWatchFile(workerPath)
        const workerSource = await readFile(workerPath, 'utf8')
        return [
          `const source = ${JSON.stringify(workerSource)};`,
          "const workerUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'",
          "  ? URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))",
          "  : 'data:text/javascript,export%20{}';",
          'export default workerUrl;',
        ].join('\n')
      },
    },
    {
      name: 'dsh-knowledge-tailwind-css',
      resolveId(source: string, importer: string | undefined) {
        const physical = physicalCssPath(source, importer)
        if (physical !== KNOWLEDGEBASE_CSS) return null
        return TAILWIND_PREFIX + KNOWLEDGEBASE_CSS + VIRTUAL_SUFFIX
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
          ...KNOWLEDGEBASE_SOURCE_ROOTS.map(root => ({ base: root, pattern: '**/*', negated: false })),
        ]
        const scanner = new Scanner({ sources })
        const candidates = scanner.scan()
        const compiled = optimize(compiler.build(candidates), { minify: true }).code
        for (const file of scanner.files) dependencies.add(file)
        for (const glob of scanner.globs) dependencies.add(glob.base)
        for (const entry of sources) dependencies.add(entry.base)
        for (const dependency of dependencies) this.addWatchFile(dependency)
        return virtualStyleModule('@deepseek-ai/dsh-client-ui-sdkwork-knowledge/knowledgebase-index.css', compiled)
      },
    },
    {
      name: 'dsh-knowledge-plain-css-inline',
      async resolveId(this: ResolverContext, source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
        const physical = physicalCssPath(source, importer)
        const resolved = physical === undefined
          ? await this.resolve(source, importer, { skipSelf: true })
          : { id: physical }
        if (resolved === null || resolved.id === KNOWLEDGEBASE_CSS) return null
        if (importer === undefined || !importer.includes('sdkwork')) return null
        return PLAIN_CSS_PREFIX + resolved.id + VIRTUAL_SUFFIX
      },
      async load(this: ResolverContext, id: string) {
        if (!id.startsWith(PLAIN_CSS_PREFIX)) return null
        const cssPath = id.slice(PLAIN_CSS_PREFIX.length, -VIRTUAL_SUFFIX.length)
        this.addWatchFile(cssPath)
        return virtualStyleModule('@deepseek-ai/dsh-client-ui-sdkwork-knowledge/' + cssPath, await readFile(cssPath, 'utf8'))
      },
    },
  ],
}))

export default withRealSdkwork

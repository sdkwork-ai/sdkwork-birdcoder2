import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, optimize } from '@tailwindcss/node'
import { Scanner, type SourceEntry } from '@tailwindcss/oxide'
import { clientBundle, type BuildFaceConfig } from '../tsdown.client.ts'
import { createSdkworkBrowserBuiltinsPlugin } from '../sdkwork-browser-builtins.ts'

const base = clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-generations-video', ['lib/types/index.js', 'lib/types/invariant.js'])
const SDKWORK_ROOT = fileURLToPath(new URL('../../../../sdkwork-agents/', import.meta.url))
const CREATIVE_CSS = resolvePath(SDKWORK_ROOT, 'apps/sdkwork-agents-pc/src/index.css')
const CREATIVE_COMPONENT_PACKAGE = resolvePath(
  SDKWORK_ROOT,
  'apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-creative/package.json',
)
const sdkworkRequire = createRequire(CREATIVE_COMPONENT_PACKAGE)
const SDKWORK_CONTEXT_ALIASES = {
  i18next: sdkworkRequire.resolve('i18next'),
  'react-i18next': sdkworkRequire.resolve('react-i18next'),
}
const TAILWIND_PREFIX = '\0dsh-creative-tailwind:'
const BROWSER_BUILTIN_PREFIX = '\0dsh-creative-browser-builtin:'
const PLAIN_CSS_PREFIX = '\0dsh-creative-css:'
const VIRTUAL_SUFFIX = '.mjs'

const CREATIVE_SOURCE_ROOTS = [
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-agents-pc/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-creative/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-commons/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-core/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-inspiration/src'),
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
    "  tag.dataset.plugin = '@deepseek-ai/dsh-client-ui-sdkwork-generations-video';",
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    'export default css;',
  ].join('\n')
}

function physicalCssPath(source: string, importer: string | undefined): string | undefined {
  const normalizedSource = source.replaceAll('\\', '/')
  if (normalizedSource.endsWith('/sdkwork-agents/apps/sdkwork-agents-pc/src/index.css')) {
    return CREATIVE_CSS
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
    createSdkworkBrowserBuiltinsPlugin('dsh-creative-browser-builtins', BROWSER_BUILTIN_PREFIX, VIRTUAL_SUFFIX),
    {
      name: 'dsh-creative-tailwind-css',
      resolveId(source: string, importer: string | undefined) {
        const physical = physicalCssPath(source, importer)
        if (physical !== CREATIVE_CSS) return null
        return TAILWIND_PREFIX + CREATIVE_CSS + VIRTUAL_SUFFIX
      },
      async load(this: ResolverContext, id: string) {
        if (!id.startsWith(TAILWIND_PREFIX)) return null
        const cssPath = id.slice(TAILWIND_PREFIX.length, -VIRTUAL_SUFFIX.length)
        const dependencies = new Set<string>([cssPath])
        const source = await readFile(cssPath, 'utf8')
        const compiler = await compile(source, {
          base: dirname(cssPath),
          onDependency: dependency => { dependencies.add(dependency) },
        })
        const sources: SourceEntry[] = [
          ...compiler.sources,
          ...CREATIVE_SOURCE_ROOTS.map(root => ({ base: root, pattern: '**/*', negated: false })),
        ]
        const scanner = new Scanner({ sources })
        const candidates = scanner.scan()
        const compiled = optimize(compiler.build(candidates), { minify: true }).code
        for (const file of scanner.files) dependencies.add(file)
        for (const glob of scanner.globs) dependencies.add(glob.base)
        for (const entry of sources) dependencies.add(entry.base)
        for (const dependency of dependencies) this.addWatchFile(dependency)
        return virtualStyleModule('@deepseek-ai/dsh-client-ui-sdkwork-generations-video/creative-index.css', compiled)
      },
    },
    {
      name: 'dsh-creative-plain-css-inline',
      async resolveId(this: ResolverContext, source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
        const physical = physicalCssPath(source, importer)
        const resolved = physical === undefined
          ? await this.resolve(source, importer, { skipSelf: true })
          : { id: physical }
        if (resolved === null || resolved.id === CREATIVE_CSS) return null
        if (importer === undefined || !importer.includes('sdkwork')) return null
        return PLAIN_CSS_PREFIX + resolved.id + VIRTUAL_SUFFIX
      },
      async load(this: ResolverContext, id: string) {
        if (!id.startsWith(PLAIN_CSS_PREFIX)) return null
        const cssPath = id.slice(PLAIN_CSS_PREFIX.length, -VIRTUAL_SUFFIX.length)
        this.addWatchFile(cssPath)
        return virtualStyleModule(
          '@deepseek-ai/dsh-client-ui-sdkwork-generations-video/' + cssPath,
          await readPlainCss(cssPath, new Set()),
        )
      },
    },
  ],
}))

export default withRealSdkwork

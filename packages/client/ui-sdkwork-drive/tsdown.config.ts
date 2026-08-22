import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, optimize } from '@tailwindcss/node'
import { Scanner, type SourceEntry } from '@tailwindcss/oxide'
import { clientBundle, tailwindResolvers, type BuildFaceConfig } from '../tsdown.client.ts'
import { createSdkworkBrowserBuiltinsPlugin } from '../sdkwork-browser-builtins.ts'

const tailwindResolver = tailwindResolvers(import.meta.url)

const base = clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-drive', ['lib/types/index.js', 'lib/types/invariant.js'])
const SDKWORK_ROOT = fileURLToPath(new URL('../../../../sdkwork-drive/', import.meta.url))
const DRIVE_CSS = resolvePath(SDKWORK_ROOT, 'apps/sdkwork-drive-pc/src/index.css')
const TAILWIND_PREFIX = '\0dsh-drive-tailwind:'
const BROWSER_BUILTIN_PREFIX = '\0dsh-drive-browser-builtin:'
const PLAIN_CSS_PREFIX = '\0dsh-drive-css:'
const VIRTUAL_SUFFIX = '.mjs'

const DRIVE_SOURCE_ROOTS = [
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-drive-pc/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-drive-pc/packages/sdkwork-drive-pc-drive/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-drive-pc/packages/sdkwork-drive-pc-file/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-drive-pc/packages/sdkwork-drive-pc-transfer/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-drive-pc/packages/sdkwork-drive-pc-commons/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-drive-pc/packages/sdkwork-drive-pc-core/src'),
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
    "  tag.dataset.plugin = '@deepseek-ai/dsh-client-ui-sdkwork-drive';",
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    'export default css;',
  ].join('\n')
}

function physicalCssPath(source: string, importer: string | undefined): string | undefined {
  const normalizedSource = source.replaceAll('\\', '/')
  if (normalizedSource.endsWith('/sdkwork-drive/apps/sdkwork-drive-pc/src/index.css')) {
    return DRIVE_CSS
  }
  if (isAbsolute(source)) return source
  if (source.startsWith('.') && importer !== undefined) return resolvePath(dirname(importer), source)
  return undefined
}

/**
 * Resolve a plain stylesheet's relative `@import` chain and drop the Tailwind
 * compile-time directives (`@source`, `@variant`, `@custom-variant`) the
 * browser does not understand. The inlined result becomes one style tag.
 */
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
    ...(config.plugins ?? []),
    createSdkworkBrowserBuiltinsPlugin('dsh-drive-browser-builtins', BROWSER_BUILTIN_PREFIX, VIRTUAL_SUFFIX),
    {
      name: 'dsh-drive-tailwind-css',
      resolveId(source: string, importer: string | undefined) {
        const physical = physicalCssPath(source, importer)
        if (physical !== DRIVE_CSS) return null
        return TAILWIND_PREFIX + DRIVE_CSS + VIRTUAL_SUFFIX
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
          ...DRIVE_SOURCE_ROOTS.map(root => ({ base: root, pattern: '**/*', negated: false })),
        ]
        const scanner = new Scanner({ sources })
        const candidates = scanner.scan()
        const compiled = optimize(compiler.build(candidates), { minify: true }).code
        for (const file of scanner.files) dependencies.add(file)
        for (const glob of scanner.globs) dependencies.add(glob.base)
        for (const entry of sources) dependencies.add(entry.base)
        for (const dependency of dependencies) this.addWatchFile(dependency)
        return virtualStyleModule('@deepseek-ai/dsh-client-ui-sdkwork-drive/drive-index.css', compiled)
      },
    },
    {
      name: 'dsh-drive-plain-css-inline',
      async resolveId(this: ResolverContext, source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
        const physical = physicalCssPath(source, importer)
        const resolved = physical === undefined
          ? await this.resolve(source, importer, { skipSelf: true })
          : { id: physical }
        if (resolved === null || resolved.id === DRIVE_CSS) return null
        if (importer === undefined || !importer.includes('sdkwork')) return null
        return PLAIN_CSS_PREFIX + resolved.id + VIRTUAL_SUFFIX
      },
      async load(this: ResolverContext, id: string) {
        if (!id.startsWith(PLAIN_CSS_PREFIX)) return null
        const cssPath = id.slice(PLAIN_CSS_PREFIX.length, -VIRTUAL_SUFFIX.length)
        this.addWatchFile(cssPath)
        return virtualStyleModule(
          '@deepseek-ai/dsh-client-ui-sdkwork-drive/' + cssPath,
          await readPlainCss(cssPath, new Set()),
        )
      },
    },
  ],
}))

export default withRealSdkwork

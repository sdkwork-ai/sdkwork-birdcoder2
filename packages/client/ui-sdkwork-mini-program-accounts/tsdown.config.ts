import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, optimize } from '@tailwindcss/node'
import { Scanner, type SourceEntry } from '@tailwindcss/oxide'
import { clientBundle, tailwindResolvers, type BuildFaceConfig } from '../tsdown.client.ts'
import { createSdkworkBrowserBuiltinsPlugin } from '../sdkwork-browser-builtins.ts'
import {
  MINI_PROGRAM_EMBED_CSS_LAYER,
  MINI_PROGRAM_EMBED_PORTAL_LIMIT,
  MINI_PROGRAM_EMBED_PORTAL_SCOPE,
  MINI_PROGRAM_EMBED_SCOPE,
} from './src/client/embedScope.ts'

const tailwindResolver = tailwindResolvers(import.meta.url)

const base = clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts', ['lib/types/index.js'])
const PACKAGE_ROOT = fileURLToPath(new URL('./', import.meta.url))
const SPACE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const VIEW_CSS = resolvePath(PACKAGE_ROOT, 'src/client/miniProgramView.css')
const TAILWIND_PREFIX = '\0dsh-mini-program-tailwind:'
const PLAIN_CSS_PREFIX = '\0dsh-mini-program-css:'
const BROWSER_BUILTIN_PREFIX = '\0dsh-mini-program-browser-builtin:'
const VIRTUAL_SUFFIX = '.mjs'

/** Source roots whose utilities the view compiles (mirrors the @source rows in miniProgramView.css). */
const VIEW_SOURCE_ROOTS = [
  resolvePath(PACKAGE_ROOT, 'src/client'),
  resolvePath(SPACE_ROOT, 'sdkwork-iam/apps/sdkwork-iam-pc/packages/sdkwork-iam-pc-mini-program/src'),
  resolvePath(SPACE_ROOT, 'sdkwork-ui/sdkwork-ui-pc-react/src'),
  resolvePath(SPACE_ROOT, 'sdkwork-appbase/packages/pc-react/foundation/sdkwork-i18n-pc-react/src'),
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
    "  tag.dataset.plugin = '@deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts';",
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    'export default css;',
  ].join('\n')
}

function physicalCssPath(source: string, importer: string | undefined): string | undefined {
  const normalizedSource = source.replaceAll('\\', '/')
  // The plugin imports `./miniProgramView.css`; match the file name regardless
  // of the spelling (relative, directory-qualified, or absolute) the bundler
  // passes.
  if (normalizedSource.endsWith('miniProgramView.css')) {
    return VIEW_CSS
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

/**
 * Contain the compiled sheet in the embed's cascade layer and scopes.
 *
 * Every fork bundle that styles with Tailwind compiles its own `@layer
 * utilities` from its own sources, so this sheet shares class names with
 * sheets whose variant sets differ — and within one layer document order
 * decides, which would leave the dialog at the mercy of bundle load order.
 * The layer is declared last by `apps/web/src/index.css`, so it outranks
 * `utilities` and the fork's shared `dsh-sdkwork-embedded-app` layer regardless
 * of which bundle loaded last; the scopes keep that priority from reaching any
 * other surface.
 *
 * The sheet is emitted twice because a scoped style rule cannot match its own
 * scope root: the dialog subtree is scoped to its own root, while the overlays
 * the panel portals to `document.body` carry their utilities on the portaled
 * element itself and so are scoped to the body, limited to everything outside
 * the application mount point.
 * @param css - compiled embed stylesheet text inlined into the client bundle.
 * @returns the sheet wrapped in the embed's layer and scopes.
 */
function containViewTailwindCss(css: string): string {
  return `@layer ${MINI_PROGRAM_EMBED_CSS_LAYER}{`
    + `@scope (${MINI_PROGRAM_EMBED_SCOPE}){${css}}`
    + `@scope (${MINI_PROGRAM_EMBED_PORTAL_SCOPE}) to (${MINI_PROGRAM_EMBED_PORTAL_LIMIT}){${css}}`
    + '}'
}

const withRealSdkwork: BuildFaceConfig = (env) => base(env).map(config => ({
  ...config,
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
    // These run before the preset's CSS plugins so the Tailwind compile claims
    // miniProgramView.css first: dsh-css-global-inline would otherwise inline
    // the sheet verbatim and its bare @import/@source directives would ship
    // unresolved into a <style> tag.
    createSdkworkBrowserBuiltinsPlugin('dsh-mini-program-browser-builtins', BROWSER_BUILTIN_PREFIX, VIRTUAL_SUFFIX),
    {
      name: 'dsh-mini-program-tailwind-css',
      resolveId(source: string, importer: string | undefined) {
        const physical = physicalCssPath(source, importer)
        if (physical !== VIEW_CSS) return null
        return TAILWIND_PREFIX + VIEW_CSS + VIRTUAL_SUFFIX
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
          ...VIEW_SOURCE_ROOTS.map(root => ({ base: root, pattern: '**/*', negated: false })),
        ]
        const scanner = new Scanner({ sources })
        const candidates = scanner.scan()
        const compiled = containViewTailwindCss(optimize(compiler.build(candidates), { minify: true }).code)
        for (const file of scanner.files) dependencies.add(file)
        for (const glob of scanner.globs) dependencies.add(glob.base)
        for (const entry of sources) dependencies.add(entry.base)
        for (const dependency of dependencies) this.addWatchFile(dependency)
        return virtualStyleModule('@deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts/mini-program-view.css', compiled)
      },
    },
    {
      name: 'dsh-mini-program-plain-css-inline',
      async resolveId(this: ResolverContext, source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
        const physical = physicalCssPath(source, importer)
        const resolvedCss = physical === undefined
          ? await this.resolve(source, importer, { skipSelf: true })
          : { id: physical }
        if (resolvedCss === null || resolvedCss.id === VIEW_CSS) return null
        if (importer === undefined || !importer.includes('sdkwork')) return null
        return PLAIN_CSS_PREFIX + resolvedCss.id + VIRTUAL_SUFFIX
      },
      async load(this: ResolverContext, id: string) {
        if (!id.startsWith(PLAIN_CSS_PREFIX)) return null
        const cssPath = id.slice(PLAIN_CSS_PREFIX.length, -VIRTUAL_SUFFIX.length)
        this.addWatchFile(cssPath)
        return virtualStyleModule(
          '@deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts/' + cssPath,
          await readPlainCss(cssPath, new Set()),
        )
      },
    },
    ...(config.plugins ?? []),
  ],
}))

export default withRealSdkwork

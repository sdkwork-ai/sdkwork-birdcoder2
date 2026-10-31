import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, optimize } from '@tailwindcss/node'
import { Scanner, type SourceEntry } from '@tailwindcss/oxide'
import {
  clientBundle,
  embedAppStylesheetInLayer,
  EMBEDDED_APPSTORE_CSS_LAYER,
  tailwindResolvers,
  type BuildFaceConfig,
} from '../tsdown.client.ts'
import { createSdkworkBrowserBuiltinsPlugin } from '../sdkwork-browser-builtins.ts'

const tailwindResolver = tailwindResolvers(import.meta.url)

const base = clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-markets', ['lib/types/index.js'])
const SDKWORK_ROOT = fileURLToPath(new URL('../../../../sdkwork-appstore/', import.meta.url))
const APPSTORE_CSS = resolvePath(SDKWORK_ROOT, 'apps/sdkwork-appstore-pc/src/index.css')
const APPSTORE_COMPONENT_PACKAGE = resolvePath(
  SDKWORK_ROOT,
  'apps/sdkwork-appstore-pc/packages/sdkwork-appstore-pc-embed/package.json',
)
// The create-expert flow embeds the SDKWork Agents PC sources (a second
// sibling checkout), so its tailwind sheet compiles beside the App Store one.
const AGENTS_ROOT = fileURLToPath(new URL('../../../../sdkwork-agents/', import.meta.url))
const AGENTS_CSS = resolvePath(AGENTS_ROOT, 'apps/sdkwork-agents-pc/src/index.css')
const sdkworkRequire = createRequire(APPSTORE_COMPONENT_PACKAGE)
// The embedded market pages mix router usage across two installs: the host
// surface's <MemoryRouter> and the experts cards'/search bar's useNavigate()
// must read one router context. Without a pin, the host import resolves
// through this workspace's copy while the sdkwork-appstore checkout's own
// sources keep their inlined copy — two React contexts, and useNavigate()
// throws "may be used only in the context of a <Router>" at mount. Alias both
// specifiers to the host package's single resolution (same pin as
// ui-sdkwork-appstore's bundle).
const sdkworkRouterDom = sdkworkRequire.resolve('react-router-dom')
const sdkworkRouter = createRequire(sdkworkRouterDom).resolve('react-router')
const APPSTORE_RUNTIME_SRC = resolvePath(
  SDKWORK_ROOT,
  'apps/sdkwork-appstore-pc/packages/sdkwork-appstore-pc-runtime/src',
)
const APPSTORE_RUNTIME_ENTRY = fileURLToPath(new URL('./sdkwork-appstore-pc-runtime-entry.ts', import.meta.url))
/** Host imports runtime directly but does not declare it; alias to source so the bundle inlines instead of emitting a loader external. */
const SDKWORK_PACKAGE_ALIASES = {
  '@sdkwork/appstore-pc-runtime': APPSTORE_RUNTIME_ENTRY,
  '@sdkwork/appstore-pc-runtime/environment': resolvePath(APPSTORE_RUNTIME_SRC, 'environment.ts'),
  '@sdkwork/appstore-pc-runtime/runtime': resolvePath(APPSTORE_RUNTIME_SRC, 'runtime.ts'),
  '@sdkwork/appstore-pc-runtime/session': resolvePath(APPSTORE_RUNTIME_SRC, 'sessionStore.ts'),
  '@sdkwork/appstore-pc-runtime/authConfig': resolvePath(APPSTORE_RUNTIME_SRC, 'authConfig.ts'),
  '@sdkwork/appstore-pc-runtime/credentialEntry': resolvePath(APPSTORE_RUNTIME_SRC, 'credentialEntry.ts'),
}
// qrcode declares a browser mapping (`fs: false`, node main to lib/browser) but
// the CJS bundle does not apply a dependency's nested browser map, so a bare
// `qrcode` import would inline the Node main and load require("fs") at boot.
// The sdkwork-auth surfaces import the bare root; resolve it to the browser
// entry (canvas/svg renderers, no builtins) through ui-sdkwork-iam, the package
// that declares the dependency.
const sdkworkIamRequire = createRequire(fileURLToPath(
  // ui-sdkwork-iam is this package's sibling (`packages/client/*`), and it is
  // the package that declares `qrcode`, so its own node_modules is the only
  // place the browser entry is guaranteed to resolve from.
  new URL('../ui-sdkwork-iam/package.json', import.meta.url),
))
const SDKWORK_CONTEXT_ALIASES = {
  ...SDKWORK_PACKAGE_ALIASES,
  i18next: sdkworkRequire.resolve('i18next'),
  'react-i18next': sdkworkRequire.resolve('react-i18next'),
  qrcode: sdkworkIamRequire.resolve('qrcode/lib/browser.js'),
  // One react-router instance per bundle (see the pin note above).
  'react-router': sdkworkRouter,
  'react-router-dom': sdkworkRouterDom,
}
const TAILWIND_PREFIX = '\0dsh-markets-tailwind:'
const PLAIN_CSS_PREFIX = '\0dsh-markets-css:'
const RAW_ASSET_PREFIX = '\0dsh-markets-raw:'
const VIRTUAL_SUFFIX = '.mjs'

/**
 * Tailwind v4 source sheets open with `@import "tailwindcss"` or `@plugin`;
 * a browser style tag cannot resolve either, so such sheets are compiled
 * instead of inlined verbatim.
 */
const TAILWIND_SOURCE = /^@import\s+["']tailwindcss["']|^@plugin\s+/m

const APPSTORE_SOURCE_ROOTS = [
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-appstore-pc/src'),
  resolvePath(SDKWORK_ROOT, 'apps/sdkwork-appstore-pc/packages'),
]

/**
 * The Agents create-flow sheet's scan roots. The sheet's own `@source` lines
 * cover the Agents PC packages; these add the cross-repo UI packages the
 * editor's panels render (model picker, memory picker, Drive image upload),
 * whose class names live in other sibling checkouts.
 */
const AGENTS_SOURCE_ROOTS = [
  resolvePath(AGENTS_ROOT, 'apps/sdkwork-agents-pc/src'),
  resolvePath(AGENTS_ROOT, 'apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-agents/src'),
  resolvePath(AGENTS_ROOT, 'apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-commons/src'),
  resolvePath(AGENTS_ROOT, 'apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-core/src'),
  resolvePath(fileURLToPath(new URL('../../../../sdkwork-models/', import.meta.url)), 'apps/sdkwork-models-pc/packages/sdkwork-models-pc-picker/src'),
  resolvePath(fileURLToPath(new URL('../../../../sdkwork-memory/', import.meta.url)), 'apps/sdkwork-memory-pc/packages/sdkwork-memory-pc-commons/src'),
  resolvePath(fileURLToPath(new URL('../../../../sdkwork-drive/', import.meta.url)), 'apps/sdkwork-drive-pc/packages/sdkwork-drive-pc-upload-image/src'),
]

/** Each embedded tailwind sheet: its file, its scan roots, and its embed options. */
interface EmbeddedSheet {
  cssPath: string
  sourceRoots: readonly string[]
  /** The utilities' `@scope` root; the sheet's preflight stays unscoped. */
  scope: string
  layer: string
}

const EMBEDDED_SHEETS: readonly EmbeddedSheet[] = [
  {
    cssPath: APPSTORE_CSS,
    sourceRoots: APPSTORE_SOURCE_ROOTS,
    scope: '[data-markets-surface]',
    layer: EMBEDDED_APPSTORE_CSS_LAYER,
  },
  {
    cssPath: AGENTS_CSS,
    sourceRoots: AGENTS_SOURCE_ROOTS,
    // The create flow renders under the SdkworkHostThemeSurface whose root
    // carries this marker, so its utilities never leak into the host chrome.
    scope: '[data-sdk-surface="experts-create"]',
    layer: 'dsh-sdkwork-agents-create-embed',
  },
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
    "  tag.dataset.plugin = '@deepseek-ai/dsh-client-ui-sdkwork-markets';",
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    'export default css;',
  ].join('\n')
}

function physicalCssPath(source: string, importer: string | undefined): string | undefined {
  const normalizedSource = source.replaceAll('\\', '/')
  for (const sheet of EMBEDDED_SHEETS) {
    if (normalizedSource.endsWith(sheet.cssPath.replaceAll('\\', '/'))) return sheet.cssPath
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

async function compileTailwindCss(this: ResolverContext, cssPath: string): Promise<string> {
  const sheet = EMBEDDED_SHEETS.find(candidate => candidate.cssPath === cssPath)
  if (sheet === undefined) throw new Error(`ui-sdkwork-markets: unregistered tailwind sheet ${cssPath}`)
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
    ...sheet.sourceRoots.map(root => ({ base: root, pattern: '**/*', negated: false })),
  ]
  const scanner = new Scanner({ sources })
  const candidates = scanner.scan()
  const compiled = embedAppStylesheetInLayer(
    optimize(compiler.build(candidates), { minify: true }).code,
    { layer: sheet.layer, scope: sheet.scope, splitUtilities: true },
  )
  for (const file of scanner.files) dependencies.add(file)
  for (const glob of scanner.globs) dependencies.add(glob.base)
  for (const entry of sources) dependencies.add(entry.base)
  for (const dependency of dependencies) this.addWatchFile(dependency)
  return compiled
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
    createSdkworkBrowserBuiltinsPlugin('dsh-markets-browser-builtins', '\0dsh-markets-browser-builtin:', VIRTUAL_SUFFIX),
    {
      // Vite's `?raw` convention, which the joined Agents PC closure uses for
      // inline SVG sources (the model picker's vendor icons): load the file
      // and export its text, the same module shape Vite produces. Rolldown on
      // Windows would otherwise try to open the literal `?raw` path.
      name: 'dsh-markets-raw-assets',
      async resolveId(this: ResolverContext, source: string, importer: string | undefined) {
        if (!source.endsWith('?raw')) return null
        const resolved = await this.resolve(source.slice(0, -'?raw'.length), importer, { skipSelf: true })
        return resolved === null ? null : RAW_ASSET_PREFIX + resolved.id
      },
      async load(this: ResolverContext, id: string) {
        if (!id.startsWith(RAW_ASSET_PREFIX)) return null
        const filePath = id.slice(RAW_ASSET_PREFIX.length)
        this.addWatchFile(filePath)
        return `export default ${JSON.stringify(await readFile(filePath, 'utf8'))}`
      },
    },
    {
      name: 'dsh-markets-tailwind-css',
      resolveId(source: string, importer: string | undefined) {
        const physical = physicalCssPath(source, importer)
        const sheet = EMBEDDED_SHEETS.find(candidate => candidate.cssPath === physical)
        if (sheet === undefined) return null
        return TAILWIND_PREFIX + sheet.cssPath + VIRTUAL_SUFFIX
      },
      async load(this: ResolverContext, id: string) {
        if (!id.startsWith(TAILWIND_PREFIX)) return null
        const cssPath = id.slice(TAILWIND_PREFIX.length, -VIRTUAL_SUFFIX.length)
        const compiled = await compileTailwindCss.call(this, cssPath)
        return virtualStyleModule(`@deepseek-ai/dsh-client-ui-sdkwork-markets/${cssPath.replaceAll('\\', '/')}`, compiled)
      },
    },
    {
      name: 'dsh-markets-plain-css-inline',
      async resolveId(this: ResolverContext, source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
        const physical = physicalCssPath(source, importer)
        const resolved = physical === undefined
          ? await this.resolve(source, importer, { skipSelf: true })
          : { id: physical }
        if (resolved === null) return null
        if (EMBEDDED_SHEETS.some(sheet => sheet.cssPath === resolved.id)) return null
        if (importer === undefined || !importer.includes('sdkwork')) return null
        return PLAIN_CSS_PREFIX + resolved.id + VIRTUAL_SUFFIX
      },
      async load(this: ResolverContext, id: string) {
        if (!id.startsWith(PLAIN_CSS_PREFIX)) return null
        const cssPath = id.slice(PLAIN_CSS_PREFIX.length, -VIRTUAL_SUFFIX.length)
        this.addWatchFile(cssPath)
        const source = await readFile(cssPath, 'utf8')
        const css = TAILWIND_SOURCE.test(source)
          ? await compileTailwindCss.call(this, cssPath)
          : await readPlainCss(cssPath, new Set())
        return virtualStyleModule(
          '@deepseek-ai/dsh-client-ui-sdkwork-markets/' + cssPath,
          css,
        )
      },
    },
  ],
}))

export default withRealSdkwork

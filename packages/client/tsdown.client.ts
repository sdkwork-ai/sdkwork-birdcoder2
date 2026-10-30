/**
 * Shared tsdown preset for UI plugin client bundles. Emits a closure-factory
 * artifact: the bundle calls window.__ModuleLoader__.load({id, factory})
 * and resolves externals through the injected require (loader module table —
 * cordis DI entities, no globals, no import map). Dynamic imports inline into
 * the single artifact (`inlineDynamicImports`): a code-split chunk's relative
 * require has no module-table answer. CSS is compiled by
 * lightningcss inside the bundle: `x.module.css` yields its hashed class map
 * and injects a tagged style at factory execution, while `x.css?inline`
 * exports compiled text for a plugin-owned lifecycle effect. The virtual
 * loaders register each real stylesheet as a watch dependency. Images under
 * `src/client/assets/`, imported from Client code or referenced by relative
 * `url()` in the package's own stylesheets, are emitted under `lib/assets/`
 * with their content revision in the file name and become document-relative
 * URLs served by the
 * client-modules asset route; such a package exports `./assets/*` as
 * `./lib/assets/*`, and its Node Client face rejects asset imports.
 * Non-experimental client outputs reject experimental module and stylesheet
 * inputs, including origins recorded by chained source maps.
 */
import { randomBytes } from 'node:crypto'
import { readFile, readdir, rm, rmdir, stat, utimes } from 'node:fs/promises'
import { existsSync, globSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire, isBuiltin } from 'node:module'
import { basename, dirname, extname, isAbsolute, join, posix, relative, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Rolldown, type TsdownPlugin, type UserConfig } from 'tsdown'
import { transform, type CustomAtRules, type Url, type Visitor } from 'lightningcss'
import { compile as tailwindCompile, optimize as tailwindOptimize } from '@tailwindcss/node'
import { Scanner as TailwindScanner, type SourceEntry as TailwindSourceEntry } from '@tailwindcss/oxide'
import {
  PACKAGE_ASSET_EXPORT,
  PACKAGE_ASSET_EXPORT_TARGET,
  PACKAGE_ASSET_FILES_ENTRY,
  PACKAGE_ASSET_MEDIA_TYPES,
  packageAssetMediaType,
  packageAssetReference,
  packageAssetRevision,
  packageAssetRevisionedPath,
} from './modules/src/assets.ts'
import { optionalStringArray } from './modules/src/client/manifest.ts'
import { PLATFORM_MODULES, PRELOADED_CLIENT_EXTERNALS } from './web/src/platform.ts'
import { clientBuildEnvironmentDefines, clientBuildValueDefines } from '../../scripts/client-build-environment.ts'
import { readBuildFace, type TsdownBuildFaceMeta } from '../../scripts/tsdown-build-face.ts'
import { isExperimentalPackageName } from '../../scripts/experimental-package-policy.ts'
import { BundleInputIsolation, physicalBundleInput } from '../../scripts/bundle-input-isolation.ts'

/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline
 * (which requires @tsdown/css). The suffix matters: tsdown's guard matches ids
 * ending in `.css`, so the virtual id must not.
 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const GLOBAL_CSS_VIRTUAL_PREFIX = '\0dsh-global-css:'
const INLINE_CSS_VIRTUAL_PREFIX = '\0dsh-inline-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'
const INLINE_CSS_QUERY = '?inline'

/**
 * Emit one plugin-owned style injector and an optional CSS Modules export.
 * @param css - JavaScript expression yielding the stylesheet text; see {@link stylesheetSource}.
 */
function styleInjectionModule(
  id: string,
  fileId: string,
  css: string,
  classMap?: Readonly<Record<string, string>>,
): string {
  const source = [
    `const css = ${css};`,
    `const tagId = ${JSON.stringify(`${id}/${basename(fileId)}`)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
  ]
  source.push(classMap === undefined ? 'export {};' : `export default ${JSON.stringify(classMap)};`)
  return source.join('\n')
}

/**
 * Cascade containment for the sheets host packages inline from external
 * SDKWork applications: the layer statement, the optional late family layer,
 * and the per-surface scope. Kept in its own pure module so the stylesheet
 * contract can be tested — and exercised in a real browser — without loading
 * the bundler.
 */
export {
  EMBEDDED_APP_CSS_LAYER,
  EMBEDDED_APP_LAYER_ORDER,
  EMBEDDED_APPSTORE_CSS_LAYER,
  embedAppStylesheetInLayer,
  scopeStyleSheetUtilities,
  type EmbeddedAppStyleOptions,
} from './embedded-app-styles.ts'

/**
 * Vendored framework libraries: rescoped into @deepseek-ai, so the gate below
 * would read them as plugin packages. They carry no cross-plugin runtime
 * identity to share — the framework itself is a requested module-table row
 * (external), while these are ordinary libraries a browser bundle inlines.
 */
const VENDORED_LIBRARY = /^@deepseek-ai\/(?:(?:cosmokit|schemastery)(?:\/|$)|cordis-plugin-timer$)/

/** Generated descriptor/codec contribution with no shared runtime identity. */
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

/**
 * Contract layers and pure folds a client bundle may inline: browser-safe
 * values with no runtime identity to share (no Symbol/instanceof/singleton state).
 * Everything else under @deepseek-ai/* is either a module-table entry
 * (external) or a leak the purity gate rejects.
 */
export const INLINE_SAFE = /^(?:@deepseek-ai\/dsh-(?:brand|deque|file-reference|host-apiproxy|llm|official-bundles|output-retention|session|tools|typert-protocol|util-crypto|util-time|util-values|util-workspace-path)(?:\/|$)|@deepseek-ai\/dsh-client-sdkwork-office(?:\/|$)|@deepseek-ai\/dsh-util-file-drag$|@deepseek-ai\/dsh-token-meter\/client$|@deepseek-ai\/dsh-commands\/builtin$|@deepseek-ai\/dsh-native-command\/types$|@deepseek-ai\/dsh-host-open-in-app\/shared$|@deepseek-ai\/dsh-plugin-manager\/registry$|@deepseek-ai\/dsh-agent-preset-registry\/display$|@deepseek-ai\/dsh-api-workspace-controller\/default-workspace$|@deepseek-ai\/dsh-spill-policy\/notice$)/

/**
 * Workspace mode replaces an empty config array with the root defaults. A
 * falsey entry instead removes this package before entry resolution.
 */
const SKIP_WORKSPACE_BUILD: UserConfig = { entry: '' }

/**
 * Loader-table plugin external: ui-sdkwork-iam provides the authenticated-mode page
 * shell and gate used by every SDKWork-backed mode page (drive, appstore,
 * knowledge, video, image, assets). The module loader's `stripClientSuffix`
 * resolves `require("@deepseek-ai/dsh-client-ui-sdkwork-iam/client")` to the
 * `@deepseek-ai/dsh-client-ui-sdkwork-iam` factory — no platform seed row needed.
 * ui-sdkwork-iam is an immediately-tier row: its factory is registered before any
 * dependent consumer bundle materializes.
 */
const IAM_CLIENT_EXEMPTION = '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'

/**
 * Externals resolved from the loader module table: the platform seed entries
 * plus documented loader-table exemptions for cross-plugin shared modules.
 */
export const CLIENT_EXTERNALS: readonly string[] = [
  ...PLATFORM_MODULES, IAM_CLIENT_EXEMPTION,
]

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Source aliases for the root specifier of every `@sdkwork/*` workspace
 * package, derived from the `@sdkwork/*` entries of `tsconfig.base.json`
 * paths (the single source of truth for sibling source resolution). The
 * release runner clones the pinned siblings without `node_modules`, so bare
 * specifiers imported from sibling sources cannot resolve through the
 * node_modules walk-up and would surface as runtime externals the loader
 * table cannot answer; aliasing the package root to its pinned source entry
 * makes the browser bundle compile it identically everywhere.
 *
 * Subpath specifiers (`@sdkwork/x/y`) are deliberately NOT aliased: the
 * packages' `exports` maps point each subpath at its real file (which does
 * not always sit at `src/<subpath>`), and the workspace member links under
 * the harness install resolve those exports on the runner exactly like
 * locally. Aliasing subpaths to `src/*` would hijack that correct mapping.
 * @returns Alias map of package roots to their source entry.
 */
function sdkworkSourceAliases(): Record<string, string> {
  // tsconfig.base.json is JSONC (// comments); strip line comments before parsing.
  const source = readFileSync(join(REPOSITORY_ROOT, 'tsconfig.base.json'), 'utf8')
    .split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')
  const baseConfig = JSON.parse(source) as {
    compilerOptions?: { paths?: Record<string, readonly string[]> }
  }
  const aliases: Record<string, string> = {}
  for (const [specifier, targets] of Object.entries(baseConfig.compilerOptions?.paths ?? {})) {
    if (!specifier.startsWith('@sdkwork/') || specifier.endsWith('/*')) continue
    const target = targets[0]
    if (typeof target !== 'string') continue
    aliases[specifier] = resolvePath(REPOSITORY_ROOT, target)
  }
  // ui-sdkwork-token-plan imports three ui-pc-react subpaths whose package
  // exports point at dist builds the release runner does not carry; their
  // source files sit at src/<subpath>, so map them explicitly. Keep this list
  // in sync with the subpaths the packaged bundles actually import (the
  // sdkwork import-coverage gate reports any drift).
  const UI_PC_REACT_SRC = resolvePath(REPOSITORY_ROOT, '../sdkwork-ui/sdkwork-ui-pc-react/src')
  aliases['@sdkwork/ui-pc-react/theme'] = join(UI_PC_REACT_SRC, 'theme')
  aliases['@sdkwork/ui-pc-react/components/ui/actions'] = join(UI_PC_REACT_SRC, 'components/ui/actions')
  aliases['@sdkwork/ui-pc-react/components/ui/feedback'] = join(UI_PC_REACT_SRC, 'components/ui/feedback')
  return aliases
}

const SDKWORK_SOURCE_ALIASES = sdkworkSourceAliases()

/** Rebase a physical lib-relative source onto a browser URL that mirrors the repository directories. */
function browserSourcePath(source: string, sourcemapPath: string): string {
  if (!source.startsWith('.')) return source
  const physicalSource = resolvePath(dirname(sourcemapPath), source)
  const repositoryPath = relative(REPOSITORY_ROOT, physicalSource).split(sep).join('/')
  return repositoryPath.startsWith('packages/') ? `../../../${repositoryPath}` : source
}

/**
 * Resolve Tailwind's JavaScript and stylesheet modules from the declaring
 * package's own install rather than the stylesheet's directory. The Tailwind
 * compile plugins run with stylesheets inside sibling SDKWork checkouts,
 * which carry no node_modules on the release runner; every declaring package
 * lists the Tailwind runtime and plugins it compiles as devDependencies, so
 * its require reaches the workspace store. Bare ids the package does not
 * install fall through to default resolution from the stylesheet directory.
 * @param configUrl - `import.meta.url` of the declaring tsdown config.
 * @returns `css` and `js` resolvers for `@tailwindcss/node` compile options.
 */
/**
 * A Tailwind v4 source sheet opens with its bare import or any Tailwind
 * directive. Plain sheets keep the verbatim inline path; sheets with
 * `@source`/`@variant`/`@custom-variant`/`@theme`/`@plugin` must go through
 * the compiler so their relative `@import` chain is inlined and the
 * compile-time directives are dropped — otherwise a `<style>` tag ships
 * `@import "./x.css"` verbatim and the renderer 404s the stylesheet.
 */
const TAILWIND_SOURCE_SHEET = /^@import\s+["']tailwindcss["']|^@(?:plugin|source|variant|custom-variant|theme)\s+/m

/**
 * Compile one Tailwind v4 source sheet through the same pipeline the app
 * shell's Vite build uses: compile with package-install resolvers, scan the
 * sheet's own package sources for candidates, optimize. Plain sheets keep the
 * verbatim inline path.
 * @param cssPath - absolute stylesheet path.
 * @param addWatchFile - watch-registration callback from the loader hook.
 * @returns the compiled, minified CSS text.
 */
async function compileTailwindSourceSheet(cssPath: string, addWatchFile: (id: string) => void): Promise<string> {
  const resolvers = tailwindResolvers(cssPath)
  const dependencies = new Set<string>([cssPath])
  const source = await readFile(cssPath, 'utf8')
  const compiler = await tailwindCompile(source, {
    base: dirname(cssPath),
    customCssResolver: resolvers.css,
    customJsResolver: resolvers.js,
    onDependency: dependency => { dependencies.add(dependency) },
  })
  const packageRoot = packageJsonRootOf(cssPath)
  const sources: TailwindSourceEntry[] = [
    ...compiler.sources,
    ...(packageRoot === undefined ? [] : [{ base: join(packageRoot, 'src'), pattern: '**/*', negated: false }]),
  ]
  const scanner = new TailwindScanner({ sources })
  const candidates = scanner.scan()
  const compiled = tailwindOptimize(compiler.build(candidates), { minify: true }).code
  for (const file of scanner.files) dependencies.add(file)
  for (const glob of scanner.globs) dependencies.add(glob.base)
  for (const entry of sources) dependencies.add(entry.base)
  for (const dependency of dependencies) addWatchFile(dependency)
  return compiled
}

/** Nearest package.json directory above a file, or undefined. */
function packageJsonRootOf(file: string): string | undefined {
  let dir = dirname(file)
  while (dir.length > 3) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
  return undefined
}

export function tailwindResolvers(configUrl: string): {
  css: (id: string, base: string) => Promise<string | undefined>
  js: (id: string, base: string) => Promise<string | undefined>
} {
  const require = createRequire(configUrl)
  const resolve = async (id: string, css: boolean): Promise<string | undefined> => {
    if (id.startsWith('.') || id.startsWith('/')) return undefined
    try {
      // The stylesheet side loads the bare package through its `style` field.
      return require.resolve(css && id === 'tailwindcss' ? 'tailwindcss/index.css' : id)
    } catch {
      return undefined
    }
  }
  return {
    css: (id) => resolve(id, true),
    js: (id) => resolve(id, false),
  }
}

/**
 * Build the tsdown config for one UI plugin package: the node-half lib build
 * plus the browser client bundle. Client packages emit both halves during the
 * Client pass by default; packages needed for Host reflection may opt into the
 * earlier Host pass. A package-level tsdown.config.ts REPLACES the root
 * workspace layout, so the lib half must be restated here — dropping it leaves
 * the package without lib/index.js and the host Loader cannot import its node
 * half. The Client build consumes `lib/types` and chains those tsc maps, with
 * original source content, into the standalone plugin map.
 * @param packageDirOrId - the package's own directory, normally the config's
 * `import.meta.dirname`, or the package name the fork's own preset call sites
 * spell out. Its `package.json` name is the plugin id stamped into the
 * __ModuleLoader__.load handoff and onto the injected style tags, and the
 * owner segment of its asset URLs; its `src/client/assets/` holds the only
 * images the browser bundle may reference.
 * @param libEntry - node-half entries.
 * @param options - phase placement, lib overrides, optional independently bundled Node Client, companion configs, and per-file Client banner.
 * @returns ENV-selected tsdown config for the current build face.
 * @throws {Error} when the package manifest is unreadable or declares no name.
 */
export function clientBundle(
  packageDirOrId: string,
  libEntry: readonly string[],
  options: ClientBundleOptions = {},
): BuildFaceConfig {
  const packageDir = presetPackageDir(packageDirOrId)
  const manifest = readPackageManifest(packageDir)
  const lib = clientLibraryConfig(manifest, libEntry, options.lib)
  return (inlineConfig, meta) => {
    const face = readBuildFace(inlineConfig, meta)
    const clientEntry = face === undefined ? 'src/client/index.ts' : 'lib/types/client/index.js'
    const client = clientConfig(manifest, packageDir, clientEntry, options.clientBanner, options.dualClient === true)
    const node = [lib, ...(options.companions ?? [])]
    const clientFaces = options.dualClient === true
      ? [nodeClientConfig(manifest, clientEntry), client]
      : [client]
    if (face === 'host') return options.hostPhase === true ? node : [SKIP_WORKSPACE_BUILD]
    if (face === 'client') {
      return options.hostPhase === true ? clientFaces : [...node, ...clientFaces]
    }
    return [...node, ...clientFaces]
  }
}

/**
 * Build the tsdown config for a client library the compile shell links
 * statically (the static assembly channel: `apps/web` resolves the package
 * name, bundles the artifact, and owns the chunk layout and the CSS pipeline).
 *
 * Calling this preset is what puts a package in the static assembly channel,
 * so the call sites are the roster: gates read it through
 * {@link isStaticLinkedConfig} rather than a second hand-kept list. A package on
 * this roster must not be a module-table row as well — the browser would take
 * the statically linked copy and a provider's bytes would sit unused in its
 * bundle.
 *
 * Four artifact contracts:
 * 1. every bare specifier stays an import. The shell attributes chunk bytes by
 *    `node_modules/<pkg>`, so a dependency inlined into a workspace file is
 *    attributed to no npm package and its bytes fall into the index chunk,
 *    which collapses the vendor/index cache split.
 * 2. `esm` on `platform: 'browser'` — the shell is the only consumer.
 * 3. sourcemaps, chained through the tsc maps under `lib/types` to the sources.
 * 4. stylesheets ship with the package: a relative `.css` import survives as a
 *    relative external and the sheet is emitted under `lib/` at its
 *    `src`-relative path, so vite stays the only owner of class hashing.
 * @param packageDirOrId - the package's own directory, normally the config's
 * `import.meta.dirname`, or the package name the fork's own preset call sites
 * spell out; its `package.json` name is used in tsdown diagnostics.
 * @param libEntry - emitted JavaScript entries consumed from `lib/types`, one
 * bundle each: a multi-entry build would emit a hash-named shared chunk that
 * the exact `files` list cannot publish.
 * @returns ENV-selected tsdown config for the Client build face.
 * @throws {Error} when the package manifest is unreadable or declares no name.
 */
export function staticLinked(packageDirOrId: string, libEntry: readonly string[]): BuildFaceConfig {
  const id = presetManifest(packageDirOrId).name
  // Each entry names its own output file, so two entries with the same basename
  // would overwrite one artifact instead of emitting two.
  const names = new Set(libEntry.map(entry => basename(entry, '.js')))
  if (names.size !== libEntry.length) {
    throw new Error(`tsdown: ${id} entries collide on an output name: ${libEntry.join(', ')}`)
  }
  return clientOnly(libEntry.map(entry => staticLinkedConfig(id, entry)))
}

/**
 * Whether a package's tsdown configs put it in the static assembly channel.
 * The roster has no separate list: gates load each package's own
 * `tsdown.config.ts`, call it for the Client face, and ask this.
 * @param configs - configs a package's build-face function returned.
 * @returns true when at least one config was built by {@link staticLinked}.
 */
export function isStaticLinkedConfig(configs: readonly UserConfig[]): boolean {
  return configs.some(config => (config.plugins as readonly { name?: string }[] | undefined ?? [])
    .some(plugin => plugin.name === STATIC_LINKED_PLUGIN))
}

/**
 * Build a Client-only Node library during the Client pass.
 * @param packageDirOrId - the package's own directory, normally the config's
 * `import.meta.dirname`, or the package name the fork's own preset call sites
 * spell out; its `package.json` name is used in tsdown diagnostics.
 * @param libEntry - Emitted JavaScript entries consumed from `lib/types`.
 * @returns ENV-selected tsdown config for the Client build face.
 * @throws {Error} when the package manifest is unreadable or declares no name.
 */
export function clientLibrary(packageDirOrId: string, libEntry: readonly string[]): BuildFaceConfig {
  const lib = clientLibraryConfig(presetManifest(packageDirOrId), libEntry)
  return clientOnly([lib])
}

/**
 * Select arbitrary package-local configs only during the Client pass.
 * @param configs - Node-side configs emitted after Client tsc.
 * @returns ENV-selected tsdown config for the Client build face.
 */
export function clientOnly(configs: readonly UserConfig[]): BuildFaceConfig {
  return (inlineConfig, meta) => readBuildFace(inlineConfig, meta) === 'host'
    ? [SKIP_WORKSPACE_BUILD]
    : [...configs]
}

interface ClientBundleOptions {
  /** Emit the Node-side artifacts during the Host pass instead of the Client pass. */
  readonly hostPhase?: boolean
  /** Emit independent ESM `client.node.js` and browser-factory `client.browser.js` from the same Client entry. */
  readonly dualClient?: boolean
  /** Additional Node-side configs emitted alongside the package library. */
  readonly companions?: readonly UserConfig[]
  /** Overrides for the package's primary Node-side library config. */
  readonly lib?: UserConfig
  /** Optional legal or attribution text selected by emitted client filename. */
  readonly clientBanner?: (fileName: string) => string | undefined
}

type BuildFaceConfig = (
  inlineConfig: Pick<UserConfig, 'env'>,
  meta?: TsdownBuildFaceMeta,
) => UserConfig[]

function clientLibraryConfig(
  manifest: PackageManifest,
  libEntry: readonly string[],
  overrides: UserConfig = {},
): UserConfig {
  let externals: readonly RegExp[] | undefined
  const isProductionDependency = (specifier: string): boolean =>
    matchesSpecifier(externals ??= productionExternals(manifest), specifier)
  return {
    name: manifest.name,
    entry: [...libEntry],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    // The Node half inlines `@sdkwork/*` (see {@link productionExternals}), so
    // it needs the same pnpm-store resolution root as the browser half: the
    // workspace member links under node_modules/.pnpm/node_modules resolve the
    // bare specifiers that sibling sources import, identically on the release
    // runner and in local checkouts.
    inputOptions: {
      resolve: {
        modules: ['node_modules', join(process.cwd(), 'node_modules/.pnpm/node_modules')],
        conditionNames: [
          (process.env.NODE_ENV ?? 'production') === 'development' ? 'development' : 'production',
          'browser', 'import', 'module', 'default',
        ],
      },
    },
    // Public client build values are fixed into the Node half as they are into the browser half.
    define: clientBuildValueDefines(process.env),
    deps: {
      // The Node half runs from a real install: a production dependency is on
      // disk there and stays an import, everything else inlines. Stating both
      // halves takes the artifact off tsdown's getProductionDeps fallback, where
      // moving a dependency between npm sections silently re-bundles it.
      // Builtins keep tsdown's own handling (neither side claims them).
      neverBundle: isProductionDependency,
      alwaysBundle: (specifier: string) => !isBuiltin(specifier) && !isProductionDependency(specifier),
    },
    ...overrides,
  }
}

/** The slice of the rolldown plugin context the stylesheet plugin uses. */
interface AssetEmitter {
  emitFile(file: {
    type: 'asset'
    fileName: string
    source: Uint8Array
    originalFileName: string
  }): string
}

/** The slice of the rolldown plugin context that emits and watches one package asset. */
interface AssetContext extends AssetEmitter {
  addWatchFile(id: string): void
}

function staticLinkedConfig(id: string, entry: string, outputName = basename(entry, '.js')): UserConfig {
  const emitted = new Set<string>()
  const isolation = clientInputIsolation(id)
  return {
    name: id,
    entry: { [outputName]: entry },
    outDir: 'lib',
    format: ['esm'],
    platform: 'browser',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    // The shell compiles this artifact, so its map is the only path from a
    // browser stack frame back to the TSX (tsc emits the lib/types half).
    sourcemap: true,
    outputOptions: {
      sourcemapExcludeSources: false,
      sourcemapPathTransform: isolation.sourcePath,
    },
    plugins: [{
      // Contract 1. `pre` because tsdown's own deps plugin would otherwise
      // resolve and inline every specifier missing from the npm production
      // sections, which is the coupling this preset exists to remove. The name
      // is also the roster marker {@link isStaticLinkedConfig} reads.
      name: STATIC_LINKED_PLUGIN,
      resolveId: {
        order: 'pre' as const,
        handler(source: string, importer: string | undefined) {
          // An entry arrives without an importer and must stay internal.
          if (importer === undefined) return null
          return isBareSpecifier(source) ? { id: source, external: true } : null
        },
      },
    }, tscSourceMapPlugin(), isolation.plugin, {
      // Contract 4. The import survives verbatim and the sheet lands beside the
      // JavaScript, so the shell's CSS Modules pipeline sees a real stylesheet.
      name: 'dsh-css-asset',
      async resolveId(this: AssetEmitter, source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || importer === undefined) return null
        const { file, fileName } = stylesheetAsset(source, importer)
        if (!emitted.has(fileName)) {
          emitted.add(fileName)
          // originalFileName also puts the physical sheet in the watch graph.
          this.emitFile({ type: 'asset', fileName, source: await readFile(file), originalFileName: file })
        }
        // Every emitted chunk sits at the lib/ root, so the src-relative name
        // is what resolves from there. Rolldown keeps relative externals as
        // written instead of re-normalizing them.
        return { id: `./${fileName}`, external: true }
      },
    }],
  }
}

/** Whether a specifier names a package rather than a file next to its importer. */
function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('\0') && !isAbsolute(specifier)
}

/**
 * Locate a stylesheet import against the package sources and name its emitted position.
 * @param source - relative import specifier as written in the source.
 * @param importer - absolute path of the importing module, emitted or source.
 * @returns the stylesheet on disk plus its `src`-relative name under `lib/`.
 */
function stylesheetAsset(source: string, importer: string): { readonly file: string, readonly fileName: string } {
  const file = sourceAssetPath(source, importer).replaceAll('/', sep)
  const sourceRoot = packageSourceRootFromImporter(importer)
  if (sourceRoot === undefined || !isUnderDirectory(file, sourceRoot)) {
    throw new Error(`tsdown: stylesheet ${file} is outside the package sources`)
  }
  return { file, fileName: relative(sourceRoot, file).split(sep).join('/') }
}

/** Whether a resolved asset path lives under the importing package's `src/` tree. */
export function isInImporterPackageSources(file: string, importer: string): boolean {
  const sourceRoot = packageSourceRootFromImporter(importer)
  return sourceRoot !== undefined && isUnderDirectory(file, sourceRoot)
}

/**
 * Whether a resolved asset path comes from an installed npm package
 * (`node_modules`). Third-party stylesheets (monaco-editor's editor chrome)
 * cannot go through rolldown's own CSS pipeline — the preset's virtual
 * modules deliberately replace it — so they join the same global-inline
 * injection the package sources use.
 */
export function isFromNodeModules(file: string): boolean {
  const normalized = file.replaceAll('/', sep)
  return normalized.includes(`${sep}node_modules${sep}`)
}

function isUnderDirectory(file: string, directory: string): boolean {
  const normalizedFile = file.replaceAll('/', sep)
  const normalizedDir = directory.replaceAll('/', sep)
  const prefix = normalizedDir.endsWith(sep) ? normalizedDir : `${normalizedDir}${sep}`
  return normalizedFile === normalizedDir || normalizedFile.startsWith(prefix)
}

/** The manifest fields the build faces read to name the package and state its own module edges. */
interface PackageManifest {
  /** Package name: the tsdown config name, the Client loader id, and the diagnostic subject. */
  readonly name: string
  /** Sections a real install materializes on disk next to the built package. */
  readonly dependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
  readonly optionalDependencies?: Record<string, string>
  /** Package exports; the browser face emits assets only while `./assets/*` publishes `lib/assets`. */
  readonly exports?: Readonly<Record<string, unknown>>
  readonly dsh?: { readonly client?: { readonly external?: unknown } }
}

/**
 * Read the manifest of the package whose config calls a preset. The caller
 * passes its directory because tsdown evaluates every package config with the
 * repository root as `process.cwd()` during a workspace build.
 * @param packageDir - the package's own directory.
 * @returns the parsed manifest.
 * @throws {Error} when `package.json` is unreadable, is not JSON, or declares no string name.
 */
function readPackageManifest(packageDir: string): PackageManifest {
  const manifestPath = resolvePath(packageDir, 'package.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(
      `tsdown: cannot read ${manifestPath}; pass the package directory (the import.meta.dirname of its tsdown.config.ts)`,
      { cause: error },
    )
  }
  if (typeof parsed !== 'object' || parsed === null || !('name' in parsed) || typeof parsed.name !== 'string') {
    throw new Error(`tsdown: ${manifestPath} declares no string package name`)
  }
  return parsed as PackageManifest
}

/**
 * Resolve the directory of the package whose config calls a preset, from
 * either form a preset call site spells: the package's own directory, or its
 * package name. The fork's own `ui-sdkwork-*` configs pass the name, and a name
 * cannot be turned into a path through `process.cwd()` because tsdown evaluates
 * every package config with the repository root as cwd during a workspace
 * build, so a name is matched against the workspace manifests instead.
 *
 * FORK DIVERGENCE: upstream's presets take the directory only, so the asset
 * pipeline can read `src/client/assets/`. The fork's name-based call sites have
 * no directory to hand over, so presets that need the path resolve it here
 * rather than being unable to reach the assets.
 * @param subject - the package's own directory, or the name it declares.
 * @returns the package directory, absolute or relative to the repository root.
 * @throws {Error} when no workspace package declares the name.
 */
function presetPackageDir(subject: string): string {
  if (isAbsolute(subject) || existsSync(join(subject, 'package.json'))) return subject
  for (const manifestPath of globSync('packages/*/*/package.json', { cwd: REPOSITORY_ROOT })) {
    const manifest = JSON.parse(
      readFileSync(resolvePath(REPOSITORY_ROOT, manifestPath), 'utf8'),
    ) as PackageManifest
    if (manifest.name === subject) return dirname(resolvePath(REPOSITORY_ROOT, manifestPath))
  }
  throw new Error(`tsdown: no packages/*/*/package.json declares the name ${subject}`)
}

/**
 * Read the manifest of the package whose config calls a preset, from either
 * form a preset call site spells (see {@link presetPackageDir}).
 * @param subject - the package's own directory, or the name it declares.
 * @returns the parsed manifest.
 * @throws {Error} when a directory holds no readable manifest, or no workspace package declares the name.
 */
function presetManifest(subject: string): PackageManifest {
  return readPackageManifest(presetPackageDir(subject))
}

/**
 * External patterns for one package's Node half: its own production sections,
 * subpaths included. `@sdkwork/*` sibling packages are deliberately NOT
 * external: the loader module table does not serve them and the packaged
 * application does not install them, so a left-over require would throw at
 * boot — the Node half inlines them instead, resolving through the workspace
 * links exactly like the browser bundles do.
 * @param manifest - the package's own manifest.
 * @returns one `^name(/|$)` pattern per production dependency, name-sorted.
 */
function productionExternals(manifest: PackageManifest): readonly RegExp[] {
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ])
  return [...names]
    .filter(name => !name.startsWith('@sdkwork/'))
    .sort()
    .map(name => new RegExp(`^${escapeSpecifier(name)}(/|$)`))
}

/**
 * Module-table specifiers one `dsh.client` declaration requests. Matching is
 * exact, never normalized: a package declares the specifier its own code
 * imports, and the loader keys static entries the same way.
 * @param subject - package name, used in diagnostics.
 * @param declaration - the package's `dsh.client` object.
 * @returns the requested specifiers, empty when the package declares none.
 * @throws {Error} when `external` is not a string array.
 */
export function requestedExternals(
  subject: string,
  declaration: { readonly external?: unknown },
): ReadonlySet<string> {
  return new Set(optionalStringArray(subject, 'dsh.client.external', declaration.external) ?? [])
}

/**
 * Module-table specifiers one package requests. The shell baseline is implicit
 * for every dynamic bundle; `dsh.client.external` only adds package-specific
 * dynamic rows or subpaths.
 * @param manifest - the package's own manifest, whose `dsh.client` declaration adds requests.
 * @returns the baseline plus the package's explicit requests.
 */
function clientExternals(manifest: PackageManifest): ReadonlySet<string> {
  return new Set([
    ...CLIENT_EXTERNALS,
    ...PRELOADED_CLIENT_EXTERNALS,
    ...requestedExternals(manifest.name, manifest.dsh?.client ?? {}),
  ])
}

/** Escape a package name for literal use inside a RegExp source. */
function escapeSpecifier(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whether an import specifier is the package a pattern names, or one of its subpaths. */
function matchesSpecifier(patterns: readonly RegExp[], specifier: string): boolean {
  return patterns.some(pattern => pattern.test(specifier))
}

/** Render package-local dynamic imports through the Client module loader's asynchronous operation. */
function asyncChunkRequirePlugin(): TsdownPlugin {
  return {
    name: 'dsh-client-async-chunk-require',
    renderChunk(code, chunk, outputOptions) {
      if (outputOptions.format !== 'cjs') return null
      const transformed = new Rolldown.RolldownMagicString(code)
      for (const dynamicImport of chunk.dynamicImports) {
        const fileName = dynamicImport.startsWith('./') ? dynamicImport.slice(2) : dynamicImport
        if (!/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/.test(fileName)) continue
        const specifier = `./${fileName}`
        const call = new RegExp(
          `Promise\\.resolve\\(\\)\\.then\\(\\(\\)\\s*=>\\s*require\\((['"])${escapeSpecifier(specifier)}\\1\\)\\)`,
          'gu',
        )
        const matches = [...code.matchAll(call)]
        if (matches.length === 0) {
          throw new Error(`client bundle compiler: dynamic chunk ${JSON.stringify(specifier)} has no generated import expression`)
        }
        for (const match of matches) {
          transformed.overwrite(match.index, match.index + match[0].length, `require.async(${JSON.stringify(specifier)})`)
        }
      }
      return transformed.hasChanged() ? transformed : null
    },
    async writeBundle(outputOptions, bundle) {
      const entry = Object.values(bundle).find(output => output.type === 'chunk' && output.isEntry)
      if (entry === undefined || outputOptions.dir === undefined) return
      const entryPath = resolvePath(outputOptions.dir, entry.fileName)
      const current = await stat(entryPath)
      const completedAt = new Date(Math.max(Date.now(), current.mtimeMs + 1))
      await utimes(entryPath, current.atime, completedAt)
    },
  }
}

/** Emitted asset directory below the browser config's `lib` outDir, published as {@link PACKAGE_ASSET_FILES_ENTRY}. */
const ASSET_OUTPUT_DIR = posix.relative('lib', PACKAGE_ASSET_FILES_ENTRY)

/** Characters the asset route rejects in a decoded path segment, because Node resolves export subpaths as URL text. */
const UNSERVABLE_ASSET_SEGMENT = /[%#?\\\0]/

/** A `url()` value with a scheme, such as `data:` or `https:`, which names no package file. */
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i

/**
 * Free identifier an asset reference compiles to before rendering; the CommonJS
 * render turns each call into `require.asset(...)`, the module loader's
 * synchronous asset resolver, which returns the reference unchanged unless its
 * carrier maps it. The fixed hexadecimal suffix keeps plugin strings that happen
 * to contain the shorter prefix out of that rewrite, and keeps the source maps
 * that carry the loaded module text byte-stable across builds.
 */
const PACKAGE_ASSET_CALL = '__dshPackageAsset_5f8e2c1a9b7d'

/** Compile one asset reference into the resolver call. */
function packageAssetCall(reference: string): string {
  return `${PACKAGE_ASSET_CALL}(${JSON.stringify(reference)})`
}

/**
 * Compile stylesheet text into a JavaScript expression that passes each package-asset
 * reference the `url()` rewrite inserted through the resolver call. The rewrite writes
 * a placeholder of letters, digits, and underscores, which lightningcss never escapes,
 * with a per-stylesheet random part that stylesheet text cannot contain by chance.
 * A placeholder may appear several times or not at all, as when minification copies
 * or drops a declaration.
 * @param css - stylesheet text after the rewrite.
 * @param references - reference of each placeholder the rewrite inserted into this stylesheet.
 * @returns a string literal, or a concatenation of literals and resolver calls.
 */
function stylesheetSource(css: string, references: ReadonlyMap<string, string>): string {
  if (references.size === 0) return JSON.stringify(css)
  const parts: string[] = []
  let last = 0
  for (const match of css.matchAll(new RegExp([...references.keys()].join('|'), 'gu'))) {
    parts.push(JSON.stringify(css.slice(last, match.index)), packageAssetCall(references.get(match[0]) as string))
    last = match.index + match[0].length
  }
  parts.push(JSON.stringify(css.slice(last)))
  return parts.join(' + ')
}

/** One stylesheet's `url()` rewrite: the lightningcss options and the references they insert while transforming. */
interface StylesheetAssets {
  /** lightningcss options; empty when the stylesheet lies outside the package's own `src`. */
  readonly options: { readonly visitor?: Visitor<CustomAtRules> }
  /** Reference of each placeholder inserted during the transform that uses {@link options}. */
  readonly references: ReadonlyMap<string, string>
}

/** Browser-face package assets: the import plugin and the stylesheet `url()` rewrite share one per-build emission record. */
interface PackageAssets {
  /** `dsh-package-asset`: resolves asset imports, emits referenced files, and prunes stale `lib/assets` files after writing. */
  readonly plugin: TsdownPlugin
  /**
   * Select the lightningcss options that rewrite one stylesheet's relative `url()` values.
   * @param context - plugin context of the stylesheet loader, which emits each referenced asset.
   * @param stylesheet - physical stylesheet path.
   * @returns a `url()` visitor when the stylesheet lies inside the package's own `src`, otherwise no options,
   *   and the references the visitor inserts.
   * @throws {Error} from the visitor when a relative `url()` does not name a publishable package asset.
   */
  urlRewrite(context: AssetContext, stylesheet: string): StylesheetAssets
}

/**
 * Build the package-asset rules of one dynamic browser bundle. A referenced
 * file must lie under the package's own `src/client/assets/`, have a supported
 * extension, and be published by the `./assets/*` export; it is emitted once
 * per build under `lib/assets/` at its relative path with the content revision
 * inserted before the extension, and the reference compiles to the module loader's
 * synchronous resolver call on its document-relative URL.
 * A one-shot build deletes files under `lib/assets/` that it did not emit; a
 * watch build keeps them for pages still running an earlier generation.
 * @param manifest - the package's own manifest, naming the URL owner and declaring the asset export.
 * @param packageDir - the package's own directory.
 * @returns the plugin and stylesheet visitor sharing the per-build emission record.
 */
function packageAssets(manifest: PackageManifest, packageDir: string): PackageAssets {
  const name = manifest.name
  const sourceDir = resolvePath(packageDir, 'src')
  const assetsDir = resolvePath(sourceDir, 'client', 'assets')
  /** Reference of every asset emitted in the current build, keyed by its real path. */
  const references = new Map<string, string>()

  const reference = (context: AssetContext, file: string): string => {
    let realPath: string
    try {
      realPath = realpathSync(file)
    } catch (error) {
      throw new Error(`tsdown: ${name}: cannot resolve asset ${file}`, { cause: error })
    }
    const emitted = references.get(realPath)
    if (emitted !== undefined) return emitted
    const below = pathBelow(realDirectory(assetsDir), realPath)
    if (below === undefined) throw new Error(`tsdown: ${name}: ${file} is outside src/client/assets; move the asset there`)
    const assetPath = below.split(sep).join('/')
    if (assetPath.split('/').some(segment => UNSERVABLE_ASSET_SEGMENT.test(segment) || segment.toLowerCase() === 'node_modules')) {
      throw new Error(`tsdown: ${name}: ${file} has a node_modules path segment or one containing %, #, ?, \\ or NUL, which the asset route cannot serve; rename it`)
    }
    const extension = posix.extname(assetPath)
    if (extension !== extension.toLowerCase()) {
      throw new Error(`tsdown: ${name}: ${file} has an uppercase extension; asset imports are typed by lowercase extensions, so rename it`)
    }
    if (manifest.exports?.[PACKAGE_ASSET_EXPORT] !== PACKAGE_ASSET_EXPORT_TARGET) {
      throw new Error(
        `tsdown: ${name}: ${file} needs package.json exports ${JSON.stringify({ [PACKAGE_ASSET_EXPORT]: PACKAGE_ASSET_EXPORT_TARGET })} `
        + `and ${JSON.stringify(PACKAGE_ASSET_FILES_ENTRY)} in files`,
      )
    }
    if (packageAssetMediaType(assetPath) === undefined) {
      throw new Error(`tsdown: ${name}: ${file} is not a supported asset; supported extensions: ${[...PACKAGE_ASSET_MEDIA_TYPES.keys()].join(', ')}`)
    }
    const bytes = readFileSync(realPath)
    const emittedPath = packageAssetRevisionedPath(assetPath, packageAssetRevision(bytes))
    context.emitFile({ type: 'asset', fileName: `${ASSET_OUTPUT_DIR}/${emittedPath}`, source: bytes, originalFileName: realPath })
    context.addWatchFile(realPath)
    const url = packageAssetReference(name, emittedPath)
    references.set(realPath, url)
    return url
  }

  return {
    plugin: {
      name: 'dsh-package-asset',
      buildStart() { references.clear() },
      resolveId(source, importer) {
        if (importer === undefined || packageAssetMediaType(source) === undefined) return null
        return sourceAssetPath(source, importer)
      },
      load(id) {
        if (!isAbsolute(id) || packageAssetMediaType(id) === undefined) return null
        return `export default ${packageAssetCall(reference(this, id))};`
      },
      renderChunk(code, _chunk, outputOptions) {
        if (outputOptions.format !== 'cjs' || !code.includes(PACKAGE_ASSET_CALL)) return null
        const transformed = new Rolldown.RolldownMagicString(code)
        for (const match of code.matchAll(new RegExp(`\\b${PACKAGE_ASSET_CALL}\\(`, 'gu'))) {
          transformed.overwrite(match.index, match.index + match[0].length, 'require.asset(')
        }
        return transformed
      },
      async writeBundle(outputOptions, bundle) {
        // A watch rebuild keeps earlier files: the Host still serves the previous
        // bundle generation, and pages running it request those asset names.
        if (this.meta.watchMode || outputOptions.dir === undefined) return
        const outDir = outputOptions.dir
        const assets = resolvePath(outDir, ASSET_OUTPUT_DIR)
        if (!existsSync(assets)) return
        await pruneDirectory(assets, file => relative(outDir, file).split(sep).join('/') in bundle)
      },
    },
    urlRewrite(context, stylesheet) {
      const inserted = new Map<string, string>()
      const nonce = randomBytes(6).toString('hex')
      if (pathBelow(realDirectory(sourceDir), realpathSync(stylesheet)) === undefined) return { options: {}, references: inserted }
      const base = dirname(stylesheet)
      const rewrite = (url: Url): Url | undefined => {
        // Empty values, fragments, root-relative paths, schemes such as `data:`, and placeholders name no package file.
        if (url.url === '' || url.url.startsWith('#') || url.url.startsWith('/') || URL_SCHEME.test(url.url)) return undefined
        if (inserted.has(url.url)) return undefined
        if (/[#?]/u.test(url.url)) {
          throw new Error(`tsdown: ${name}: ${stylesheet} references ${JSON.stringify(url.url)}; a package asset url() takes no fragment or query`)
        }
        const placeholder = `__dshPackageAsset_${nonce}_${String(inserted.size)}__`
        inserted.set(placeholder, reference(context, resolvePath(base, url.url)))
        return { ...url, url: placeholder }
      }
      return {
        options: {
          visitor: {
            Url: url => rewrite(url),
            // lightningcss does not visit the urls inside image-set(), so its options are rewritten here.
            Image(image) {
              if (image.type !== 'image-set') return undefined
              const options = image.value.options.map((option) => {
                const url = option.image.type === 'url' ? rewrite(option.image.value) : undefined
                return url === undefined ? option : { ...option, image: { type: 'url' as const, value: url } }
              })
              return { ...image, value: { ...image.value, options } }
            },
          },
        },
        references: inserted,
      }
    },
  }
}

/** Real path of an existing directory, or undefined when it does not exist. */
function realDirectory(directory: string): string | undefined {
  return existsSync(directory) ? realpathSync(directory) : undefined
}

/**
 * Locate a real path strictly inside a real directory.
 * @param root - real directory path, or undefined when the directory does not exist.
 * @param file - real file path.
 * @returns the platform-separated path of `file` below `root`, or undefined when it is not inside.
 */
function pathBelow(root: string | undefined, file: string): string | undefined {
  if (root === undefined) return undefined
  const path = relative(root, file)
  return path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path) ? undefined : path
}

/**
 * Delete every file a predicate rejects below a directory, then every directory left empty.
 * @param directory - directory to prune; removed itself when nothing remains.
 * @param keep - whether a file path survives.
 * @returns whether the directory was removed.
 */
async function pruneDirectory(directory: string, keep: (file: string) => boolean): Promise<boolean> {
  let remaining = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!(await pruneDirectory(path, keep))) remaining++
    } else if (keep(path)) {
      remaining++
    } else {
      await rm(path)
    }
  }
  if (remaining > 0) return false
  await rmdir(directory)
  return true
}

/**
 * Reject asset imports in a Node Client face, which has no asset route.
 * @param id - package name, used in diagnostics.
 * @returns a plugin whose resolveId throws for every supported asset extension.
 */
function browserOnlyAssets(id: string): TsdownPlugin {
  return {
    name: 'dsh-package-asset-browser-only',
    resolveId(source) {
      if (packageAssetMediaType(source) === undefined) return null
      throw new Error(`tsdown: ${id}: asset imports are browser-only (${source})`)
    },
  }
}

/** Bundle the Client entry for plain Node independently of the Host entry and browser factory. */
function nodeClientConfig(manifest: PackageManifest, entry: string): UserConfig {
  const isolation = clientInputIsolation(manifest.name)
  return clientLibraryConfig(manifest, [entry], {
    name: `${manifest.name}/client-node`,
    entry: { 'client.node': entry },
    sourcemap: true,
    inputOptions: { resolve: { conditionNames: ['node', 'import', 'module', 'default'] } },
    plugins: [browserOnlyAssets(manifest.name), tscSourceMapPlugin(), isolation.plugin],
    outputOptions: {
      entryFileNames: 'client.node.js',
      chunkFileNames: 'client.node.[name].js',
      sourcemapExcludeSources: false,
      sourcemapPathTransform: isolation.sourcePath,
    },
  })
}

function clientConfig(
  manifest: PackageManifest,
  packageDir: string,
  entry: string,
  clientBanner?: (fileName: string) => string | undefined,
  dualClient = false,
): UserConfig {
  const id = manifest.name
  let requested: ReadonlySet<string> | undefined
  const isRequested = (specifier: string): boolean => (requested ??= clientExternals(manifest)).has(specifier)
  const isolation = clientInputIsolation(id)
  const assets = packageAssets(manifest, packageDir)
  return {
    name: `${id}/client`,
    entry: { client: entry },
    // SDKWork siblings resolve to their pinned sources (see
    // {@link sdkworkSourceAliases}); package-local configs may layer their own
    // aliases over these.
    alias: { ...SDKWORK_SOURCE_ALIASES },
    // Sibling SDKWork sources import bare specifiers (`@sdkwork/*`, npm
    // packages their apps declare) that resolve only through the sibling's own
    // install, which the release runner does not clone. The pnpm virtual
    // store's flat link directory reaches every installed package (including
    // each workspace member), so append it as a module search root. The root
    // workspace config carries the same setting, but the inputOptions merge is
    // not dependable for package-local configs, so the browser bundle sets it
    // itself; the path derives from `process.cwd()` (the tsdown invocation
    // directory) because the config loader rewrites `import.meta.url`.
    inputOptions: {
      resolve: {
        modules: ['node_modules', join(process.cwd(), 'node_modules/.pnpm/node_modules')],
        conditionNames: [
          (process.env.NODE_ENV ?? 'production') === 'development' ? 'development' : 'production',
          'browser', 'import', 'module', 'default',
        ],
      },
    },
    // Browser bundle lands beside the Node artifacts. clean must stay off:
    // cleaning this invocation would wipe the independently emitted Node entry.
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    // Types ship from lib/types (tsc); dts here would wrap the banner/footer into .d.cts and break parsing.
    dts: false,
    // Plugin code is fetched outside Vite's module graph, so its own bundle
    // must carry the TS/TSX mapping consumed by browser profiling tools.
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: isRequested,
      // Anything NOT requested from the loader module table must inline
      // (wire/type layers, clsx — every non-shared dep). A require() the
      // table cannot answer is a guaranteed runtime throw, so the rule is the
      // package's own request list: requested specifiers stay imports,
      // everything else is bundled.
      alwaysBundle: (specifier: string) => !isRequested(specifier),
    },
    // Browser bundles inline node-idiom deps (zustand/immer read
    // process.env.NODE_ENV; zustand's esm build also probes
    // import.meta.env.MODE, which a CJS output cannot carry — rolldown flags
    // EMPTY_IMPORT_META). vite defined both on the seed path; tsdown inlining
    // needs the substitutions here or the factory throws ReferenceError at
    // boot / the build gate reds. Both keys honor the build's NODE_ENV so a
    // dev build keeps the dev-branch semantics; artifacts default to production.
    // The bare `import.meta.env` key is required alongside the precise MODE
    // key: zustand probes `import.meta.env ? import.meta.env.MODE : ...`, and
    // the truthiness probe would otherwise survive as an empty import.meta.
    define: {
      ...clientBuildEnvironmentDefines(process.env),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [{
      // Bundle purity gate (build-time mirror of the module-edge rules): the
      // baseline and package-specific requests stay external, inline-safe wire layers
      // inline, and every other @deepseek-ai value import is a build error — a
      // cross-plugin value import either inlines a duplicate runtime instance
      // or requires a specifier the module table cannot answer for this package.
      // Cross-plugin collaboration goes through cordis services instead.
      name: 'dsh-client-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (isRequested(source)) return null // requested module-table row: external wins
        if (VENDORED_LIBRARY.test(source)) return null // vendored library: inline, no shared identity
        if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null // wire contribution: inline is the point
        throw new Error(
          `client bundle purity: "${source}" is not in the default client externals or ${id}'s dsh.client.external, an inline-safe wire layer, or a generated /remote contribution — `
          + 'cross-plugin value imports are forbidden; declare a non-default module request or collaborate through cordis services '
          + '(type-only imports are erased and never reach this gate)',
        )
      },
    }, tscSourceMapPlugin(), isolation.plugin, {
      name: 'dsh-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
        return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        // The virtual id otherwise hides the physical stylesheet from Rolldown's watch graph.
        this.addWatchFile(fileId)
        const source = await readFile(fileId)
        const stylesheetAssets = assets.urlRewrite(this, fileId)
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
          ...stylesheetAssets.options,
        })
        const classMap: Record<string, string> = {}
        const exportEntries = Object.entries(cssExports ?? {})
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        for (const [local, exp] of exportEntries) classMap[local] = exp.name
        return styleInjectionModule(id, fileId, stylesheetSource(code.toString(), stylesheetAssets.references), classMap)
      },
    }, {
      name: 'dsh-css-text-inline',
      resolveId(source: string, importer: string | undefined) {
        // Rolldown may hand the specifier with or without its query preserved
        // (`x.css?inline` vs `x.css` + query on the resolved id); match the
        // stylesheet by the bare specifier and the inline marker separately.
        const bare = source.replace(/\?.*$/, '')
        if (!bare.endsWith('.css') || !source.includes(INLINE_CSS_QUERY)) return null
        const stylesheet = bare
        const abs = importer !== undefined ? sourceAssetPath(stylesheet, importer) : stylesheet
        return INLINE_CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(INLINE_CSS_VIRTUAL_PREFIX)) return null
        // Rolldown preserves the original import's query on the resolved
        // virtual id (`…mjs?inline`); strip it before unwrapping the suffix.
        const fileId = virtualId.slice(INLINE_CSS_VIRTUAL_PREFIX.length).replace(/\.mjs(?:\?.*)?$/, '')
        this.addWatchFile(fileId)
        const source = await readFile(fileId)
        const stylesheetAssets = assets.urlRewrite(this, fileId)
        const { code } = transform({ filename: fileId, code: source, minify: true, ...stylesheetAssets.options })
        return `export default ${stylesheetSource(code.toString(), stylesheetAssets.references)};`
      },
    }, {
      name: 'dsh-css-global-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.css') || source.endsWith('.module.css') || importer === undefined) return null
        const abs = sourceAssetPath(source, importer)
        if (!isInImporterPackageSources(abs, importer) && !isFromNodeModules(abs)) return null
        // A sibling checkout may reference a build-product stylesheet that the
        // pinned source tree does not ship; leave it to rolldown's own
        // resolution instead of failing the whole client pass here.
        if (!existsSync(abs)) return null
        return GLOBAL_CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(GLOBAL_CSS_VIRTUAL_PREFIX)) return null
        // Newer rolldown strips `?inline` before resolveId and re-appends the
        // query onto the resolved virtual id. When present, the importer wants
        // the compiled CSS as a default-exported string (like the inline arm),
        // not a style-injecting side-effect module.
        const inlineWanted = virtualId.endsWith(INLINE_CSS_QUERY)
        const unwrapped = inlineWanted
          ? virtualId.slice(GLOBAL_CSS_VIRTUAL_PREFIX.length, -INLINE_CSS_QUERY.length)
          : virtualId.slice(GLOBAL_CSS_VIRTUAL_PREFIX.length)
        const fileId = unwrapped.replace(/\.mjs$/, '')
        this.addWatchFile(fileId)
        const raw = await readFile(fileId)
        const source = raw.toString('utf8')
        // Upstream rewrites referenceable asset URLs for the published bundle; the
        // fork routes Tailwind source sheets through the compiler first, because
        // their bare @import/@plugin directives are unresolvable in the renderer.
        const stylesheetAssets = assets.urlRewrite(this, fileId)
        const compiled = TAILWIND_SOURCE_SHEET.test(source)
          ? await compileTailwindSourceSheet(fileId, id => this.addWatchFile(id))
          : transform({ filename: fileId, code: raw, minify: true, ...stylesheetAssets.options }).code.toString()
        const code = stylesheetSource(compiled, stylesheetAssets.references)
        // `stylesheetSource` already yields a JavaScript expression (a JSON string
        // literal, or a concatenation carrying the package-asset resolver calls),
        // so the inline default export interpolates it as-is. Re-encoding it would
        // ship the quotes as stylesheet text: `tag.textContent` then holds a quoted
        // literal, the browser parses zero rules, and every `--dsw-*` token the
        // sheet defines disappears (a light palette over the boot dark canvas).
        if (inlineWanted) return `export default ${code};`
        return styleInjectionModule(id, fileId, code)
      },
    }, assets.plugin],
    outputOptions: {
      entryFileNames: dualClient ? 'client.browser.js' : 'client.js',
      // The imported source basename becomes the published chunk name; package
      // files lists and artifact tests pin every intentional chunk.
      chunkFileNames: dualClient ? 'client.browser.[name].js' : 'client.[name].js',
      // Single-file artifact: each graph row serves exactly one script and the
      // module table answers only package-name specifiers, so a code-split
      // dynamic chunk (`require("./x-<hash>.cjs")`) has no loader path. Dynamic
      // imports inline here; laziness stays at materialization, not download.
      // The chunk names above stay pinned for the chunked pipeline the fork's
      // tailwind/css virtual loaders have not migrated to `@tsdown/css` yet.
      codeSplitting: false,
      sourcemapExcludeSources: false,
      // The map is served from /plugins/<scoped-package>/client.js.map. The
      // browser resolves its local sources back into URLs that mirror the
      // /packages/<group>/<package>/src directories; sourcesContent keeps them usable
      // without exposing that tree as an HTTP route.
      sourcemapPathTransform(source, mapPath) {
        isolation.sourcePath(source, mapPath)
        return browserSourcePath(source, mapPath)
      },
      banner: (chunk) => {
        const registration = `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, ${chunk.isEntry ? '' : `chunk: ${JSON.stringify(chunk.fileName)}, `}factory: (require) => {`
        const prefix = clientBanner?.(chunk.fileName)
        return prefix === undefined ? registration : `${prefix}\n${registration}`
      },
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}

/** Check browser bundle inputs before their original package identity is folded into an artifact. */
function clientInputIsolation(id: string): {
  plugin: TsdownPlugin
  sourcePath: (source: string, mapPath: string) => string
} {
  const experimental = isExperimentalPackageName(id)
  const inputs = new BundleInputIsolation(REPOSITORY_ROOT, `client bundle isolation (${id})`)
  return {
    plugin: {
      name: 'dsh-client-input-isolation',
      buildStart() { inputs.reset() },
      generateBundle(_options, bundle) {
        if (experimental) return
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk') {
            for (const module of Object.keys(output.modules)) {
              inputs.assertInput(clientInputFile(module))
              const info = this.getModuleInfo(module)
              if (info === null) {
                // Rolldown's runtime helper is compiler-generated and has no source module record.
                if (module === '\0rolldown/runtime.js') continue
                throw new Error(`client bundle isolation (${id}): module ${module} has no bundler module record`)
              }
              for (const dependency of [...info.importedIds, ...info.dynamicallyImportedIds]) {
                inputs.assertInput(clientInputFile(dependency))
              }
            }
            for (const external of [...output.imports, ...output.dynamicImports]) {
              if (!(external in bundle)) inputs.assertInput(external)
            }
          } else {
            for (const original of output.originalFileNames) inputs.assertInput(original)
          }
        }
      },
    },
    sourcePath(source, mapPath) {
      if (!experimental) {
        const decoded = clientInputFile(source)
        const file = physicalBundleInput(decoded) ?? resolvePath(dirname(mapPath), decoded)
        inputs.assertSourceMapInput(file)
      }
      return source
    },
  }
}

/**
 * CSS loader ids append a JavaScript suffix to the physical stylesheet path.
 * Fork-owned SDKWork clients name their virtual style modules the same way —
 * `\0dsh-<slug>-tailwind:`, `\0dsh-<slug>-css:` and `\0dsh-<slug>-pdf-worker:`
 * prefix the physical file, and the `.mjs` suffix keeps the id out of tsdown's
 * css guard — so that suffix must come off here as well. Left on, the isolation
 * check probes for a `<sheet>.css.mjs` that never exists on disk and rejects the
 * bundle. The `-browser-builtin:` family is deliberately not matched: its
 * payload is a Node builtin name, not a filesystem path.
 */
const SDKWORK_VIRTUAL_INPUT = /^\u0000dsh-[a-z0-9-]+-(?:tailwind|css|pdf-worker):(.*)\.mjs(?:\?.*)?$/

/**
 * Recover the physical stylesheet from a virtual CSS loader id.
 *
 * The import's own query survives onto the resolved id: an `x.css?inline` import
 * that resolves to `<prefix><abs>.mjs` comes back as `<prefix><abs>.mjs?inline`
 * (rolldown strips the query before `resolveId` and re-appends it afterwards).
 * The query must come off *before* the `.mjs` suffix, because slicing four
 * characters off `…base.css.mjs?inline` leaves `…base.css.mjs?in` and the
 * isolation check then probes for a path that never exists on disk.
 * @param id - bundler module id, possibly a virtual CSS loader id.
 * @returns the physical file path, or the id unchanged when it wraps none.
 */
function clientInputFile(id: string): string {
  const prefix = [CSS_VIRTUAL_PREFIX, GLOBAL_CSS_VIRTUAL_PREFIX, INLINE_CSS_VIRTUAL_PREFIX]
    .find(prefix => id.startsWith(prefix))
  if (prefix === undefined) return SDKWORK_VIRTUAL_INPUT.exec(id)?.[1] ?? id
  const path = id.slice(prefix.length).replace(/\?.*$/, '')
  return path.slice(0, -CSS_VIRTUAL_SUFFIX.length)
}

/** Chain tsc's emitted maps into any Client bundle that consumes `lib/types`. */
function tscSourceMapPlugin() {
  return {
    name: 'dsh-tsc-sourcemap',
    async load(id: string) {
      if (!id.includes(TYPES_MARKER) || !id.endsWith('.js') || !existsSync(`${id}.map`)) return null
      const code = await readFile(id, 'utf8')
      const mapPath = `${id}.map`
      const map = JSON.parse(await readFile(mapPath, 'utf8')) as {
        sourceRoot?: unknown
        sources?: unknown
        sourcesContent?: unknown
        [key: string]: unknown
      }
      if (!Array.isArray(map.sources) || map.sources.some(source => typeof source !== 'string')) {
        throw new Error(`client sourcemap: ${mapPath} has invalid sources`)
      }
      const sources = map.sources as string[]
      if (
        !Array.isArray(map.sourcesContent)
        || map.sourcesContent.length !== sources.length
        || map.sourcesContent.some(source => typeof source !== 'string')
      ) {
        const sourceRoot = typeof map.sourceRoot === 'string' ? map.sourceRoot : ''
        map.sourcesContent = await Promise.all(sources.map(async source =>
          await readFile(resolvePath(dirname(mapPath), sourceRoot, source), 'utf8')))
      }
      return { code: code.replace(SOURCEMAP_COMMENT, ''), map }
    },
  }
}

/** Path segment separating a package's tsc output from the sources it was emitted from. */
const TYPES_ROOT = `${sep}lib${sep}types`
const TYPES_MARKER = `${TYPES_ROOT}${sep}`

/** Plugin name carrying contract 1, and the marker that identifies a statically linked config. */
const STATIC_LINKED_PLUGIN = 'dsh-static-linked-external'

/** Path segment a package's sources hang under, and the root emitted assets mirror. */
const SOURCE_MARKER = `${sep}src${sep}`

/** Trailing sourcemap reference tsc appends to every emitted module. */
const SOURCEMAP_COMMENT = /\n\/\/# sourceMappingURL=.*\s*$/

/** Map an emitted client entry path back to its `src/` tree directory. */
function sourceImporterDir(importer: string): string {
  const importerDir = dirname(importer).replaceAll('/', sep)
  const boundary = importerDir.indexOf(TYPES_ROOT)
  if (boundary < 0) return importerDir
  const afterTypes = importerDir.slice(boundary + TYPES_ROOT.length).replace(/^[/\\]/, '')
  return resolvePath(importerDir.slice(0, boundary), 'src', afterTypes)
}

/** Root `src/` directory for the package that owns `importer`. */
function packageSourceRootFromImporter(importer: string): string | undefined {
  const importerDir = dirname(importer).replaceAll('/', sep)
  const typesBoundary = importerDir.indexOf(TYPES_ROOT)
  if (typesBoundary >= 0) return resolvePath(importerDir.slice(0, typesBoundary), 'src')
  const sourceBoundary = importerDir.indexOf(SOURCE_MARKER)
  if (sourceBoundary >= 0) return importerDir.slice(0, sourceBoundary + SOURCE_MARKER.length - 1)
  // The importer may sit directly in the package's src root (`src/index.ts`),
  // whose directory carries no trailing separator to match SOURCE_MARKER.
  if (importerDir.endsWith(SOURCE_MARKER.slice(0, -1))) return importerDir
  return undefined
}

/** Resolve an emitted JS asset import against its source-tree counterpart. */
export function sourceAssetPath(source: string, importer: string): string {
  if (!source.startsWith('.') && !isAbsolute(source)) return createRequire(importer).resolve(source)
  const fromSourceTree = resolvePath(sourceImporterDir(importer), source)
  if (existsSync(fromSourceTree)) return fromSourceTree
  const fromEmitted = resolvePath(dirname(importer), source)
  if (existsSync(fromEmitted)) return fromEmitted
  return fromSourceTree
}

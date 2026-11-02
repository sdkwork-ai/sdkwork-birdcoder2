import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSdkworkLaunchProfile, type SdkworkLaunchProfile } from '@deepseek-ai/dsh-sdkwork-env-bootstrap'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { SDKWORK_ENV_BOOT_GLOBAL, projectSdkworkEnvBase } from '@deepseek-ai/dsh-client-ui-sdkwork-env'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { clientBuildEnvironmentDefines } from '../../scripts/client-build-environment.ts'
import { WEB_SOURCE_ALIASES } from './vite-source-aliases.ts'
import { productWebBundleIsolation } from './product-isolation.ts'
import { katexWoff2Fonts } from './katex-fonts.ts'

const src = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url))
const repoRoot = src('../..')
const STANDALONE_ERROR = 'apps/web is not a standalone application: bare Vite cannot inject window.__DSH_BOOT__. '
  + 'From a repository checkout, run `pnpm dsh web`; an installed package uses `dsh web`. '
  + 'For client-plugin HMR, run `pnpm run dev:web`, which starts `dsh web` and the rebuild watchers together.'
const DEFAULT_CLIENT_TITLE = 'DSH Local Build'

/** Escape build-time text before placing it in the HTML title element. */
function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Project the public build title into the initial HTML document. */
function clientDocumentTitle(): Plugin {
  const title = escapeHtmlText(process.env.DSH_CLIENT_TITLE ?? DEFAULT_CLIENT_TITLE)
  return {
    name: 'dsh-client-document-title',
    transformIndexHtml(html) {
      return html.replace('<title>DSH Local Build</title>', `<title>${title}</title>`)
    },
  }
}

/** Keep the redistribution license beside the bundled brand font. */
function brandFontLicense(): Plugin {
  return {
    name: 'dsh-brand-font-license',
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'assets/fonts/Montserrat-OFL.txt',
        source: await readFile(src('../../packages/client/ui-theme/src/styles/Montserrat-OFL.txt')),
      })
    },
  }
}

/** Fail before a Vite dev or preview server can expose the boot-manifest-free shell. */
function rejectStandaloneServe(): Plugin {
  return {
    name: 'dsh-reject-standalone-web-serve',
    config(_config, env) {
      if (env.command === 'serve') throw new Error(STANDALONE_ERROR)
    },
  }
}

/**
 * Emit preview.html beside index.html: the built index page with one module
 * script — the worker bootstrap entry — spliced ahead of its entry tag. Both
 * pages share every chunk; the extra tag is the only difference, so the
 * static worker deployment ships the served page verbatim plus its
 * bootstrap.
 */
function emitPreviewPage(): Plugin {
  let bootstrapFile: string | undefined
  let write = true
  let written = false
  let outputDirectory = ''
  return {
    name: 'dsh-emit-preview-page',
    configResolved(config) {
      write = config.build.write
      outputDirectory = resolve(config.root, config.build.outDir)
    },
    buildStart() {
      bootstrapFile = undefined
      written = false
    },
    generateBundle(_options, bundle) {
      if (!write) return
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk' && item.isEntry && item.name === 'bootstrap') bootstrapFile = item.fileName
      }
      if (bootstrapFile === undefined) throw new Error('vite: preview bootstrap entry missing from the bundle')
    },
    writeBundle() { written = true },
    async closeBundle() {
      if (!write || !written || bootstrapFile === undefined) return
      const page = await readFile(resolve(outputDirectory, 'index.html'), 'utf8')
      const anchor = page.indexOf('<script type="module"')
      if (anchor === -1) throw new Error('vite: built index.html lost its module entry tag')
      const tag = `<script type="module" crossorigin src="./${bootstrapFile}"></script>`
      await writeFile(resolve(outputDirectory, 'preview.html'), `${page.slice(0, anchor)}${tag}${page.slice(anchor)}`)
    },
  }
}

/**
 * Vendor-chunk membership, by exact npm package name — the heavy render
 * families (math, highlight, markdown) that change only on dependency bumps.
 * Only packages workspace code imports DIRECTLY need listing: their private
 * transitive dependencies (oniguruma machinery, character tables, …) are
 * imported solely by these and rollup's chunk coloring pulls them into
 * vendor automatically. A dependency shared with index-side code falls back
 * to index — a few kB of dilution, never a correctness problem. Anything not
 * listed (react family, the vendored cordis workspace, tiny helpers like
 * anser/clsx, all workspace code) stays in the default `index` chunk, so
 * editing shell code re-hashes only index and returning clients keep the
 * cached vendor chunk.
 *
 * Every member must be React-free. A package that
 * imports react/jsx-runtime must never be listed — rollup folds a module
 * shared between the entry and a manual chunk into the manual chunk, so one
 * react-importing member would drag the single shared react copy into
 * vendor. The React side of markdown/math rendering is workspace code and
 * rides index.
 */
const VENDOR_PACKAGES: ReadonlySet<string> = new Set([
  // math
  'katex',
  // syntax highlight (@shikijs/langs is handled separately below —
  // lazy grammars must not land here)
  'shiki',
  // markdown parse pipeline (micromark/mdast; the incremental React renderer
  // over it is workspace code)
  'mdast-util-from-markdown',
  'mdast-util-gfm',
  'mdast-util-math',
  'micromark-core-commonmark',
  'micromark-extension-gfm',
  'micromark-extension-math',
  'micromark-factory-space',
  'micromark-util-character',
  'micromark-util-classify-character',
  'micromark-util-sanitize-uri',
  'micromark-util-symbol',
  'micromark-util-types',
])

/**
 * Boot grammars statically imported by ui-primitives' highlight.ts
 * (`@shikijs/langs/typescript` → `dist/typescript.mjs`, etc.). They live in
 * the same package as the lazy read-card grammars, but unlike those they are
 * part of the initial load and belong in the vendor chunk; the lazy ones must
 * stay unassigned so each keeps its own on-demand chunk.
 */
const BOOT_GRAMMAR_FILES: readonly string[] = [
  'dist/typescript.mjs',
  'dist/shellscript.mjs',
  'dist/json.mjs',
]

/** Font asset extensions routed to assets/fonts/. */
const FONT_EXTENSIONS: readonly string[] = ['.woff2', '.woff', '.ttf']

/**
 * npm package name of a resolved module id: the segment after the last
 * `node_modules/`. pnpm nests the real package under an inner node_modules.
 */
function npmPackageOf(id: string): string | undefined {
  const parts = id.split('/node_modules/')
  if (parts.length === 1) return undefined
  const [first, second] = parts[parts.length - 1].split('/')
  if (first.startsWith('.')) return undefined // .pnpm store segment, not a package
  if (first.startsWith('@')) return second === undefined ? undefined : `${first}/${second}`
  return first
}

function resolveSdkworkBuildProfile(mode: string): SdkworkLaunchProfile {
  switch (mode.toLowerCase()) {
    case 'dev':
    case 'development':
      return 'development'
    case 'test':
      return 'test'
    case 'staging':
      return 'staging'
    case 'production':
    case 'prod':
      return 'production'
    default:
      return resolveSdkworkLaunchProfile(repoRoot)
  }
}

/** Deployment profile a browser build targets; `cloud` is the default. */
const DEFAULT_DEPLOYMENT_PROFILE = 'cloud' as const

/** Deployment profiles the build can target, matching the topology files. */
type DeploymentProfile = typeof DEFAULT_DEPLOYMENT_PROFILE | 'standalone'

/**
 * Resolve the deployment profile a build targets.
 * @param value - `DSH_WEB_DEPLOYMENT_PROFILE`, when the lane sets it.
 * @returns the profile; `cloud` when unset.
 * @throws When the value names another profile.
 */
function resolveDeploymentProfile(value: string | undefined): DeploymentProfile {
  const normalized = value?.trim().toLowerCase()
  if (normalized === undefined || normalized === '') return DEFAULT_DEPLOYMENT_PROFILE
  if (normalized === 'cloud' || normalized === 'standalone') return normalized
  throw new Error(`DSH_WEB_DEPLOYMENT_PROFILE must be cloud or standalone; got ${JSON.stringify(value)}`)
}

/** Surface origins that must name a deployment domain, never a loopback host. */
const SURFACE_ORIGIN_KEYS = [
  'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL',
  'SDKWORK_BIRDCODER_APP_API_BASE_URL',
  'SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL',
  'SDKWORK_BIRDCODER_IM_API_BASE_URL',
  'SDKWORK_BIRDCODER_IM_EMBED_URL',
  'SDKWORK_IM_API_BASE_URL',
  'SDKWORK_IM_EMBED_URL',
] as const

/** A loopback origin, which a non-development build must never bake. */
const LOOPBACK_ORIGIN = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/iu

/**
 * Publish the SDKWork deployment this build targets into the page.
 *
 * The browser cannot read env files, and the client plugin bundles are built
 * apart from this page, so the built HTML is the one place a build hands the
 * browser its deployment. Vite's `loadEnv` reads the committed
 * `.env`/`.env.<deployment-profile>.<environment>` files for the selected
 * profile and mode, `projectSdkworkEnvBase` maps the SDKWork keys onto the
 * `ui-sdkwork-env` settings shape, and the page global is the same one the
 * settings scope consumes. Every build is therefore exactly one deployment:
 * `DSH_WEB_DEPLOYMENT_PROFILE` chooses `cloud` (the default) or `standalone`,
 * and the build mode chooses `development|test|staging|production` (or
 * `DSH_WEB_BUILD_MODE`, which the Desktop launchers set for their own lane).
 * Nothing is resolved at runtime.
 *
 * The launching shell is not a configuration source: its `SDKWORK_*` values are
 * removed for the duration of the load, and only the explicit
 * `DSH_WEB_SDKWORK_*` channel reaches the file values (the Desktop development
 * lane uses it for `--gateway`). A non-development build also drops any
 * loopback origin, so the packaged application always talks to a deployment
 * domain rather than the packaging host's local server.
 * @param deploymentProfile - profile whose env file the build reads.
 * @param environment - tier the build mode selected.
 * @returns the plugin that injects the page global.
 */
function sdkworkEnvInjection(deploymentProfile: DeploymentProfile, environment: SdkworkLaunchProfile): Plugin {
  // The launching shell is not a configuration source: a packaged Desktop
  // application exports its own deployment into every child process, and that
  // must not decide what a build bakes. Saved and restored so the rest of the
  // build still sees it.
  const inherited = new Map<string, string | undefined>()
  for (const name of Object.keys(process.env)) {
    if (!name.startsWith('SDKWORK_') && !name.startsWith('VITE_SDKWORK_')) continue
    inherited.set(name, process.env[name])
    delete process.env[name]
  }
  let loaded: Record<string, string>
  try {
    const tracked = join(repoRoot, `.env.${deploymentProfile}.${environment}`)
    if (!existsSync(tracked)) {
      throw new Error(`apps/web: missing ${tracked}; every build names its deployment env file `
        + `(DSH_WEB_DEPLOYMENT_PROFILE=${deploymentProfile}, mode=${environment})`)
    }
    loaded = loadEnv(`${deploymentProfile}.${environment}`, repoRoot, '') as Record<string, string>
  } finally {
    for (const [name, value] of inherited) {
      if (value !== undefined) process.env[name] = value
    }
  }
  // A launcher that resolved a value itself (the Desktop development lane's
  // `--gateway`) passes it in this explicit channel; nothing else about the
  // launching shell leaks into the build.
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('DSH_WEB_SDKWORK_') || value === undefined || value.trim() === '') continue
    loaded[name.slice('DSH_WEB_'.length)] = value
  }
  if (environment !== 'development') {
    for (const key of SURFACE_ORIGIN_KEYS) {
      const value = loaded[key]
      if (value !== undefined && LOOPBACK_ORIGIN.test(value)) delete loaded[key]
    }
  }
  const projection = projectSdkworkEnvBase(createLaunchEnvironmentSnapshot([{ source: 'process', values: loaded }]))
  // `</script>` inside a string would end the inline script early.
  const serialized = JSON.stringify(projection).replace(/</gu, '\\u003c')
  return {
    name: 'dsh-sdkwork-env-injection',
    transformIndexHtml(html) {
      return html.replace('</head>', `<script>window.${SDKWORK_ENV_BOOT_GLOBAL}=${serialized};</script>\n</head>`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const environment = resolveSdkworkBuildProfile(process.env.DSH_WEB_BUILD_MODE?.trim() || mode)
  const deploymentProfile = resolveDeploymentProfile(process.env.DSH_WEB_DEPLOYMENT_PROFILE)
  return {
  // Relative asset URLs: preview.html mounts the same output under any base
  // directory, and the served index resolves identically from the site root.
  base: './',
  plugins: [
    rejectStandaloneServe(), clientDocumentTitle(), brandFontLicense(), katexWoff2Fonts(), react(), tailwindcss(), emitPreviewPage(),
    sdkworkEnvInjection(deploymentProfile, environment),
    productWebBundleIsolation(src('../..'), src('.')),
  ],
  build: {
    // The worker bootstrap holds its page at top-level await; Vite's default
    // `modules` target (es2020-era) rejects that syntax.
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        index: src('./index.html'),
        // Standalone entry, not an index.html script tag: Vite folds every
        // module tag of one page into a single synthetic entry, and only a
        // separate input keeps the shared page chunks bootstrap-free.
        bootstrap: src('./src/preview.ts'),
      },
      output: {
        // The worker-preview surface groups under dist/preview/ (the page
        // itself stays at dist/preview.html), so the published payload can
        // exclude it as one directory.
        entryFileNames(chunk): string {
          return chunk.name === 'bootstrap' ? 'preview/[name]-[hash].js' : 'assets/[name]-[hash].js'
        },
        // Output layout: the two main chunks stay at assets/ root; lazy
        // @shikijs/langs grammar chunks group under assets/langs/; fonts
        // (all KaTeX faces referenced by vendor.css) group under
        // assets/fonts/. Sourcemaps need no arrangement: rollup writes each
        // .map next to its js and references it by bare relative filename.
        chunkFileNames(chunk): string {
          // Grammar chunks are recognized by their member modules, not the
          // facade: shared embedded-grammar chunks (e.g. html+javascript,
          // split out because php/ruby/mdx embed them) have no facade at all.
          // index and vendor are excluded by name — vendor legitimately
          // carries the three boot grammars.
          if (chunk.name === 'index' || chunk.name === 'vendor') return 'assets/[name]-[hash].js'
          const isLangChunk = chunk.moduleIds.some(id => id.includes('/node_modules/@shikijs/langs/'))
          return isLangChunk ? 'assets/langs/[name]-[hash].js' : 'assets/[name]-[hash].js'
        },
        assetFileNames(asset): string {
          const fileName = asset.names[0] ?? ''
          const isFont = FONT_EXTENSIONS.some(ext => fileName.endsWith(ext))
          return isFont ? 'assets/fonts/[name]-[hash][extname]' : 'assets/[name]-[hash][extname]'
        },
        manualChunks(id: string): string | undefined {
          const pkg = npmPackageOf(id)
          if (pkg === undefined) return undefined // workspace + vendored cordis: index
          if (pkg === '@shikijs/langs') {
            return BOOT_GRAMMAR_FILES.some(file => id.endsWith(`/${file}`)) ? 'vendor' : undefined
          }
          return VENDOR_PACKAGES.has(pkg) ? 'vendor' : undefined
        },
      },
    },
  },
  worker: {
    // The preview worker rides dist/preview/ with the rest of that surface.
    rollupOptions: { output: { entryFileNames: 'preview/[name]-[hash].js' } },
  },
  resolve: {
    // One instance per shared npm identity: a bare specifier otherwise resolves
    // from the importer's directory, so a diverging range ships a second React
    // and splits hook and element identity. Entries are package ids — they cover
    // react/jsx-runtime and react-dom/client — and resolve from this package's
    // node_modules, so react must stay a devDependency here and any watcher must
    // run vite from this directory (scripts/dev-web.ts). Workspace packages need
    // no entry: pnpm links each of them to a single directory.
    // One instance per shared npm identity: a bare specifier otherwise resolves
    // from the importer's directory, so a diverging range ships a second React
    // and splits hook and element identity. Entries are package ids — they cover
    // react/jsx-runtime and react-dom/client — and resolve from this package's
    // node_modules, so react must stay a devDependency here and any watcher must
    // run vite from this directory (scripts/dev-web.ts).
    dedupe: ['react', 'react-dom'],
    // Workspace packages resolve to SOURCE: package.json exports point at lib
    // for Node/type consumers, but the browser bundle must compile src directly
    // so CSS rides vite's pipeline instead of the CSS-externalized lib bundle.
    // Only the shell's normal package entry is aliased — plugin packages are
    // NEVER bundled here (shell self-sufficiency — see
    // packages/client/web/README.md); they arrive as runtime
    // bundles through the client module system. Order matters — subpath
    // aliases must win over bare-name prefixes.
    alias: [
      // Browserize the vendored Cordis Loader's only Node import.
      { find: /^node:module$/, replacement: src('./src/node-module-stub.ts') },
      ...WEB_SOURCE_ALIASES,
    ],
    // Workspace packages resolve to TypeScript sources; try `.ts` before `.js`
    // so tsc residue (`src/*.js` next to `src/*.ts`, untracked) in sibling
    // checkouts can never shadow the source plane in the browser bundle.
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  define: {
    ...clientBuildEnvironmentDefines(process.env),
    // vendored loader internal.ts: fromInternal() probes the Node major —
    // "0.0.0" takes neither branch, returning undefined (exactly the empty
    // internal slot the shell boot fills with the client module loader).
    'process.versions.node': '"0.0.0"',
    'process.execArgv': '[]',
    // vendored loader index.ts: envData falls to its default branch.
    'process.env.CORDIS_SHARED': 'undefined',
  },
  }
})

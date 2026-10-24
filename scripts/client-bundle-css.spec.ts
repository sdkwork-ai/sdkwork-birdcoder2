/**
 * Stylesheets and package assets enter client bundles through plugin loaders,
 * which register their physical files as watch dependencies. Package assets
 * are emitted under `lib/assets/` with revisioned file names and referenced by document-relative URLs.
 */
import { transform } from 'lightningcss'
import { runInNewContext } from 'node:vm'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, type TsdownBundle, type UserConfig } from 'tsdown'
import { afterEach, describe, expect, it } from 'vitest'
import { packageAssetRevision } from '../packages/client/modules/src/assets.ts'
import {
  EMBEDDED_APP_CSS_LAYER,
  EMBEDDED_APP_LAYER_ORDER,
  EMBEDDED_APPSTORE_CSS_LAYER,
  clientBundle,
  embedAppStylesheetInLayer,
  scopeStyleSheetUtilities,
} from '../packages/client/tsdown.client.ts'

interface EmittedAsset {
  type: 'asset'
  fileName: string
  source: Uint8Array
  originalFileName: string
}

interface PluginContext {
  emitFile(file: EmittedAsset): string
  addWatchFile(id: string): void
}

interface BundlePlugin {
  name: string
  buildStart?: (this: PluginContext) => void
  resolveId?: (source: string, importer?: string) => string | null
  load?: (this: PluginContext, id: string) => string | null | Promise<string | null>
  writeBundle?: (this: { meta: { watchMode: boolean } }, outputOptions: { dir?: string }, bundle: Record<string, unknown>) => Promise<void>
  renderChunk?: (code: string, chunk: unknown, outputOptions: { format: string }) => { toString(): string } | null
}

type PluginName = 'dsh-css-modules-inline' | 'dsh-css-global-inline' | 'dsh-css-text-inline' | 'dsh-package-asset'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-asset-fixture'
const ASSET_EXPORTS = { './client': './lib/client.js', './assets/*': './lib/assets/*' }
const WHALE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const WHALE_REV = packageAssetRevision(WHALE)
const WHALE_URL = `plugins/@deepseek-ai/dsh-client-asset-fixture/assets/whale-${WHALE_REV}.png`

/** The resolver call identifier a compiled module emits before rendering. */
const RESOLVER_CALL = /__dshPackageAsset_[0-9a-f]{12}(?=\()/u

/** Read the resolver call identifier from one compiled module. */
function resolverCall(output: string | null): string {
  const call = RESOLVER_CALL.exec(output ?? '')?.[0]
  if (call === undefined) throw new Error('compiled module carries no resolver call')
  return call
}

/**
 * Evaluate the stylesheet text an emitted style module or inline-text module computes.
 * @param output - emitted module source.
 * @param resolve - stands in for the module loader's asset resolver.
 * @returns the stylesheet text with each resolved reference.
 */
function stylesheetText(output: string | null, resolve: (reference: string) => string): string {
  if (output === null) throw new Error('stylesheet module was not emitted')
  const call = RESOLVER_CALL.exec(output)?.[0]
  const body = output
    .replace(/^export default (.*);$/mu, 'return typeof css === "undefined" ? $1 : css;')
    .replace(/^export \{\};$/mu, 'return css;')
  return runInNewContext(`(() => {\n${body}\n})()`, { ...call === undefined ? {} : { [call]: resolve }, document: undefined }) as string
}

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** Create a spec-owned temporary directory, addressed by its real path. */
async function temporaryDirectory(prefix: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  temporaryRoots.push(root)
  return root
}

async function writeFiles(root: string, files: Readonly<Record<string, string | Uint8Array>>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

/** Create a client package fixture whose manifest declares the given exports. */
async function assetPackage(
  files: Readonly<Record<string, string | Uint8Array>>,
  exports: Readonly<Record<string, string>> = ASSET_EXPORTS,
): Promise<string> {
  const root = await temporaryDirectory('dsh-client-asset-')
  await writeFiles(root, { 'package.json': JSON.stringify({ name: PACKAGE_NAME, type: 'module', exports }), ...files })
  return root
}

/** Client-face configs of one package, as its tsdown.config.ts would return them. */
function clientFaceConfigs(packageDir: string, dualClient = false): UserConfig[] {
  return clientBundle(packageDir, ['lib/types/index.js'], { dualClient })({ env: { DSH_BUILD_FACE: 'client' } })
}

function configPlugin(config: UserConfig | undefined, name: string): BundlePlugin {
  if (config === undefined) throw new Error('config missing')
  const plugin = (config as { plugins: BundlePlugin[] }).plugins.find(candidate => candidate.name === name)
  if (plugin === undefined) throw new Error(`${name} missing from ${String(config.name)}`)
  return plugin
}

/** Look up plugins of one browser config, so stylesheet and asset plugins share its per-build state. */
function browserPlugins(packageDir: string): (name: PluginName) => BundlePlugin {
  const client = clientFaceConfigs(packageDir).find(config => config.platform === 'browser')
  return name => configPlugin(client, name)
}

function bundlePlugin(name: PluginName): BundlePlugin {
  return browserPlugins(join(import.meta.dirname, '../packages/client/ui-sidebar'))(name)
}

interface RecordingContext extends PluginContext {
  readonly emitted: EmittedAsset[]
  readonly watched: string[]
}

function recordingContext(): RecordingContext {
  const emitted: EmittedAsset[] = []
  const watched: string[] = []
  return {
    emitted,
    watched,
    emitFile(file) {
      emitted.push(file)
      return file.fileName
    },
    addWatchFile(id) { watched.push(id) },
  }
}

/** Emitted files with hex sources, so Buffer and Uint8Array bytes compare equal. */
function emittedFiles(context: { readonly emitted: readonly EmittedAsset[] }): object[] {
  return context.emitted.map(file => ({ ...file, source: Buffer.from(file.source).toString('hex') }))
}

function hooks(plugin: BundlePlugin): Required<Pick<BundlePlugin, 'resolveId' | 'load'>> {
  if (plugin.resolveId === undefined || plugin.load === undefined) throw new Error(`${plugin.name} hooks are incomplete`)
  return { resolveId: plugin.resolveId, load: plugin.load }
}

/** Resolve and load one import through a plugin. */
async function loadImport(plugin: BundlePlugin, context: PluginContext, source: string, importer: string): Promise<string | null> {
  const { resolveId, load } = hooks(plugin)
  const id = resolveId(source, importer)
  if (typeof id !== 'string') throw new Error(`${plugin.name} did not resolve ${source}`)
  return await load.call(context, id)
}

describe('client bundle CSS Modules', () => {
  it('registers the source stylesheet as a watch dependency', async () => {
    const root = await temporaryDirectory('dsh-client-css-watch-')
    const stylesheet = join(root, 'Fixture.module.css')
    await writeFile(stylesheet, '.root { color: red; }\n')
    const context = recordingContext()

    const output = await loadImport(bundlePlugin('dsh-css-modules-inline'), context, './Fixture.module.css', join(root, 'index.ts'))

    expect(context.watched).toEqual([stylesheet])
    expect(output).toContain('data-plugin-css')
  })
})

describe('client bundle global CSS', () => {
  it('compiles a side-effect stylesheet into a watched style injector', async () => {
    const root = await temporaryDirectory('dsh-client-global-css-watch-')
    const stylesheet = join(root, 'base.css')
    await writeFile(stylesheet, 'body { color: red; }\n')
    const context = recordingContext()

    const output = await loadImport(bundlePlugin('dsh-css-global-inline'), context, './base.css', join(root, 'index.ts'))

    expect(context.watched).toEqual([stylesheet])
    expect(output).toContain('data-plugin-css')
    expect(output).toContain('body{color:red}')
  })

  it('compiles inline stylesheets as watched text without a module side effect', async () => {
    const root = await temporaryDirectory('dsh-client-inline-css-watch-')
    const stylesheet = join(root, 'base.css')
    await writeFile(stylesheet, 'body { color: red; }\n')
    const context = recordingContext()

    const output = await loadImport(bundlePlugin('dsh-css-text-inline'), context, './base.css?inline', join(root, 'index.ts'))

    expect(context.watched).toEqual([stylesheet])
    expect(output).toContain('export default "body{color:red}"')
    expect(output).not.toContain('data-plugin-css')
  })
})

describe('client bundle package asset imports', () => {
  it('emits an imported asset once per build and exports its revisioned URL', async () => {
    const root = await assetPackage({ 'src/client/assets/icons/whale@2x.png': WHALE })
    const plugin = browserPlugins(root)('dsh-package-asset')
    const { resolveId, load } = hooks(plugin)
    const asset = join(root, 'src/client/assets/icons/whale@2x.png')
    const context = recordingContext()

    const id = resolveId('./assets/icons/whale@2x.png', join(root, 'lib/types/client/index.js'))
    if (id === null) throw new Error('asset import did not resolve')
    const first = await load.call(context, id)
    const second = await load.call(context, id)

    const expected = `export default ${resolverCall(first)}("plugins/@deepseek-ai/dsh-client-asset-fixture/assets/icons/whale%402x-${WHALE_REV}.png");`
    expect(id).toBe(asset)
    expect([first, second]).toEqual([expected, expected])
    expect(emittedFiles(context)).toEqual([{
      type: 'asset',
      fileName: `assets/icons/whale@2x-${WHALE_REV}.png`,
      source: Buffer.from(WHALE).toString('hex'),
      originalFileName: asset,
    }])
    expect(context.watched).toEqual([asset])

    plugin.buildStart?.call(context)
    expect(await load.call(context, id)).toBe(expected)
    expect(context.emitted).toHaveLength(2)
  })

  it('renders each resolver call as the module loader require.asset in the CommonJS bundle only', async () => {
    const root = await assetPackage({ 'src/client/assets/whale.png': WHALE })
    const plugin = browserPlugins(root)('dsh-package-asset')
    const { renderChunk } = plugin
    if (renderChunk === undefined) throw new Error('asset plugin has no renderChunk hook')
    const call = resolverCall(await hooks(plugin).load.call(recordingContext(), join(root, 'src/client/assets/whale.png')))
    // Plugin data that only shares the fixed prefix stays as written.
    const literal = 'const text = "__dshPackageAsset(";\n'
    const code = `const a = ${call}("${WHALE_URL}");\nconst css = "x" + ${call}("${WHALE_URL}") + "y";\n${literal}`

    expect(renderChunk(code, {}, { format: 'cjs' })?.toString())
      .toBe(`const a = require.asset("${WHALE_URL}");\nconst css = "x" + require.asset("${WHALE_URL}") + "y";\n${literal}`)
    expect(renderChunk(code, {}, { format: 'es' })).toBeNull()
    expect(renderChunk('const a = 1;\n', {}, { format: 'cjs' })).toBeNull()
  })

  it('builds an asset import into require.asset and keeps plugin strings that share the prefix', async () => {
    const root = await assetPackage({
      'src/client/assets/whale.png': WHALE,
      'lib/types/client/index.js': 'import whale from "./assets/whale.png"\nexport const url = whale\nexport const text = "__dshPackageAsset("\n',
    })
    const config = clientFaceConfigs(root).find(candidate => candidate.platform === 'browser')
    if (config === undefined) throw new Error('browser config missing')

    let builds: TsdownBundle[] = []
    try {
      builds = await build({
        ...config, cwd: root, config: false, tsconfig: false,
        write: false, clean: false, exports: false, report: false, logLevel: 'silent',
      })
      const output = builds.flatMap(bundle => bundle.chunks).find(chunk => chunk.type === 'chunk' && chunk.fileName === 'client.js')
      const code = output?.type === 'chunk' ? output.code : ''
      expect(code).toContain(`require.asset(${JSON.stringify(WHALE_URL)})`)
      expect(code).not.toContain('__dshPackageAsset_')
      expect(code).toContain('"__dshPackageAsset("')
    } finally {
      for (const bundle of builds) await bundle[Symbol.asyncDispose]()
    }
  })

  it('ignores imports and modules that are not supported assets', async () => {
    const root = await assetPackage({ 'src/client/index.ts': '', 'src/client/assets/font.woff2': 'font' })
    const { resolveId, load } = hooks(browserPlugins(root)('dsh-package-asset'))
    const importer = join(root, 'src/client/index.ts')
    const context = recordingContext()

    expect(resolveId('./index.ts', importer)).toBeNull()
    expect(resolveId('./assets/font.woff2', importer)).toBeNull()
    expect(resolveId('./assets/whale.png', undefined)).toBeNull()
    expect(await load.call(context, importer)).toBeNull()
    expect(await load.call(context, 'whale.png')).toBeNull()
    expect(context.emitted).toEqual([])
  })

  it('rejects files outside the package src/client/assets directory', async () => {
    const other = await assetPackage({ 'src/client/assets/whale.png': WHALE })
    const root = await assetPackage({
      'src/client/whale.png': WHALE,
      'node_modules/dependency/package.json': JSON.stringify({ name: 'dependency' }),
      'node_modules/dependency/whale.png': WHALE,
    })
    const plugin = browserPlugins(root)('dsh-package-asset')
    const { load } = hooks(plugin)
    const importer = join(root, 'src/client/index.ts')
    const context = recordingContext()

    await expect(loadImport(plugin, context, './whale.png', importer))
      .rejects.toThrow(`${join(root, 'src/client/whale.png')} is outside src/client/assets; move the asset there`)
    expect(() => load.call(context, join(other, 'src/client/assets/whale.png'))).toThrow('is outside src/client/assets')
    await expect(loadImport(plugin, context, 'dependency/whale.png', importer)).rejects.toThrow('is outside src/client/assets')
    expect(context.emitted).toEqual([])
  })

  it.each([
    ['is missing', { './client': './lib/client.js' }],
    ['targets another directory', { './assets/*': './src/client/assets/*' }],
  ])('rejects an asset while the asset export %s', async (_case, exports) => {
    const root = await assetPackage({ 'src/client/assets/whale.png': WHALE }, exports)
    const { load } = hooks(browserPlugins(root)('dsh-package-asset'))

    expect(() => load.call(recordingContext(), join(root, 'src/client/assets/whale.png')))
      .toThrow('needs package.json exports {"./assets/*":"./lib/assets/*"} and "lib/assets" in files')
  })

  it('rejects a missing asset file by name', async () => {
    const root = await assetPackage({})
    const asset = join(root, 'src/client/assets/missing.png')
    const { load } = hooks(browserPlugins(root)('dsh-package-asset'))

    expect(() => load.call(recordingContext(), asset)).toThrow(`${PACKAGE_NAME}: cannot resolve asset ${asset}`)
  })

  it.each([
    'src/client/assets/100%.png', 'src/client/assets/icons#1/whale.png', 'src/client/assets/Node_Modules/whale.png',
  ])('rejects %s, which the asset route cannot serve', async (path) => {
    const root = await assetPackage({ [path]: WHALE })
    const { load } = hooks(browserPlugins(root)('dsh-package-asset'))

    expect(() => load.call(recordingContext(), join(root, path)))
      .toThrow(`${join(root, path)} has a node_modules path segment or one containing %, #, ?, \\ or NUL, which the asset route cannot serve; rename it`)
  })

  it('resolves every copy of a reference and tolerates a minifier dropping one', async () => {
    const root = await assetPackage({
      'src/client/assets/whale.png': WHALE,
      'src/client/assets/old.png': WHALE,
      'src/client/theme.css': '.a { background: url(./assets/old.png); background: url(./assets/whale.png); } .b { mask: url(./assets/whale.png); }',
    })

    const output = await loadImport(browserPlugins(root)('dsh-css-global-inline'), recordingContext(), './theme.css', join(root, 'src/client/index.ts'))

    const css = stylesheetText(output, reference => `resolved:${reference}`)
    expect(css.split(`url(resolved:${WHALE_URL})`)).toHaveLength(3)
    // lightningcss keeps only the last background, so the placeholder of old.png is missing from the text.
    expect(css).not.toContain('old-')
    expect(css).not.toContain('__dshPackageAsset')
  })

  it('rewrites the urls inside image-set()', async () => {
    const root = await assetPackage({
      'src/client/assets/whale.png': WHALE,
      'src/client/theme.css': '.a { background-image: image-set(url(./assets/whale.png) 1x, url("data:image/png;base64,AA==") 2x); }',
    })
    const context = recordingContext()

    const output = await loadImport(browserPlugins(root)('dsh-css-global-inline'), context, './theme.css', join(root, 'src/client/index.ts'))

    const css = stylesheetText(output, reference => `resolved:${reference}`)
    expect(css).toContain(`resolved:${WHALE_URL}`)
    expect(css).toContain('data:image/png;base64,AA==')
    expect(context.emitted.map(file => file.fileName)).toEqual([`assets/whale-${WHALE_REV}.png`])
  })

  it('keeps literal placeholder-like text and resolves only the references the rewrite inserted', async () => {
    const root = await assetPackage({
      'src/client/assets/whale.png': WHALE,
      'src/client/assets/__dshPackageAsset_logo.png': WHALE,
      'src/client/theme.css': [
        '.a::after { content: "__dshPackageAsset0__"; } .b { background: url(./assets/whale.png); }',
        '.c { background: url(./assets/__dshPackageAsset_logo.png); }',
      ].join('\n'),
    })

    const output = await loadImport(browserPlugins(root)('dsh-css-global-inline'), recordingContext(), './theme.css', join(root, 'src/client/index.ts'))

    const css = stylesheetText(output, reference => `resolved:${reference}`)
    expect(css).toContain('content:"__dshPackageAsset0__"')
    expect(css).toContain(`url(resolved:${WHALE_URL})`)
    // A real file whose name shares the placeholder prefix is still a package asset.
    expect(css).toContain(`url(resolved:plugins/@deepseek-ai/dsh-client-asset-fixture/assets/__dshPackageAsset_logo-${WHALE_REV}.png)`)
  })

  it('rejects an uppercase extension, which the asset import types do not declare', async () => {
    const root = await assetPackage({ 'src/client/assets/whale.PNG': WHALE })
    const { load } = hooks(browserPlugins(root)('dsh-package-asset'))
    const asset = join(root, 'src/client/assets/whale.PNG')

    expect(() => load.call(recordingContext(), asset)).toThrow(`${asset} has an uppercase extension`)
  })

  it('passes a file name lightningcss escapes through the resolver call, and rejects a fragment or query', async () => {
    const root = await assetPackage({
      'src/client/assets/whale(2x).png': WHALE,
      'src/client/View.module.css': '.a { mask: url(\'./assets/whale(2x).png\'); }',
      'src/client/Bad.module.css': '.b { mask: url(\'./assets/whale(2x).png#part\'); }',
    })
    const plugin = browserPlugins(root)('dsh-css-modules-inline')
    const importer = join(root, 'src/client/index.ts')

    const output = await loadImport(plugin, recordingContext(), './View.module.css', importer)
    const reference = `plugins/@deepseek-ai/dsh-client-asset-fixture/assets/whale%282x%29-${WHALE_REV}.png`
    // The served Web app returns the reference unchanged; the text must still parse as one url() declaration.
    const css = stylesheetText(output, asset => asset)
    expect(css).toContain(`url(${reference})`)
    expect(transform({ filename: 'View.css', code: Buffer.from(css), minify: true }).code.toString()).toContain(`mask:url(${reference})`)
    await expect(loadImport(plugin, recordingContext(), './Bad.module.css', importer))
      .rejects.toThrow('a package asset url() takes no fragment or query')
  })

  it('rejects asset imports in the Node Client face', async () => {
    const root = await assetPackage({})
    const node = clientFaceConfigs(root, true).find(config => config.name === `${PACKAGE_NAME}/client-node`)
    const { resolveId } = configPlugin(node, 'dsh-package-asset-browser-only')
    if (resolveId === undefined) throw new Error('browser-only guard has no resolveId hook')
    const importer = join(root, 'lib/types/client/index.js')

    expect(() => resolveId('./assets/whale.png', importer)).toThrow(`${PACKAGE_NAME}: asset imports are browser-only (./assets/whale.png)`)
    expect(resolveId('./index.js', importer)).toBeNull()
  })
})

describe('client bundle stylesheet url()', () => {
  it('rewrites relative CSS Modules urls and keeps urls that name no package file', async () => {
    const root = await assetPackage({
      'src/client/assets/whale.png': WHALE,
      'src/client/View.module.css': [
        '.whale { mask: url(\'./assets/whale.png\') center / 100% 100% no-repeat; }',
        '@supports (mask-image: url(\'\')) { .empty { background: url(\'\'); } }',
        '.data { background: url("data:image/svg+xml,%3Csvg%3E"); }',
        '.fragment { mask: url(#mask); }',
        '.rooted { background: url(/static/a.png); }',
        '.remote { background: url(https://example.com/a.png); }',
      ].join('\n'),
    })
    const context = recordingContext()

    const output = await loadImport(browserPlugins(root)('dsh-css-modules-inline'), context, './View.module.css', join(root, 'src/client/index.ts'))

    expect(output).toContain(`url(" + ${resolverCall(output)}(${JSON.stringify(WHALE_URL)}) + ")`)
    const css = stylesheetText(output, reference => `resolved:${reference}`)
    expect(css).toContain(`url(resolved:${WHALE_URL})`)
    for (const preserved of ['(mask-image:url(\'\'))', 'background:url()', 'url(data:image/svg+xml,%3Csvg%3E)', 'url(#mask)', 'url(/static/a.png)', 'url(https://example.com/a.png)']) {
      expect(css).toContain(preserved)
    }
    expect(emittedFiles(context)).toEqual([{
      type: 'asset',
      fileName: `assets/whale-${WHALE_REV}.png`,
      source: Buffer.from(WHALE).toString('hex'),
      originalFileName: join(root, 'src/client/assets/whale.png'),
    }])
  })

  it.each([
    ['dsh-css-global-inline', './theme.css'],
    ['dsh-css-text-inline', './theme.css?inline'],
  ] as const)('rewrites relative urls through %s', async (name, source) => {
    const root = await assetPackage({
      'src/client/assets/whale.png': WHALE,
      'src/client/theme.css': 'body { background: url(./assets/whale.png); }',
    })
    const context = recordingContext()

    const output = await loadImport(browserPlugins(root)(name), context, source, join(root, 'src/client/index.ts'))

    expect(stylesheetText(output, reference => `resolved:${reference}`)).toContain(`url(resolved:${WHALE_URL})`)
    expect(context.emitted.map(file => file.fileName)).toEqual([`assets/whale-${WHALE_REV}.png`])
  })

  it('leaves stylesheets outside the package src untouched', async () => {
    const root = await assetPackage({
      'node_modules/@fortune-sheet/react/dist/index.css': '.sheet { background: url("EwaAntH.gif"); }',
    })
    const context = recordingContext()

    const output = await loadImport(
      browserPlugins(root)('dsh-css-global-inline'),
      context,
      '../../node_modules/@fortune-sheet/react/dist/index.css',
      join(root, 'src/client/index.ts'),
    )

    expect(output).toContain('url(EwaAntH.gif)')
    expect(context.emitted).toEqual([])
  })

  it.each([
    ['./assets/font.woff2', 'is not a supported asset; supported extensions: .svg, .png, .webp, .jpg, .jpeg'],
    ['./whale.png', 'is outside src/client/assets; move the asset there'],
    ['./assets/missing.png', 'cannot resolve asset'],
  ])('rejects url(%s)', async (url, message) => {
    const root = await assetPackage({
      'src/client/whale.png': WHALE,
      'src/client/assets/font.woff2': 'font',
      'src/client/View.module.css': `.x { background: url(${url}); }`,
    })

    await expect(loadImport(browserPlugins(root)('dsh-css-modules-inline'), recordingContext(), './View.module.css', join(root, 'src/client/index.ts')))
      .rejects.toThrow(message)
  })
})

describe('client bundle asset output', () => {
  it('prunes lib/assets files this build did not emit and the directories they leave empty', async () => {
    const root = await assetPackage({
      'lib/client.js': '',
      'lib/assets/whale.png': WHALE,
      'lib/assets/icons/kept.svg': '<svg/>',
      'lib/assets/icons/stale.svg': '<svg/>',
      'lib/assets/old/deep/stale.webp': 'webp',
    })
    const { writeBundle } = browserPlugins(root)('dsh-package-asset')
    if (writeBundle === undefined) throw new Error('asset plugin has no writeBundle hook')
    const out = join(root, 'lib')
    const build = { meta: { watchMode: false } }

    await writeBundle.call(build, { dir: out }, { 'client.js': {}, 'assets/whale.png': {}, 'assets/icons/kept.svg': {} })

    expect(['client.js', 'assets/whale.png', 'assets/icons/kept.svg', 'assets/icons/stale.svg', 'assets/old']
      .map(path => [path, existsSync(join(out, path))]))
      .toEqual([
        ['client.js', true],
        ['assets/whale.png', true],
        ['assets/icons/kept.svg', true],
        ['assets/icons/stale.svg', false],
        ['assets/old', false],
      ])

    await writeBundle.call(build, { dir: out }, { 'client.js': {} })
    expect([existsSync(join(out, 'client.js')), existsSync(join(out, 'assets'))]).toEqual([true, false])
    await writeBundle.call(build, { dir: out }, { 'client.js': {} })
  })

  it('keeps earlier lib/assets files in a watch rebuild for pages running the previous generation', async () => {
    const root = await assetPackage({
      'lib/client.js': '',
      'lib/assets/whale-000000000000.png': WHALE,
    })
    const { writeBundle } = browserPlugins(root)('dsh-package-asset')
    if (writeBundle === undefined) throw new Error('asset plugin has no writeBundle hook')
    const out = join(root, 'lib')

    await writeBundle.call({ meta: { watchMode: true } }, { dir: out }, { 'client.js': {}, 'assets/whale-111111111111.png': {} })

    expect(existsSync(join(out, 'assets/whale-000000000000.png'))).toBe(true)
  })
})

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** The shell sheet is the contract owner; the packet restates it verbatim. */
const SHELL_SHEET = 'apps/web/src/index.css'
const LAYER_STATEMENT = /@layer\s+([^;{}]*);/

function parseLayerStatement(css: string): string[] {
  const match = LAYER_STATEMENT.exec(css)
  if (match === null) throw new Error('no @layer statement found')
  return match[1].split(',').map(name => name.trim()).filter(name => name !== '')
}

describe('embedded app stylesheet layer position', () => {
  it('restates the shell layer order so the position cannot depend on parse order', () => {
    // A layer is positioned when its name is first *seen*, and both the shell
    // sheet and every embedded app sheet are injected from JavaScript — so
    // naming the layer without restating its order lets the injector that ran
    // first decide whether `utilities` outranks the whole embedded sheet.
    const output = embedAppStylesheetInLayer('.x{color:red}')

    expect(parseLayerStatement(output)).toEqual(parseLayerStatement(readFileSync(join(REPO, SHELL_SHEET), 'utf8')))
    expect(output.endsWith(`@layer ${EMBEDDED_APP_CSS_LAYER}{.x{color:red}}`)).toBe(true)
  })

  it('keeps the embedded layer behind the shell utilities layer', () => {
    const order = [...EMBEDDED_APP_LAYER_ORDER]

    expect(order.indexOf('utilities')).toBeLessThan(order.indexOf(EMBEDDED_APP_CSS_LAYER))
    // The App Store family must outrank the shared embedded layer inside its
    // own surfaces, and the api-key embed must stay last of all.
    expect(order.indexOf(EMBEDDED_APP_CSS_LAYER)).toBeLessThan(order.indexOf(EMBEDDED_APPSTORE_CSS_LAYER))
    expect(order.indexOf(EMBEDDED_APPSTORE_CSS_LAYER)).toBeLessThan(order.indexOf('dsh-sdkwork-apikey-embed'))
    expect(new Set(order).size).toBe(order.length)
  })
})

describe('embedded app stylesheet scoping', () => {
  const SCOPE = '[data-appstore-surface]'

  it('splits a family sheet: document rules stay shared, utilities move scoped and late', () => {
    const css = [
      '@layer properties{@supports (color:red){*{--tw-test:0}}}',
      '@layer theme{:root,:host{--spacing:.25rem}}',
      '@layer base{*{box-sizing:border-box}}',
      '@layer utilities{.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}}',
      '@layer components{.card{padding:1rem}}',
      '@layer utilities{@container (min-width:48rem){.\\@3xl\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}}}',
      ':root{--store-token:1}',
      '.store-page{color:red}',
    ].join('')

    const output = embedAppStylesheetInLayer(css, {
      layer: EMBEDDED_APPSTORE_CSS_LAYER,
      scope: SCOPE,
      splitUtilities: true,
    })

    expect(output.startsWith(`@layer ${EMBEDDED_APP_LAYER_ORDER.join(', ')};`)).toBe(true)
    const sharedStart = output.indexOf(`@layer ${EMBEDDED_APP_CSS_LAYER}{`)
    const familyStart = output.indexOf(`@layer ${EMBEDDED_APPSTORE_CSS_LAYER}{`)
    expect(sharedStart).toBeGreaterThan(-1)
    expect(familyStart).toBeGreaterThan(sharedStart)

    const shared = output.slice(sharedStart, familyStart)
    const family = output.slice(familyStart)

    // Theme, preflight, components and the app's document rules stay in the
    // shared layer, so they cannot outrank other applications' utilities.
    expect(shared).toContain('@layer theme{:root,:host{--spacing:.25rem}}')
    expect(shared).toContain('@layer base{*{box-sizing:border-box}}')
    expect(shared).toContain('@layer components{.card{padding:1rem}}')
    expect(shared).toContain(':root{--store-token:1}')
    expect(shared).toContain('.store-page{color:red}')
    expect(shared).not.toContain('.grid-cols-1')

    // Both utilities blocks move into the family layer, under one surface scope.
    expect(family.startsWith(`@layer ${EMBEDDED_APPSTORE_CSS_LAYER}{@scope (${SCOPE}){`)).toBe(true)
    expect(family).toContain('.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}')
    expect(family).toContain('@container (min-width:48rem){.\\@3xl\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}}')
    expect(family).not.toContain('box-sizing:border-box')
    expect(family.endsWith('}}')).toBe(true)
  })

  it('keeps the shared layer and adds no scope without options', () => {
    const output = embedAppStylesheetInLayer('.x{color:red}')

    expect(output).not.toContain('@scope')
    expect(output.endsWith(`@layer ${EMBEDDED_APP_CSS_LAYER}{.x{color:red}}`)).toBe(true)
  })

  it('falls back to the whole-sheet scope when splitUtilities has no scope', () => {
    const output = embedAppStylesheetInLayer('@layer utilities{.p-4{padding:1rem}}', {
      layer: EMBEDDED_APPSTORE_CSS_LAYER,
      splitUtilities: true,
    })

    expect(output).toContain(`@layer ${EMBEDDED_APPSTORE_CSS_LAYER}{@layer utilities{.p-4{padding:1rem}}}`)
    expect(output).not.toContain('@scope')
  })

  it('does not let braces inside strings and comments close the block', () => {
    const css = '@layer utilities{.a::before{content:"}"}/* } */}.b{color:red}'
    const output = scopeStyleSheetUtilities(css, SCOPE)

    expect(output).toBe(`@layer utilities{@scope (${SCOPE}){.a::before{content:"}"}/* } */}}.b{color:red}`)
    expect(scopeStyleSheetUtilities('@layer utilities{.a{color:red}', SCOPE)).toBe('@layer utilities{.a{color:red}')
  })

  it('leaves a layer statement form unchanged', () => {
    expect(scopeStyleSheetUtilities('@layer utilities;.a{color:red}', SCOPE)).toBe('@layer utilities;.a{color:red}')
    expect(scopeStyleSheetUtilities('@layer utilities;@layer utilities{.a{color:red}}', SCOPE))
      .toBe(`@layer utilities;@layer utilities{@scope (${SCOPE}){.a{color:red}}}`)
  })
})

describe('client bundle images', () => {
  it('embeds an imported image as a watched data URL and ignores other modules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-client-image-watch-'))
    try {
      const image = join(root, 'preview.svg')
      const importer = join(root, 'index.ts')
      await writeFile(image, '<svg/>')
      const plugin = bundlePlugin('dsh-image-inline')
      const id = plugin.resolveId?.('./preview.svg', importer)
      if (typeof id !== 'string' || plugin.load === undefined) throw new Error('image plugin hooks are incomplete')
      const watched: string[] = []

      const output = await plugin.load.call({ addWatchFile: file => watched.push(file) }, id)

      expect(watched).toEqual([image])
      expect(output).toBe(`export default "data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}";`)
      expect(plugin.resolveId?.('./index.ts', importer)).toBeNull()
      expect(await plugin.load.call({ addWatchFile: file => watched.push(file) }, importer)).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

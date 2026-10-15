/**
 * Stylesheets and images enter client bundles through plugin loaders, which
 * must register their physical files as watch dependencies.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EMBEDDED_APP_CSS_LAYER,
  EMBEDDED_APP_LAYER_ORDER,
  clientBundle,
  embedAppStylesheetInLayer,
} from '../packages/client/tsdown.client.ts'

interface BundlePlugin {
  name: string
  resolveId?: (source: string, importer?: string) => string | null
  load?: (this: { addWatchFile(id: string): void }, id: string) => Promise<string | null>
}

function bundlePlugin(name: 'dsh-css-modules-inline' | 'dsh-css-global-inline' | 'dsh-css-text-inline' | 'dsh-image-inline'): BundlePlugin {
  const configs = clientBundle(
    join(import.meta.dirname, '../packages/client/ui-sidebar'),
    ['lib/types/index.js'],
  )({ env: { DSH_BUILD_FACE: 'client' } })
  const client = configs.find(config => config.platform === 'browser')
  if (client === undefined) throw new Error('client config missing')
  const plugins = (client as { plugins: BundlePlugin[] }).plugins
  const plugin = plugins.find(candidate => candidate.name === name)
  if (plugin === undefined) throw new Error(`${name} missing from client config`)
  return plugin
}

describe('client bundle CSS Modules', () => {
  it('registers the source stylesheet as a watch dependency', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-client-css-watch-'))
    try {
      const stylesheet = join(root, 'Fixture.module.css')
      const importer = join(root, 'index.ts')
      await writeFile(stylesheet, '.root { color: red; }\n')
      const plugin = bundlePlugin('dsh-css-modules-inline')
      const virtualId = plugin.resolveId?.('./Fixture.module.css', importer)
      if (typeof virtualId !== 'string' || plugin.load === undefined) {
        throw new Error('CSS Modules plugin hooks are incomplete')
      }
      const watched: string[] = []

      const output = await plugin.load.call({ addWatchFile: id => watched.push(id) }, virtualId)

      expect(watched).toEqual([stylesheet])
      expect(output).toContain('data-plugin-css')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('client bundle global CSS', () => {
  it('compiles a side-effect stylesheet into a watched style injector', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-client-global-css-watch-'))
    try {
      await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-css-fixture', private: true }))
      await mkdir(join(root, 'src'), { recursive: true })
      const stylesheet = join(root, 'src', 'base.css')
      const importer = join(root, 'src', 'index.ts')
      await writeFile(stylesheet, 'body { color: red; }\n')
      const plugin = bundlePlugin('dsh-css-global-inline')
      const virtualId = plugin.resolveId?.('./base.css', importer)
      if (typeof virtualId !== 'string' || plugin.load === undefined) {
        throw new Error('global CSS plugin hooks are incomplete')
      }
      const watched: string[] = []

      const output = await plugin.load.call({ addWatchFile: id => watched.push(id) }, virtualId)

      expect(watched).toEqual([stylesheet])
      expect(output).toContain('data-plugin-css')
      expect(output).toContain('body{color:red}')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('compiles inline stylesheets as watched text without a module side effect', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-client-inline-css-watch-'))
    try {
      await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-css-fixture', private: true }))
      await mkdir(join(root, 'src'), { recursive: true })
      const stylesheet = join(root, 'src', 'base.css')
      const importer = join(root, 'src', 'index.ts')
      await writeFile(stylesheet, 'body { color: red; }\n')
      const plugin = bundlePlugin('dsh-css-text-inline')
      const virtualId = plugin.resolveId?.('./base.css?inline', importer)
      if (typeof virtualId !== 'string' || plugin.load === undefined) {
        throw new Error('inline CSS plugin hooks are incomplete')
      }
      const watched: string[] = []

      const output = await plugin.load.call({ addWatchFile: id => watched.push(id) }, virtualId)

      expect(watched).toEqual([stylesheet])
      expect(output).toContain('export default "body{color:red}"')
      expect(output).not.toContain('data-plugin-css')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
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
    expect(new Set(order).size).toBe(order.length)
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

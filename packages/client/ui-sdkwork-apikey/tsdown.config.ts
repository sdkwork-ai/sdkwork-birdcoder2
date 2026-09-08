import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, optimize } from '@tailwindcss/node'
import { Scanner, type SourceEntry } from '@tailwindcss/oxide'
import { clientBundle, tailwindResolvers, type BuildFaceConfig } from '../tsdown.client.ts'
import { createSdkworkBrowserBuiltinsPlugin } from '../sdkwork-browser-builtins.ts'

const tailwindResolver = tailwindResolvers(import.meta.url)

/**
 * The api-keys embed must NOT ship the monaco editor core (multi-MB, CSS
 * sheets the client bundle pipeline cannot process, worker entry imports).
 * The client half therefore stubs the two static `?worker` specifiers and
 * externalizes the bare `monaco-editor` dynamic import — its failure is
 * caught by ConfigCodeEditor's degraded read-only <pre> fallback, so the
 * usage-details drawer stays functional without the editor.
 */
const WORKER_STUB = resolve(import.meta.dirname, 'src/client/monacoWorkerStub.ts')
const MONACO_WORKER_SPECIFIERS = [
  'monaco-editor/esm/vs/editor/editor.worker?worker',
  'monaco-editor/esm/vs/language/json/json.worker?worker',
] as const

const base = clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-apikey', ['lib/types/index.js'])
const PACKAGE_ROOT = fileURLToPath(new URL('./', import.meta.url))
const SPACE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const VIEW_CSS = resolve(PACKAGE_ROOT, 'src/client/apiKeysView.css')
const VIRTUAL_SUFFIX = '.mjs'
const TAILWIND_PREFIX = '\0dsh-apikey-tailwind:'
const PLAIN_CSS_PREFIX = '\0dsh-apikey-css:'
const BROWSER_BUILTIN_PREFIX = '\0dsh-apikey-browser-builtin:'

/**
 * The embedded cloudrouter console view speaks react-i18next, and the bundle
 * graph pulls TWO installs without a pin: the plugin's own init resolves the
 * workspace's react-i18next (17.0.13) while ApiKeysView's imports resolve
 * through the cloudrouter checkout's virtual store (17.0.11). Each copy has
 * its own module-level `i18nInstance` singleton, so `ensureConsoleApiKeysI18n`
 * initialized copy A while every `useTranslation()` in the view read copy B —
 * an uninitialized instance whose `t(key)` returns only the defaultValue, or
 * the raw key when no defaultValue is passed (`common.actions.createKey`
 * rendered literally in the modal). Pin both specifiers to THIS package's
 * resolution so the init and the consumers share one instance (the same
 * dual-context class of bug the react-router pin in ui-sdkwork-markets
 * fixes).
 */
const pluginRequire = createRequire(resolve(PACKAGE_ROOT, 'package.json'))
const I18N_PIN_ALIASES = {
  i18next: pluginRequire.resolve('i18next'),
  'react-i18next': pluginRequire.resolve('react-i18next'),
} as const

/** Source roots the view's utilities live in (mirrors the @source rows in apiKeysView.css). */
const VIEW_SOURCE_ROOTS = [
  resolve(PACKAGE_ROOT, 'src/client'),
  resolve(
    SPACE_ROOT,
    'sdkwork-cloudrouter/apps/sdkwork-cloudrouter-pc/packages/sdkwork-cloudrouter-pc-console-api-keys/src',
  ),
  resolve(
    SPACE_ROOT,
    'sdkwork-cloudrouter/apps/sdkwork-cloudrouter-pc/packages/sdkwork-cloudroutes-pc-commons/src',
  ),
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
    "  tag.dataset.plugin = '@deepseek-ai/dsh-client-ui-sdkwork-apikey';",
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    'export default css;',
  ].join('\n')
}

function physicalCssPath(source: string, importer: string | undefined): string | undefined {
  const normalizedSource = source.replaceAll('\\', '/')
  // The modal imports `./apiKeysView.css`; match the file name regardless of
  // the spelling (relative, directory-qualified, or absolute) the bundler
  // passes — the same idiom ui-sdkwork-token-plan uses for tokenPlan.css.
  if (normalizedSource.endsWith('apiKeysView.css')) {
    return VIEW_CSS
  }
  if (isAbsolute(source)) return source
  if (source.startsWith('.') && importer !== undefined) return resolve(dirname(importer), source)
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
      return readPlainCss(resolve(dirname(cssPath), specifier), seen)
    },
  )
  return imported
    .replaceAll(/^@source\s+[^;]+;/gmu, '')
    .replaceAll(/^@variant\s+[^;]+;/gmu, '')
    .replaceAll(/^@custom-variant\s+[^;]+;/gmu, '')
}

async function compileViewTailwindCss(this: ResolverContext, cssPath: string): Promise<string> {
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
  const compiled = optimize(compiler.build(candidates), { minify: true }).code
  for (const file of scanner.files) dependencies.add(file)
  for (const glob of scanner.globs) dependencies.add(glob.base)
  for (const entry of sources) dependencies.add(entry.base)
  for (const dependency of dependencies) this.addWatchFile(dependency)
  return compiled
}

const withRealSdkwork: BuildFaceConfig = (env) => {
  const list = base(env)
  const resolved = Array.isArray(list) ? list : [list]
  for (const config of resolved) {
    if (typeof config !== 'object' || config === null) continue
    const record = config as {
      entry?: unknown
      alias?: Record<string, string>
      plugins?: unknown[]
      deps?: {
        neverBundle?: (specifier: string) => boolean
        alwaysBundle?: (specifier: string) => boolean
      }
    }
    const entry = record.entry
    const entrySpecifier = typeof entry === 'string'
      ? entry
      : entry && typeof entry === 'object'
        ? Object.values(entry as Record<string, unknown>)[0]
        : undefined
    // The monaco guards apply to EVERY face (client bundle and lib/types):
    // the sibling api-keys console source reached the public type surface, so
    // the types build resolves the same `?worker` specifiers (invalid Windows
    // file names) and the same dynamic `monaco-editor` import (whose esm tree
    // drags CSS sheets the pipeline cannot process).
    if (typeof entrySpecifier !== 'string') {
      continue
    }
    const isBrowserFace = (record as { platform?: string }).platform === 'browser'
    record.alias = {
      ...record.alias,
      // The i18n pin applies only to the browser bundle: the lib/types face
      // must keep emitting plain imports (its consumers resolve normally).
      ...(isBrowserFace ? I18N_PIN_ALIASES : {}),
      ...Object.fromEntries(MONACO_WORKER_SPECIFIERS.map(specifier => [specifier, WORKER_STUB])),
    }
    // Alias keys containing '?' are not matched by rolldown's alias resolver
    // (it treats the specifier as a path and rejects the character); an
    // explicit resolveId hook is the reliable interception point.
    const monacoGuard = {
      name: 'dsh-monaco-worker-stub',
      resolveId(source: string) {
        if ((MONACO_WORKER_SPECIFIERS as readonly string[]).includes(source)) return WORKER_STUB
        return null
      },
    }
    record.plugins = isBrowserFace
      ? [
          // These run BEFORE the preset's CSS plugins so the Tailwind compile
          // claims apiKeysView.css first: dsh-css-global-inline would
          // otherwise inline the sheet verbatim and its bare @import/@plugin
          // directives would ship unresolved into a <style> tag.
          createSdkworkBrowserBuiltinsPlugin('dsh-apikey-browser-builtins', BROWSER_BUILTIN_PREFIX, VIRTUAL_SUFFIX),
          {
            name: 'dsh-apikey-tailwind-css',
            resolveId(source: string, importer: string | undefined) {
              const physical = physicalCssPath(source, importer)
              if (physical !== VIEW_CSS) return null
              return TAILWIND_PREFIX + VIEW_CSS + VIRTUAL_SUFFIX
            },
            async load(this: ResolverContext, id: string) {
              if (!id.startsWith(TAILWIND_PREFIX)) return null
              const cssPath = id.slice(TAILWIND_PREFIX.length, -VIRTUAL_SUFFIX.length)
              const compiled = await compileViewTailwindCss.call(this, cssPath)
              return virtualStyleModule('@deepseek-ai/dsh-client-ui-sdkwork-apikey/api-keys-view.css', compiled)
            },
          },
          {
            name: 'dsh-apikey-plain-css-inline',
            async resolveId(this: ResolverContext, source: string, importer: string | undefined) {
              if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
              const physical = physicalCssPath(source, importer)
              const resolvedCss = physical === undefined
                ? await (this as ResolverContext).resolve(source, importer, { skipSelf: true })
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
                '@deepseek-ai/dsh-client-ui-sdkwork-apikey/' + cssPath,
                await readPlainCss(cssPath, new Set()),
              )
            },
          },
          monacoGuard,
          ...((record.plugins as unknown[]) ?? []),
        ]
      : [monacoGuard, ...((record.plugins as unknown[]) ?? [])]
    const deps = record.deps
    if (deps !== undefined) {
      const { neverBundle, alwaysBundle } = deps
      deps.neverBundle = (specifier: string) =>
        specifier === 'monaco-editor' || (typeof neverBundle === 'function' && neverBundle(specifier))
      if (typeof alwaysBundle === 'function') {
        deps.alwaysBundle = (specifier: string) =>
          specifier !== 'monaco-editor' && alwaysBundle(specifier)
      }
    }
  }
  return resolved
}

export default withRealSdkwork

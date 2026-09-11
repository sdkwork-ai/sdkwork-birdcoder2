import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import tsdownConfig from '../tsdown.config.ts'

const hostRequire = createRequire(import.meta.url)

/**
 * Electron loads sandboxed preloads through `executeSandboxedPreloadScripts`,
 * whose `require` is a restricted polyfill that resolves only the modules
 * below. A relative require of a sibling emitted chunk therefore throws
 * `module not found: ./ipc-<hash>.cjs`, the contextBridge bridge is never
 * exposed, and the renderer loses `window.dshDesktop` with no build error.
 *
 * Code splitting reintroduces exactly that failure whenever the preload entries
 * share a module, so both the build contract and the built artifacts are
 * guarded here.
 */
const SANDBOX_MODULES = new Set(['electron', 'events', 'timers', 'url'])

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const LIB_DIR = join(APP_ROOT, 'lib')
const PRELOAD_FILES = ['preload.cjs', 'preload-app.cjs']

interface PreloadConfig {
  readonly entry: Record<string, string>
  readonly outputOptions?: { readonly codeSplitting?: boolean }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function configs(): PreloadConfig[] {
  const configs = Array.isArray(tsdownConfig) ? tsdownConfig : [tsdownConfig]
  return configs.filter((config): config is PreloadConfig => (
    isRecord(config)
    && isRecord(config.entry)
    && !Array.isArray(config.entry)
    && Object.values(config.entry).some(source => typeof source === 'string' && /preload/u.test(source))
  ))
}

interface ExposedBridge {
  readonly key: string
  readonly value: Record<string, unknown>
}

/** Loads one preload the way the sandbox bundle does, returning exposed worlds. */
function loadSandboxedPreload(file: string): ExposedBridge[] {
  const exposed: ExposedBridge[] = []
  const electronStub = {
    contextBridge: { exposeInMainWorld: (key: string, value: Record<string, unknown>) => { exposed.push({ key, value }) } },
    ipcRenderer: { invoke: () => Promise.resolve(), on: () => {}, off: () => {} },
  }
  const preloadRequire = (specifier: string): unknown => {
    if (!SANDBOX_MODULES.has(specifier)) throw new Error(`module not found: ${specifier}`)
    return specifier === 'electron' ? electronStub : hostRequire(specifier) as unknown
  }

  const filePath = join(LIB_DIR, file)
  const source = readFileSync(filePath, 'utf8')
  const specifiers = source.match(/require\("([^"]+)"\)/gu) ?? []
  for (const match of specifiers) {
    const specifier = match.slice('require("'.length, -2)
    if (!SANDBOX_MODULES.has(specifier)) throw new Error(`${file} requires the unsupported module "${specifier}"`)
  }

  const emit = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {${source}\n})`,
    { filename: filePath },
  ) as (exports: unknown, require: (specifier: string) => unknown, module: unknown, filename: string, dirname: string) => void
  emit({}, preloadRequire, { exports: {} }, filePath, LIB_DIR)
  return exposed
}

describe('sandboxed preload bundling', () => {
  it('builds every preload entry as a single config with code splitting disabled', () => {
    const preloadConfigs = configs()
    expect(preloadConfigs.length).toBeGreaterThan(0)
    for (const config of preloadConfigs) {
      expect(Object.keys(config.entry)).toHaveLength(1)
      expect(config.outputOptions?.codeSplitting).toBe(false)
    }
  })
})

describe.skipIf(!PRELOAD_FILES.every(file => existsSync(join(LIB_DIR, file))))('built sandboxed preloads', () => {
  it.each(PRELOAD_FILES)('%s is self-contained with no relative chunk require', (file) => {
    const source = readFileSync(join(LIB_DIR, file), 'utf8')
    expect(source).not.toMatch(/require\("\./u)
  })

  it.each(PRELOAD_FILES)('%s exposes window.dshDesktop under the sandbox require', (file) => {
    const exposed = loadSandboxedPreload(file)
    const bridge = exposed.find(entry => entry.key === 'dshDesktop')
    expect(bridge).toBeDefined()
    expect(bridge?.value.protocolVersion).toBe(1)
  })

  it('inlines the shared IPC channel names instead of emitting an ipc-* chunk', () => {
    const source = readFileSync(join(LIB_DIR, 'preload.cjs'), 'utf8')
    expect(source).toContain('dsh-desktop:locale-get')
    expect(source).toContain('dsh-desktop:app-quit')
  })
})

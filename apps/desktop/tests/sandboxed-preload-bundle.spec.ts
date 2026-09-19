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
// Every preload main.ts loads beside the built main.js, each entry's own
// self-contained `.cjs`: the product bridge plus the two modal bridges.
const PRELOAD_FILES = [
  { file: 'preload-app.cjs', url: 'dsh-app://app/index.html', bridge: 'dshDesktop' },
  { file: 'preload-mandatory.cjs', url: 'dsh-app://shell/mandatory-update.html', bridge: 'dshMandatoryUpdate' },
  { file: 'preload-update-dialog.cjs', url: 'dsh-app://shell/update-dialog.html', bridge: 'dshUpdateDialog' },
]

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
function loadSandboxedPreload(file: string, url: string): ExposedBridge[] {
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

  // The bundles read `location` to scope their exposure, exactly as the
  // Electron shell does; run under the preload's own document location. The
  // product bridge also marks `document.documentElement`, so the stub carries a
  // minimal document root.
  const existingLocation = globalThis.location
  globalThis.location = { href: url } as Location
  const existingDocument = (globalThis as { document?: unknown }).document
  if (existingDocument === undefined) {
    ;(globalThis as { document?: unknown }).document = {
      documentElement: { dataset: {}, getAttribute: () => null, addEventListener: () => {} },
      addEventListener: () => {},
    }
  }
  try {
    const emit = vm.runInThisContext(
      `(function (exports, require, module, __filename, __dirname) {${source}\n})`,
      { filename: filePath },
    ) as (exports: unknown, require: (specifier: string) => unknown, module: unknown, filename: string, dirname: string) => void
    emit({}, preloadRequire, { exports: {} }, filePath, LIB_DIR)
  } finally {
    if (existingLocation === undefined) delete (globalThis as { location?: unknown }).location
    else globalThis.location = existingLocation
    if (existingDocument === undefined) delete (globalThis as { document?: unknown }).document
  }
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

describe.skipIf(!PRELOAD_FILES.every(preload => existsSync(join(LIB_DIR, preload.file))))('built sandboxed preloads', () => {
  it.each(PRELOAD_FILES)('$file is self-contained with no relative chunk require', (preload) => {
    const source = readFileSync(join(LIB_DIR, preload.file), 'utf8')
    expect(source).not.toMatch(/require\("\./u)
  })

  it.each(PRELOAD_FILES)('$file exposes its bridge under the sandbox require', (preload) => {
    const exposed = loadSandboxedPreload(preload.file, preload.url)
    const bridge = exposed.find(entry => entry.key === preload.bridge)
    expect(bridge).toBeDefined()
    if (preload.bridge === 'dshDesktop') expect(bridge?.value.protocolVersion).toBe(1)
  })

  it('inlines the shared IPC channel names instead of emitting an ipc-* chunk', () => {
    const source = readFileSync(join(LIB_DIR, 'preload-app.cjs'), 'utf8')
    expect(source).toContain('dsh-desktop:updates-status')
    expect(source).toContain('dsh-desktop:directory-pick')
  })
})

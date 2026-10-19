/** Linux under the Electron binary refuses sharp; every other platform keeps it. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, type ResolveHookSync } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { installLinuxSharpGuard, refuseSharp } from '../src/sharp-platform.ts'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'desktop-sharp-guard-'))
  for (const name of ['sharp', 'other']) {
    const directory = join(root, 'node_modules', name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version: '0.0.0', main: 'index.cjs' }))
    writeFileSync(join(directory, 'index.cjs'), `module.exports = { kind: '${name}' }\n`)
  }
  return { root, requireFrom: createRequire(join(root, 'entry.cjs')) }
}

it('refuses the bare sharp specifier and delegates every other request', () => {
  const resolve = refuseSharp()
  const nextResolve = vi.fn(() => ({ url: 'file:///resolved.mjs', shortCircuit: true }))
  const context = { conditions: [], importAttributes: {}, parentURL: undefined }
  expect(() => resolve('sharp', context, nextResolve)).toThrow(/Linux Electron Host/u)
  expect(nextResolve).not.toHaveBeenCalled()
  expect(resolve('sharpness', context, nextResolve)).toEqual({ url: 'file:///resolved.mjs', shortCircuit: true })
  expect(nextResolve).toHaveBeenCalledWith('sharpness', context)
})

it('installs only when Linux runs the Host under Electron', () => {
  const installed: Array<{ resolve: ResolveHookSync }> = []
  const register = (hooks: { resolve: ResolveHookSync }) => {
    installed.push(hooks)
    return { deregister: vi.fn() }
  }
  expect(installLinuxSharpGuard({ platform: 'linux', electron: '44.7.0', register })).toBeDefined()
  expect(installed).toHaveLength(1)
  expect(installLinuxSharpGuard({ platform: 'linux', electron: undefined, register })).toBeUndefined()
  expect(installLinuxSharpGuard({ platform: 'win32', electron: '44.7.0', register })).toBeUndefined()
  expect(installLinuxSharpGuard({ platform: 'darwin', electron: '44.7.0', register })).toBeUndefined()
  expect(installed).toHaveLength(1)
})

it('rejects a real require of sharp and leaves other packages loadable', () => {
  const { root, requireFrom } = fixture()
  const guard = installLinuxSharpGuard({ platform: 'linux', electron: '44.7.0' })
  if (guard === undefined) throw new Error('the guard must install for Linux under Electron')
  try {
    expect(() => requireFrom('sharp')).toThrow(/Linux Electron Host/u)
    expect(requireFrom('other')).toEqual({ kind: 'other' })
  } finally {
    guard.deregister()
    rmSync(root, { recursive: true, force: true })
  }
})

it('rejects a dynamic import in the real Node ESM loader', () => {
  // Vitest runs test modules through Vite's runner, which would resolve the import
  // itself; the Host and the IM plugin use Node's own loader, so probe it in a child.
  const { root } = fixture()
  const source = pathToFileURL(fileURLToPath(new URL('../src/sharp-platform.ts', import.meta.url))).href
  writeFileSync(join(root, 'client.mjs'),
    "export const loaded = import('sharp').then(module => module.default.kind, error => error.message)\n")
  writeFileSync(join(root, 'probe.mjs'), [
    "import { registerHooks } from 'node:module'",
    `import { refuseSharp } from ${JSON.stringify(source)}`,
    'registerHooks({ resolve: refuseSharp() })',
    "const { loaded } = await import('./client.mjs')",
    'process.stdout.write(await loaded)',
  ].join('\n'))
  try {
    const output = execFileSync(process.execPath, ['--experimental-strip-types', join(root, 'probe.mjs')],
      { cwd: root, encoding: 'utf8' })
    expect(output).toMatch(/Linux Electron Host/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

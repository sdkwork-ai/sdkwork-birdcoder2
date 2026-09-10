import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, basename, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const packageRoot = resolve(import.meta.dirname, '..')
const bundlePath = join(packageRoot, 'lib/client.js')
const require = createRequire(import.meta.url)
const licenseNames = [
  'LICENSE',
  'cmaps/LICENSE',
  'standard_fonts/LICENSE_FOXIT',
  'standard_fonts/LICENSE_LIBERATION',
  'wasm/LICENSE_JBIG2',
  'wasm/LICENSE_OPENJPEG',
  'wasm/LICENSE_PDFJS_JBIG2',
  'wasm/LICENSE_PDFJS_OPENJPEG',
  'wasm/LICENSE_PDFJS_QCMS',
  'wasm/LICENSE_QCMS',
] as const

function run(command: string, args: string[], cwd: string, timeout: number): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout })
  expect(result.error).toBeUndefined()
  expect(result.signal, result.stderr).toBeNull()
  expect(result.status, result.stderr).toBe(0)
  return result.stdout
}

function runPnpm(args: string[], cwd: string, timeout: number): string {
  const entrypoint = process.env.npm_execpath
  if (entrypoint === undefined || entrypoint === '') {
    if (process.platform === 'win32') throw new Error('npm_execpath is required to run pnpm on Windows')
    return run('pnpm', args, cwd, timeout)
  }
  return /\.[cm]?js$/iu.test(entrypoint)
    ? run(process.execPath, [entrypoint, ...args], cwd, timeout)
    : run(entrypoint, args, cwd, timeout)
}

describe('published PDF.js licenses', () => {
  it.skipIf(!existsSync(bundlePath))('keeps every bundled license in the packed client artifact', ({ task }) => {
    const output = mkdtempSync(join(tmpdir(), 'dsh-document-preview-pack-'))
    try {
      // pnpm prints one object; npm (when npm_execpath resolves there) wraps
      // the same shape in a one-element array.
      const parsed = JSON.parse(runPnpm([
        'pack', '--json', '--pack-destination', output,
      ], packageRoot, task.timeout)) as
        | { filename: string; files: { path: string }[] }
        | readonly { filename: string; files: { path: string }[] }[]
      const packed = Array.isArray(parsed) ? parsed[0]! : parsed
      expect(packed.files.map(file => file.path)).toContain('lib/client.js')
      expect(packed.files.some(file => file.path.endsWith('pdfjs-NOTICES.txt'))).toBe(false)

      // pnpm 11 reports an absolute tarball path while npm names the file
      // relative to the destination; both write the tarball into `output`.
      // GNU tar reads a leading `C:` as a remote host unless --force-local
      // disables that, and MSYS builds want forward slashes.
      const tarball = resolve(output, basename(packed.filename))
      const tarArgs = process.platform === 'win32'
        ? ['--force-local', '-xOf', tarball.replaceAll('\\', '/'), 'package/lib/client.js']
        : ['-xOf', tarball, 'package/lib/client.js']
      const client = run('tar', tarArgs, packageRoot, task.timeout)
      expect(client).toContain('//! Bundled PDF.js license notices')
      const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'))
      for (const name of licenseNames) {
        const source = readFileSync(join(pdfRoot, name), 'utf8').trimEnd()
        const commented = [`// ${name}`, '// ', ...source.split('\n').map(line => `// ${line}`)].join('\n')
        expect(client, `${name} must be visible in package/lib/client.js`).toContain(commented)
      }
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  })
})

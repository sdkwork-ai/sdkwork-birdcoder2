/** Resolve packaged Office engine manifests from their complete, unpacked resource directories. */
import { registerHooks, type ModuleHooks } from 'node:module'
import { realpathSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Locate the archive containing a packaged runtime.
 * @param runtimeDir - Prepared or ASAR-contained runtime directory.
 * @returns Parent archive path, or undefined for a prepared directory.
 */
export function runtimeArchivePath(runtimeDir: string): string | undefined {
  const parent = dirname(runtimeDir)
  return basename(parent) === 'app.asar' ? parent : undefined
}

/**
 * Keep engine executable and resource paths usable by native child processes outside Electron.
 * Hooks apply only to this thread; worker threads must install their own resolver.
 *
 * FORK DIVERGENCE: upstream rewrites only the platform engine packages
 * (`libreoffice-kit-<platform>-<arch>` / `-<platform>-` for the helpers). Leaving the
 * `@deepseek-ai/libreoffice-kit` adapter itself inside the archive breaks the
 * adapter's own engine probe: it decides whether a declared engine is installed with
 * `lstatSync(join(directory, name), { throwIfNoEntry: false }) !== undefined`
 * (`installedPackageExists`), and Electron's ASAR `lstatSync` answers a missing entry
 * with `null` where Node answers `undefined`. Every candidate directory under the
 * archive therefore looks installed, so a genuinely absent platform package is
 * reported as an incomplete installation instead of falling back to WASM — which is
 * the documented Linux behaviour (`2026-09-15-platform-office-engines`: "current
 * Linux distributions select WASM") and made the packaged Linux release lanes fail
 * in `smoke-packaged-runtime.ts`. Redirecting the adapter — and with it the platform
 * engine packages it resolves — onto the physical unpacked tree puts the probe back on
 * real filesystem semantics, because `installedPackageExists` derives its candidate
 * directories from the adapter's own location through `require.resolve.paths`. The WASM
 * engine stays where upstream keeps it: a Linux target unpacks it too, so ordinary
 * resolution already reaches the unpacked copy from the unpacked adapter.
 * @param runtimeDir - Prepared or ASAR-contained dsh runtime directory.
 * @returns Installed resolver for the Host lifetime, or undefined for a non-ASAR runtime.
 */
export function installOfficeEngineResolution(runtimeDir: string): ModuleHooks | undefined {
  if (runtimeArchivePath(runtimeDir) === undefined) return undefined
  const root = realpathSync(runtimeDir)
  const archive = dirname(root)
  const scope = join(root, 'node_modules', '@deepseek-ai')
  const source = `${pathToFileURL(scope).href}/`
  const destination = `${pathToFileURL(join(`${archive}.unpacked`, relative(archive, root), 'node_modules', '@deepseek-ai')).href}/`
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context)
      if (!/^@deepseek-ai\/libreoffice-kit(?:\/|-|$)/u.test(specifier)) return resolved
      // The WASM engine keeps upstream's archived location. It is the engine a Linux
      // target unpacks (`selectOfficeEngine` falls back to `wasm` whenever the kit
      // manifest declares no native package for the target), so its files sit on the
      // unpacked tree as well and ordinary resolution already reaches them from the
      // unpacked adapter. Pinning the specifier would only add a way to miss it.
      if (/^@deepseek-ai\/libreoffice-kit-wasm(?:\/|$)/u.test(specifier)) return resolved
      const canonical = pathToFileURL(realpathSync(fileURLToPath(resolved.url))).href
      if (!canonical.startsWith(source)) {
        if (canonical.startsWith(pathToFileURL(`${archive}/`).href)) {
          throw new Error(`desktop Office engine resolved outside the runtime package directory: ${resolved.url}`)
        }
        return resolved
      }
      const physical = realpathSync(fileURLToPath(destination + canonical.slice(source.length)))
      return { ...resolved, url: pathToFileURL(physical).href }
    },
  })
}

/**
 * Browser shims for Node built-ins referenced transitively by embedded SDKWork
 * PC surfaces (markdown/vfile, runtime env probes, etc.). Used only from package
 * tsdown.config.ts build scripts — never imported by client bundles.
 */

/** Node built-ins that must not remain as loader externals in browser bundles. */
export const BROWSER_ONLY_NODE_BUILTINS = new Set(['fs', 'path', 'process', 'url', 'worker_threads'])

/**
 * Minimal ESM source for one browser-safe Node built-in stub.
 * @param builtin - normalized built-in name without the `node:` prefix.
 * @returns virtual module source inlined by tsdown/rolldown.
 */
export function browserBuiltinModule(builtin: string): string {
  switch (builtin) {
    case 'process':
      return [
        'const processShim = {',
        '  cwd: () => "/",',
        '  env: {},',
        '  browser: true,',
        '};',
        'export default processShim;',
      ].join('\n')
    case 'url':
      return [
        'export function fileURLToPath(url) {',
        '  const href = typeof url === "string" ? url : String(url?.href ?? url);',
        '  if (href.startsWith("file://")) {',
        '    return decodeURIComponent(href.slice(href.startsWith("file:///") ? 8 : 7));',
        '  }',
        '  return href;',
        '}',
        'export function pathToFileURL(path) {',
        '  const normalized = path.startsWith("/") ? path : `/${path}`;',
        '  return new URL(`file://${normalized}`);',
        '}',
        'export { fileURLToPath as urlToPath };',
        'export default { fileURLToPath, pathToFileURL };',
      ].join('\n')
    case 'path':
      return [
        'const sep = "/";',
        'function normalize(path) { return path.replace(/\\\\/g, "/"); }',
        'function join(...parts) {',
        '  return normalize(parts.filter(Boolean).join("/")).replace(/\\/+/g, "/");',
        '}',
        'function dirname(path) {',
        '  const normalized = normalize(path);',
        '  const index = normalized.lastIndexOf("/");',
        '  return index <= 0 ? (normalized.startsWith("/") ? "/" : ".") : normalized.slice(0, index);',
        '}',
        'function basename(path, ext) {',
        '  const normalized = normalize(path);',
        '  const name = normalized.slice(normalized.lastIndexOf("/") + 1);',
        '  return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;',
        '}',
        'function extname(path) {',
        '  const normalized = normalize(path);',
        '  const index = normalized.lastIndexOf(".");',
        '  return index <= normalized.lastIndexOf("/") ? "" : normalized.slice(index);',
        '}',
        'const minpath = { sep, join, dirname, basename, extname, normalize };',
        'export { minpath };',
        'export default minpath;',
      ].join('\n')
    default:
      return 'export default {};'
  }
}

/**
 * Rolldown plugin that inlines browser-safe Node built-in shims for embedded
 * SDKWork PC bundles loaded through BirdCoder's module loader.
 * @param name - plugin name for tsdown diagnostics.
 * @param prefix - virtual module prefix unique to the owning package config.
 * @param virtualSuffix - suffix keeping virtual ids out of tsdown's css guard.
 * @returns a tsdown-compatible plugin object.
 */
export function createSdkworkBrowserBuiltinsPlugin(
  name: string,
  prefix: string,
  virtualSuffix = '.mjs',
) {
  return {
    name,
    resolveId(source: string) {
      const normalized = source.startsWith('node:') ? source.slice('node:'.length) : source
      return BROWSER_ONLY_NODE_BUILTINS.has(normalized)
        ? prefix + normalized + virtualSuffix
        : null
    },
    load(id: string) {
      if (!id.startsWith(prefix)) return null
      const builtin = id.slice(prefix.length, -virtualSuffix.length)
      return browserBuiltinModule(builtin)
    },
  }
}

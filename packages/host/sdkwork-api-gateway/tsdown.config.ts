import { defineConfig } from 'tsdown'
import { hostOnlyTsdownConfig } from '../../../scripts/tsdown-build-face.ts'

/**
 * Two Node entries: the default plugin (`lib/index.js`, the sdkworkApiFallback
 * + sdkworkEventUpgrades provider) and the desktop carrier node half
 * (`lib/desktop.js`, the desktop-connection plugin the Electron main process
 * mounts). The Client pass builds nothing — the package has no browser face.
 */
const HOST_LIBRARY = {
  entry: ['lib/types/index.js', 'lib/types/desktop.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  // Inline the `connection` helpers these node halves reach through `/src/*`
  // specifiers. They have no built entry: `connection` exports `./src/*`
  // verbatim, so an externalized `@deepseek-ai/dsh-client-connection/src/...ts`
  // import survives into the shipped chunk and resolves to TypeScript SOURCE at
  // runtime. Node's ESM loader rejects it with ERR_UNKNOWN_FILE_EXTENSION the
  // moment the Loader imports this package, which fails desktop host boot with
  // `failed to import loader entry sdkwork-api-gateway` — invisible to
  // typecheck, which resolves the same specifier through tsconfig paths.
  // Bundling is also what keeps a fork host package self-contained: the copied
  // helpers are compiled from this same tree in the same pass, so they cannot
  // drift from `connection`'s own copy.
  deps: {
    alwaysBundle: [/@deepseek-ai\/dsh-client-connection\/src\//],
  },
} as const

export default defineConfig((options, meta) => hostOnlyTsdownConfig(HOST_LIBRARY, options, meta))

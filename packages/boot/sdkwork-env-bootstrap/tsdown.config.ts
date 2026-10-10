import { defineConfig } from 'tsdown'
import { hostOnlyTsdownConfig } from '../../../scripts/tsdown-build-face.ts'

/**
 * Keep the optional IAM credential-entry import as a runtime specifier.
 * Bundling it rewrites `import('@sdkwork/iam-credential-entry/node-bootstrap')`
 * to a hashed chunk that Electron resolves next to the wrong `lib/` and
 * swallows, so `pnpm desktop:dev` never generates a token.
 *
 * Bundling resolves the real SDKWork packages, not the emit project's
 * declaration facades: a `.d.ts` facade carries no runtime module to inline.
 */
const HOST_LIBRARY = {
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  tsconfig: 'tsconfig.bundle.json',
  deps: {
    neverBundle: ['@sdkwork/iam-credential-entry'],
  },
} as const

export default defineConfig((options, meta) => hostOnlyTsdownConfig(HOST_LIBRARY, options, meta))

import { defineConfig } from 'tsdown'
import { isClientBuildFace } from '../../../scripts/tsdown-build-face.ts'

/** Host-only library: the Client tsdown pass has no tsc emit for this package. */
const CLIENT_PASS_SKIP = { entry: '' } as const

/**
 * Keep the optional IAM credential-entry import as a runtime specifier.
 * Bundling it rewrites `import('@sdkwork/iam-credential-entry/node-bootstrap')`
 * to a hashed chunk that Electron resolves next to the wrong `lib/` and
 * swallows, so `pnpm desktop:dev` never generates a token.
 */
const HOST_LIBRARY = {
  entry: ['lib/types/index.js', 'lib/types/invariant.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    neverBundle: ['@sdkwork/iam-credential-entry'],
  },
} as const

export default defineConfig((options, meta) => (
  isClientBuildFace(options, meta) ? CLIENT_PASS_SKIP : HOST_LIBRARY
))

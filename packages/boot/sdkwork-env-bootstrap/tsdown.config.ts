import { defineConfig } from 'tsdown'

/**
 * Keep the optional IAM credential-entry import as a runtime specifier.
 * Bundling it rewrites `import('@sdkwork/iam-credential-entry/node-bootstrap')`
 * to a hashed chunk that Electron resolves next to the wrong `lib/` and
 * swallows, so `pnpm desktop:dev` never generates a token.
 */
export default defineConfig({
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
})

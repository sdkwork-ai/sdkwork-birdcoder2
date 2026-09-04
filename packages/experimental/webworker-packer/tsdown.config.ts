import { defineConfig } from 'tsdown'

/**
 * The packer ships TWO entries: the library (`index`) and the `dsh-pack-vfs-image`
 * CLI (`bin`), the latter referenced by package.json `bin`. The root tsdown
 * builds only `lib/types/index.js`, so this override adds `lib/types/bin.js`.
 * Declarations come from `tsc -b` (dts: false), matching every package.
 */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/bin.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  // The runtime's `/src/*` export resolves to TypeScript SOURCE, so an
  // externalized specifier survives into the shipped chunk and dies in Node
  // with ERR_UNKNOWN_FILE_EXTENSION the moment anyone runs the
  // `dsh-pack-vfs-image` CLI or imports this library. Inline the two maps the
  // packer reads — they are small constant tables compiled from this same tree
  // in this same pass, so they cannot drift from the runtime's own copy.
  deps: {
    alwaysBundle: [/@deepseek-ai\/dsh-experimental-webworker-runtime\/src\//],
  },
})

import { clientBundle } from '../tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-client-connection', [
  'lib/types/index.js',
  // Source entry (not lib/types/desktop.js): the desktop-bridge compiles an
  // ocean of references before the dependency's tsc pass can emit the .js, so
  // tsdown's lib/types entry would see ENOENT on platforms whose parallel
  // build schedules the consumer first. Passing the .ts source lets tsdown
  // compile it in the same pass, which is also what keeps the artifact
  // self-contained (single source tree, single compilation).
  'src/client/desktop-bridge.ts',
])

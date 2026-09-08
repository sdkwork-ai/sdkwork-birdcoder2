import { clientBundle } from '../tsdown.client.ts'

// The desktop-bridge entry uses a .ts source path (not lib/types/desktop.js):
// the bridge only has type exports and no runtime dependency on any other
// compiled package, so tsdown compiling it directly removes the CI race where
// tsdown read lib/types/desktop.js before tsc emitted it. The object entry
// syntax pins the output basename to desktop (without it, tsdown preserves the
// src/client/ segment under lib/ and electron's package.json files gate would
// silently drop the artifact).
export default clientBundle('@deepseek-ai/dsh-client-connection', [], {
  lib: {
    entry: {
      index: 'lib/types/index.js',
      desktop: 'src/client/desktop-bridge.ts',
    },
  },
})

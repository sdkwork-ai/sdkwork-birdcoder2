import { clientBundle } from '../tsdown.client.ts'

// The Host half is two entries: the plugin itself and its Typert `remote` face,
// which the web-app patch mounts as its own row (the panel half reads the
// roster through that namespace). The browser half is the keyed panel.
export default clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-experts', [
  'lib/types/index.js',
  'lib/types/remote.js',
])

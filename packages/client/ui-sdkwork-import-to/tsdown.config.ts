import { clientBundle } from '../tsdown.client.ts'

/**
 * Browser bundle for the relay API-key "导入到" plugin. The console package
 * this plugin composes is a sibling sdkwork checkout resolved through the
 * repo's `@sdkwork/*` source aliases, so the default bundle face inlines it;
 * no declaration-facade paths need swapping here.
 */
export default clientBundle('@deepseek-ai/dsh-client-ui-sdkwork-import-to', ['lib/types/index.js'])

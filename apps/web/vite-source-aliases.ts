import { fileURLToPath } from 'node:url'

const src = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url))

/**
 * Workspace source aliases for the web Vite shell. Package exports aim at lib/
 * for Node consumers; the browser bundle compiles src/ so CSS stays on Vite's
 * pipeline. Keep replacement paths in sync with the package entry they shadow.
 */
export const WEB_SOURCE_ALIASES = [
  { find: /^node:module$/, replacement: src('./src/node-module-stub.ts') },
  { find: /^@deepseek-ai\/dsh-client-web$/, replacement: src('../../packages/client/web/src/boot.ts') },
  { find: /^@deepseek-ai\/dsh-client-ui-renderer\/client$/, replacement: src('../../packages/client/ui-renderer/src/client/index.ts') },
  { find: /^@deepseek-ai\/dsh-client-ui-slots$/, replacement: src('../../packages/client/ui-slots/src/index.ts') },
  { find: /^@deepseek-ai\/dsh-client-ui-primitives$/, replacement: src('../../packages/client/ui-primitives/src/index.ts') },
  { find: /^@deepseek-ai\/dsh-client-ui-attachment$/, replacement: src('../../packages/client/ui-attachment/src/index.ts') },
  { find: /^@deepseek-ai\/dsh-client-modules\/client$/, replacement: src('../../packages/client/modules/src/client/index.ts') },
  // The seed table imports the IAM token manager through its package subpath;
  // the emitted lib half imports @sdkwork/sdk-common, whose package entry
  // points at a dist build that only exists in the sibling's own checkout.
  // The sibling SDKWorks carry no dist on the release runner, so both the
  // subpath and the sdk-common package resolve to their pinned sources here.
  { find: /^@deepseek-ai\/dsh-client-ui-sdkwork-iam\/sdkwork-global-token-manager$/, replacement: src('../../packages/client/ui-sdkwork-iam/src/sdkwork-global-token-manager.ts') },
  { find: /^@sdkwork\/sdk-common$/, replacement: src('../../../sdkwork-sdk-commons/sdkwork-sdk-common-typescript/src/index.ts') },
] as const

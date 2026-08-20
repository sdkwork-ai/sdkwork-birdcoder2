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
] as const

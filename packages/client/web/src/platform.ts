/**
 * Shared browser platform modules. Seeding, bundling externals, and Vite
 * aliases consume this list so their module identities cannot drift.
 * @module @deepseek-ai/dsh-client-web/src/platform
 */

/** The module specifiers the shell shares into the frozen module table. */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-renderer/client',
  // NOTE: '@deepseek-ai/dsh-client-ui-attachment' must NOT be seeded here.
  // The seed key would equal the plugin's loader name, and import() resolves
  // seed-first — a seeded bare-name entry would shadow the dynamic client
  // bundle with whatever the alias points at, leaving the attachment slots
  // unregistered (uploads succeed but never display). Upstream removed this
  // seed row in f37bc082c5; keep it dynamic.
  '@deepseek-ai/dsh-client-ui-dockkit',
  '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager',
  '@deepseek-ai/dsh-client-ui-sdkwork-settings-menu/sdkwork-icons',
  '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/sdkwork-rail-tooltip',
] as const

/** Client-bundle specifiers whose factories the parser preloads before the shell starts. */
export const PRELOADED_CLIENT_EXTERNALS = [
] as const

/** One platform module specifier (a seed-table key). */
export type PlatformModule = (typeof PLATFORM_MODULES)[number]

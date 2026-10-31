import { defineConfig } from 'vitest/config';

/**
 * Test configuration for the tablet root.
 *
 * It is deliberately separate from `vite.config.ts`: the build config owns the
 * Tauri frontend output and the dev-server port, neither of which a test run
 * should touch. Tests resolve packages through workspace links, so no
 * package-specifier aliases are declared here (APP_PC_ARCHITECTURE_SPEC.md
 * §2.0.1, inherited by APP_PAD_ARCHITECTURE_SPEC.md §2.1).
 */
export default defineConfig({
  test: {
    include: [
      'tests/**/*.spec.{ts,tsx}',
      'packages/*/tests/**/*.spec.{ts,tsx}',
    ],
    environment: 'node',
  },
});
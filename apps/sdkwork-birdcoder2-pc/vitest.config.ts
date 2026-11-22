import { defineConfig } from 'vitest/config'

/**
 * Test configuration for the PC root.
 *
 * It is deliberately separate from `vite.config.ts`: the build config derives
 * `dist/<deployment-profile>/<envAlias>/` from the mode and throws without one
 * (`browser deployment profile must be one of standalone, cloud`), so a test run
 * that fell back to it failed at startup. Tests resolve workspace packages
 * through the real pnpm links, so no package-specifier aliases are declared here
 * (APP_PC_ARCHITECTURE_SPEC.md section 2.0.1).
 */
export default defineConfig({
  test: {
    include: [
      'tests/**/*.spec.{ts,tsx}',
      'packages/*/tests/**/*.spec.{ts,tsx}',
    ],
    environment: 'node',
  },
})

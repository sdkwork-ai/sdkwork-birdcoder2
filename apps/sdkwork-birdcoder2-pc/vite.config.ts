import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import { resolveBrowserDistOutDir } from '../../../sdkwork-specs/tools/browser-dist-layout.mjs';

/**
 * Browser renderer build configuration.
 *
 * Output layout follows APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md §2.1 and is derived from the
 * canonical helper: `dist/<deployment-profile>/<envAlias>/`. A bare `dist/` layout is forbidden.
 */
export default defineConfig(({ mode }) => {
  const [deploymentProfile = 'standalone', environment = 'development'] = mode.split('.');
  return {
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolveBrowserDistOutDir(environment, deploymentProfile),
      emptyOutDir: true,
    },
  };
});

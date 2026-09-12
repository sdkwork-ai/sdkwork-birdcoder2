import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import { resolveBrowserDistOutDir } from '../../../sdkwork-specs/tools/browser-dist-layout.mjs';

/**
 * H5 mobile renderer build configuration.
 *
 * One renderer serves H5, WebView, and Capacitor targets. Output layout follows
 * APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md §2.1 and is derived from the canonical helper:
 * `dist/<deployment-profile>/<envAlias>/`.
 */
export default defineConfig(({ mode }) => {
  const [deploymentProfile = 'standalone', environment = 'development'] = mode.split('.');
  return {
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolveBrowserDistOutDir(environment, deploymentProfile),
      emptyOutDir: true,
      target: 'es2020',
    },
  };
});

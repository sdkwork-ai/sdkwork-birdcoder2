import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Tablet renderer build configuration.
 *
 * The renderer runs inside the Tauri host and emits to the host `frontendDist`
 * (`src-tauri/tauri*.conf.json` -> `../dist`). A pad root is exempt from the
 * browser `dist/<profile>/<envAlias>/` publish layout because it ships store and
 * installer artifacts, not browser assets (APP_PAD_ARCHITECTURE_SPEC.md §2.1).
 *
 * The mode grammar is `<deployment-profile>.<environment>` for iPadOS and
 * `<deployment-profile>.<environment>.tablet-android` for Android tablets. The
 * matching `.env.<mode>` file supplies the public VITE_SDKWORK_* identity.
 */
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
}));
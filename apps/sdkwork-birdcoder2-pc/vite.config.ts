import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type PluginOption } from 'vite';

import { resolveBrowserDistOutDir } from '../../../sdkwork-specs/tools/browser-dist-layout.mjs';
import {
  assertBrowserDevRuntimeEnvDocument,
  buildBrowserDevRuntimeEnvDocument,
  buildBrowserRuntimeEnvGlobalBridge,
  buildBrowserRuntimeEnvGlobalScript,
} from '../../../sdkwork-specs/tools/browser-runtime-env.mjs';
import { createBrowserRuntimeEnvVitePlugin } from '../../../sdkwork-specs/tools/browser-runtime-env-vite.mjs';
import { resolveViteEnvironment } from '../../../sdkwork-specs/tools/vite-runtime-profile.mjs';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const dependencyRoot = path.resolve(appRoot, '..', '..', '..');

/** The document `index.html` already loads, before `/src/main.tsx`. */
const RUNTIME_ENV_DOCUMENT_PATH = '/runtime-env.js';

/** Canonical same-origin API paths the application ingress owns. */
const APPLICATION_INGRESS_PROXY_PATHS = ['/app', '/backend', '/v1'];

/**
 * Read the deploy-time runtime document the canonical build runner materialized.
 *
 * `build-browser-client.mjs` materializes `public/runtime-env.json` from
 * `etc/browser/runtime-env.<profileId>.json` before it invokes Vite, so the file
 * is present when a real build evaluates this config. Reading it at
 * `generateBundle` keeps the built document and the dev document on one contract
 * (BROWSER_RUNTIME_ENV_SPEC.md section 3).
 */
function readMaterializedRuntimeEnvDocument(): Record<string, unknown> {
  const documentPath = path.join(appRoot, 'public', 'runtime-env.json');
  let source: string;
  try {
    source = readFileSync(documentPath, 'utf8');
  } catch {
    throw new Error(
      'public/runtime-env.json is missing; run the canonical browser build runner '
      + '(sdkwork-specs/tools/build-browser-client.mjs materializes it from etc/browser/).',
    );
  }
  return JSON.parse(source) as Record<string, unknown>;
}

/**
 * Serve the dev runtime document and emit the build runtime document
 * (BROWSER_RUNTIME_ENV_SPEC.md sections 2-4).
 *
 * `index.html` loads `/runtime-env.js` before the renderer, so the document must
 * exist in a hosted artifact too — not only under the dev server. The dev body
 * comes from the canonical builders (process env wins over the dotenv file) and
 * is asserted on every request; the build body is the materialized deploy-time
 * document.
 */
function birdcoder2RuntimeEnvDocumentPlugin(profileId: string, deploymentProfile: string): PluginOption {
  return createBrowserRuntimeEnvVitePlugin({
    name: 'birdcoder2-pc-runtime-env-document',
    path: RUNTIME_ENV_DOCUMENT_PATH,
    resolveServeDocument: () => {
      const document = buildBrowserDevRuntimeEnvDocument({ profileId });
      assertBrowserDevRuntimeEnvDocument(document, { profileId });
      return buildBrowserRuntimeEnvGlobalScript(
        buildBrowserRuntimeEnvGlobalBridge(document, { deploymentProfile }),
      );
    },
    resolveBuildAsset: () => buildBrowserRuntimeEnvGlobalScript(
      buildBrowserRuntimeEnvGlobalBridge(readMaterializedRuntimeEnvDocument(), { deploymentProfile }),
    ),
  }) as PluginOption;
}

/**
 * Browser renderer build and serve configuration.
 *
 * Output layout follows APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md section 2.1 and
 * is derived from the canonical helper `dist/<deployment-profile>/<envAlias>/`,
 * so a bare `dist/` is never a publish target.
 *
 * The lifecycle environment comes from the shared `resolveViteEnvironment`
 * resolver rather than a local `mode.split('.')`, whose historical drift
 * silently routed `demo` builds into the production directory.
 */
export default defineConfig(({ command, mode }) => {
  const fileEnv = loadEnv(mode, appRoot, '');
  const runtimeEnvSource: Record<string, string | undefined> = { ...fileEnv, ...process.env };
  const lifecycleEnvironment = resolveViteEnvironment(mode, process.env);
  const deploymentProfile = String(
    process.env.SDKWORK_DEPLOYMENT_PROFILE
      ?? fileEnv.VITE_SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE
      ?? mode.split('.')[0]
      ?? 'standalone',
  ).trim();
  const isServe = command === 'serve';

  /**
   * The application ingress a dev server proxies the canonical API paths to.
   * Process topology wins over the dotenv file; the file value legitimately
   * carries the deploy-time domain and must not be trusted blindly in dev.
   */
  const ingressTarget = String(
    runtimeEnvSource.SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL
      ?? runtimeEnvSource.VITE_SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL
      ?? '',
  ).trim();

  return {
    plugins: [
      react(),
      tailwindcss(),
      birdcoder2RuntimeEnvDocumentPlugin(mode, deploymentProfile),
    ],
    /**
     * In dev the page origin IS the application ingress
     * (BROWSER_RUNTIME_ENV_SPEC.md section 1), so the client addresses the API
     * same-origin and lets the dev server fan it out. The dotenv value is the
     * ingress's own absolute URL — correct for the ingress process, wrong for a
     * browser on another device.
     */
    define: isServe
      ? {
        'import.meta.env.VITE_SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL': JSON.stringify('/'),
      }
      : {},
    server: {
      // Loopback, not Vite's `localhost` default: on Windows `localhost`
      // resolves to `::1` first, so a `::1`-only listener is unreachable from
      // the `127.0.0.1` URLs the topology and browser tooling use.
      host: '127.0.0.1',
      // The PC root source-links sibling repositories, so Vite serves files
      // whose real path is outside the app root.
      fs: { allow: [appRoot, dependencyRoot] },
      ...(isServe && ingressTarget
        ? {
          proxy: Object.fromEntries(
            APPLICATION_INGRESS_PROXY_PATHS.map((prefix) => [
              prefix,
              { target: ingressTarget, changeOrigin: true, ws: true },
            ]),
          ),
        }
        : {}),
    },
    build: {
      outDir: resolveBrowserDistOutDir(lifecycleEnvironment, deploymentProfile),
      emptyOutDir: true,
      target: 'es2020',
    },
  };
});

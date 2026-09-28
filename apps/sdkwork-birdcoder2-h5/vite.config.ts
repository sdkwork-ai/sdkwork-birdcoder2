import { createSdkworkCredentialEntryBootstrapVitePlugin } from '@sdkwork/iam-credential-entry/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
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
import { resolveLucideReactEntry, resolveViteEnvironment } from '../../../sdkwork-specs/tools/vite-runtime-profile.mjs';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const dependencyRoot = path.resolve(appRoot, '..', '..', '..');

/**
 * The single `lucide-react` ESM entry the renderer resolves.
 *
 * The shell draws its tab icons with this library, and the H5 app source-links
 * sibling repositories that carry their own `node_modules`. Without an explicit
 * alias a glyph could load a second copy of the library, which is the
 * duplicate-module hazard the sibling renderers alias away for react and
 * zustand the same way. Probed rather than hard-coded because the entry file
 * name differs between install layouts (`.mjs` / `.js`).
 */
const lucideReactEntry = resolveLucideReactEntry(appRoot);
if (!lucideReactEntry) {
  throw new Error(
    'lucide-react ESM entry not found under node_modules (expected dist/esm/lucide-react.{mjs,js}).',
  );
}

/** The document `index.html` already loads, before `/src/main.tsx`. */
const RUNTIME_ENV_DOCUMENT_PATH = '/runtime-env.js';

/** Canonical same-origin API paths the application ingress owns. */
const APPLICATION_INGRESS_PROXY_PATHS = ['/app', '/backend', '/v1'];

const SDKWORK_BAD_GATEWAY_CODE = 50201;
const SDKWORK_BAD_GATEWAY_STATUS = 502;

/**
 * Reply to an unreachable upstream with a governed `application/problem+json`
 * body instead of Vite's opaque proxy error.
 *
 * The mobile client renders its capability failure from the problem document
 * (`errors.result.<code>`), so a raw socket error would surface as an
 * unlabelled string and hide which surface is missing. This mirrors the
 * sibling BirdCoder renderers' dev proxies.
 */
function configureSdkworkProxyProblemResponse(proxy: {
  on: (event: 'error', handler: (error: unknown, request: unknown, response: unknown) => void) => void;
}): void {
  proxy.on('error', (_error, _request, response) => {
    const res = response as
      | {
          statusCode: number;
          setHeader: (name: string, value: string | number) => void;
          end: (body: string) => void;
          headersSent?: boolean;
          writableEnded?: boolean;
        }
      | undefined;
    if (!res || typeof res.setHeader !== 'function' || typeof res.end !== 'function') {
      return;
    }
    if (res.headersSent || res.writableEnded) {
      return;
    }
    const traceId = `dev-${Date.now().toString(36)}`;
    const body = JSON.stringify({
      type: `https://docs.sdkwork.com/problems/${SDKWORK_BAD_GATEWAY_CODE}`,
      title: 'Bad gateway',
      status: SDKWORK_BAD_GATEWAY_STATUS,
      code: SDKWORK_BAD_GATEWAY_CODE,
      traceId,
      i18nKey: `errors.result.${SDKWORK_BAD_GATEWAY_CODE}`,
      detail: 'The upstream service could not be reached.',
    });
    res.statusCode = SDKWORK_BAD_GATEWAY_STATUS;
    res.setHeader('Content-Type', 'application/problem+json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-SdkWork-Trace-Id', traceId);
    res.end(body);
  });
}

/**
 * Serve the ONE dev runtime document through a serve-only middleware
 * (BROWSER_RUNTIME_ENV_SPEC.md §2/§4).
 *
 * A static `public/runtime-env.js` is forbidden: the build runner materialises
 * deploy-time values into that directory, and a stale artifact would poison
 * the dev server with an absolute cloud edge. The document VALUES come from
 * the canonical builders, and the contract asserted on every request is the
 * shared one — so a loopback absolute or a process-only topology key fails
 * loudly instead of reaching the browser.
 */
function birdcoder2RuntimeEnvDocumentPlugin(profileId: string, deploymentProfile: string): PluginOption {
  return createBrowserRuntimeEnvVitePlugin({
    name: 'birdcoder2-h5-runtime-env-document',
    path: RUNTIME_ENV_DOCUMENT_PATH,
    resolveServeDocument: () => {
      const document = buildBrowserDevRuntimeEnvDocument({ profileId });
      assertBrowserDevRuntimeEnvDocument(document, { profileId });
      return buildBrowserRuntimeEnvGlobalScript(
        buildBrowserRuntimeEnvGlobalBridge(document, { deploymentProfile }),
      );
    },
  }) as PluginOption;
}

/**
 * H5 mobile renderer build and serve configuration.
 *
 * One renderer serves H5, WebView, and Capacitor targets. Build output layout
 * follows APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md §2.1 and is derived from
 * the canonical helper `dist/<deployment-profile>/<envAlias>/`.
 *
 * The mode is parsed by the shared `resolveViteEnvironment` rather than a local
 * `mode.split('.')`: a local copy has to be kept in step with the lifecycle
 * vocabulary by hand, and the historical drift silently routed `demo` builds
 * into the production directory.
 */
export default defineConfig(({ command, mode }) => {
  const fileEnv = loadEnv(mode, appRoot, '');
  const runtimeEnvSource: Record<string, string | undefined> = { ...fileEnv, ...process.env };
  const lifecycleEnvironment = resolveViteEnvironment(mode, process.env);
  const deploymentProfile = String(
    process.env.SDKWORK_DEPLOYMENT_PROFILE
      ?? fileEnv.VITE_SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE
      ?? fileEnv.VITE_SDKWORK_DEPLOYMENT_PROFILE
      ?? mode.split('.')[0]
      ?? 'standalone',
  ).trim();
  const isServe = command === 'serve';

  /**
   * The application ingress a dev server proxies the canonical API paths to.
   *
   * Process topology bindings win over the dotenv file, exactly as the client
   * env materialiser assumes; the file value is what `vite build` also reads,
   * so it legitimately carries a deploy-time domain and must not be trusted
   * blindly in dev.
   */
  const ingressTarget = String(
    runtimeEnvSource.SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL
      ?? runtimeEnvSource.VITE_SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL
      ?? '',
  ).trim();

  const bootstrapAccessToken = String(runtimeEnvSource.SDKWORK_ACCESS_TOKEN ?? '').trim();
  const credentialEntryBootstrap = createSdkworkCredentialEntryBootstrapVitePlugin({
    // Spread rather than `accessToken: <string | undefined>`: the option is
    // `accessToken?: string` under `exactOptionalPropertyTypes`, so passing an
    // explicit `undefined` is a type error — and the plugin reads the process
    // env itself when the option is absent.
    ...(bootstrapAccessToken ? { accessToken: bootstrapAccessToken } : {}),
    environment: lifecycleEnvironment,
  });

  const internalDevPort = String(
    runtimeEnvSource.SDKWORK_BIRDCODER_H5_INTERNAL_DEV_PORT
      ?? runtimeEnvSource.VITE_SDKWORK_BIRDCODER_H5_INTERNAL_DEV_PORT
      ?? '',
  ).trim();

  return {
    plugins: [
      react(),
      tailwindcss(),
      birdcoder2RuntimeEnvDocumentPlugin(mode, deploymentProfile),
      // The only sanctioned dev-time browser credential handoff
      // (IAM_CREDENTIAL_ENTRY_SPEC.md §5.1): injects the canonical global into
      // the served HTML before application modules run, and returns nothing
      // outside `development` (or an explicitly opted-in `test`).
      ...(credentialEntryBootstrap ? [credentialEntryBootstrap as PluginOption] : []),
    ],
    /**
     * In dev the page origin IS the application ingress
     * (BROWSER_RUNTIME_ENV_SPEC.md §1), so the client must address the API
     * same-origin and let the dev server fan it out. The dotenv value is the
     * ingress's own absolute URL — correct for the ingress process, wrong for
     * a browser on another device, and it would also point the page at a
     * deploy-time domain in a cloud-profile file.
     */
    define: isServe
      ? {
          'import.meta.env.VITE_SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL': JSON.stringify('/'),
        }
      : {},
    resolve: {
      /**
       * A regex, not the string `'lucide-react'`: the string form also rewrites
       * `lucide-react/dynamic`, whose per-icon entry points must keep resolving
       * inside the package.
       */
      alias: [{ find: /^lucide-react$/, replacement: lucideReactEntry }],
    },
    server: {
      /**
       * Loopback, not Vite's `localhost` default: on Windows `localhost`
       * resolves to `::1` first, so a `::1`-only listener is unreachable from
       * the `127.0.0.1` URLs the topology, the dev proxy and the browser
       * tooling all use.
       */
      host: '127.0.0.1',
      // Topology-selected when declared; otherwise Vite's own default port.
      ...(internalDevPort ? { port: Number(internalDevPort), strictPort: true } : {}),
      /**
       * The H5 app source-links its sibling repositories, so Vite serves files
       * whose real path is outside the app root. Without this the dev server
       * rejects every `@sdkwork/*` module with a 403 on the source path.
       */
      fs: { allow: [appRoot, dependencyRoot] },
      ...(isServe && ingressTarget
        ? {
            proxy: Object.fromEntries(
              APPLICATION_INGRESS_PROXY_PATHS.map((prefix) => [
                prefix,
                {
                  target: ingressTarget,
                  changeOrigin: true,
                  ws: true,
                  configure: configureSdkworkProxyProblemResponse,
                },
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

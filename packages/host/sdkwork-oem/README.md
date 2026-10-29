---
description: "OEM profile: one deployment-owned JSON file naming the DeepSeek login and inference origins plus the display brand, resolved for the Host and published to the browser."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-oem

English | [中文](README.zh.md)

## Summary

An OEM deployment keeps the official DeepSeek verification flow and moves only the origins it runs against. This package resolves one JSON profile at boot, provides it as `ctx.oem`, and publishes the display brand (`__DSH_OEM__`) through the Web index injection. The account row reads `platformOrigin` and `inferenceOrigin` from it; the account route and the web-search rows read their endpoint bases. Without a profile every row resolves the shipped BirdCoder endpoints and brand; a composition that does not mount this profile keeps its own official defaults.

## Brand identity

The application shipped by this repository is **BirdCoder**, and its logo is the BirdCoder bird (`apps/web/public/favicon.png`, from which the desktop, welcome, and installer marks derive). The OEM profile's default `brand.name` is also **BirdCoder**, so an OEM build with no profile still presents BirdCoder.

A deployment may set another `brand.name`; every client and Desktop display string then follows at render time. That is a display-name change only: a future OEM that adopts another brand must also replace the build-time logo rasters — app icons, installer brand images, and `apps/desktop/renderer/assets/welcome-bird.png` — in the same build. `oem.json` never swaps image assets.

## Compatibility

The login flow itself is never reconfigured: state/PKCE handling, `/oauth/callback`, `auth_init`/`auth_exchange`, the `/dsh/authorize` and `/dsh/authorized` browser paths, request headers, grant storage, and 401 handling stay official. An OEM platform must implement the same contract behind its own origin.

A hosted deployment finishes the official browser flow on its own domain: the browser sends its `window.location.origin`, the Host accepts it only when it matches `application.origins`, and that origin becomes the `redirect_uri` sent to Platform. Desktop and SSH-forwarded local use keep the loopback callback, so no profile is needed for them.

The SDKWork IAM client keeps its generated `/app/v3/api/...` PC login paths, parameter shapes, and `X-Platform: pc` header; `sdkwork.iamBaseUrl` only substitutes the origin.

Desktop browser login keeps the SDKWork contract: the app opens `<iamAuthorizeBaseUrl>/iam/v3/oauth/authorize` with PKCE S256, `client_id=sdkwork.iamClientId`, `redirect_uri=sdkwork.iamRedirectUri`, `scope=openid profile offline_access`, and a state token. The hosted page completes at `/auth/desktop/launch?redirectUrl=…`, which hands the code back through the deep link; the app redeems it at `/app/v3/api/oauth/desktop_sessions` and stores the dual-token session. The shipped defaults are `birdcoder` and `birdcoder://auth/callback`, so a deployment whose IAM console registered another OAuth client or callback repoints the two fields instead of patching code. The authorize path and parameters stay upstream. The redirect scheme must be the desktop application's URL scheme (`desktop.protocol` in the brand manifest, `birdcoder` in the shipped brand): the packaged shell registers that scheme with the OS, and an HTTP(S) redirect never reaches the app.

## Configuration

The profile path is `DSH_OEM_CONFIG`, then `$DSH_HOME/oem.json`. A missing file means the shipped defaults; a file that exists but cannot be read, parsed, or validated fails the launch. `DSH_OEM_CONFIG` is read by both the Host and the Desktop shell, so prefer an absolute path: a relative override resolves against each process's working directory.

```json
{
  "brand": {
    "name": "Acme Coder",
    "companyName": "Acme"
  },
  "application": {
    "origins": ["https://birdcoder.com"]
  },
  "sdkwork": {
    "iamBaseUrl": "https://api.birdcoder.com",
    "iamAuthorizeBaseUrl": "https://platform.birdcoder.com"
  },
  "deepseek": {
    "platformOrigin": "https://platform.acme.test",
    "inferenceOrigin": "https://gateway.acme.test",
    "allowLoopbackHttp": false,
    "rewriteBrowserOrigin": false,
    "messagesBaseUrl": "https://gateway.acme.test/anthropic",
    "webSearchBaseUrl": "https://gateway.acme.test/anthropic/v1",
    "webApiBaseUrl": "https://gateway.acme.test/v1/tools"
  }
}
```

| Field | Default | Meaning |
|---|---|---|
| `brand.name` | `BirdCoder` | Display name substituted into the client locale copy, the sidebar wordmark, the document title, and every Desktop native string |
| `brand.companyName` | `SDKWork` | Vendor name for surfaces that need one |
| `application.origins` | `["https://birdcoder.com"]` | Public origins this deployment serves the Web app from; a browser sign-in callback must match one of them. Loopback stays accepted for Desktop and local use |
| `sdkwork.iamBaseUrl` | `https://api.birdcoder.com` | SDKWork IAM app-api origin for the PC login client. The generated paths (`/app/v3/api/auth/...`) and the `X-Platform: pc` header are unchanged; only this domain moves. A value different from the shipped default replaces the `ui-sdkwork-env` profile origin in every tier, while the default leaves the environment profile in control |
| `sdkwork.iamAuthorizeBaseUrl` | `https://platform.birdcoder.com` | Hosted IAM authorization origin for the desktop browser-login flow. The app opens `<origin>/iam/v3/oauth/authorize`; the login pages keep their `/auth/...` paths and return through `sdkwork.iamRedirectUri` |
| `sdkwork.iamClientId` | `birdcoder` | OAuth client id the hosted authorization receives as `client_id`. Independent of the `ui-sdkwork-env` app id, which remains the API tenant key. Must match the public client registered in the IAM console; lower-case letters, digits, `.`, `_`, and `-` |
| `sdkwork.iamRedirectUri` | `birdcoder://auth/callback` | Registered deep-link callback the hosted login returns through. Must be a custom-scheme absolute URI without credentials, query, or fragment, and its scheme must be the desktop brand's `desktop.protocol` |
| `deepseek.platformOrigin` | `https://platform.birdcoder.com` | Browser sign-in, account, usage, and top-up origin |
| `deepseek.inferenceOrigin` | `https://api.birdcoder.com` | Account-route model and file origin; also derives the search bases |
| `deepseek.allowLoopbackHttp` | `false` | Accept loopback HTTP origins (development only) |
| `deepseek.rewriteBrowserOrigin` | `false` | Rewrite Platform browser pages onto `platformOrigin` for a reverse proxy |
| `deepseek.messagesBaseUrl` | `https://api.birdcoder.com/anthropic` | Account-route Messages base; derived as `<inferenceOrigin>/anthropic` |
| `deepseek.webSearchBaseUrl` | `https://api.birdcoder.com/anthropic/v1` | Anthropic-compatible search base; derived as `<inferenceOrigin>/anthropic/v1` |
| `deepseek.webApiBaseUrl` | `https://api.birdcoder.com/v1/tools` | Search and Fetch API base; derived as `<inferenceOrigin>/v1/tools` |

The DeepSeek API-key vendor (`llm-deepseek`) is intentionally outside the OEM profile: its endpoint, key handling, and the Models page's `https://api.deepseek.com/anthropic` placeholder stay DeepSeek. An OEM model gateway belongs to a separate provider route, not to the DeepSeek vendor.

An official `platformOrigin` cannot be paired with a deployment `inferenceOrigin`: an official account grant would be forwarded to the deployment endpoint. The reverse — a deployment login portal issuing its own grants for the official API — is allowed; the endpoint bases then keep their official defaults. `messagesBaseUrl`, when set, must share the inference origin.

## Environment domains

The shipped defaults follow the SDKWork lifecycle so a source `pnpm dev:web` / `pnpm desktop:dev` never talks to production:

| Lifecycle | `platformOrigin` | `inferenceOrigin` | `iamAuthorizeBaseUrl` |
|---|---|---|---|
| `development` | `http://platform-dev.birdcoder.com` | `http://api-dev.birdcoder.com` | `http://platform-dev.birdcoder.com` |
| `testing` | `https://platform-test.birdcoder.com` | `https://api-test.birdcoder.com` | `https://platform-test.birdcoder.com` |
| `staging` | `https://platform-staging.birdcoder.com` | `https://api-staging.birdcoder.com` | `https://platform-staging.birdcoder.com` |
| `production` | `https://platform.birdcoder.com` | `https://api.birdcoder.com` | `https://platform.birdcoder.com` |

The lifecycle is read from `SDKWORK_BIRDCODER_PROFILE_ID` / `SDKWORK_BIRDCODER_ENVIRONMENT` (then the unprefixed `SDKWORK_*` keys), falling back to `NODE_ENV=development` or `DSH_DESKTOP_DEV_APP=1`, and finally production. Only the development tier admits plain HTTP; test, staging, and production require HTTPS. The Messages, Search, and Search/Fetch bases derive from the inference origin, so they follow the same tier.

`sdkwork.iamBaseUrl` is deliberately the production constant in every tier: the IAM app-api origin comes from the active `ui-sdkwork-env` profile (`api-dev` in development, `api-test` in testing, `api.birdcoder.com` in production), and an explicit `oem.json` value still overrides it. An explicit origin in `oem.json` always wins over the tier default, so a profile pinning production domains makes a development launch use production by operator choice. A non-production launch refuses an explicit production BirdCoder endpoint (`platform`, `api`, or the IAM origins) instead of silently crossing tiers: keep those values under `environments.production` and give the active tier its own section.

The DeepSeek API-key vendor (`llm-deepseek`) is outside this table: it stays on DeepSeek's own endpoint as described below.

A single profile can carry every tier's origins. Root fields are shared, and `environments.<lifecycle>` overrides them for that launch, so one `oem.json` serves development and release without copying files. Precedence is `environments.<lifecycle>` → root → shipped defaults:

```json
{
  "brand": { "name": "Acme Coder", "companyName": "Acme" },
  "environments": {
    "development": {
      "sdkwork": { "iamAuthorizeBaseUrl": "http://platform-dev.acme.test" },
      "deepseek": {
        "platformOrigin": "http://platform-dev.acme.test",
        "inferenceOrigin": "http://api-dev.acme.test",
        "allowInsecureHttp": true
      }
    },
    "production": {
      "deepseek": {
        "platformOrigin": "https://platform.acme.test",
        "inferenceOrigin": "https://api.acme.test"
      }
    }
  }
}
```

## Merge contract

Upstream syncs must preserve these rules:

- The login flow stays upstream's: state/PKCE, `/oauth/callback`, `auth_init`/`auth_exchange`, `/dsh/authorize` and `/dsh/authorized`, request headers, grant storage, and 401 handling. Only origins come from the profile; never add an OEM branch inside `deepseek-account-platform`.
- The browser callback origin is `application.origins` plus the loopback path. Never widen `loginOrigin` to an arbitrary origin, and keep a hosted deployment's public origin in the profile rather than inferring it from request headers.
- Never route the DeepSeek API-key vendor (`llm-deepseek`) or its displayed endpoint through the profile; an OEM model gateway is a separate provider route. The account route and DeepSeek Search/Fetch remain the OEM-configurable surfaces.
- The SDKWork IAM client derives every PC path from the generated SDK under `sdkwork.iamBaseUrl`; never spell an IAM API path or a second IAM origin in `ui-sdkwork-iam`. The desktop flow keeps `/iam/v3/oauth/authorize` and `/auth/desktop/launch` verbatim; its `client_id` and `redirect_uri` come from `sdkwork.iamClientId` and `sdkwork.iamRedirectUri`, and the deep-link receiver matches that redirect exactly rather than any URL sharing the scheme.
- Endpoint literals — the shipped BirdCoder defaults (`https://platform.birdcoder.com`, `https://api.birdcoder.com`) and the official values a deployment can restore (`https://platform.deepseek.com`, `https://api.deepseek.com`) — live only in named default constants (`PUBLIC_BASE_URL`, `DEEPSEEK_DEFAULT_BASE_URL`, `DEEPSEEK_WEB_API_BASE_URL`, this resolver’s `DEFAULT_*`/`OFFICIAL_*`), tests, and the documented public-API issuer guard in `deepseek-account-platform/src/index.ts`. A merge that changes a shipped default is a product change, not a sync.
- New branded copy renders through `LocaleRuntime.setBrand` (client) or `resolveDesktopLocale(locale, brand)` (Desktop); a new literal "BirdCoder" in display copy is the regression. Build-time identity (`productName`, application identifier, the OS URL scheme, `birdcoder` command, installer rasters, web manifest, docs site name) stays out of runtime config; `sdkwork.iamRedirectUri` names the callback path but cannot replace the scheme the packaged shell registers.
- A new endpoint joins the OEM schema, derives from `inferenceOrigin`, and is asserted in `packages/bundle/base/tests/base.spec.ts`.

Re-verify after every upstream merge (the first grep must match only the constants and guard named above; the two counts must hold):

```sh
grep -rn "platform.deepseek.com\|api.deepseek.com" packages/credentials/deepseek-account-platform/src packages/llm/llm-deepseek/src packages/llm/llm-deepseek-api-key/src packages/llm/llm-deepseek-account/src packages/web
grep -c "^      inject: \[oem\]" packages/bundle/base/cordis.patch.yml   # 4: account + account route + two search providers; never the DeepSeek API-key vendor
grep -c "applicationName: desktopBrandName()" apps/desktop/src/main.ts   # 1
pnpm exec vitest run packages/host/sdkwork-oem packages/credentials/deepseek-account-platform/tests packages/client/ui-sdkwork-oem packages/client/ui-primitives/tests/oem-brand.client.spec.tsx apps/desktop/tests/locale.spec.ts
```

## Model Experience

None, as the package publishes deployment endpoints and a display name; it never enters a model prompt, Session log, or tool result.

#### KV Cache effect

None; the profile changes no model request prefix.

## Known Limitations and Deferred Work

- The profile is read once at boot — a changed file applies on the next launch.
- Static build artifacts keep their own spellings: the desktop `productName`, application identifier, OS URL scheme, updater cache, `birdcoder` command, installer rasters, the web manifest name, and the documentation site identity are build-time OEM work, not runtime profile fields. A brand that changes `desktop.protocol` must set `sdkwork.iamRedirectUri` to that scheme; the shell then receives the login callback through the same OS registration as its product links.
- The web search and Fetch providers accept an endpoint base; their wire protocol and model names stay provider-defined.

### Dev Note

Bundle rows that read this profile declare `inject: [oem]` so their `!!js` config expressions resolve after the service exists. The base bundle mounts the row for every profile; headless disables the account and credential rows but still resolves the profile harmlessly.

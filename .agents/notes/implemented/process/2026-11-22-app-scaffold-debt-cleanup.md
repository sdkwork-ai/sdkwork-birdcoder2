# Agent Note: The scaffold app roots shed their pre-scaffold template debt

Status: implemented

English | [中文](2026-11-22-app-scaffold-debt-cleanup.zh.md)

## Problem

The BirdCoder2 application roots were regenerated from the SDKWork standard-layout scaffold, but the committed tree still carried the pre-scaffold template's artifacts. The symptoms were not cosmetic; most of them made a root stop type-checking or stop building:

- The derived `.env.<profile>` files still carried a token whose `app_id` was the *surface key* (`sdkwork-birdcoder2-h5`) and whose permission scope was the four IAM read claims. The canonical materializer now derives the public application token from the root's deploy application anchor and grants `iam:self`, so `materialize-client-env --check` failed on the first scaffold root.
- The browser runtime documents lived in `config/browser/runtime-env.<profile>.example.json`, while `build-browser-client.mjs` requires `etc/browser/runtime-env.<profile>.json` wired through `etc/sdkwork.deployment.config.json` `profiles[<profileId>].source`. The canonical browser build stopped at "app deployment config does not declare browser source".
- Neither the H5 nor the pad root authored `src/vite-env.d.ts`, and `.gitignore` ignored every `apps/**/src/**/*.d.ts` anyway — only `apps/web` was exempted. `tsc` therefore reported `import.meta.env` and `.css` side-effect imports as unknown, and the browser build runner's type-check step failed before Vite ever ran.
- Every PC package tsconfig extended `../../../tsconfig.base.json` (missing one level), so its package typechecks and the vitest transformer could not resolve the config. The PC root also declared `types: ["vite/client"]`, which the root `typeRoots` makes unresolvable, had no vitest config (so `vitest` fell back to the build config and threw), and declared no renderer dependencies at all even though `src/` and `vite.config.ts` import them.
- The host package was still named `sdkwork-birdcoder2-pc-desktop`; the client-host gate reports that as a retired migration alias for the canonical `-pc-tauri` name.
- Generated package READMEs still carried the template renderer's defects: `Surface: `[object Object]``, "the family is scaffolded only: no package is registered as a workspace member" (false — the families are enumerated in `pnpm-workspace.yaml`), "empty public contract" for the implemented H5 core/shell, a missing H5 family table row for `hosts`/`agent-chat`, and a literal `` `undefined` `` where the mini-program core package name belongs.
- `apps/README.md` did not index `apps/desktop-publisher`; five pad scripts and one desktop publisher script were unclassified executables; the About plugin's test tsconfig aliased the *generated transport* instead of the composed SDK facade; and two Rust dependency declarations (plus `async-trait`) were dead weight.

## Decision

Repair the roots against the current standards instead of pinning the old template:

- Regenerate every derived `.env.<profile>` from the canonical materializer so the public application token names the deployment anchor with `iam:self`.
- Move the browser runtime documents to `etc/browser/runtime-env.<profile>.json`, run `align-browser-runtime-env.mjs` to write the `profiles[<profileId>].source` map and the `materialization` block, and emit the build document from the materialized `public/runtime-env.json` in both browser Vite configs. `index.html` keeps its static `/runtime-env.js` tag, and the plugin now emits that asset at `generateBundle` instead of only serving it in dev.
- Author `src/vite-env.d.ts` in the H5, pad, and PC roots and un-ignore `apps/*/src/vite-env.d.ts` so the declaration can be committed.
- Align every app package tsconfig to the non-composite checker shape (four-level base, no declarations), add the missing PC `vitest.config.ts` and renderer dependencies, and drop the unresolvable `types` shorthand.
- Rename the host package and its references to `@sdkwork/birdcoder2-pc-tauri`.
- Fix the README facts (surface ids, wiring status, implemented contracts, the missing H5 family rows, the mini-program core name), index `desktop-publisher`, classify the launchers, point the About test project at the composed SDK facade, and delete the unused Rust dependencies and the accidentally committed zero-byte `AppAuthPages.tsx`.
- In the sibling `sdkwork-iam` repository, spread the credential-entry Vite plugin's optional fields instead of declaring them `string | undefined`; strict consumers compile that source with `exactOptionalPropertyTypes`.

## Alternatives considered

**Keep `config/browser` and teach `build-browser-client.mjs` to read it.** The aligner and the browser runtime-env standard already own this matrix, and a second accepted location would create two authorities for the same deploy-time document.

**Exclude `vite.config.ts` from the app typecheck program.** The build runner type-checks the whole program before Vite, and the Vite config is where the credential-entry and runtime-env plugins are wired; excluding it would let a broken build config pass the gate that exists to catch it.

**Keep the About test alias on the generated transport.** The SDK consumer gate exists so a consumer treats the composed facade as its surface; aliasing the transport bypasses that boundary and hides a facade that stops exporting what consumers need.

**Keep the old token values and the `pc-desktop` name.** Both are exactly the drift the canonical materializer and the host-package gate now detect; preserving them would keep the check red.

## Consequences

Both browser roots now typecheck, test, and build end to end (`dist/standalone/dev/`), the pad root passes its full `check` aggregate, and the 15-operation BirdCoder2 App API contract agrees across the OpenAPI authority, the Rust route manifests, and the generated SDK transport. The generated `pc-tauri` package is linked through the lockfile, and the app roots' package families report no migration debt. One cross-repository edit accompanies this change: the `sdkwork-iam` credential entry plugin's strict-mode type fix. Local `.env` regeneration and the moved `etc/browser` documents change 70 tracked files, so a review should treat the token-line and path moves as generated.

## Verification

`pnpm --dir apps/sdkwork-birdcoder2-h5 {typecheck,test,build:dev}` and the same for `apps/sdkwork-birdcoder2-pc` pass; `pnpm --dir apps/sdkwork-birdcoder2-pad check` passes. `ui-sdkwork-about`'s tests and `typecheck:tests` pass, and `check-app-sdk-consumer-imports.mjs --repo .` reports no violation. `verify-generated-sdk-typescript`, `verify-sdkwork-dependencies`, `verify-application-entrypoints`, `topology:validate`, `check-apps-directory-index`, `materialize-client-env --check`, `check-browser-build-scripts`, `check-browser-runtime-env-standard`, `check-client-host-packages`, `check-operations-conformance`, and `check-route-path-collisions` all pass. A local audit script compares the OpenAPI authority, the Rust `APP_API_ROUTES` manifests, and the emitted SDK paths: 15 operations on each side, with matching method, path, tag, permission, and dual-token auth. `cargo test` for the six relay/service crates passes (20 tests); the full workspace build stops in `aws-lc-sys` on this machine's MSVC toolchain, which is environmental and unrelated to the change.

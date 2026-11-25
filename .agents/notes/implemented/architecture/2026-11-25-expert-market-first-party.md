# Agent Note: Ship the expert market as a first-party package

Status: implemented

English | [中文](2026-11-25-expert-market-first-party.zh.md)

## Problem

The expert market — the 331-expert roster, the five expert teams, the summon and create-with-AI tools, the market panel, the 设置 → 专家 page and the composer picker — was pinned as the `plugins/sdkwork-dsh-agents` submodule, a mirror of `@michengai/dsh-agency-agents`. It shipped the mirror's committed `lib/` artifacts, so this repository could not build, typecheck or test the code it runs; the roster's only source of truth was the plugin's bundled markdown assets; and the product goal is for the expert data, categories and teams to be initialized from `sdkwork-specs` and owned by `sdkwork-agents`, with the DSH plugin as the integration surface only.

## Decision

The expert market is now the first-party package `packages/client/ui-sdkwork-experts` (`@deepseek-ai/dsh-client-ui-sdkwork-experts`), built by this repository like every other `packages/*` member:

- The source, assets and build config came from the mirror's `1.3.x` line — the same code the submodule ran — adapted to this repository's package conventions: three entries (`index`, `remote`, and the `client` bundle), workspace peer edges, `clientBundle()` build, and `@tabler/icons-react` as the one browser-only third-party input. The four missing remote files (`remote.ts`, `remote-contract.ts`, `client/remote.ts` and the ambient type declarations) were restored from that line, and the package identity strings, API routes (`/api/sdkwork/experts/*`), request header (`x-sdkwork-client`) and operator links were aligned to the SDKWork implementation.
- The submodule is removed in full: the `.gitmodules` entry, the gitlink, the working-tree directory, the `update:expert-market` / `check:expert-market` scripts, their `scripts/update-expert-market.mjs` implementation and the `expert-market-pin` workflow. `pnpm-workspace.yaml` drops the 28 scoped `@michengai/dsh-agency-agents>@deepseek-ai/*` overrides that existed only to point the standalone plugin's peer edges at this workspace.
- The web-app patch mounts the built-in package as the same two rows (`agency-agents-remote`, `agency-agents` with `entryLocation: both`), and the package is a bundle dependency. The panel key stays `agency-agents` because it is the one contract the Experts tab embeds by.
- The bundle acceptance spec now reads this build's artifacts, pins the two rows and the panel key, and additionally fails if `.gitmodules` or the working tree mentions the removed submodule or the old package name.

## Alternatives considered

**Keep the submodule and only change its URL.** That leaves the code unbuildable here, keeps the roster's source of truth in a third-party asset tree, and keeps the installed product on committed artifacts that no gate in this repository verifies.

**Keep the submodule checkout as a plain directory under `plugins/`.** The plugin would still be outside `packages/*`, so the workspace dependency policy, typecheck aggregates and build faces would not cover it, and two copies of the expert-market source would exist.

**Move only the browser half into a package and keep the host half in the submodule.** The two halves share contracts and the Remote descriptors; splitting them across a package boundary would need a new wire package and would leave the summon tools in unbuildable code.

## Consequences

- The expert market's build, typecheck and test now run here. `packages/client/ui-sdkwork-experts` builds `lib/index.js`, `lib/remote.js` and `lib/client.js`; its `README` records the model/token/KV-cache effects of the prompt section and the ten tools.
- The repository no longer depends on the MichengAI repository or its release cadence. A fix ships with this repository's release instead of a pin bump.
- The expert data plane is now a normal feature gap rather than a submodule boundary: the roster, categories and teams are initialized from `sdkwork-specs` and owned by `sdkwork-agents`. The Host half accepts an ingested catalog overlay over the `agencyAgents` Remote (`syncSdkworkCatalog`, `syncSdkworkPersonas`), which replaces the bundled roster, teams and personas while the bundled assets stay the offline fallback. The market page now fetches the catalog from the Agents App API and pushes it into that overlay once its gateway and IAM session are ready; a composition that mounts the package without that page keeps the bundled roster.
- The market UI is unchanged by this note; the reference gallery design (featured collections, category rail, usage statistics, an 专家团 sibling tab) remains a separate change.

## Verification

`pnpm exec tsc -b packages/client/ui-sdkwork-experts/tsconfig.host.json` and `.../tsconfig.client.json` pass, and `pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-experts run bundle` emits the three entries. `pnpm exec vitest run packages/bundle/web-app/tests/built-in-expert-market.spec.ts` passes all four cases (composition, submodule removal, incomplete-form rejection, desktop layers), and `pnpm exec vitest run packages/client/ui-sdkwork-markets/tests` passes (187 tests across the market page, the embedded panel and the surface contracts).

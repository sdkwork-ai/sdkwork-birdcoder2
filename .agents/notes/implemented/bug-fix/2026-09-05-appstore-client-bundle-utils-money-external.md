# Agent Note: Appstore client bundle maps @sdkwork/utils/money to sibling source

Status: implemented

English | [中文](2026-09-05-appstore-client-bundle-utils-money-external.zh.md)

## Problem

`pnpm build` failed at `verify-sdkwork-dependencies`:

```
packages/client/ui-sdkwork-appstore/lib/client.js: client bundle leaves require("@sdkwork/utils/money") external — map the package to sibling source in tsconfig.bundle.json so tsdown inlines it
```

The appstore client bundle compiles sibling sources from the pinned `sdkwork-appstore` checkout, and `sdkwork-appstore-pc-commons/src/formatPrice.ts` plus `sdkwork-appstore-pc-product/src/lib/utils.ts` import `@sdkwork/utils/money`. `packages/client/tsdown.client.ts` derives bundle aliases from the `@sdkwork/*` keys of `tsconfig.base.json` but takes only exact package-root keys: a TypeScript paths key without a wildcard matches only the identical specifier, so the base mapping of the `@sdkwork/utils` root does not cover the `money` subpath. The subpath had no alias and no node_modules hit reachable from the sibling tree, rolldown emitted the import as an external, and the loader module table cannot answer `@sdkwork/*` specifiers at runtime — `checkClientBundleSdkworkExternals` turns that drift into a build error before any bundle ships.

## Decision

`packages/client/ui-sdkwork-appstore/tsconfig.bundle.json` maps `@sdkwork/utils/money` to the pinned sibling source file `../../../../sdkwork-utils/packages/sdkwork-utils-typescript/src/money.ts`, the same file the `@sdkwork/utils` package `exports` map points `./money` at. The appstore tsdown config passes that tsconfig to every build pass (`tsconfig: 'tsconfig.bundle.json'`), so the runtime bundle inlines the source and emitted types resolve to it identically on dev machines and on the release runner, which clones pinned siblings without `node_modules`. The row sits beside the existing `@sdkwork/sdk-common/*` rows in the same file, which own the same fix class for that package.

## Alternatives considered

**Promote the alias into the shared preset's explicit subpath list in `tsdown.client.ts`** (the `@sdkwork/ui-pc-react/theme` rows). That list serves subpaths imported across the client workspace; today only the appstore bundle inlines sources importing `utils/money`. The package-local row keeps the mapping next to its in-file precedent, and a second affected bundle is the trigger to promote it.

**Add a `@sdkwork/utils/*` wildcard to `src/*`.** Rejected on the same grounds the preset documents: a package's `./x` export need not sit at `src/x`, so a wildcard hijacks subpath resolution that the package `exports` map already points at the right file.

**Declare `@sdkwork/utils` as a dependency so node resolution finds the workspace link.** Resolution from a file inside the sibling checkout never reaches the harness `node_modules` — the directory walk-up stays inside the sibling tree — and the release runner clones pinned siblings without `node_modules` at all. Where a compiled lib build did resolve, the bundle would inline built output instead of the pinned source, breaking the source-pin model the aliases keep.

## Consequences

The mapping is hand-maintained per subpath: a sibling source that starts importing another `@sdkwork/utils/*` subpath (the checkout already imports `utils/id` in files the bundle closure does not currently reach) re-trips `checkClientBundleSdkworkExternals` until the same one-line row is added. The gate runs before any bundle pass and names the exact specifier to map. After the fix the rebuilt appstore bundle emits no `@sdkwork/*` require and `verify-sdkwork-dependencies` passes.

# Desktop packaging boot and closure fixes

English | [中文](2026-09-05-desktop-packaging-fixes.zh.md)

Three packaging defects blocked the 0.1.3-alpha.1 desktop release; this change fixes all three
so the Desktop shell boots and `check:pack-deps` passes.

## sdkwork-api-gateway inlines `/src/*` imports

`packages/host/sdkwork-api-gateway/tsdown.config.ts` added an `alwaysBundle` pattern for
`@deepseek-ai/dsh-client-connection/src/`. The node halves of this package reach the `connection`
helpers through `/src/*` specifiers; `connection` exports `./src/*` verbatim, so an externalized
`@deepseek-ai/dsh-client-connection/src/...ts` import survives into the shipped chunk and resolves
to TypeScript SOURCE at runtime. Node's ESM loader rejects it with `ERR_UNKNOWN_FILE_EXTENSION` the
moment the Loader imports this package, which fails desktop host boot with
`failed to import loader entry sdkwork-api-gateway`. Typecheck resolves the same specifier through
tsconfig `paths`, so the break was invisible to the source-plane gate. Bundling the helpers also
keeps this fork host package self-contained: the copied helpers compile from the same tree in the
same pass and cannot drift from `connection`'s own copy.

## session-persistence-jsonl delays the `fs-ext` load

`packages/session/session-persistence-jsonl/src/lease.ts` converted the module-scope `fs-ext`
import into the body of `flockAsync`, the only POSIX lock path that calls `flock(2)`. Windows holds
a named kernel semaphore instead (`./win32.ts`) and never calls it. A static import still makes
every platform and runtime link `fs_ext.node` while loading this plugin, and the installed binding
is compiled for the Node.js ABI the package was built against (127 on Node 22), not for the ABI of
whatever ends up loading it. Electron carries its own (133 on Electron 35). The mismatch is an
unrecoverable `ERR_DLOPEN_FAILED` that aborts the whole Loader entry group, so a static import
lets `session-persistence-jsonl` alone kill desktop boot on a platform that never takes a POSIX
lock. Resolving `fs-ext` at first use keeps the native dependency strictly inside the branch that
needs it; the module registry caches the resolution, so this costs nothing per call.

## Desktop packaged dependency closure synced

`apps/desktop/package.json` was missing six workspace dependencies that the Desktop host links
at runtime: `@deepseek-ai/dsh-client-file-upload`, `@deepseek-ai/dsh-sdkwork-api-gateway`,
`@deepseek-ai/dsh-session-format`, `@deepseek-ai/dsh-session-format-catalog`,
`@deepseek-ai/dsh-session-format-v0-to-v1`, `@deepseek-ai/dsh-session-format-v1-to-v2`.
`scripts/sync-pack-deps.mjs --write` merged them in alphabetical order and the matching
`pnpm-lock.yaml` rows resolve to `workspace:^`. `check:pack-deps` now reports "closure complete".

## connection tsdown entries emit to the right filenames

`packages/client/connection/tsdown.config.ts` switched the desktop entry from `lib/types/desktop.js`
to `src/client/desktop-bridge.ts` and adopted the object entry form (`{ index, desktop }`) so tsdown
emits `lib/index.js` and `lib/desktop.js` (not `lib/src/client/desktop-bridge.js`, which the
`package.json` files gate would silently drop). Two defects were in play:

1. **CI build race.** The original `lib/types/desktop.js` entry was the tsc output of
   `desktop-bridge.ts`. Under parallel CI builds, tsdown sometimes started reading it before tsc had
   emitted it, surfaced as `ENOENT` / "Cannot resolve entry module". `desktop-bridge.ts` only has
   `import type` statements and no runtime dependency on any other compiled package, so tsdown
   compiling the source directly removes the tsc-ordering requirement.
2. **Smoke failure.** After the race was bypassed, the string-entry form (`['src/client/desktop-bridge.ts']`)
   made tsdown preserve the full `src/client/` segment under `lib/`; the packaged app then shipped
   `lib/src/client/desktop-bridge.js` and no `lib/desktop.js`, and the packaged-boot probe died on
   `ERR_MODULE_NOT_FOUND` for `@deepseek-ai/dsh-client-connection/lib/index.js`. Pinning each entry
   key to the desired basename restores the filenames the host expects.

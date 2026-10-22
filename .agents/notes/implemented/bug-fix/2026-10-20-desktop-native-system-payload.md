# Agent Note: Desktop ships the native system payload

Status: implemented

English | [中文](2026-10-20-desktop-native-system-payload.zh.md)

## Problem

`@deepseek-ai/node-addon-system` owns the POSIX session lock (`./flock`) and the Linux Landlock launcher, and resolves each binary through the platform package its entry declares as an optional dependency, `@deepseek-ai/node-addon-system-<platform>-<arch>` ([platform packages](../architecture/2026-09-07-prebuilt-system-primitives.md)). Desktop packaging packed only the entry into `packed/landlock`, so the runtime project's `pnpm install --prod` asked the registry for the platform package. The registry carries only 0.1.2 while this checkout pins 0.1.5-alpha.2, the `~0.1.5-alpha.2` range resolves to nothing, and pnpm treats an unresolved optional dependency as absent. The materialized runtime therefore shipped without the addon and the launcher, and every process that takes a session write lease died on `Cannot find module '@deepseek-ai/node-addon-system-linux-x64/package.json'`: the prepared-runtime smoke, which acquires a real lock on POSIX, and the installed application under `/opt/BirdCoder/resources/app.asar/dsh`. Windows never showed the defect, because it has no platform package, `./flock` keeps its koffi semaphore there, and Landlock is Linux-only.

## Decision

`package-target.ts` builds the host's native payload (`pnpm --dir native/system run build:native`) and packs the host platform package beside the entry with `native/system/scripts/pack-release.mjs --current-platform-only`, the packer and the npm-for-platform/pnpm-for-entry rule that [the container image](../process/2026-08-17-landlock-container-offline-packing.md) already uses. The platform tarball joins the Desktop package set, whose `file:` overrides replace the entry's registry range, so `node_modules/@deepseek-ai/node-addon-system-<platform>-<arch>/` is part of the materialized runtime with its `bin/` payload. Windows keeps packing the entry alone: it has no platform package, and `pack-release.mjs` resolves `pnpm` through PATH, which a Windows runner spells `pnpm.cmd`.

`prepare-dsh.ts` refuses a POSIX runtime without the target's platform package, so a package set that lost the payload fails packaging instead of shipping an application that cannot lock a session.

`electron-builder-config.mjs` unpacks `**/node_modules/@deepseek-ai/node-addon-system-*/bin/**/*`, and `launcherPath()` rewrites a resolved `.asar` segment onto the sibling `.asar.unpacked` tree. `bin/landlock-run` carries no extension, so the existing native-binary pattern misses it, and an executable inside the archive cannot be spawned; the addons keep matching `**/*.node`.

The Linux lanes install `musl-tools`, because the launcher is a static musl executable and the musl addon is a second copy of the binding.

## Alternatives considered

**Publish the platform packages and keep resolving them from the registry.** Every Desktop build would then depend on a separate release workflow having published the exact pinned version, and a build from any other commit still produces a runtime without the lock; a self-contained runtime must not resolve native capabilities from a registry at install time.

**Pack the platform package without building the host payload.** Its prepack gate refuses a package whose declared binaries are absent, so that fails at pack time instead of shipping an empty package.

**Fall back to a pure-JavaScript lock when the addon is missing.** The entry's contract is to reject acquisition rather than grant an unprotected lock, and a pure-JavaScript lock changes the semantics the session write lease depends on.

**Unpack the whole platform package.** `prebuilds.json` and the README are archive content the loader never executes, so the narrower pattern keeps the unpacked tree minimal.

## Consequences

Linux and macOS packaging need a build host matching the target architecture, a C compiler, and, on Linux, `musl-tools`; a Windows or Linux host of the wrong architecture is refused before preparation, and a macOS host whose architecture differs from the target fails at `prepare:dsh` naming the missing platform package. The runtime grows by the launcher and two addon copies. The packaged application regains the session lock and the Landlock launcher; the runtime smoke acquires a real lock on both POSIX targets and requires the unpacked Linux launcher.

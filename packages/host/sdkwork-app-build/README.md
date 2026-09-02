---
description: "Package-manager build runs with streamed output for the host: the sdkworkAppBuild service that spawns one build per accepted request, buffers frames for late followers, and cancels through a tree kill."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-app-build

English | [中文](README.zh.md)

## Summary

Host capability for one-click app packaging: `sdkworkAppBuild.start` validates a build directory (absolute cwd, readable `package.json`, existing script), resolves the package manager from the lockfile present (`pnpm-lock.yaml` → `pnpm run`, `yarn.lock` → `yarn run`, else `npm run`), spawns the build with `shell: true` and color-forcing disabled, and records every frame — `started`, `output` (line-split stdout/stderr), and a single terminal `exit` — in a per-build bounded buffer. Followers attach through `follow(buildId, signal)`: buffered history replays by delivered index, live frames arrive as they emit, and the iteration ends right after the exit frame or quietly on abort (aborting detaches the follower, it never kills the build). `cancel(buildId)` requests a tree kill (`taskkill /T /F` on win32, process-group SIGTERM elsewhere) and lets the process's own exit path emit the terminal frame; a grace period covers a grandchild that escaped the tree walk and holds the stdio pipes. Concurrency is capped at three running builds; finished records are retained (up to twenty) so late followers and `status(buildId)` still answer. The wire face over this seam is the [`sdkwork-app-build-controller`](../../api/sdkwork-app-build-controller/README.md) Remote; this package owns no transport.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the service in a host profile (`static inject = ['sdkworkAppBuild']` from the controller does it in the composed web-app bundle) and address builds by `buildId`. `start` throws `SdkworkAppBuildError` with one of five codes — `cwd-unreadable`, `no-package-json`, `script-missing`, `build-unknown`, `concurrency-exceeded` — and never leaves a half-registered record: validation happens before the spawn. Script arguments join after the conventional ` -- ` separator and must match a safe charset, because the command joins into a shell string without quoting.

<a id="understand-the-implementation"></a>
## Understand the implementation

One `BuildRecord` per accepted request holds the frame history: `started` stays at index 0, the oldest output line drops first once the buffer hits two thousand frames, and `finish` is idempotent so the exit frame is emitted exactly once. Followers wake through per-record listener sets; every frame lands in the history synchronously before listeners run, so a delivered-index replay cannot duplicate live frames. Eviction of finished records keeps the twenty most recent by start time.

<a id="further-exploration"></a>
## Further Exploration

- [`types.ts`](./src/types.ts) — the frame vocabulary and error codes shared with the controller.
- [`tests/runner.spec.ts`](./tests/runner.spec.ts) — real-process coverage of the validate/spawn/follow/cancel paths, including the leaf-escape cancellation race.

<a id="model-experience"></a>
## Model Experience

The build id, command, and cwd ride the `started` frame, so an agent narrating a packaging run can quote the exact command; output frames preserve stdout/stderr distinction for error triage.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Cancelling during the first moments of a build (while the package-manager chain is still spawning its leaf) can let that leaf escape the kill and finish in the background; the record still reports `cancelled` and the UI stays correct, but the process is not reclaimed early.
- No per-build env overrides, no workspaces filtering, and no build logs on disk; output lives only in the bounded frame buffer.

<a id="dev-note"></a>
## Dev Note

This is a fork package (`sdkwork` marker) following the repository naming contract. The controller declares its wire vocabulary locally — the typert generator crashes on cross-package type-alias-union re-exports, so this package's types are mirrored, not re-exported, there.

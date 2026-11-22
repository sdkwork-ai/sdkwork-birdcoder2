---
description: "Typert Remote face over the sdkworkAppBuild build runner: the sdkworkAppBuild namespace with start/follow/cancel verbs, zod-validated requests, streamed build frames, and closed app-build/* error codes."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-sdkwork-app-build-controller

English | [中文](README.zh.md)

## Summary

Remote wire face for one-click app packaging: the controller extends `TypertRemoteService` with the `sdkworkAppBuild` namespace and exposes `start` (zod-validated cwd, optional script and safe-charset arguments) returning the spawn facts, `follow` streaming the build's `started`/`output`/`exit` frames until exit or client abort, and `cancel` requesting the tree kill. Capability failures map onto a closed `app-build/*` wire-code registry. Execution lives in `dsh-sdkwork-app-build`; this package adds validation, error mapping, and the typert face.

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

Clients consume the generated namespace through the remotes assembly (`ctx.remote.sdkworkAppBuild.start/follow/cancel`), never by importing this package directly — the generated `./remote` module inlines into client bundles via the repository's `GENERATED_REMOTE` rule. `follow` takes the build id and an abort signal and returns the raw async iterable; aborting ends consumption quietly, detaching without cancelling the build.

<a id="understand-the-implementation"></a>
## Understand the implementation

Validation is zod-first: the cwd must be absolute, the script name matches a strict identifier pattern with a length cap, and arguments are capped in count and length with a safe charset — the controller rejects malformed requests before the seam sees them. `buildFailure` maps `SdkworkAppBuildError` codes onto the wire registry through a `satisfies Record` table; any other failure falls through to `gateway/internal` so unexpected errors never leak their shapes.

The wire vocabulary (frames, requests, values) is declared locally rather than re-exported from the seam package, because the typert generator cannot resolve cross-package type-alias unions. Capability errors map to a closed registry of wire codes — `app-build/cwd-unreadable`, `app-build/no-package-json`, `app-build/script-missing`, `app-build/build-unknown`, `app-build/concurrency-exceeded`, `app-build/command-unrunnable` — registered by module augmentation of `RemoteErrorDetailsMap` in this package's `types.ts`. The `api-remotes` assembly mounts the generated client contribution.

<a id="further-exploration"></a>
## Further Exploration

- [`types.ts`](./src/types.ts) — local wire vocabulary plus the `RemoteErrorDetailsMap` augmentation for the `app-build/*` codes.
- [`../../host/sdkwork-app-build/README.md`](../../host/sdkwork-app-build/README.md) — the execution seam this face projects.

<a id="dev-note"></a>
## Dev Note

This is a fork package (`sdkwork` marker) following the repository naming contract. Keep the wire types in `src/types.ts` local — mirroring the seam package's shapes — or the host face build's typert generation crashes in `FaceAnalyzer.packageExportName`.

## Runtime invariants

No runtime invariant companion is published; the controller orchestrates app build jobs whose ordering and settlement are owned by the app-build service; the controller adds no independently observable state.

<a id="model-experience"></a>
## Model Experience

None, as the controller only validates requests, maps error codes, and streams build frames to its wire caller; the build execution and its output belong to the app-build capability.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The registry is closed: adding a new failure code means editing the `RemoteErrorDetailsMap` augmentation here and the mapping table together.
- No verb for listing finished builds; clients must hold the build id from `start`.

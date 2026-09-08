---
description: "SDKWork git Remote: repository status, local branches, graph log, and branch checkout over the sdkworkGit seam, with payload validation and git/* wire codes."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-sdkwork-git-controller

English | [中文](README.zh.md)

## Summary

Host Remote namespace `sdkworkGit` over the [`sdkwork-git`](../../host/sdkwork-git/README.md) seam: `status`, `branches`, `checkout`, `createAndCheckout`, and `log`. Each method validates its payload with zod before touching the seam — an absolute cwd for every request, a non-blank branch name without whitespace or a leading dash for checkout/create, an integer limit in `[1, 200]` for the log — and projects seam rejections onto the closed `git/*` wire vocabulary (`git/cwd-unreadable`, `git/not-a-repo`, `git/branch-name-invalid`, `git/checkout-failed`, `git/command-failed`); anything else is a `gateway/internal`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## Use this package

Mount the controller after the seam in a host composition (the web-app bundle row declares `inject: [sdkworkGit]`); the typert generator emits the host face and the browser Remote client at build. Browser consumers read the mounted `remote.sdkworkGit` namespace; `ui-sdkwork-git` adapts it into its structural port.

<a id="understand-the-implementation"></a>

## Understand the implementation

The controller owns the wire vocabulary only: request shapes are declared locally in `src/types.ts` (the typert generator requires every frame member to resolve inside the owning package — cross-package re-exports crash it), and the seam's structurally identical types are never re-exported. Validation is the only logic; every method is a straight pass-through after `safeParse`.

<a id="known-limitations-and-deferred-work"></a>

## Dev Note

This is a fork package (`sdkwork` marker) following the repository naming contract. The controller declares its wire vocabulary locally — the typert generator crashes on cross-package type re-exports, so the seam types are mirrored, not re-exported, there.

## Runtime invariants

No runtime-invariant companion is published; the controller is a stateless validator over a stateless seam.

## Model Experience

None, as the namespace is a validation and pass-through face over the git seam; the seam's reads and checkouts carry no model-visible registration.

#### KV Cache effect

None; repository facts ride the wire to the UI and never enter model context.

## Known Limitations and Deferred Work

- The namespace is read-plus-checkout only; staging, committing, and push/pull are deferred with the seam beneath them.

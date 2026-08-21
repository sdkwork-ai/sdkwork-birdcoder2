# Agent Note: SDKWork fork 命名契约（sdkwork 前缀）

Status: implemented

English | [中文](2026-08-21-sdkwork-prefix-naming-contract.zh.md)

## Problem

The fork customizes and adds packages on top of `deepseek-ai/deepseek-harness`, and upstream keeps iterating. Before the contract, fork-specific packages used plain names (`ui-iam`, `ui-env`, `desktop-carrier`) that upstream could adopt or collide with. An upstream merge can then silently overwrite a fork feature, or a name collision forces a fork package to be treated as upstream's. The 2026-08-21 upstream sync made the cost concrete: fork packages without a distinctive marker cannot be distinguished from upstream's during conflict resolution.

## Decision

Every package or entry this fork adds or customizes carries the `sdkwork` marker in its name, immediately after the scope word that names its surface:

| Surface | npm name | Directory | Examples |
|---|---|---|---|
| Client UI packages | `@deepseek-ai/dsh-client-ui-sdkwork-<name>` | `packages/client/ui-sdkwork-<name>/` | `ui-sdkwork-iam`, `ui-sdkwork-env` |
| Host packages | `@deepseek-ai/dsh-sdkwork-<name>` | `packages/host/sdkwork-<name>/` | `sdkwork-desktop-carrier` |
| Bundle packages | `@deepseek-ai/dsh-sdkwork-<name>` | `packages/bundle/sdkwork-<name>/` | `sdkwork-desktop-app` |
| Boot packages | `@deepseek-ai/dsh-sdkwork-<name>` | `packages/boot/sdkwork-<name>/` | `sdkwork-env-bootstrap` |

Plain `ui-<name>` / `<name>` package names belong to upstream. Fork code never lives in them; a fork package found with a plain name is a rename debt item, tracked in this ledger until the rename lands.

Imports, tsconfig paths, cordis.yml rows, docs, tests, and every other reference use the `sdkwork` names exclusively — no alias, compatibility package, or dual name remains (the [repository naming contract](2026-08-11-repository-naming-contract-and-rename-ledger.md) applies the same all-or-nothing rule).

## Rename ledger

Completed in the WIP branch `wip/sdkwork-sync-2026-08-21` (checkpointed 2026-08-21, pending final review and merge to `main`):

- `ui-env` → `ui-sdkwork-env` (`@deepseek-ai/dsh-client-ui-sdkwork-env`)
- `ui-iam` → `ui-sdkwork-iam` (`@deepseek-ai/dsh-client-ui-sdkwork-iam`)
- `ui-app-modes` → `ui-sdkwork-app-modes`
- `ui-appstore` → `ui-sdkwork-appstore`
- `ui-course` → `ui-sdkwork-course`
- `ui-drive` → `ui-sdkwork-drive`
- `ui-feedback` → `ui-sdkwork-feedback`
- `ui-generations-image` / `video` / `assets` → `ui-sdkwork-generations-*`
- `ui-knowledge` → `ui-sdkwork-knowledge`
- `ui-settings-menu` → `ui-sdkwork-settings-menu`
- `ui-token-plan` → `ui-sdkwork-token-plan`
- `ui-updater` → `ui-sdkwork-updater`
- `ui-window-controls` → `ui-sdkwork-window-controls`
- `desktop-carrier` → `sdkwork-desktop-carrier`
- `desktop-app` (bundle) → `sdkwork-desktop-app`
- `sdkwork-env-bootstrap` (boot) — already conforming

Any fork package not listed here that still uses a plain name must be renamed before its next upstream sync, and this ledger updated.

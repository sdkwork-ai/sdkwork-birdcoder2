# Agent Note: Per-target Desktop release lanes

Status: implemented

English | [中文](2026-11-02-desktop-release-per-target-lanes.zh.md)

## Problem

The tagged Desktop release packaged its six targets as one matrix job. A single target failure — an Electron download flake, a runner image change — left one matrix child red among five green ones, and the only supported way to repackage one target was to dispatch or re-run the whole workflow, repeating six dependency installs and six workspace builds. The packaging work is also duplicated by construction: every lane runs the same platform-independent workspace build and package packing, and every attempt re-downloads the Electron distribution and the bundled runtime payload.

## Decision

[`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) owns the target table and [`desktop-package-target.yml`](../../../../.github/workflows/desktop-package-target.yml) owns the lane body. Each target is its own job — `package-win-x64` through `package-linux-arm64` — so the run summary and the Actions API name the target that failed, "re-run failed jobs" retries that target alone, and a matrix cannot silently expand the failure surface. The reusable workflow takes the runner, artifact, package script and build directories as inputs, so the six rows stay the only coverage definition and the lane body has one home.

`resolve` resolves the version and validates an optional `targets` input — `all`, or a comma-separated subset of the six target names — in release order, rejecting unknown, repeated and empty entries. A partial selection annotates the run with a warning: [`assemble-github-release.ts`](../../../../scripts/release/assemble-github-release.ts) accepts only the complete six-target asset set, so a partial run repackages and diagnoses, it does not publish.

Every lane caches the Electron distribution and the bundled runtime's Node, pnpm and Python payloads in the runner's temporary directory, outside the checkout so the Windows short build roots are unchanged, and restores that directory by runner OS and architecture with version-keyed fallbacks. Both payload halves are addressed by version, and the runtime install verifies its package store, so a stale cache entry can only cost a download the lane was going to make. The cache is writable and therefore shared only among these trusted release lanes, as [`apps/desktop/packaging/README.md`](../../../../apps/desktop/packaging/README.md) requires.

The lanes stay concurrent and self-contained: each one still builds and packs the platform-independent workspace in place of downloading a prepared tree. See the measurement and the rejected alternative below.

## Measurements

One local `win-x64 --unsigned` run on a 16-core Windows host with warm dependency and package caches, taken from the run's `result.json`: total 413 s.

| Stage | Seconds |
|---|---|
| workspace build (`build --profile local`) | 73 |
| pack dsh, vendor, host, plugins and native entry | 81 |
| runtime preparation (Electron download, primary runtime) | 42 |
| package set | 15 |
| runtime install, materialize and packaged smoke | 98 |
| electron-builder | 111 |
| packaged runtime smoke | 35 |

The stages after the workspace build add up to 413 s because the packing lane and the runtime preparation run concurrently on Windows; the sum of the rows alone overstates it by exactly that overlap. The workspace build and the packing stages are the platform-independent share of a lane. This is one sample from one host, not a CI budget; it bounds what sharing that work across targets could remove, and the shipped decision keeps it in each lane.

## Alternatives considered

**Keep the matrix and rely on the UI's single-child re-run.** The UI can retry one matrix child, but a matrix cannot be dispatched with a named subset, and its job name carries no target that a caller or the API can key on. The explicit jobs keep the same six-row table in the same file while making "repackage `win-arm64`" a dispatch argument.

**Produce the platform-independent build once and have every lane download it.** It removes five builds, but the lanes run concurrently today: a shared job is a serial prerequisite in front of six lanes, so its own duration lands on the critical path that the slowest lane sets, and one shared failure blocks every target. It is a runner-minute saving, not a wall-clock one, and the download cache already removes the duplicate that costs wall-clock.

**Cache the built workspace across commits so each lane's build becomes incremental.** A restored tree from a different commit keeps output files of deleted or renamed sources, which `pnpm pack` would then ship as if they belonged to this release. A lane's own build is what proves the tree matches its checkout.

**Keep the lane body inside `desktop-release.yml` and copy it per target.** Six copies of a 130-line job drift on the first change to a runner, an environment variable or a preflight step; the caller table and one reusable body keep the target data and the target steps apart.

## Consequences

A failed target is one job with a stable name, and its retry repeats that target only; the artifacts the other five targets already uploaded stay in the run. A one-command repackage of a single target is a `workflow_dispatch` with `targets: <name>`, and such a run cannot publish, which `resolve` states as a warning rather than discovering it in the assembly job.

The lane body moves into a reusable workflow, so the caller workflow is the target table; [`scripts/desktop-release-workflow.spec.ts`](../../../../scripts/desktop-release-workflow.spec.ts) pins the six rows' runners, build roots, platform settings files, package scripts and artifact names against [`desktop-build-paths.mjs`](../../../../apps/desktop/scripts/desktop-build-paths.mjs) and the release assembly's artifact list. Adding a target means a row in `resolve`'s vocabulary, a job, and an entry in the assembly — the spec fails on any one of them alone.

Each lane still repeats the platform-independent workspace build and packing. The measurement above is the budget for changing that, and the download cache covers the duplicate that costs wall-clock on every attempt.

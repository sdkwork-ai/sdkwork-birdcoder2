# Agent Note: Client test aggregate out of the build solution

Status: implemented

English | [中文](2026-09-07-client-test-aggregate-out-of-build-solution.zh.md)

## Problem

`build:lib:client` (and therefore every `pnpm run build`) re-ran the client test aggregate whenever any file in its closure changed: `tsc -b tsconfig.client.json` built ~89 referenced package projects (about a second when warm) and then type-checked a noEmit root program over all `packages/client/*` tests, `*.client.*` specs, css declarations, and the tsdown client preset sources.
Measured on a 32-core Windows host, the root re-check cost 1m20s–2m16s of silent single-threaded tsc after any content edit in that closure — including edits to test files, the natural unit of iteration — so a build producing no output for minutes looked hung.
Watch invocations over the same solution (`tsc -b tsconfig.client.json --watch`, the `dev-web` tsc stage) repeated the same re-check on every change.

## Decision

Split the client solution in two, keeping the reference list in exactly one file.
`tsconfig.client.json` becomes the **build solution**: the same ~89 project references and an explicit empty `files` list (an absent include/files would default the root program to the whole repository); `tsc -b` on it emits every referenced project's `lib/types` for the tsdown Client pass and nothing else, and `build:lib:client` keeps its exact command text.
New `tsconfig.client.tests.json` is the **client test aggregate**: the former include/exclude blocks moved verbatim (tests, css declarations, `packages/client/tsdown.client.ts`, `scripts/client-build-environment.ts`, the `scripts/*.client.*` specs) plus a mirror of the same references; it runs only from `typecheck:contracts-ready` and the root `tsconfig.json` graph (editors, `tsc -b tsconfig.json`).
The mirrored references are load-bearing, not bookkeeping: the aggregate type-checks imports that resolve into a referenced project against that project's emitted `lib/types` declarations (project-reference redirects); without the references the same include set becomes a flat program over every package source, which fails with hundreds of `Context` merge and strictness errors (verified before the mirror was added).
`scripts/client-tsconfig.spec.ts` asserts the build solution stays program-less and the two reference lists stay equal; `scripts/ts-project.ts` maps the `client` face to `tsconfig.client.tests.json`, so repo-wide client programs (verify-client-packages, optional-dependency-imports) flatten exactly the set they flattened before.
Consumers of the aggregate's include/exclude moved with it: the `sdkwork-dependencies` exclusion check reads `tsconfig.client.tests.json`, and oxlint's owning-project contract attributes client test files to it.

## Alternatives considered

- **Move only the tests out and drop the references from the aggregate** — rejected: without references the aggregate loses project-reference redirects and becomes a flat program over every package source; the same 467-file include set then fails with hundreds of `Context` merge and strictness errors (verified empirically before adding the mirror).
- **Derive the build project list at runtime** (a wrapper script reading the references and spawning `tsc -b` per project, keeping one static config) — rejected: it changes the documented build command shape, complicates the `dev-web` watch stage, and buys nothing over a mirrored static list whose equality a spec enforces mechanically.
- **Duplicate the references into the tests config without a drift guard** — rejected: silent drift would change which projects the aggregate redirects to; `client-tsconfig.spec` keeps the two lists equal and the build solution program-less.
- **Keep the aggregate in the build solution** — rejected: every content edit in the test closure (test edits included) made `build:lib:client` spend 1m20s–2m16s of silent single-threaded tsc, which is the defect this note removes.

## Consequences

`build:lib:client` no longer pays the aggregate: warm tsc ~1s (references only) plus the tsdown pass, and a test file with type errors does not fail the build (verified: an injected `TS2322` left the build at 0.63s while the tests config reported it, exit 1).
Client test type checking keeps full coverage in `pnpm run typecheck` / `typecheck:contracts-ready` and the CI typecheck gate; the aggregate's first run costs ~2m18s and warm runs ~0.7s (tsc -b caching).
Watch invocations of `tsconfig.client.json` (dev-web, manual `--watch`) no longer re-check the aggregate per edit.
Adding a Client package reference now touches `tsconfig.client.json` and its mirror in `tsconfig.client.tests.json`; the spec guard turns a missed mirror into a failing test rather than silent drift.

## Testing

File-set parity: the tests config's parsed include matches the old aggregate's 467 files exactly (0 missing, 0 extra).
`tsc -b tsconfig.client.json` warm 0.63–0.69s, exit 0 with a deliberately broken test file present; `tsc -b tsconfig.client.tests.json` reports the injected `TS2322`, exit 1, and settles warm at 0.75s.
Whole-graph `tsc -b tsconfig.json` completes in ~6s (host + client + test aggregate all cached).
Gates and specs green: `verify-client-packages`, `client-tsconfig.spec`, `sdkwork-dependencies.spec`, `project-reference-faces.spec`, `oxlint-contract.spec`, `verify-client-packages.spec`, `verify-optional-dependency-imports.spec`.
`verify-optional-dependency-imports` reports 22 module-scope optional loads on the current working tree both before and after the seed change (pre-existing local state, not caused by this split).

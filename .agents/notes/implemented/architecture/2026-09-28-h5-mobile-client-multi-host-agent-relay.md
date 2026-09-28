# Agent Note: Relay a mobile H5 client to many self-hosted agent runtimes

Status: implemented

English | [中文](2026-09-28-h5-mobile-client-multi-host-agent-relay.zh.md)

## Problem

`apps/sdkwork-birdcoder2-pc` runs the harness in-process: the renderer talks to a runtime that lives beside it. A phone cannot do that. It has no room for the harness, no filesystem to run an agent in, and it cannot keep a long-lived socket alive across backgrounding. So the H5 root could not be a smaller PC — it needed a different execution model, and `apps/sdkwork-birdcoder2-h5` was a scaffold whose README still said the renderer and capability packages were unimplemented.

The requirement was an owner with **many** hosts: Windows, Linux, macOS, Docker, and cloud `sdkwork-sandbox` instances, each running one `sdkwork-birdcoder2`, all reachable from one phone. That makes the mobile client an endpoint of a relay whose far side is a machine the phone may never have spoken to before, and it has to work without changing the PC application or its plugins.

## Decision

**The backend is two API faces over one shared domain service.** `crates/sdkwork-routes-birdcoder2-app-api` is the owner's mobile surface (hosts, pairing codes, conversations, turns, the event log); `crates/sdkwork-routes-birdcoder2-internal-api` is the host runtime's surface (attach, lease, heartbeat, claim a turn, report events). Both hold `crates/sdkwork-birdcoder2-host-runtime-service` as a shared `Arc`. That sharing is the whole point: a pairing code the owner mints on the app face has to be redeemable on the internal face, so they cannot be two services with two stores. `crates/sdkwork-api-birdcoder2-assembly` assembles them.

**The wire model is a relay, not a proxy.** Attachment runs: pairing code → lease → heartbeat at one third of the lease, clamped to 5–600 seconds (`heartbeat_interval_seconds` in `service.rs`) → the host claims a submitted turn and appends events with a monotonically increasing `sequence`. Host status is *projected from the lease on every read* (`pending` / `online` / `offline` / `disabled`), so there is no separate health record to drift.

**The client follows the log by watermark.** The phone re-reads only what it has not applied, using `afterSequence`, and persists that watermark in host secure storage (`@sdkwork/birdcoder2-h5-core`'s `session` surface). Backgrounding or a dropped connection therefore resumes a conversation instead of replaying it. The live text is assembled from `assistant-delta` events and replaced by the durable turn record when a terminal event arrives. A run is bounded at 150 poll rounds of 1.2 s — three minutes — so a host that stopped reporting cannot keep the phone awake.

**Capability packages see ports, never transport.** `BirdCoder2Ports` is the only type face `@sdkwork/birdcoder2-h5-hosts` and `@sdkwork/birdcoder2-h5-agent-chat` may import; constructing the generated SDK client happens once, in the composition root. `check-frontend-composition` enforces this, and a mutation proved it covers the new packages. The shell owns the tab bar and the component-key-to-screen binding, so a capability that contributes a route appears in the navigation without the shell being edited; a route naming an unregistered component key throws rather than rendering a blank screen.

## Alternatives considered

**Connect the phone straight to each host.** Rejected. Every host would need an inbound endpoint the phone can reach, there is no place to hold the owner's credential story, and the fleet model — one list, one selection, one revoke — would have to be reinvented on the client. It would also put runtime concerns inside a mobile bundle.

**One backend per face.** Rejected. A pairing code minted by the app face must be redeemable by the internal face; two services would need either a shared database (an implicit coupling that is worse than an explicit `Arc`) or a hand-off protocol between them.

**Proxy the agent's own protocol to the phone instead of maintaining a log.** Rejected. A phone backgrounds constantly and drops connections by design, so the client needs an ordered, resumable log it can re-enter at a watermark. A live stream would lose the turn.

**Have the H5 root embed the harness runtime.** Rejected by the premise: this is the thing a phone cannot do.

## Consequences

- The mobile client holds no runtime state; a lost connection costs a replay from the watermark, not a lost turn.
- Host liveness is derived, so an expired lease degrades a host to `offline` with no sweep job.
- Route crates must be listed explicitly in the root `Cargo.toml` `[workspace] members` array: the API assembly materializer reads that array verbatim rather than expanding a glob, so a `crates/*` glob would hide every route crate from `assembly-manifest.json`.
- The PC application and the `packages/*` client plugins are untouched — the API is a relay, so nothing about their surfaces had to change.
- `tsconfig.base.json` needed a `@sdkwork/utils/*` row. `sdkwork-sdk-common` imports `@sdkwork/utils/id` by subpath, and the bare row only matched the exact specifier, so no Vite-based tool could load the generated app SDK. `tsc` had hidden this because it resolves the specifier from sdk-common's own config.

## Testing

`pnpm --dir apps/sdkwork-birdcoder2-h5 test` runs 63 tests across 11 files. `vitest.config.ts` exists because vitest otherwise falls back to `vite.config.ts` — a build config that derives the output directory from `mode` and threw without one, so the package's `test` script had never passed; it also derives the `@sdkwork/*` aliases from `tsconfig.base.json`, since vitest has no tsconfig `paths` support and a `paths` row resolves straight to a file, bypassing package `exports`.

The shell's route-wiring spec is mutation-verified: changing one contribution's `component` key to an unregistered name fails two assertions naming both the route identity and the bad key, and the suite is green again once reverted.

`cargo check --workspace --all-targets` is clean for all four crates. `check-frontend-composition`, `check-composition-resolver`, `check-permission-composition`, `check-route-path-collisions`, `check-api-assembly-integration-closure`, `check-rust-backend-composition`, `check-apps-directory-index`, `check-app-manifest-standard` and `check-sdk-standard` (`--workspace` scoped) all pass. `verify-repo` reports no violation in any file this work created or modified; its only remaining findings are nested `pnpm-workspace.yaml` files inside gitignored build trees (`apps/desktop/.desktop-build`, `.workbuddy/tmp/dsh-home-verify`).

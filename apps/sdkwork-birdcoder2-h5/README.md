# sdkwork-birdcoder2-h5

H5 mobile web application root for BirdCoder2, with Capacitor as the native host/release shape.

Authority: `APP_H5_ARCHITECTURE_SPEC.md` §2, `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2,
`APPLICATION_SPEC.md`. Package UI rules: `APP_MOBILE_REACT_UI_SPEC.md`.

## Role in the Adaptive Web pair

Per `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2.1 every module that exposes browser UI on a
public origin must ship **both** `sdkwork-birdcoder2-pc` and `sdkwork-birdcoder2-h5`. Selection is same-origin by device
class: mobile → H5 (fallback PC), desktop → PC (fallback H5).

## Remote hosts, not a local runtime

A phone cannot host the agent runtime, so this root does not run one. An owner enrolls **many**
hosts — Windows, Linux, macOS, Docker, or a cloud `sdkwork-sandbox` instance — each running one
`sdkwork-birdcoder2` instance, and talks to all of them through one Rust API backend. The mobile
client is a relay endpoint, not a runtime:

```text
mobile H5  ──app API──▶  sdkwork-routes-birdcoder2-app-api  ─┐
                                                             ├─▶ HostRuntimeService
host runtime ──internal API─▶ sdkwork-routes-birdcoder2-internal-api ─┘
```

- `crates/sdkwork-routes-birdcoder2-app-api` — the owner's surface: list, rename and revoke hosts;
  issue a pairing code; list, create, rename and delete conversations; submit and cancel a turn;
  read the append-only event log.
- `crates/sdkwork-routes-birdcoder2-internal-api` — the host runtime's surface: attach with a
  pairing code, mint and renew a lease, heartbeat, claim a turn, report events.
- `crates/sdkwork-birdcoder2-host-runtime-service` — the one domain service **both** faces hold as
  a shared `Arc`. That sharing is what makes the two faces one application rather than two.
- `crates/sdkwork-api-birdcoder2-assembly` — the assembly crate. Route crates are discovered by
  reading the `[workspace] members` array in the repository `Cargo.toml` verbatim, so the four
  members are listed explicitly instead of as a `crates/*` glob.

Attachment is a relay, with no long-lived inbound connection to the phone:

1. The owner asks the app API for a pairing code and hands it to the target machine.
2. The host runtime attaches with that code and receives a lease. It heartbeats at one third of the
   lease duration, clamped to 5–600 seconds.
3. The phone submits a turn; the host claims it, runs it, and appends events to the log with a
   monotonically increasing `sequence`.
4. The phone follows the log by `sequence` watermark and re-reads only what it has not applied. The
   watermark is persisted in host secure storage, so backgrounding the app or losing the connection
   resumes the conversation instead of replaying it.

Because the API is a relay rather than a proxy of the agent's own protocol, nothing about the PC
application or its plugins changes: `sdkwork-birdcoder2-pc` and the `packages/*` client plugins are
untouched by this root.

## Standard root layout

```text
sdkwork-birdcoder2-h5/
  .sdkwork/            # application skills and plugins
  bin/                 # ios/ and android/ operational helpers
  etc/                 # source-controlled deployment profile projection
  config/
    browser/           # public browser runtime-env templates
    host/              # Capacitor platform templates, permission and deep-link metadata
    server/            # only when this root owns a server/preview process
    container/         # only when this root owns a container process
  docs/ public/ scripts/ sdks/ specs/ tests/
  src/                 # root shell entry and composition boundary only
  packages/            # core, commons, shell, capability, console, admin, capacitor host
  index.html vite.config.ts vitest.config.ts
```

## Package family

| Package | Role |
| --- | --- |
| `@sdkwork/birdcoder2-h5-core` | The aggregation surface: `BirdCoder2Ports` (the only type face a capability package may see), generated-SDK client construction, host adapter fallbacks, the route registry, and the conversation watermark store. |
| `@sdkwork/birdcoder2-h5-hosts` | Host fleet capability: the fleet list, inline rename and revoke, and the two-step enrollment flow. Contributes `app.host.fleet.{index,enroll}`. |
| `@sdkwork/birdcoder2-h5-agent-chat` | Agent conversation capability: the live transcript, the streaming turn log, and the session list. Contributes `app.agent.chat.{index,sessions}`. |
| `@sdkwork/birdcoder2-h5-commons` | Shared mobile presentation primitives, safe-area and gesture helpers. |
| `@sdkwork/birdcoder2-h5-shell` | Mobile route assembly, navigation, AuthGate wiring. Owns the tab bar and the component-key-to-screen binding; owns no capability state and no transport. |
| `@sdkwork/birdcoder2-h5-capacitor` | **The only** package allowed to own Capacitor configuration, plugin implementation, generated native project directories, and platform-specific host implementations. |

A capability package takes `BirdCoder2Ports` as a prop and never imports the generated SDK; the
composition root (`src/bootstrap/`) decides the transport. `check-frontend-composition` enforces it.

## Deployment profiles

Both `standalone` and `cloud` are supported; `cloud` is the default. Browser output emits into
`dist/<deployment-profile>/<envAlias>/`. H5 browser output is a Web artifact even on iOS/Android
browsers; only the Capacitor host produces IPA/APK/AAB.

## Derived client env

`.env.<deployment-profile>.<environment>` files are derived, never hand-edited:

```bash
node ../../../sdkwork-specs/tools/materialize-client-env.mjs --root ../../.. --check
```

## Tests

```bash
pnpm --dir apps/sdkwork-birdcoder2-h5 test
```

`vitest.config.ts` exists because vitest would otherwise fall back to `vite.config.ts`, which is a
build config that derives the output directory from `mode` and throws without a `--mode`. It also
derives the `@sdkwork/*` aliases from `tsconfig.base.json`, since vitest has no tsconfig `paths`
support and a `paths` row resolves straight to a file, bypassing package `exports`.

## Implementation status

The renderer, the composition root, the route registry, both capability packages, and the Rust
backend are implemented and covered by tests. Not implemented: the Capacitor native host (the
`bin/ios` and `bin/android` helpers are still placeholders) and the browser-side host adapters'
native implementations beyond the browser fallbacks.

A full `vite build` additionally needs the workspace packages linked by a real `pnpm install`.

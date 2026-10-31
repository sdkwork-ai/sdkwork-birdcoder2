# sdkwork-birdcoder2-pad

Tablet-first application root for BirdCoder2 (iPadOS and Android tablets).

Authority: `APP_PAD_ARCHITECTURE_SPEC.md` §2 and §5, `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`,
`APPLICATION_SPEC.md`. Package UI rules: `APP_PC_REACT_UI_SPEC.md` (shared large-screen rules).

## Standard root layout

```text
sdkwork-birdcoder2-pad/
  .sdkwork/            # application skills and plugins
  assets/              # tablet screenshots, covers, and capture configuration
  bin/                 # cross-platform operational scripts
  config/              # browser runtime, tablet runtime, and Tauri templates
  etc/                 # deployment profile projection
  docs/                # architecture notes, adaptation evidence, runbooks
  public/              # static assets copied into the tablet renderer
  scripts/             # build, validation, and release utilities
  sdks/                # application-root SDK workspaces and generator inputs
  specs/               # local component and tablet adaptation contracts
  src/                 # root shell entry and composition boundary only
  packages/            # runtime, shell, app, console, admin, and Tauri host packages
  tests/               # application-level integration, tablet, and boundary tests
  index.html           # tablet renderer entry
  vite.config.ts       # renderer build configuration
  vitest.config.ts     # test configuration
```

## Surfaces in this root

| Package family | Role |
| --- | --- |
| `@sdkwork/birdcoder2-pad-core` | Runtime/bootstrap, SDK client factories, appbase IAM runtime, global TokenManager, window-class detection, host adapter contracts. |
| `@sdkwork/birdcoder2-pad-commons` | Tablet layout primitives, split-view helpers, touch target and responsive helpers. |
| `@sdkwork/birdcoder2-pad-shell` | Tablet navigation rail/sidebar, master-detail composition, app route assembly, AuthGate wiring. |
| `@sdkwork/birdcoder2-pad-<capability>` | Tablet-adapted user-facing capability packages. |
| `@sdkwork/birdcoder2-pad-console-*` | User-facing management console packages. |
| `@sdkwork/birdcoder2-pad-admin-*` | Internal operator packages owning the `backend-admin` boundary. |
| `@sdkwork/birdcoder2-pad-tauri` | The single iPadOS and Android tablet native host. |

## Runtime targets

| Target | Artifact | Host |
| --- | --- | --- |
| `tablet-ipados` | IPA (TestFlight / App Store / private distribution) | `sdkwork-birdcoder2-pad-tauri` Tauri iOS target |
| `tablet-android` | APK / AAB (Play / private distribution) | `sdkwork-birdcoder2-pad-tauri` Tauri Android target |

No browser, desktop, server, container, Electron, or Capacitor target is declared by this root.

## Deployment profiles

Both `standalone` and `cloud` are supported; `cloud` is the default. Each target and
environment has a checked-in `.env.<deployment-profile>.<environment>` file plus an
Android tablet variant. `.env.local`, `.env.*.local`, `.env.postgres`, and
`config/*.local.toml` are ignored.

## Tablet adaptation

- Window classes: `compact`, `medium`, `expanded`, `large`, detected from actual viewport
  dimensions and observed with `ResizeObserver`.
- Navigation: drawer below 600 px, navigation rail from 600 px, master-detail from 840 px,
  three-pane from 1200 px.
- Both portrait and landscape are supported; no orientation lock.
- iPadOS Split View, Slide Over, Stage Manager and Android freeform are claimed.
- Touch targets are 44 pt on iPadOS and 48 dp on Android tablets.
- The full declared matrix and evidence paths live in `specs/tablet-adaptation.spec.json`.

## Commands

```text
pnpm install
pnpm dev
pnpm dev:standalone
pnpm dev:cloud
pnpm dev:tablet-ipados
pnpm dev:tablet-android
pnpm stop
pnpm typecheck
pnpm test
pnpm test:tablet-adaptation
pnpm test:config
pnpm check
pnpm verify
pnpm lint
pnpm build
pnpm build:tablet-ipados
pnpm build:tablet-ipados:prod
pnpm build:tablet-android
pnpm build:tablet-android:prod
pnpm clean
```

`dev` starts the default tablet host (iPadOS). `dev:standalone` and `dev:cloud` select the
corresponding deployment profile. Tablet builds require Xcode/Apple tooling for iPadOS and
the Android SDK for Android tablets; CI must record which runner image satisfies each target.

## Scaffold status

This root is a **standard-layout scaffold**: layout, manifest, profile projection, tablet
adaptation contract, config templates, package family boundary, and tablet adaptation tests
exist. Capability packages, the production renderer, signing material, store listings, and
native target projects are not implemented yet; build/xcrun/gradle commands become functional
as those land.
# sdkwork-birdcoder2-pc

PC browser / desktop / large-screen tablet application root for BirdCoder2.

Authority: `APP_PC_ARCHITECTURE_SPEC.md` §2, `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2,
`APPLICATION_SPEC.md`. Package UI rules: `APP_PC_REACT_UI_SPEC.md`.

## Standard root layout

```text
sdkwork-birdcoder2-pc/
  .sdkwork/            # application skills and plugins
  bin/                 # cross-platform operational scripts
  etc/                 # source-controlled deployment profile projection
  config/              # non-secret config templates per runtime target
  docs/                # architecture notes, runbooks, release notes
  public/              # browser-served static assets
  scripts/             # build, validation, generation, migration utilities
  sdks/                # application-root SDK workspaces and generator inputs
  specs/               # local component/application specs
  src/                 # root shell entry and composition boundary only
  packages/            # reusable runtime, shell, app, console, admin, desktop packages
  tests/               # application-level integration and boundary tests
  index.html           # browser renderer entry
  vite.config.ts       # renderer build configuration
```

## Surfaces in this root

| Package family | Role |
| --- | --- |
| `@sdkwork/birdcoder2-pc-core` | Runtime/bootstrap, SDK client construction, appbase IAM runtime, global TokenManager, host adapters. |
| `@sdkwork/birdcoder2-pc-commons` | Shared presentation primitives, command palette, global search, accessibility helpers. |
| `@sdkwork/birdcoder2-pc-shell` | App route assembly, layout, navigation, AuthGate wiring, workspace entry. |
| `@sdkwork/birdcoder2-pc-<capability>` | User-facing capability packages. |
| `@sdkwork/birdcoder2-pc-console-*` | User-facing management console packages. |
| `@sdkwork/birdcoder2-pc-admin-*` | Internal operator packages owning the `backend-admin` boundary. |
| `@sdkwork/birdcoder2-pc-desktop` | Tauri/Electron native host for Windows, macOS, Linux, iPadOS, and Android tablet targets. |

## Deployment profiles

Both `standalone` and `cloud` are supported; `cloud` is the default. Browser builds emit into
`dist/<deployment-profile>/<envAlias>/` (`APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2.1);
a bare `dist/` is never a valid publish target.

## Derived client env

`.env.<deployment-profile>.<environment>` files are **derived**, never edited by hand:

```bash
node ../../../sdkwork-specs/tools/materialize-client-env.mjs --root ../../..          # materialize
node ../../../sdkwork-specs/tools/materialize-client-env.mjs --root ../../.. --check   # verify
```

## Scaffold status

This root is a **standard-layout scaffold**: layout, manifest, profile projection, config
templates, and the package family boundary exist. The renderer, capability packages, and
native desktop host are not implemented yet — build/dev commands become functional as those land.

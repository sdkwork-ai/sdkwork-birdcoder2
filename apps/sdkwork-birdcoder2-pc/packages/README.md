# packages/ — pc package family

Architecture-local package family for `sdkwork-birdcoder2-pc`.
Authority: `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2, `APP_PC_ARCHITECTURE_SPEC.md`, `MODULE_SPEC.md`.

## Family

| Package | Role | Layer |
| --- | --- | --- |
| `@sdkwork/birdcoder2-pc-core` | Runtime/bootstrap, SDK client construction, appbase IAM runtime, global TokenManager, host adapters, offline/resilience and diagnostics. | `runtime` |
| `@sdkwork/birdcoder2-pc-commons` | Shared presentation primitives, command palette, global search, accessibility and input helpers. | `ui` |
| `@sdkwork/birdcoder2-pc-shell` | App route assembly, layout, navigation, AuthGate wiring, workspace entry, keyboard and pointer workflows. | `shell` |
| `@sdkwork/birdcoder2-pc-console-shell` | User-facing management console navigation, route assembly, console permission hints. | `shell` |
| `@sdkwork/birdcoder2-pc-admin-core` | Backend-admin boundary: backend SDK and appbase backend SDK wrappers, staff route guards, audit-sensitive layout. | `runtime` |
| `@sdkwork/birdcoder2-pc-desktop` | Tauri/Electron native host: window/tray, deep links, clipboard, file dialogs, updater, local service lifecycle, tablet packaging. | `host` |

## Rules

- App/console/admin packages stay separated: app packages use the plain
  `pc` segment, console packages add `-console-`, admin packages add `-admin-`
  and own the `backend-admin` boundary.
- `@sdkwork/birdcoder2-pc-core` is the only package that may export application-owned app SDK and
  appbase app SDK wrappers; backend SDK wrappers belong to the admin core boundary only.
- Feature packages receive SDK clients, service ports, providers, and adapters by injection;
  they must not construct SDK clients or read credentials.
- Internal dependencies use `workspace:*` (TypeScript) or a relative `path:` dependency (Dart).

## Wiring status

The family is scaffolded only: no package is registered as a workspace member yet, so no
package is built or linked. Registering the members is the next step before the first
capability package lands.

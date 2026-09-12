# packages/ — mini-program package family

Architecture-local package family for `sdkwork-birdcoder2-mini-program`.
Authority: `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2, `MINI_PROGRAM_APP_ARCHITECTURE_SPEC.md`, `MODULE_SPEC.md`.

## Family

| Package | Role | Layer |
| --- | --- | --- |
| `@sdkwork/birdcoder2-mp-core` | Runtime/bootstrap, generated app SDK client injection, appbase IAM runtime, token manager wiring. | `runtime` |
| `@sdkwork/birdcoder2-mp-commons` | Shared components, theming tokens, list/empty/loading/error/permission-denied states. | `ui` |
| `@sdkwork/birdcoder2-mp-shell` | Shell scaffold, tab bar, navigation, route projection input. | `shell` |
| `@sdkwork/birdcoder2-mp-console-core` | User-facing console boundary: console services, permission hints, console route contributions. | `runtime` |
| `@sdkwork/birdcoder2-mp-admin-core` | Backend-admin boundary for mini programs: backend SDK wrappers and staff guards. | `runtime` |
| `@sdkwork/birdcoder2-mp-host` | Platform adapter boundary (`src/weixin/` and other profiles): storage, request, login, subscribe-message, payment wrappers. | `host` |

## Rules

- App/console/admin packages stay separated: app packages use the plain
  `mp` segment, console packages add `-console-`, admin packages add `-admin-`
  and own the `backend-admin` boundary.
- `undefined` is the only package that may export application-owned app SDK and
  appbase app SDK wrappers; backend SDK wrappers belong to the admin core boundary only.
- Feature packages receive SDK clients, service ports, providers, and adapters by injection;
  they must not construct SDK clients or read credentials.
- Internal dependencies use `workspace:*` (TypeScript) or a relative `path:` dependency (Dart).

## Wiring status

The family is scaffolded only: no package is registered as a workspace member yet, so no
package is built or linked. Registering the members is the next step before the first
capability package lands.

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
- `@sdkwork/birdcoder2-mp-core` is the only package that may export application-owned app SDK and
  appbase app SDK wrappers; backend SDK wrappers belong to the admin core boundary only.
- Feature packages receive SDK clients, service ports, providers, and adapters by injection;
  they must not construct SDK clients or read credentials.
- Internal dependencies use `workspace:*` (TypeScript) or a relative `path:` dependency (Dart).

## Wiring status

Every package in this family is a registered workspace member
(`apps/sdkwork-birdcoder2-mini-program/packages/*` in `pnpm-workspace.yaml`), so each one is linked
and type-checked by the repository. Only the boundary contracts exist so far: no renderer, page
projection, or WeChat host profile is implemented yet.

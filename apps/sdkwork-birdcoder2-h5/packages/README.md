# packages/ — h5 package family

Architecture-local package family for `sdkwork-birdcoder2-h5`.
Authority: `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2, `APP_H5_ARCHITECTURE_SPEC.md`, `MODULE_SPEC.md`.

## Family

| Package | Role | Layer |
| --- | --- | --- |
| `@sdkwork/birdcoder2-h5-core` | Runtime/bootstrap, SDK client construction, appbase IAM runtime, global TokenManager, host adapter fallback registration. | `runtime` |
| `@sdkwork/birdcoder2-h5-commons` | Shared mobile presentation primitives, safe-area and gesture helpers, empty/loading/error states. | `ui` |
| `@sdkwork/birdcoder2-h5-shell` | Mobile route assembly, navigation, AuthGate wiring, shell layout. | `shell` |
| `@sdkwork/birdcoder2-h5-console-shell` | User-facing mobile console navigation and route assembly. | `shell` |
| `@sdkwork/birdcoder2-h5-admin-core` | Backend-admin boundary for H5: backend SDK wrappers and staff guards. | `runtime` |
| `@sdkwork/birdcoder2-h5-capacitor` | The only owner of Capacitor configuration, plugin implementation, generated native projects, and platform-specific host implementations. | `host` |

## Rules

- App/console/admin packages stay separated: app packages use the plain
  `h5` segment, console packages add `-console-`, admin packages add `-admin-`
  and own the `backend-admin` boundary.
- `@sdkwork/birdcoder2-h5-core` is the only package that may export application-owned app SDK and
  appbase app SDK wrappers; backend SDK wrappers belong to the admin core boundary only.
- Feature packages receive SDK clients, service ports, providers, and adapters by injection;
  they must not construct SDK clients or read credentials.
- Internal dependencies use `workspace:*` (TypeScript) or a relative `path:` dependency (Dart).

## Wiring status

The family is scaffolded only: no package is registered as a workspace member yet, so no
package is built or linked. Registering the members is the next step before the first
capability package lands.

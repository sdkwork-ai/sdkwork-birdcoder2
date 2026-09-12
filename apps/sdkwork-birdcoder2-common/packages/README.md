# packages/ — common package family

Architecture-local package family for `sdkwork-birdcoder2-common`.
Authority: `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2, `APPLICATION_SPEC.md`, `MODULE_SPEC.md`.

## Family

| Package | Role | Layer |
| --- | --- | --- |
| `@sdkwork/birdcoder2-contracts` | Cross-architecture contracts: typed DTOs, enums, event and route identity keys, i18n key namespaces. | `contracts` |
| `@sdkwork/birdcoder2-sdk-ports` | Service ports and generated-SDK-facing interfaces injected into client services. | `service` |
| `@sdkwork/birdcoder2-service` | Architecture-neutral orchestration over injected SDK clients: validation mapping, cache invalidation, workflow composition. | `service` |

## Rules

- App/console/admin packages stay separated: app packages use the plain
  `capability` segment, console packages add `-console-`, admin packages add `-admin-`
  and own the `backend-admin` boundary.
- `@sdkwork/birdcoder2-contracts` is the only package that may export application-owned app SDK and
  appbase app SDK wrappers; backend SDK wrappers belong to the admin core boundary only.
- Feature packages receive SDK clients, service ports, providers, and adapters by injection;
  they must not construct SDK clients or read credentials.
- Internal dependencies use `workspace:*` (TypeScript) or a relative `path:` dependency (Dart).

## Wiring status

The family is scaffolded only: no package is registered as a workspace member yet, so no
package is built or linked. Registering the members is the next step before the first
capability package lands.

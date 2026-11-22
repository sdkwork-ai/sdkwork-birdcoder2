# packages/ — h5 package family

Architecture-local package family for `sdkwork-birdcoder2-h5`.
Authority: `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2, `APP_H5_ARCHITECTURE_SPEC.md`, `MODULE_SPEC.md`.

## Family

| Package | Role | Layer |
| --- | --- | --- |
| `@sdkwork/birdcoder2-h5-core` | Runtime/bootstrap, SDK client construction, appbase IAM runtime, global TokenManager, host adapter fallback registration. | `runtime` |
| `@sdkwork/birdcoder2-h5-hosts` | Host fleet capability: fleet list, inline rename/revoke, and the two-step enrollment flow. Contributes `app.host.fleet.*`. | `feature` |
| `@sdkwork/birdcoder2-h5-agent-chat` | Agent conversation capability: live transcript, streaming turn log, and session list. Contributes `app.agent.chat.*`. | `feature` |
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

Every package in this family is a registered workspace member
(`apps/sdkwork-birdcoder2-h5/packages/*` in `pnpm-workspace.yaml`), so each one is linked and
type-checked by the repository.

`core`, `shell`, `hosts`, and `agent-chat` are implemented and covered by the app's vitest suite:
they own the composition root, the route shell, and both capabilities. `commons`, `console-shell`,
`admin-core`, and `capacitor` still expose scaffold boundary contracts whose real surfaces land with
their first consumers; the Capacitor native project (`ios/`, `android/`) is not generated yet.

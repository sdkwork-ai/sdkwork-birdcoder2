# packages/ — pad package family

Architecture-local package family for `sdkwork-birdcoder2-pad`.
Authority: `APP_PAD_ARCHITECTURE_SPEC.md` §4, `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2,
`MODULE_SPEC.md`.

## Family

| Package | Role | Layer |
| --- | --- | --- |
| `@sdkwork/birdcoder2-pad-core` | Runtime/bootstrap, SDK client factories, appbase IAM runtime, global TokenManager, window-class detection, host adapter contracts. | `runtime` |
| `@sdkwork/birdcoder2-pad-commons` | Domain-neutral tablet layout primitives, split-view planning, touch-target and responsive helpers. | `ui` |
| `@sdkwork/birdcoder2-pad-shell` | Tablet navigation rail/sidebar, master-detail composition, app route assembly, AuthGate wiring. | `shell` |
| `@sdkwork/birdcoder2-pad-<capability>` | Tablet-adapted user-facing capability packages. | `capability` |
| `@sdkwork/birdcoder2-pad-console-core` | User-facing console runtime helpers and permission hints. | `runtime` |
| `@sdkwork/birdcoder2-pad-console-shell` | User-facing management console tablet navigation and route composition. | `shell` |
| `@sdkwork/birdcoder2-pad-admin-core` | Backend-admin boundary: backend SDK wrappers, staff route guards, operator context. | `runtime` |
| `@sdkwork/birdcoder2-pad-admin-shell` | Internal management tablet layout, admin menus, admin route composition. | `shell` |
| `@sdkwork/birdcoder2-pad-tauri` | The single iPadOS and Android tablet native host. | `host` |

## Rules

- Package names carry the `pad` segment. New pad packages must not use `-react`, `-pc-`,
  `-h5-`, mobile-framework, or another client root's private source.
- App and console packages use app SDKs; only `pad-admin-*` packages own the
  `backend-admin` boundary and backend SDK wrappers.
- Exactly one `pad-tauri` host package exists. Electron, Capacitor, generic host, and
  second-architecture packages are forbidden.
- `pad-core` exports app SDK and appbase app SDK wrappers and no backend SDK wrappers.
- Internal dependencies use `workspace:*`.
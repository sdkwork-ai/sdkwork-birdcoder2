# packages/ — Flutter mobile package family

Dart packages for `sdkwork-birdcoder2-flutter-mobile`. Authority: `FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` §3,
`APP_FLUTTER_UI_SPEC.md`, `MODULE_SPEC.md`.

| Package | Role | Layer |
| --- | --- | --- |
| `sdkwork_birdcoder2_flutter_mobile_core` | Runtime/bootstrap, generated Dart SDK injection, appbase Flutter IAM runtime, token manager wiring, diagnostics. | `runtime` |
| `sdkwork_birdcoder2_flutter_mobile_commons` | Shared widgets, theming, adaptive layout primitives, loading/empty/validation-error/permission-denied/offline states. | `ui` |
| `sdkwork_birdcoder2_flutter_mobile_shell` | Route assembly, navigation shell, auth gate wiring. | `shell` |
| `sdkwork_birdcoder2_flutter_mobile_host` | Platform adapter boundary: secure storage, deep links, push, permissions, device capability probes. | `host` |

## Rules

- Names use lower snake case and include `flutter_mobile`.
- Reserved forms: `sdkwork_birdcoder2_flutter_mobile_console_<capability>` (user console) and
  `sdkwork_birdcoder2_flutter_mobile_admin_<capability>` (internal admin, `backend-admin` boundary).
- Widgets and services must not call platform plugins directly; platform behavior goes through
  `sdkwork_birdcoder2_flutter_mobile_host`.
- Generated Dart SDK clients are injected from `sdkwork_birdcoder2_flutter_mobile_core`.

## Wiring status

Only `sdkwork_birdcoder2_flutter_mobile_core` is wired into the root `pubspec.yaml`; `commons`,
`shell`, and `host` are not referenced yet, and no native runner project (`ios/`, `android/`) exists.
The packages expose scaffold boundary contracts until the first capability consumes them.

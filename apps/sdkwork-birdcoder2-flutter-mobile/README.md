# sdkwork-birdcoder2-flutter-mobile

Flutter mobile application root for BirdCoder2 (iOS and Android).

Authority: `FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` §2, `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2,
`APPLICATION_SPEC.md`. Package UI rules: `APP_FLUTTER_UI_SPEC.md`.

## Standard root layout

```text
sdkwork-birdcoder2-flutter-mobile/
  .sdkwork/            # application skills and plugins
  etc/                 # source-controlled deployment profile projection
  env/                 # canonical materialized dart-define inputs (generated)
  config/
    app/               # non-secret runtime templates consumed by bootstrap
    host/              # platform packaging metadata, permissions, app links, signing references
    server/ container/ # only when this root owns such a process
  docs/ scripts/ sdks/ specs/ test/
  lib/                 # thin root: main.dart, app.dart, auth_gate.dart, bootstrap/
  packages/            # Dart packages, lower snake case
  pubspec.yaml
```

## Package family

Dart package names use lower snake case and include `flutter_mobile`:

| Package | Role |
| --- | --- |
| `sdkwork_birdcoder2_flutter_mobile_core` | Runtime/bootstrap, generated Dart SDK injection, appbase Flutter IAM runtime, token manager wiring. |
| `sdkwork_birdcoder2_flutter_mobile_commons` | Shared widgets, theming, adaptive layout primitives, loading/empty/error states. |
| `sdkwork_birdcoder2_flutter_mobile_shell` | Route assembly, navigation shell, auth gate wiring. |
| `sdkwork_birdcoder2_flutter_mobile_host` | Platform adapter boundary: secure storage, deep links, push, permissions. Widgets and services must not call platform plugins directly. |

## Build inputs

`env/sdkwork.<deployment-profile>.<environment>.json` is the canonical materialized build input,
passed with `--dart-define-from-file`:

```bash
flutter run --dart-define-from-file=env/sdkwork.standalone.development.json
flutter build appbundle --dart-define-from-file=env/sdkwork.cloud.production.json
```

Regenerate (never hand-edit):

```bash
node ../../../sdkwork-specs/tools/materialize-client-env.mjs --root ../../.. --check
```

## Scaffold status

Standard-layout scaffold: layout, manifest, profile projection, host templates, Dart package
family boundary, and a thin `lib/` exist. No capability package or native platform project is
implemented yet; iOS builds additionally require a macOS host with Apple tooling.

# AGENTS.md — sdkwork-birdcoder2-flutter-mobile

Flutter mobile application root of BirdCoder2.

- Follow `FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` and `APP_FLUTTER_UI_SPEC.md` before creating files.
- Dart package names use lower snake case and include `flutter_mobile`:
  `sdkwork_birdcoder2_flutter_mobile_<capability>`, `sdkwork_birdcoder2_flutter_mobile_console_<capability>`, `sdkwork_birdcoder2_flutter_mobile_admin_<capability>`.
- Root `lib/` stays thin: bootstrap, providers, route assembly, shell registration, auth gate.
  Screens and services live in packages under `packages/`.
- Widgets and services must not call platform plugins or method channels directly; use the typed
  adapters in `sdkwork_birdcoder2_flutter_mobile_host`.
- Generated Dart SDK clients are injected from bootstrap/core. No raw `http`, no manual auth
  headers, no TypeScript wrapper imports.
- Never hand-edit `env/sdkwork.<profile>.<environment>.json`; regenerate from `etc/`.
- Never commit tokens, signing private keys, or platform secrets.

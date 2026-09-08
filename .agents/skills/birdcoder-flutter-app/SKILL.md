---
name: birdcoder-flutter-app
description: Use when developing Flutter applications — widgets and state management, routing, platform channels, theming, and Flutter-specific build/test tooling (dart analyze, flutter test, build apk/ipa).
---

# Flutter App Development

Build a Flutter feature the Flutter way: composable widgets, single source of state, const-first.

## Workflow

1. Read the existing project structure (feature folders, chosen state management — provider/riverpod/bloc) and follow it; do not introduce a second state paradigm.
2. Compose UI from small widgets; keep `build` pure and cheap — push work into providers/controllers, split widgets at rebuild boundaries, prefer `const` constructors.
3. Navigation and theming ride the app's router and `ThemeData` — no hardcoded colors or sizes that break dark mode.
4. Platform-specific needs go through plugins or platform channels with a documented method contract and missing-plugin fallbacks.
5. Verify: `dart analyze` clean, `flutter test` for widget/unit coverage of the changed feature, and note the build command for manual check (`flutter build apk`/`ipa`).

## Rules

- No business logic inside widgets; widgets render state and forward intents.
- Async UI states (loading/error/empty) are explicit widget states, never exceptions leaking to the screen.

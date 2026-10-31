# AGENTS.md — sdkwork-birdcoder2-pad

Tablet-first application root of BirdCoder2 (iPadOS and Android tablets).

- Follow `APP_PAD_ARCHITECTURE_SPEC.md` before creating or moving files here.
- Root `src/` stays thin: bootstrap, providers, tablet layout entry, route assembly,
  AuthGate, environment selection, SDK client construction, IAM runtime wiring, host
  adapter registration, and window-class detection.
  Business screens, services, routes, i18n, and state live in `packages/`.
- Package names must carry the `pad` segment: `@sdkwork/birdcoder2-pad-*`,
  `@sdkwork/birdcoder2-pad-console-*`, `@sdkwork/birdcoder2-pad-admin-*`.
- Exactly one tablet host package is allowed: `@sdkwork/birdcoder2-pad-tauri`.
- App/console packages consume app SDKs; only `pad-admin-*` packages (the `backend-admin`
  boundary) may consume backend SDKs.
- Runtime targets are limited to `tablet-ipados` and `tablet-android`. Never declare
  browser, desktop, server, container, Electron, or Capacitor as a pad runtime target.
- All four window classes (`compact`, `medium`, `expanded`, `large`) are supported.
  Never branch layout on device model, user agent, or a fixed orientation.
- Tokens and refresh tokens use the tablet host secure-storage adapter backed by the
  iOS Keychain or Android Keystore. Never persist them in Web storage or plain files.
- Never hand-edit generated release artifacts or commit secrets, tokens, signing keys,
  provisioning profiles, database URLs, or Redis credentials.
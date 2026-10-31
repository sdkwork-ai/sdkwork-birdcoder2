# @sdkwork/birdcoder2-pad-tauri

The single native host package for `sdkwork-birdcoder2-pad`: iPadOS and Android tablet
packaging metadata, Tauri configuration, permissions, capabilities, icons, and target
workflows.

- Surface: `pad` (iPadOS and Android tablet host)
- Layer role: `frontend-host`
- Standard: `APP_PAD_ARCHITECTURE_SPEC.md` section 7, `DESKTOP_APP_ARCHITECTURE_SPEC.md`.

## What this package owns

| Path | Owns |
| --- | --- |
| `src/host/` | Typed tablet host adapter, declared capability set, and stable unsupported/unavailable outcomes. |
| `src-tauri/tauri.conf.json` | Shared Tauri shell, tablet window defaults, CSP, and bundle targets. |
| `src-tauri/tauri.ios.conf.json` | iPadOS minimum OS, Apple signing references, IPA/TestFlight lane. |
| `src-tauri/tauri.android.conf.json` | Android min SDK, large-screen manifest behavior, APK/AAB lane. |
| `src-tauri/Cargo.toml`, `src-tauri/src/` | Rust shell and command registration. |
| `src-tauri/permissions/`, `src-tauri/capabilities/` | Tauri permission and capability declarations. |
| `src-tauri/icons/` | Tablet icon source and derived sizes. |
| `src-tauri/gen/apple/`, `src-tauri/gen/android/` | Generated native project locations (toolchain-owned). |

## What this package must not own

Business authorization, app/domain services, generated SDK edits, route constants, login
UI, token storage, or a second architecture's scaffold. It never depends on a PC host
package, an Electron host, a Capacitor host, or another client root's host.

## Platform prerequisites

- iPadOS: macOS host, Xcode, Apple Developer team, provisioning profile, signing
  certificate, entitlements, minimum OS 16.0, iPad device family, and the TestFlight /
  App Store / private distribution lane.
- Android tablet: Android SDK, minimum SDK 26, signing key held in the approved secret
  store, ABI targets, adaptive icon assets, `resizeableActivity` and large-screen
  declarations, and the Play / private distribution lane.

Signing keys, provisioning profiles, and store credentials are never committed.
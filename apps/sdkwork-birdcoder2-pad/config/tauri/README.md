# config/tauri/

Tauri host templates for `sdkwork-birdcoder2-pad`.

Tauri platform config owns bundle id, package name, icons, permissions, capabilities, window
metadata, and signing **references** (`APP_PAD_ARCHITECTURE_SPEC.md` §7,
`DESKTOP_APP_ARCHITECTURE_SPEC.md`). It must not carry business API contracts, SDK ownership,
auth tokens, or private keys.

Per-target overrides live in the host package as `src-tauri/tauri.ios.conf.json` and
`src-tauri/tauri.android.conf.json`; they may override packaging, identifiers, permissions,
capabilities, and window metadata only.

iPadOS builds require a macOS host with Xcode, Apple signing assets, and the Apple
Developer team/provisioning profile. Android tablet builds require the Android SDK, a
signing key managed outside the repository, and Play/private distribution credentials.
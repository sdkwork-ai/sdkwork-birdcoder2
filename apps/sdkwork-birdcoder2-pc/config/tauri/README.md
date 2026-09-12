# config/tauri/

Tauri host templates for `sdkwork-birdcoder2-pc`.

Tauri platform config owns bundle id, package id, icons, permissions, capabilities, window
metadata, and signing **references** (`APP_PC_ARCHITECTURE_SPEC.md` §2.1,
`DESKTOP_APP_ARCHITECTURE_SPEC.md`). It must not carry business API contracts, SDK ownership,
auth tokens, or private keys.

Per-target overrides live beside `src-tauri/` as `tauri.windows.conf.json`,
`tauri.macos.conf.json`, `tauri.linux.conf.json`, `tauri.ios.conf.json`, and
`tauri.android.conf.json`; they may override packaging, identifiers, and permissions only.

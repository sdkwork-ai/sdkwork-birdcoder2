# bin/

Cross-platform operational scripts for `sdkwork-birdcoder2-pad`.

Authority: `MODULE_BIN_SPEC.md`. `bin/` is the single operator channel for this root: scripts
here may call package commands, but package commands remain the canonical development
interface and `bin/` must never become a second build system.

| Directory | Purpose |
| --- | --- |
| `windows/` | Windows operator helpers (device logs, artifact checks, release uploads). |
| `linux/` | Linux operator helpers (Android only; iPadOS builds require macOS). |
| `macos/` | macOS operator helpers (iPadOS signing, archive, TestFlight upload). |
# bin/

Cross-platform operational scripts for `sdkwork-birdcoder2-pc`.

Authority: `MODULE_BIN_SPEC.md`. `bin/` is the single operator channel for this root:
scripts here may call package commands, but package commands remain the canonical
development interface and `bin/` must never become a second build system.

| Directory | Purpose |
| --- | --- |
| `windows/` | Windows desktop launch, diagnostics, and packaging helpers. |
| `linux/` | Linux desktop launch, diagnostics, and packaging helpers. |
| `macos/` | macOS desktop launch, diagnostics, and packaging helpers. |

# AGENTS.md — sdkwork-birdcoder2-mini-program

Native mini program application root of BirdCoder2.

- Follow `MINI_PROGRAM_APP_ARCHITECTURE_SPEC.md` and `APP_MINI_PROGRAM_UI_SPEC.md` before creating files.
- Business code lives in `packages/sdkwork-birdcoder2-mp-*` (directory) / `@sdkwork/birdcoder2-mp-*` (package name). Platform `pages`/`subpackages` are
  deterministic projections assembled from route contributions, not a source root.
- Package names use the `mp` segment: `@sdkwork/birdcoder2-mp-*`, `-mp-console-*`, `-mp-admin-*`.
  Platform-exclusive names such as `mp-weixin-*` require an approved component spec.
- Feature packages must not call platform globals (`wx.*`, `my.*`) directly; use the typed
  adapters in `@sdkwork/birdcoder2-mp-host`.
- `project.private.config.json` is host-local and never committed. Builds must not contain access
  tokens, platform secrets, private upload keys, database URLs, or signing credentials.

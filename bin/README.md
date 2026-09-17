# bin/ — standardized entrypoints (`sdkwork-specs/MODULE_BIN_SPEC.md`)

English | [中文](README.zh.md)

`sdkwork-birdcoder2` ships the standard nine `bin/` entrypoints. Shared behavior
lives in `sdkwork-specs/bin/lib/sdkwork-common.sh`; this directory only
carries identity (`bin/lib/module.sh`) and thin dispatches.

| Script | Purpose |
| --- | --- |
| `docker-image.sh` | build / push / save / load / update / inspect `registry.sdkwork.com/apps/sdkwork-birdcoder2-standalone:<version>` |
| `docker-deploy.sh` | install / upgrade / rollback / status / logs / down / start / stop / restart the Docker bundle on `wsl` or `ssh://[user@]host` |
| `apps-build.sh` | build declared app surfaces (`server` → cargo · `h5`/`pc` → root `build:<arch>:<env>[:cloud]` · `desktop` → `build:desktop`) |
| `apps-package.sh` | package surfaces into `target/bin-packages/` (+ sidecar `.sha256`) |
| `apps-deploy.sh` | deploy packaged apps to WSL Ubuntu / remote Ubuntu |
| `apps-pkg-installer.sh` | package native OS installers (`windows|linux|macos|android|ios`) into `target/bin-installers/` |
| `config.sh` / `doctor.sh` / `backup.sh` | operations lifecycle (`OPERATIONS_SPEC.md` §3–§5) |

Declared app types: `server,desktop,h5,pc,flutter,mini-program` — the Rust
API-assembly workspace, the Electron shell, and the four SDKWork client app
roots under `apps/` (`sdkwork-birdcoder2-h5`, `-pc`, `-flutter-mobile`,
`-mini-program`). Default image tag comes from
`sdkwork.app.config.json` → `release.currentVersion`.

Flags: `--environment development|test|staging|demo|production` ·
`--profile standalone|cloud` · `--host wsl|ssh://[user@]host[:port]` ·
`--yes` · `--dry-run`. Each run appends its command, flags, and exit status
to `target/bin-evidence/evidence.log`. Run `bin/<script>.sh doctor` for the
environment self-check.

> Wired in `bin/lib/module.sh`: `apps-build.sh` for `server`/`h5`/`pc`/
> `desktop`. Hooks that still have no canonical command — `docker-image.sh
> build`, `apps-build.sh flutter|mini-program`, and the whole
> package/installer/deploy channel — fail fast with the exact command to
> wire (MODULE_BIN_SPEC.md §3). Wire them to the repository's canonical
> build/package/deploy commands as they land.

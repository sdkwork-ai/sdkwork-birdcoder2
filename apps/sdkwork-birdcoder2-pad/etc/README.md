# etc/

Source-controlled deployment profile projection for `sdkwork-birdcoder2-pad`.

Authority: `ENVIRONMENT_SPEC.md`, `CONFIG_SPEC.md`, `SOURCE_CONFIG_SPEC.md`.

## Contents

- `sdkwork.deployment.config.json` projects the ten canonical deployment profiles
  (`standalone` / `cloud` × `development` / `test` / `staging` / `demo` / `production`)
  onto the repository-root topology environment files.
- The repository root owns the topology contract and the client-env materialization
  authority; this file points at them and never restates their values.

## Rules

- Public, non-secret profile identity only. No tokens, secrets, database URLs, Redis
  credentials, signing material, or API route constants belong here.
- Tablet renderer env files are checked in per runtime target and environment; they are
  public configuration, not runtime state.
- Host-local overrides (`.env.local`, `.env.*.local`, `.env.postgres`, `.env.release.local`,
  `config/*.local.toml`) are ignored and never committed.
- The pad root owns no server or container deployable profile (`config/server/`,
  `config/container/` are forbidden by `APP_PAD_ARCHITECTURE_SPEC.md` §2).

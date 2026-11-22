# config/ — non-secret runtime templates

Architecture-local config templates grouped by runtime target
(`APP_PC_ARCHITECTURE_SPEC.md` §2.1). Checked-in files are **safe examples only**.

Browser deploy-time runtime documents are not templates: they are authored projections under
`etc/browser/runtime-env.<deployment-profile>.<environment>.json`, wired through
`etc/sdkwork.deployment.config.json` and materialized to `public/runtime-env.json` by the canonical
browser build runner.

| Directory | Owner | Must not own |
| --- | --- | --- |
| `desktop/` | Installed desktop mode, local service toggle, client-local SQLite path, secure storage provider. | Server PostgreSQL defaults, API route constants, signing secrets. |
| `server/` | Bind address, PostgreSQL, Redis, reverse-proxy trust, service paths. | Browser-only `VITE_*`, Tauri packaging metadata. |
| `container/` | Container service config, mounted secrets references, external services, volumes. | Image-baked secrets, mutable database state. |
| `tauri/` | Bundle id, icons, window metadata, signing **references**. | Business API contracts, auth tokens, private keys. |

Host-local overrides (`.env.local`, `.env.<profile>.local`, `config/host/postgres.env`, `.env.release.local`,
`config/*.local.toml`) are ignored, never committed.

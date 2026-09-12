# config/ — non-secret runtime templates

Architecture-local config templates grouped by runtime target
(`APP_PC_ARCHITECTURE_SPEC.md` §2.1). Checked-in files are **safe examples only**.

| Directory | Owner | Must not own |
| --- | --- | --- |
| `browser/` | Promotable public SDK base URLs, public feature flags, public app metadata. | Secrets, tokens, database/Redis URLs, private service endpoints. |
| `desktop/` | Installed desktop mode, local service toggle, client-local SQLite path, secure storage provider. | Server PostgreSQL defaults, API route constants, signing secrets. |
| `server/` | Bind address, PostgreSQL, Redis, reverse-proxy trust, service paths. | Browser-only `VITE_*`, Tauri packaging metadata. |
| `container/` | Container service config, mounted secrets references, external services, volumes. | Image-baked secrets, mutable database state. |
| `tauri/` | Bundle id, icons, window metadata, signing **references**. | Business API contracts, auth tokens, private keys. |

Host-local overrides (`.env.local`, `.env.<profile>.local`, `.env.postgres`, `.env.release.local`,
`config/*.local.toml`) are ignored, never committed.

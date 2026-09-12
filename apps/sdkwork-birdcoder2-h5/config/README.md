# config/ — non-secret runtime and host templates

| Directory | Owns | Must not own |
| --- | --- | --- |
| `browser/` | Promotable public SDK base URLs, public feature flags, public app metadata. | Secrets, tokens, database/Redis URLs, private endpoints. |
| `host/` | Capacitor platform templates, permission metadata, URL scheme and app-link references, native capability flags, signing **reference** metadata. | Secrets, signing private keys, tokens, API keys, business route constants. |
| `server/` | Local preview / owned server runtime config. | Browser-only `VITE_*`, host packaging metadata. |
| `container/` | Container runtime config when this root owns one. | Image-baked secrets, mutable database state. |

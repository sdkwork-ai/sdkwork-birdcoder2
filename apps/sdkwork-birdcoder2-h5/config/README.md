# config/ — non-secret runtime and host templates

Browser deploy-time runtime documents are **not** templates: they are authored projections under
`etc/browser/runtime-env.<deployment-profile>.<environment>.json` and are wired through
`etc/sdkwork.deployment.config.json` (materialized to `public/runtime-env.json` by the canonical
browser build runner).

| Directory | Owns | Must not own |
| --- | --- | --- |
| `host/` | Capacitor platform templates, permission metadata, URL scheme and app-link references, native capability flags, signing **reference** metadata. | Secrets, signing private keys, tokens, API keys, business route constants. |
| `server/` | Local preview / owned server runtime config. | Browser-only `VITE_*`, host packaging metadata. |
| `container/` | Container runtime config when this root owns one. | Image-baked secrets, mutable database state. |

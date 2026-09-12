# config/ — non-secret runtime and host templates

| Directory | Owns | Must not own |
| --- | --- | --- |
| `app/` | Non-secret runtime templates consumed by the Flutter bootstrap (public SDK base URLs, public flags, public app metadata). | Secrets, tokens, database or Redis URLs, private endpoints. |
| `host/` | iOS bundle id, Android package id, entitlements/permission references, push environment, app links, universal links, signing **reference** names. | Signing private keys, auth/refresh tokens, API keys, database credentials, SDK ownership, business route constants. |
| `server/` | Owned server runtime config (only when this root owns one). | Client-only `SDKWORK_*` build inputs. |
| `container/` | Owned container runtime config (only when this root owns one). | Image-baked secrets, mutable database state. |

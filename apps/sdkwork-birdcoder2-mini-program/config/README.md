# config/ — non-secret runtime and host templates

| Directory | Owns | Must not own |
| --- | --- | --- |
| `mini-program/` | **Generated** runtime env JSON per deployment profile (SDK base URLs, public flags, public app metadata). | Tokens, platform secrets, private upload keys, database/Redis URLs, signing credentials. |
| `host/` | Platform app ids, platform profiles, permission references, upload environment, platform package settings, signing **reference** metadata. | Platform private keys, tokens, API keys, database credentials, business API constants, SDK ownership. |
| `server/` | Owned server runtime config (only when this root owns one). | Client build inputs. |
| `container/` | Owned container runtime config (only when this root owns one). | Image-baked secrets. |

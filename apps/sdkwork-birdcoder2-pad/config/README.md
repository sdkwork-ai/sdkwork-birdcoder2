# config/

Non-secret configuration templates for this tablet root.

| Directory | Owns | Must not own |
| --- | --- | --- |
| `browser/` | Tablet WebView public runtime config: public SDK base URLs, public flags, app metadata. | Secrets, tokens, private endpoints, database or Redis settings. |
| `tablet/` | Installed tablet runtime defaults: local host mode, secure storage provider, cache policy, target metadata references. | API route constants, business config, signing secrets. |
| `tauri/` | Tauri platform packaging templates: bundle id, icons, permissions, capabilities, window metadata, signing references. | Business API contracts, SDK ownership, auth tokens, private keys. |

Authority: `APP_PAD_ARCHITECTURE_SPEC.md` §2 and §6.1, `CONFIG_SPEC.md`,`ENVIRONMENT_SPEC.md`.
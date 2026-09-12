# Source Configuration — sdkwork-birdcoder2-mini-program

Source-controlled, secret-free deployment/runtime profiles for this application root.
Authority: `SOURCE_CONFIG_SPEC.md`, `APPLICATION_DEPLOY_LAYOUT_SPEC.md`.

The repository-level deployment authority lives in `../../../etc/sdkwork.deployment.config.json`
(application `sdkwork-birdcoder2`, runtime code `birdcoder2`, profiles `etc/topology/`). This root keeps the
application-local projection of that authority; it never becomes a second authority for
shared endpoints, and it never stores secrets.

## Files

| File | Purpose |
| --- | --- |
| `sdkwork.deployment.config.json` | This root's profile index and materialization contract. |

Regenerate the derived client inputs with the canonical materializer from the repository root:

```bash
node ../../../sdkwork-specs/tools/materialize-client-env.mjs --root . --check
```

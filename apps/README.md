# apps/

Application: sdkwork-birdcoder2
Status: active
Owner: SDKWork maintainers
Specs: APPLICATION_SPEC.md, SDKWORK_WORKSPACE_SPEC.md

## Primary App Surface

The repository root is the primary runnable app surface.
The repository root `sdkwork.app.config.json` governs the primary application manifest.

## Directory Index

| Directory | Surface role | Runnable | Purpose | Entry |
| --- | --- | --- | --- | --- |
| cli | app | yes | `@deepseek-ai/dsh` | [README](cli/README.md) |
| desktop | app | yes | DeepSeek Harness Desktop | [README](desktop/README.md) |
| desktop-host | app | yes | desktop-host app application root. | `desktop-host/` |
| sdkwork-birdcoder2-common | common | no | Cross-architecture shared package family for BirdCoder2 (not a runnable client surface) | [README](sdkwork-birdcoder2-common/README.md) |
| sdkwork-birdcoder2-flutter-mobile | flutter-mobile | yes | BirdCoder2 Flutter Mobile flutter-mobile application root. | [README](sdkwork-birdcoder2-flutter-mobile/README.md) |
| sdkwork-birdcoder2-h5 | h5 | yes | BirdCoder2 H5 h5 application root. | [README](sdkwork-birdcoder2-h5/README.md) |
| sdkwork-birdcoder2-mini-program | mini-program | yes | BirdCoder2 WeChat Mini Program mini-program application root. | [README](sdkwork-birdcoder2-mini-program/README.md) |
| sdkwork-birdcoder2-pc | pc | yes | BirdCoder2 PC pc application root. | [README](sdkwork-birdcoder2-pc/README.md) |
| web | app | yes | web app application root. | `web/` |

## Allowed Content

- Selected language/architecture application roots with `README.md`, `AGENTS.md`, `.sdkwork/`, and `specs/` when authored packages exist.
- Architecture-local `packages/`, `config/`, `src/`, `lib/`, `App/`, or `entry/` directories required by the owning architecture standard.

## Forbidden Content

- Repository-root API contracts, generated SDK workspaces, Rust crates, or deployment descriptors moved under `apps/`.
- Runtime secrets, user-private state, generated SDK transport output, or cross-application copied business logic.

## Related Specs

- `../sdkwork-specs/APPLICATION_SPEC.md`
- `../sdkwork-specs/SDKWORK_WORKSPACE_SPEC.md`
- `../sdkwork-specs/APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`

## Verification

```bash
node ../sdkwork-specs/tools/check-apps-directory-index.mjs --root .
```

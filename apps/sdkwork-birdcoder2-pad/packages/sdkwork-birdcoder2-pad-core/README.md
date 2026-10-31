# @sdkwork/birdcoder2-pad-core

Tablet runtime/bootstrap for BirdCoder2: SDK client factories, appbase IAM runtime,
TokenManager binding, window-class detection, and host adapter contracts.

- Surface: `pad`
- Layer role: `frontend-core`
- Standard: `MODULE_SPEC.md`, `APP_PAD_ARCHITECTURE_SPEC.md`

## Public exports

| Entry | Content |
| --- | --- |
| `.` | Window classes, host adapter contracts, session binding, and SDK factory types. |
| `./sdk` | Application-owned app SDK factory types. No backend SDK wrappers. |
| `./host` | Typed tablet host contract and capability vocabulary. |
| `./session` | Global TokenManager binding and secure-storage requirements. |
| `./window-class` | Window-class definitions and viewport resolver. |

## Boundaries

This package must stay free of backend SDK wrappers, product pages, domain workflows, and
admin business logic. Backend SDK wrappers belong to `@sdkwork/birdcoder2-pad-admin-core`.

## Known Limitations

This is the scaffold package boundary. Appbase IAM runtime construction, the concrete
TokenManager binding, and app SDK client factories arrive with the first capability.
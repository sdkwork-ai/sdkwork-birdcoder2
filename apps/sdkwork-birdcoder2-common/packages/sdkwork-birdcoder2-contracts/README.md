# @sdkwork/birdcoder2-contracts

Cross-architecture contracts: typed DTOs, enums, event and route identity keys, i18n key namespaces.

- Surface: `[object Object]`
- Layer role: `contracts`
- Standard: `MODULE_SPEC.md`, `APPLICATION_SPEC.md`

## Public exports

| Entry | Content |
| --- | --- |
| `src/index.ts` | Public contract of this package. |

## Model Experience

The package currently exposes an empty public contract: the scaffold reserves the
module boundary so SDK clients, service ports, and route contributions can be added
without re-cutting the package family. Consumers receive nothing until the first
capability lands, so no behavior depends on this package yet.

## Known Limitations and Deferred Work

- No capability is implemented; only the module boundary, manifest, and component spec exist.
- SDK client injection, route contributions, i18n keys, and tests arrive with the first capability.
- Routing, state, and host-adapter wiring are deferred until a capability needs them.

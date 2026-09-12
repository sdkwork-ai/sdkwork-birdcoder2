# sdkwork_birdcoder2_flutter_mobile_commons

Shared widgets, theming, adaptive layout primitives, loading/empty/validation-error/permission-denied/offline states.

- Surface: `[object Object]`
- Layer role: `ui`
- Standard: `MODULE_SPEC.md`, `FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md`

## Public exports

| Entry | Content |
| --- | --- |
| `lib/index.dart` | Public contract of this package. |

## Model Experience

The package currently exposes an empty public contract: the scaffold reserves the
module boundary so SDK clients, service ports, and route contributions can be added
without re-cutting the package family. Consumers receive nothing until the first
capability lands, so no behavior depends on this package yet.

## Known Limitations and Deferred Work

- No capability is implemented; only the module boundary, manifest, and component spec exist.
- SDK client injection, route contributions, i18n keys, and tests arrive with the first capability.
- Routing, state, and host-adapter wiring are deferred until a capability needs them.

# @sdkwork/birdcoder2-h5-core

Runtime/bootstrap, SDK client construction, capability port contracts, host adapter fallback registration, conversation watermarks.

- Surface: `h5`
- Layer role: `runtime`
- Standard: `MODULE_SPEC.md`, `APP_H5_ARCHITECTURE_SPEC.md`

## Public exports

| Entry | Content |
| --- | --- |
| `.` | Aggregate contract: re-exports every subpath below. |
| `./sdk` | `BirdCoder2Ports` and the one generated-client factory (`createBirdCoder2PortsFromOptions`); the only subpath that may name `@sdkwork/birdcoder2-app-sdk`. |
| `./modules` | Route identities and the route registry the shell mounts. |
| `./host` | Clipboard and secure-storage adapters with their browser fallbacks. |
| `./session` | Per-conversation event watermarks (the resume point of the relayed event log). |
| `./composition` | Component-spec wiring for the composition gate. |

## Model Experience

The package is the mobile client's composition root. It owns the four things a capability
package must never reach for itself: the transport (the generated BirdCoder2 App API client),
the platform adapters, durable conversation state, and the route registry. Every screen reaches
the platform through `BirdCoder2Ports`, so a wire or transport change is absorbed here instead
of rippling into screens.

## Known Limitations and Deferred Work

- Host adapters ship browser fallbacks only; the Capacitor native implementations land with the
  native host package.
- Route contributions are registered by the capability packages; this package only freezes the
  registry.

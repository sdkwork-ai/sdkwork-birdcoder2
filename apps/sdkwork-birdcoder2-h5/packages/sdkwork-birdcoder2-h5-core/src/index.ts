/**
 * Public contract of `@sdkwork/birdcoder2-h5-core`.
 *
 * Surface: `h5`. Layer role: `frontend-core`.
 *
 * The core package is the mobile client's composition root. It owns the four
 * things a capability package must never reach for itself: the transport (the
 * generated app SDK), the platform (host adapters), durable conversation state
 * (event watermarks), and the route registry the shell mounts. Everything a
 * screen needs therefore arrives through one of the six declared subpaths:
 *
 * - `.`             — this aggregate, for the app root
 * - `./sdk`         — {@link BirdCoder2Ports} and the one generated-client factory
 * - `./modules`     — route ids and the route registry
 * - `./host`        — clipboard and secure-storage adapters
 * - `./session`     — per-conversation event watermarks
 * - `./composition` — component-spec wiring for the composition gate
 */

export const packageId = '@sdkwork/birdcoder2-h5-core' as const

export const BIRDCODER2_H5_CORE_VERSION = '0.1.0' as const

export * from './sdk/index.ts'
export * from './modules/index.ts'
export * from './host/index.ts'
export * from './session/index.ts'
export * from './composition/index.ts'

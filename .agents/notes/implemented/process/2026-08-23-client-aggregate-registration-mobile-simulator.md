# Agent Note: Client aggregate must register every clientBundle package

Status: implemented

English | [中文](2026-08-23-client-aggregate-registration-mobile-simulator.zh.md)

## Problem

`Release (dsh)` failed in `build:lib:client` with `UNRESOLVED_ENTRY` for `lib/types/index.js` and `lib/types/invariant.js`. `packages/client/ui-sdkwork-mobile-simulator` declares a `clientBundle` tsdown config whose Node half consumes `lib/types`, but the package is absent from the `tsconfig.client.json` project references, so the Client tsc pass never emits its `lib/types` and the Client tsdown pass cannot resolve the entries. The package entered through the SDKWork sync merge without an aggregate registration.

## Decision

Register `./packages/client/ui-sdkwork-mobile-simulator` in the `tsconfig.client.json` references, alongside the other `ui-sdkwork-*` packages. The aggregate references stay the single registration roster: a client package with a tsdown config must appear there or its Client-pass build cannot find its tsc output.

## Consequences

The Client tsc pass now emits `lib/types` for the simulator package, and the Client tsdown pass resolves its Node half. No other package is missing from the aggregate (checked against every `packages/client/*` tsdown config).

## Testing

Clean-tree rehearsal: `tsc -b tsconfig.host.json`, the Host tsdown pass, `tsc -b tsconfig.client.json`, and the Client tsdown pass all complete.

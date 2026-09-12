# Cross-architecture shared package family for BirdCoder2 (not a runnable client surface)

Authority: `APPLICATION_SPEC.md`, `MODULE_SPEC.md`, `SDKWORK_WORKSPACE_SPEC.md`,
`APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2.

## Role

Owns contracts, service ports, runtime/bootstrap helpers, SDK adapter boundaries, i18n keys,
and domain RPC proto packages that every client architecture root (`pc`, `h5`,
`flutter-mobile`, `mini-program`) consumes. It has **no UI runtime dependency** and must never
be treated as a runnable surface.

## Layout

| Path | Purpose |
| --- | --- |
| `packages/` | Shared `@sdkwork/birdcoder2-*` packages consumed by every client root. |
| `specs/` | Local component/application specs extending, never contradicting, the canonical specs. |
| `.sdkwork/` | Application-local skills and plugins. |

## Rules

- Cross-architecture reuse happens through generated SDKs, contracts, service ports, route
  metadata, i18n keys, design tokens, host adapter contracts, and test fixtures — never by
  importing another client architecture's UI implementation or private `src/` internals.
- Packages here must not render UI and must not depend on React, Capacitor, WeChat, or Flutter.
- Concrete SDK construction stays in each client root's bootstrap/core.

## Verification

```bash
node ../../../sdkwork-specs/tools/check-apps-directory-index.mjs --root ../../..
```

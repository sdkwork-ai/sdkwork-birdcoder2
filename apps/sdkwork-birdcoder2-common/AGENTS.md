# AGENTS.md — sdkwork-birdcoder2-common

Cross-architecture shared package-family root of the BirdCoder2 application
(`apps/sdkwork-birdcoder2-common`). It is **not** a runnable client surface.

- Follow `APPLICATION_SPEC.md`, `MODULE_SPEC.md`, and `SDKWORK_WORKSPACE_SPEC.md`.
- Do not add UI, React, Capacitor, Flutter, or platform-global dependencies here.
- Do not construct SDK clients or read credentials here; export ports and adapters instead.
- Keep the package family names under `@sdkwork/birdcoder2-*` without a client-architecture segment.
- Cross-client route ids, i18n keys, service ports, and test fixtures belong here when more than
  one client root needs them.

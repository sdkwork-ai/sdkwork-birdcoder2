---
name: birdcoder-dsh-plugin
description: Use when developing plugins for the dsh (DeepSeek Harness) agent platform — cordis-style plugin packages, registration effects, service injection, typed events, and the repository's AGENTS.md conventions.
---

# dsh Plugin Development

Build a dsh (DeepSeek Harness) plugin as a cordis plugin package with the repository's own rules.

## Workflow

1. Read the host repository's `AGENTS.md` and `docs/architecture.md` first: registrations are effects (`ctx.effect`/`ctx.on`, a registry's `register()` returns the disposer), and new behavior goes on documented extension points — never into the agent loop.
2. Model the plugin as an npm package under the host's workspace layout (pure ESM, package name per the naming contract, `@deepseek-ai/cordis` as a peer dependency).
3. Export `name`/`inject`/`apply(ctx)`: `inject` names the services used; `apply` registers through `ctx.effect` so teardown cascades; type-only imports pull cross-package contracts.
4. Typed events via declaration merging on the host's event maps; every model-visible input it contributes gets a durable session event.
5. Verify: typecheck, the package's unit tests, lint, and the host's repo gates — never bypass a failing gate.

## Rules

- A capability seam stays complete (Service Definition / Provider / Consumer roles); split only when roles evolve independently.
- Public APIs are pre-stable: update every consumer in the same change; keep interfaces explicit at package boundaries.

# scripts/

Build, validation, and release utilities for this root. Thin entrypoints only; reusable
tooling belongs in the repository root `tools/` or `sdkwork-specs/tools/`.

| Script | Purpose |
| --- | --- |
| `tablet.mjs` | Single tablet command wrapper: selects the deployment profile, environment, and runtime target, starts the renderer dev server, and invokes the Tauri CLI for iPadOS or Android. It writes the development session pid used by `stop-tablet.mjs`. |
| `stop-tablet.mjs` | Stops only this root's recorded tablet development session. It never operates on deployed services or other checkouts. |
| `release-preflight.mjs` | Fails a release build when the env identity, Tauri target config, icon set, or signing hygiene is incomplete. It never reads or prints secret values. |
| `clean.mjs` | Removes only this root's own build output (`dist/`, `.tmp/`, `coverage/`, `src-tauri/target/`, `src-tauri/.tauri/`) after checking every path stays inside the app root. |

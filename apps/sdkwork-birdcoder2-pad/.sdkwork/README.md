# SDKWork Application Workspace

This `.sdkwork/` directory is source-controlled workspace metadata for `sdkwork-birdcoder2-pad`.

It is governed by `../../../sdkwork-specs/SDKWORK_WORKSPACE_SPEC.md`.

## Application Identity

- App: sdkwork-birdcoder2-pad
- Type: react-tauri tablet app
- Runtime targets: tablet-ipados, tablet-android
- Domain: ai
- Framework: React + Tauri

## Authoritative Local Entries

- README.md: purpose and ownership for this workspace metadata directory.
- skills/README.md: application skill contribution guidance.
- plugins/README.md: application plugin contribution guidance.
- `../agent.app.config.json`: application identity and release metadata.

This directory is not runtime state. Do not store generated SDK transport output, secrets,
local credentials, runtime databases, cache, logs, or user-private files here.

## Execution References

- Agent entrypoint: `../AGENTS.md`
- Shared execution soul: `../../../sdkwork-specs/SOUL.md`
- Workspace metadata standard: `../../../sdkwork-specs/SDKWORK_WORKSPACE_SPEC.md`
- Architecture standard: `../../../sdkwork-specs/APP_PAD_ARCHITECTURE_SPEC.md`
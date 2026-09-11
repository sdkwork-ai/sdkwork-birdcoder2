---
name: birdcoder-workbuddy-plugin
description: Use when developing plugins for the Workbuddy platform — extending a Workbuddy host with custom capabilities through its declared plugin contract, from reading the host's extension model to a locally verified plugin package.
---

# Workbuddy Plugin Development

Build a Workbuddy plugin that extends the host through its declared contract.

## Workflow

1. Read the host's plugin documentation and one existing plugin example first: the package shape, the entry/export contract, and the available extension points (commands, tools, panels, events).
2. Scaffold the plugin package to that contract; name and scope it per the host's conventions; declare the capabilities it contributes.
3. Implement each capability against the host's typed API; follow the host's own patterns for registration, teardown, and error handling — no undocumented private hooks.
4. Verify locally: install the plugin into the host, exercise every contributed capability, and confirm a clean disable/uninstall path.
5. Deliver the plugin package, its README (install, usage, configuration), and the local validation record.

## Rules

- If a requested capability has no documented extension point, surface that instead of inventing an integration — propose the supported alternative.
- Keep plugin state out of global scope; lifecycle-owned state lives and dies with the plugin instance.

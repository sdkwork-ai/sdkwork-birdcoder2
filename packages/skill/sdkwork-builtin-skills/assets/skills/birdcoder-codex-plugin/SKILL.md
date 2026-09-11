---
name: birdcoder-codex-plugin
description: Use when developing plugins or hooks for Codex (OpenAI's agentic CLI) — extending Codex with custom slash commands, hooks, agents, or MCP servers following Codex's plugin model.
---

# Codex Plugin Development

Extend Codex through its supported extension surfaces, verified against the real CLI.

## Workflow

1. Identify the extension surface that fits the request — Codex plugins (a package with a declared entry and capabilities) for commands/hooks/agents, MCP for external tools — and read the official plugin documentation for the current version.
2. Scaffold against the host's declared contract: the plugin entry exports the required shape; capabilities declare what the plugin contributes (commands, hooks, agents, MCP servers).
3. Implement on the typed boundaries the plugin model provides; keep every capability independently testable and its failure path explicit (errors surface to the session, never silently).
4. Validate locally against the real CLI before calling it done: install the plugin, exercise each contributed command/hook/agent, and confirm teardown/dispose is clean.
5. Deliver the plugin package, its README (install + usage), and the local validation record.

## Rules

- Follow the host's supported surfaces; undocumented private APIs break on the next update and are off-limits.
- Secrets and credentials never live in plugin config or source; read them from the environment at runtime.

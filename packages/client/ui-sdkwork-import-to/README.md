---
description: "SDKWork relay API-key \"导入到\" plugin (browser half): the API-key table's hover menu lists CC Switch's sixteen link-importable coding tools (its app catalog minus CodeBuddy), and every click regenerates that tool's live config with CC Switch's own click-to-use write semantics, offers the CC Switch provider link, and emits an install command."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-import-to

English | [中文](README.zh.md)

## Summary


SDKWork relay API-key "导入到" plugin (browser half). The CloudRouter console's API-key table replaces its three built-in rows (Birdcoder, CC Switch, DeepSeek Harness) with this plugin's sixteen tools — CC Switch's app catalog minus CodeBuddy. Picking a row first confirms the key's name, masked value and target tool; the plaintext is revealed through the audited endpoint only after that confirmation.

The dialog then lists the exact files CC Switch writes when its provider card is activated, offers copy/download per file, the install command, and the `ccswitch://v1/import?...&enabled=true` link.

## Table of Contents

- [What it owns](#what-it-owns)
- [How it integrates](#how-it-integrates)
- [Build](#build)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="what-it-owns"></a>
## What it owns

- **Menu catalog** (`src/client/targets.ts`): the sixteen CC Switch applications in its picker order — Claude Code, Claude Desktop, Codex, Gemini CLI, Grok Build, OpenCode, OpenClaw, Hermes, Pi, MiniMax Code, Kimi Code, DeepSeek Harness, Antigravity, Oh My Pi, Copilot CLI, WorkBuddy — each with a two-letter badge, the formats it accepts, its default format, whether it needs a model, and whether it takes a terminal or app restart.
- **Per-target projections** (`src/client/ccSwitch/builders/`): one builder per tool, reproducing CC Switch's `deeplink/provider.rs` settings plus the matching live config writer. Claude Code writes `env.ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL` into `~/.claude/settings.json`; Claude Desktop registers a gateway profile under its `Claude-3p` config library with a profile id this plugin owns; Codex writes `config.toml` (`model_provider = "custom"`, wire API per format) plus `auth.json`; Gemini CLI writes `.env` and `settings.json`; Grok Build, OpenCode, OpenClaw, Hermes, Pi, MiniMax Code, Kimi Code, DeepSeek Harness, Oh My Pi, Copilot CLI and WorkBuddy each get their own file and field names; Antigravity gets a private `--gemini_dir` profile and the environment-prefixed launch command because it has no global settings file.
- **Provider link** (`src/client/ccSwitch/deeplink.ts`): `ccswitch://v1/import?resource=provider&app=<id>&name=…&endpoint=…&apiKey=…&model=…&apiFormat=…&enabled=true`, the same contract CC Switch uses for its own click-to-use.
- **Install command** (`src/client/ccSwitch/script.ts`): a PowerShell or POSIX program that creates missing files, backs up plugin-owned documents before replacing them, and writes a merge file's fragment to `<path>.birdcoder-import` instead of overwriting the user's file. It never silently replaces an existing live config.
- **Import dialog** (`src/client/dialog/`): the source key's name and masked value, provider name / model / protocol form, one card per file with the path, write mode, managed keys, content, optional merge fragment, and copy/download actions, plus the CC Switch link, the install command, and Antigravity's launch command.
- **Cross-bundle seam** (`src/client/extension.tsx`): the menu rows and the selection callback published on `globalThis` under `Symbol.for('sdkwork.cloudrouter.quick-import-extension')`, because the console package and this plugin are separate client bundles with separate module state.

<a id="how-it-integrates"></a>
## How it integrates

The CloudRouter console package (`sdkwork-cloudrouter-pc-console-api-keys`) reads that registry slot on every render through `getQuickImportExtension()`. When the slot is empty the menu keeps its built-in three rows and its existing dialogs; when this plugin registers, the menu renders its sixteen rows, a picked row first shows the console's confirmation dialog, and the confirmed action reveals the key's plaintext, then routes to `onSelect({ targetId, key, endpoints, homepage })` with absolute gateway endpoints. The console keeps ownership of the menu, the anchor geometry, the hover timers and the reveal; this plugin owns the rows, the dialog and the projections.

`packages/bundle/web-app` mounts the row next to `ui-sdkwork-apikey`, so a shipped BirdCoder build offers the sixteen tools with no installer step; a composition without it is unchanged.

<a id="build"></a>
## Build

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-import-to bundle
```

<a id="model-experience"></a>
## Model Experience

None, as the plugin only projects a key the user already sees in the API-key table into local tool configuration files and registers no tool, prompt section, or session event.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **No direct filesystem write.** The browser client has no host filesystem service, so "导入到" produces the exact file contents plus an install command; it does not itself edit `~/.claude/settings.json` or any other live config. CC Switch users can take the link instead, which performs the writes in their app.
- **Existence-dependent variants are documented, not probed.** `opencode.jsonc` taking precedence over `opencode.json`, `models.yaml` over `models.yml`, `$CLAUDE_CONFIG_DIR` / `$CODEX_HOME` overrides, and DeepSeek Harness's optional `headless` / `acp` profiles each carry a note on the file card or the plan; a browser dialog cannot see the disk to choose the alternative path.
- **Claude Desktop profile identity.** The gateway profile id is this plugin's own (`00000000-0000-4000-8000-0000000b17c0`), so importing here and importing through CC Switch produce two profiles instead of overwriting one another.
- **Kimi's model link.** The import always writes `default_model` pointing at the imported model (CC Switch's switch semantics); a user who wants to keep their current default removes that one line.

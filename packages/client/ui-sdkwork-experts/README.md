---
description: "SDKWork expert market: the built-in 331-expert roster and five expert teams. Host half: bundled persona library, list_experts/summon_expert/summon_experts and the expert-team tools, the create-with-AI proposal tools, the subagent provider and the agency-agents settings namespace. Browser half: the keyed market panel (expert gallery, expert teams, enable/disable management), the 设置 → 专家 page, the composer @ picker and the task-recommendation bar."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-experts

English | [中文](README.zh.md)

## Summary

This package is the SDKWork implementation of the expert capability. It ships the 331 domain experts and the five built-in expert teams of The Agency roster, exposes them to the model as summonable specialists, and draws the library surface a person enables and manages them in (the market tab's cloud catalog is drawn by `ui-sdkwork-markets` over the same `sdkwork-agents` catalog):

- **Host half** — reads the bundled persona assets (`assets/agency-agents`, `assets/agency-agents-zh`), publishes the expert and team libraries, registers the `list_experts`, `summon_expert`, `summon_experts`, `list_expert_teams`, `get_expert_team` and `summon_expert_team` tools, the `propose_custom_expert` / `propose_expert_team` drafting tools and their editor-opening tools, the `## Agency expert mode` prompt section, and the `agency-agents` settings namespace that stores the enabled roster, custom experts and custom teams.
- **Browser half** — registers the keyed `agency-agents` `main` panel (the expert gallery with its divisions, the expert teams, the create-with-AI entries and the enable/disable management), the sidebar row, the 设置 → 专家 page, the composer `@` picker and the task-recommendation bar.
- **Remote half** — `src/remote.ts` publishes the `agencyAgents` Typert namespace the browser half reads the catalog, enabled list, personas and teams through.

The package is first-party. It was previously pinned as the `plugins/sdkwork-dsh-agents` submodule (the `@michengai/dsh-agency-agents` mirror); this package is that implementation built by this repository, so its `lib/` is this build's output instead of a committed upstream artifact.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## Use this package

Mount the package as the two web-app rows in `packages/bundle/web-app/cordis.patch.yml`: `agency-agents-remote` (`@deepseek-ai/dsh-client-ui-sdkwork-experts/remote`) registers the Typert namespace, and `agency-agents` (`@deepseek-ai/dsh-client-ui-sdkwork-experts`) mounts both halves with `config.entryLocation: both`. The bundle declares the dependency, and `ui-sdkwork-markets` embeds the registered `agency-agents` `main` panel as the Experts tab's market chip.

Disabling the `agency-agents` row removes the tools, the prompt section, the settings page, the composer picker, the recommendation bar and the panel in one step; the market tab then shows its unavailable notice. The enabled roster, custom experts and custom teams stored under `$DSH_HOME` survive the row's return.

`config.root` points the persona library at an external checkout of The Agency roster instead of the bundled assets; `config.divisions` narrows the divisions that load, `config.provider` selects the subagent provider (`spawn` by default), and `config.maxDepth` bounds team nesting.

<a id="understand-the-implementation"></a>

## Understand the implementation

- `src/index.ts` — the Host half: resolves the catalog root, walks the persona markdown under `assets/agency-agents{,-zh}`, builds the expert library over the `agency-agents` settings namespace, creates the team library and the proposal registry, registers the six summon/team tools plus the four create-with-AI tools, and contributes the `## Agency expert mode` prompt section. Summoning starts a subagent through `ctx.subagents`; the child receives the expert persona as a scoped `deployment:persona-prefix` section and a tool denylist on `agent/created`, so the parent session's persona is untouched.
- `src/expert-library.ts` — the roster merge: the read-only bundled experts plus the settings-stored custom experts, the enabled list, name-conflict detection, and revision-checked writes.
- `src/team-library.ts`, `src/team-contract.ts`, `src/team-engine.ts`, `src/team-runtime.ts` — the expert-team aggregate, the coordinator prompt assembly, and the two execution engines (`subagent` and `native`), including the native-teammate registration path.
- `src/creation-tools.ts`, `src/creation-contract.ts` — the staged create-with-AI proposals (`propose_custom_expert`, `propose_expert_team`) and their validation-before-persist flow; the package contributes no confirmation card of its own, so the editor tools open the host card and the market panel's editors.
- `src/remote.ts`, `src/remote-contract.ts` — the `agencyAgents` Typert host service and its strict invocation descriptors: catalog, custom-expert CRUD, enabled list, persona prompt and team CRUD. `src/client/remote.ts` is the browser-side contribution the panel mounts.
- `src/settings-compat.ts`, `src/settings-memory.ts` — the settings namespace compatibility layer, the legacy-settings import, and the local entry-location state.
- `src/subagent-registry.ts` — the child-agent registry that re-applies persona scoping and the tool denylist after a restart, with a bounded on-disk record flushed on teardown.
- `src/client/index.ts` — the browser half: the keyed `main` panel, the gallery and division filters, the teams surface, the editors, the settings page, the sidebar row, the composer `@` picker and the recommendation bar.
- `src/client/roster.ts` — the generated roster index (slug, English name, emoji, division, both descriptions) the gallery filters without loading every persona body.

<a id="model-experience"></a>

## Model Experience

### Expert tools and prompt section

#### What the model sees

The package registers `list_experts`, `summon_expert`, `summon_experts`, `list_expert_teams`, `get_expert_team` and `summon_expert_team`, plus the create-with-AI drafting tools `propose_custom_expert`, `propose_expert_team`, `open_custom_expert_editor` and `open_expert_team_editor`. It also contributes the `## Agency expert mode` prompt section, which names the expert roster concept, the enablement rule, the summoning contract and the two-step create flow. `list_experts` returns division-grouped names and descriptions, never persona bodies; a persona body (up to 20,000 characters) is read only when an expert is actually summoned.

#### Token effect

The prompt section is deterministic per locale and is assembled once per session, so it adds a fixed block on every turn of a session whose preset keeps the row. The ten tool declarations add their JSON schemas on every turn. A summon starts a child session whose first request carries the expert persona as a scoped prompt section, so the persona cost lands on the child's context rather than the parent's.

#### KV Cache effect

The prompt section and tool schemas are stable for a given locale and enabled roster, so they sit in the cached prefix. A settings write that changes the enabled list or adds a custom expert changes the section text and the `list_experts` result vocabulary, which invalidates the prefix from that point; the package does not otherwise rewrite provider requests mid-session.

## Known Limitations and Deferred Work

- **The data plane belongs to `sdkwork-agents`.** The roster, categories, teams, curated collections and the per-expert display statistics are initialized from `sdkwork-specs` and owned by `sdkwork-agents` (one managed agent per expert, plus the expert-team, persona, display-profile and collection tables). The Host half accepts an ingested overlay over the `agencyAgents` Remote (`syncSdkworkCatalog`, `syncSdkworkPersonas`): once the market page pushes the Agents catalog, the ingested experts, teams and personas replace the bundled roster and the bundled assets remain the offline fallback; a composition that mounts this package without that page keeps the bundled roster.
- **The market tab's gallery is not in this package.** The Experts tab's cloud catalog — the curated shelf, 专家 / 专家团, the division chips, the 综合 / 最热 / 最新 sort and the card grid — is drawn by `ui-sdkwork-markets`' `ExpertsCatalogPage` over the same catalog. This package keeps the `@` picker, the six summon tools, the team engine, the settings page and its `main` panel. The reference design's curated collections and usage statistics are now served by the `sdkwork-agents` catalog, so nothing here has to fabricate them.
- **The upstream operator links are neutralized.** The settings page's project/feedback buttons point at the SDKWork site rather than the third-party repository, because this package is the SDKWork implementation of the market.
- **Video/media cover art is not generated.** Expert cards use the bundled portrait pool rather than generated per-expert artwork.

---
description: "Composer capability rows: pick a skill, an MCP server, or a knowledge base for the message being composed, inserted as reviewable draft text."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-capabilities

English | [中文](README.zh.md)

## Summary

Adds three rows to the composer's Add section — 技能, MCP, and 知识库 — each opening the shared popupSelect shell over its own catalog: the session's user-invocable skills, the managed MCP servers, or the signed-in user's knowledge bases. A pick settles into the current draft as editable text: a `/name` gesture the Host expands, a directive naming the MCP server whose tools the message should use, or a knowledge base link with the passages retrieved for the draft. The popup, search, keyboard, and focus behavior belong to `ui-commands`; this package owns only what each row means.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin alongside `ui-commands` and `ui-conversation`; the three rows then appear in the composer's Add section, between 文件 and 目标, and stay out of the way everywhere else. Each row is also a typed command (`/skills`, `/mcp`, `/knowledge`), so the same picker opens from the composer's `+` button or from the slash menu. Rows are available in ordinary sessions with a retained binding; subagent sessions never offer them.

The three rows read one capability each:

- **技能** lists the session's user-invocable skills from `skills/list` and settles the pick as the `/name ` gesture. The Host's tool-skill pre-step recognizes that gesture and injects the skill's instruction body, so the pick has the same effect as typing the skill's command; the row additionally marks a skill the draft already invokes.
- **MCP** lists every server `ctx.remote.mcpManager` reports, with its live state (connected tool count, connecting, reconnecting, waiting for credentials, disabled, unavailable) and the `mcp__server__` tool prefix. The pick inserts a sentence naming that server and prefix, which steers the turn toward those tools; it never changes server configuration.
- **知识库** lists the signed-in user's knowledge bases through the SDKWork Knowledge Base catalog (`ctx.knowledgeBases`, provided by `ui-sdkwork-knowledge`), grouped into team and personal bases. When the draft already contains a question, the pick also retrieves up to five passages from the chosen base and appends them as quoted lines. The row is hidden when the deployment mounts no Knowledge Base capability.

Every insertion is plain draft text: the user can edit or delete it, and nothing reaches the Agent until the user sends the message.

### Pick behavior

Options load once per popup opening; search filters them locally. Skills use fuzzy label ranking, MCP and knowledge base rows use substring matching over label and detail. A failed catalog load shows the row's retryable failure copy, and a superseded opening (the popup closed or reopened) settles to an empty list instead of surfacing an abort.

Knowledge base retrieval uses the draft as its query and is bounded: at most five passages, 600 characters per passage, and 4000 characters for the complete quoted block. A blank draft skips retrieval entirely. When retrieval returns nothing or fails, the link is still inserted and the composer shows one informational notice, so the user can send the message or retry from a fuller draft.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`src/client/rows.ts` builds the three `CommandContribution`s over an injected {@link CapabilityRowDeps} face: availability, catalog loaders, draft reads, draft appends, and notices. `src/client/options.ts` maps catalog snapshots to rows (skills filter out model-only entries because this surface is human-facing), and `src/client/insertion.ts` owns the inserted text, including the retrieval bounds. `src/client/index.ts` wires the rows to `ctx.commandUi`, `ctx.remote.skills.list`, the `mcpManager/watch` stream (first frame, then disposed), and `ctx.conversation.input`.

The draft append goes through `requestDraftInitialization({ whenDraftExists: 'append' })`, which adds the capability text as a new paragraph and leaves existing reference chips intact; a busy composer reports its localized refusal instead of dropping the pick. Retrieved passages quote normalized whitespace so a multi-line passage stays one readable line.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-commands](../ui-commands/README.md) — the composer menu, the popupSelect shell, and the contribution contract.
- [ui-conversation](../ui-conversation/README.md) — the composer draft machine these rows append to.
- [ui-sdkwork-knowledge](../ui-sdkwork-knowledge/README.md) — the SDKWork Knowledge Base catalog and retrieval capability.
- [Client package map](../README.md) — adjacent browser UI packages.

-----

<a id="model-experience"></a>
## Model Experience

None, as the rows only insert reviewable text into the unsent draft and never submit, so the user decides what reaches a request.

#### KV Cache effect

None; the package sends no provider request and changes no prompt section. Inserted draft text reaches a request only as part of a user message the user sends, which appends to the conversation and therefore invalidates the cached prefix from that message onward like any other user input.

## Known Limitations and Deferred Work

- **MCP selection steers rather than scopes.** MCP tools are registered globally by `dsh-mcp-client`, so the row can only tell the model which server's tools a message is meant to use; per-session tool filtering would need a Host-side restriction the client cannot apply.
- **Knowledge base retrieval is compose-time and per-message.** Passages are fetched once, when the row settles against the current draft; later edits to the draft do not refresh them, and only the retrieval results are sent, not the knowledge space link itself.
- **No capability state persists across messages.** Each pick inserts text into one draft; there is no per-conversation binding that would re-apply a capability to later turns.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The knowledge base row resolves `ctx.knowledgeBases` lazily on every availability check and opening, because `ui-sdkwork-knowledge` may apply after this plugin. That keeps the row hidden until the capability exists and visible immediately afterwards, without a cross-plugin value import.

</details>

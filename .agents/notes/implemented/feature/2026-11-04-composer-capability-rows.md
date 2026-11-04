# Agent Note: Composer capability rows

Status: implemented

English | [中文](2026-11-04-composer-capability-rows.zh.md)

## Problem

The composer's Add section could attach files and reach host commands, but a conversation had no way to say which skill it should run, which MCP server it should use, or which knowledge base it should answer from. The three capabilities existed — `ui-skill` already offered skills through the `/` trigger source, `mcpManager` reported the managed servers, and the SDKWork Knowledge Base application knew the signed-in user's knowledge bases — yet none of them was reachable from the `+` menu, and two of them had no browser surface at all.

## Decision

A new browser plugin, `@deepseek-ai/dsh-client-ui-sdkwork-capabilities`, registers three `ctx.commandUi` contributions named `skills`, `mcp`, and `knowledge`. `ui-commands` orders them in the Add section between 文件 and 目标, so the `+` button and a typed `/` reach the same pickers. Each row is a `popupSelect` spec; the shared shell owns search, keyboard, focus, error and retry behavior, and the plugin owns only the catalog and the settled pick.

A pick settles into the current draft as plain text, never as a submission:

- 技能 loads `skills/list` for the session and inserts the `/name ` gesture. The Host's `tool-skill` pre-step already recognizes that gesture and injects the instruction body, so the pick has exactly the effect of typing the skill command. Model-only skills are filtered out because this is a human-facing menu.
- MCP takes the first frame of the `mcpManager/watch` stream and inserts a sentence naming the server and its `mcp__server__` tool prefix. MCP tools are global registrations, so the row steers the turn rather than scoping tools.
- 知识库 lists the SDKWork Knowledge Base selection projection through a new `ctx.knowledgeBases` service provided by `ui-sdkwork-knowledge`. When the draft already holds text, the pick retrieves passages from the chosen space and appends up to five quoted lines (600 characters each, 4000 characters for the block) after a directive sentence. A blank draft skips retrieval; an empty or failed retrieval keeps the link and reports one informational notice.

The catalog service lives in `ui-sdkwork-knowledge` because that package already owns the SDKWork host adapter, environment, IAM, and generated app client. It exposes `list` and `retrieve` over the application's own `knowledgeSelectionService.getBases` and `knowledge.retrievals.create`, and this plugin resolves it lazily so the row appears when that capability is mounted, whenever that happens.

Insertion goes through `conversation.input.requestDraftInitialization({ whenDraftExists: 'append' })`: the capability text becomes a new paragraph and existing reference chips survive. A busy composer throws the row's localized refusal, which the popup shell surfaces as a retryable error with the token intact.

## Alternatives considered

**Host-side per-conversation capability binding.** A durable session event plus a Remote write would let selections persist across turns and let the Host filter MCP tools and retrieve knowledge base passages itself. It was rejected for this change because it crosses the session format, a new Host plugin, and interface generation, while the user-visible outcome the composer needs is reviewable text the user can still edit.

**Reusing the `/` skill source for all three rows.** The skill trigger source already inserts a gesture, but it is bound to per-keystroke candidate queries at a `/` token; MCP servers and knowledge bases have no such token, and a menu row must be reachable from the `+` button. Keeping the three rows on the `ui-commands` contribution surface gives them one picker contract.

**Rendering capability chips instead of text.** Mention chips would need new reference kinds and renderers on top of the existing pipeline. Inserted text stays visible, editable, and removable in the composer, and the skills row already gains a chip for free because `ui-skill`'s user-text rule recognizes the `/name` gesture.

**Making the MCP row scope tools per conversation.** `dsh-mcp-client` registers tools globally and `ctx.tools.restrict` requires a scoped Host context, so the client cannot deny or allow a server for one session. The row therefore states which server's tools the message is meant to use, and the limitation is documented.

## Consequences

The three capabilities are discoverable from the composer without a new host protocol, and the inserted text is fully reviewable before send. The cost is that no selection persists: each pick applies to the draft it lands in, and a later turn needs its own pick. Knowledge base retrieval happens once at pick time, so extending the question afterwards does not refresh the passages, and only the retrieved passages travel — not the knowledge space id.

The knowledge row disappears when `ui-sdkwork-knowledge` is not mounted, which keeps deployments without SDKWork knowledge free of a dead entry, but also means its first opening can only succeed where that package applied.

## Verification

`packages/client/ui-sdkwork-capabilities/tests` pins the row contract: option mapping for the skill catalog, every managed MCP state, and the grouped knowledge base rows; insertion text and its retrieval bounds; and the row behavior over fake capabilities (aborted openings, catalog failures, retrieval fallbacks, and the busy-composer refusal). `packages/client/ui-sdkwork-knowledge/tests/knowledge-catalog.client.spec.ts` pins the catalog's listing filter, group order, retrieval request body, hit filtering, and abort propagation. `packages/client/ui-commands/tests` still passes over the reordered Add section, and the client typecheck aggregate covers the new package's sources and tests.

# Agent Note: The remote-expert create flow inside My experts

Status: implemented

English | [中文](2026-10-31-experts-create-flow.zh.md)

## Problem

The My-experts page's create menu dispatched one guided prompt per expert type, so "新建远程专家" produced a conversation walk-through instead of the real creation flow. The SDKWork Agents PC app already owns the product flow — a basic-info dialog (name, avatar, type, summary) whose "下一步" persists the agent, then a full editor (system prompt, model, memory, capabilities, preview chat) — and the fork embeds sibling SDKWork PC surfaces as a rule, so the question was only how to wire it into `ui-sdkwork-markets` without dragging the Agents PC app's whole dependency graph into the market bundle.

## Decision

### The capability package exports a curated create surface

`@sdkwork/agents-pc-agents` gains a `./create` subpath exporting exactly what the flow needs: `CreateAgentModal`, `CreateAgentView`, their prop types, and the knowledge-selection binding (`configureKnowledgeSelectionAdapter`, `createKnowledgebaseSelectionAdapter`). The root barrel is not used by hosts: it re-exports the chat and home surfaces, whose module graph reaches the chat transport and the Monaco loader, and a bundler that must keep a barrel's top-level instantiations cannot drop them — embedding the barrel pulled all three into the bundle. The subpath also keeps the knowledge binding out of the `./services` subpath, whose index re-exports `agentChatService` and would drag the same graph.

### The host adapter follows the per-package adaptation template

`ui-sdkwork-markets`'s `expertsHost.tsx` follows the same session/port adaptation every SDKWork surface package owns a copy of (client-bundle purity forbids cross-plugin value imports): it binds the Agents, Memory, Voice, Skills, Knowledgebase, and Drive generated clients to the active gateway and IAM session, re-derives them on environment changes, reports gateway readiness (the create affordance disables the remote row without a gateway), and persists the Agents PC session tokens so the core modules' own config functions see the session. A request fired while signed out is held at the fork's deferred sign-in gate inside the SDK interceptor chain.

Both SDK faces load code-split on first use. The knowledge-selection adapter is bound inside that loader, not at plugin apply time, because the adapter's state lives in the capability package's own module registry — configuring a fork-side copy would configure nothing the editor reads.

### The flow is fork UI around SDK components

`CreateExpertMenu` gains an `onCreateRemote`/`remoteReady` contract: the remote row enters the dialog; the local and personal-VM rows keep dispatching their guided prompts. `MineExpertsPage` owns a three-phase state (idle → dialog → editor) and swaps its whole body for the editor, whose own back control returns to the roster — the same full-body swap the my-catalog entry uses against the market chrome. Fork-visible copy (editor loading, unconfigured hint) stays locale-owned; the SDK components' own copy is theirs.

### The tests leave the client test aggregate

Markets' tests import the Agents PC closure, whose sibling sources are written for the sdkwork flag set (no `noImplicitOverride`), so the tests move out of `tsconfig.client.tests.json` into the package's own `tsconfig.tests.json` — the drift-guard split every SDKWork surface package uses (generations-image, drive, course, …). That project pins one React type identity (react-dom 19 ships no inline types and its `@types` cannot be reached through its exports map), resolves every dsh specifier through the built lib and every sdkwork specifier through the siblings' exports maps (one type identity per package; the standard-kit augmentations enter through the built declaration files, and including their sources would collide with the runtime lib's own augmentation), and it surfaced four real drift bugs in fork code that no checker had ever seen (the emit face is `noCheck`, and the aggregate checks tests against redirected lib declarations): `bundleReference` dropping `availability`/`official`, the install dialog's terminal labels missing the per-line label, the New Session entry typed through the read face of the dual `IWorkspaces` merge, and the spec doubles' sessions/workspaces shapes lagging the runtime contract.

## Alternatives considered

- **A new fork package** (`ui-sdkwork-experts`) for the create flow: the flow is an affordance of the existing My-experts page, not a mode; a second package would add the whole cordis/slots/seed scaffolding and split the page's state machine across a package boundary.
- **Configuring the knowledge adapter eagerly** (at plugin apply, through a static barrel import): it would load the editor's full graph on every boot of every deployment, including ones that never open the flow — the code-split loader exists precisely so hosts that never open it never pay.
- **Fixing the sibling barrel by deleting the chat/home re-exports**: those exports serve the standalone Agents PC app; narrowing hosts through `./create` costs nothing and changes nothing for the owner repo's own bundles.

## Consequences

- The fork now joins six more sibling workspace members and four catalog rows, so upstream syncs and CI checkouts carry a wider sibling pin set (`scripts/sdkwork-sources.manifest.json` owns the online pins; the release runner inlines the sibling sources the closure analyzer maps).
- The markets bundle grows by the editor's own closure (chat-input editor framework, model and memory pickers, Drive upload image) — inherent to the capability being embedded — while the chat/home surfaces and the Monaco loader stay out through the `./create` subpath.
- The `tsconfig.client.tests.json` exclusion means the aggregate no longer checks markets' tests; `packages/client/ui-sdkwork-markets/tsconfig.tests.json` is now the only type checker over this package's source and tests, so it must be run (or wired into a typecheck lane) whenever the package changes.
- The `remote` expert type and the personal-VM/local types now diverge in execution channel (embedded SDK flow vs conversation dispatch); if the experts catalog store lands later, its roster entries should link into the same editor rather than re-introducing a prompt-dispatch path for remote experts.

# Agent Note: SDKWork OpenClaw agent bridge — cross-runtime agent interop in both directions

Status: proposed

English | [中文](2026-09-12-sdkwork-openclaw-agent-bridge.zh.md)

## Problem

OpenClaw is a local-first agent execution gateway: a long-running Node process whose Gateway owns ingress, auth, routing, sessions, and events, bound to loopback (default `127.0.0.1:18789`), speaking JSON frames over WebSocket (`connect` handshake, then request/response/event frames) and also exposing HTTP surfaces. Inside that process OpenClaw owns its own agent runtime — system prompt, model providers, a 75+-tool catalog, skills, memory, compaction, subagents, and Docker-sandboxed execution. It reaches the outside world through channel adapters and through plugin extension points (tools, hooks, channels, models, HTTP routes, background services, chat commands, terminal commands).

The dsh fork is the mirror image: a Cordis plugin tree where `core/agent-loop` owns turn/step, `core/tools` owns the tool registry and its approval/sandbox pipeline, `core/session` owns the append-only event log, and every external transport is a plugin (`acp`, `sdk`, `webhook`, `mcp`).

Today the fork knows about OpenClaw in exactly one place, and it is not a runtime relationship. `packages/client/ui-sdkwork-apikey` renders a quick-import surface whose copy points at `~/.openclaw/openclaw.json` (`models.providers.<id>`, `agents.defaults.model.primary`) so an operator can write a CloudRouter key into OpenClaw's config. That is **configuration-level** adjacency: it makes OpenClaw call the same model endpoint. It does not let either agent's work reach the other. A dsh session cannot hand a task to an OpenClaw agent and consume the result; an OpenClaw channel conversation cannot hand a task to dsh. The two runtimes are two islands that happen to share a model provider key.

The gap matters because the two runtimes are strong where the other is not. dsh has the durable, replay-exact session log, the workspace/session model, approval and sandbox policy, and a curated coding tool surface. OpenClaw has 50+ chat-channel ingress, long-running proactive/background execution, node pairing, its own sandbox backends, and a mature multi-platform delivery layer. Neither will absorb the other, and neither should: they are separate products with separate release trains, separate security models, and separate user contracts. What is missing is not a merge — it is a **contract**.

The hard part is that an "agent runtime" is not a library boundary. Both systems want to own the same nouns (`session`, `turn`, `message`, `tool call`, `approval`, `usage`), and both persist those nouns in incompatible durable formats. Any design that tries to unify the vocabularies, mirror the logs, or share one loop between them will produce dual-write hazards, ambiguous cancellation ownership, and a permanent merge conflict on every upgrade of either side. A workable design must instead make the boundary **thin, explicit, and lossy where it has to be** — and must survive both sides upgrading independently.

## Proposal

Add a fork-owned OpenClaw bridge as a small package family, built on one rule: **the two runtimes stay two runtimes, and only tasks and results cross the boundary.**

Concretely: dsh gains an `openclaw` subagent provider so a dsh model can delegate a task to an OpenClaw agent and consume its result; OpenClaw gains the ability to drive dsh through surfaces dsh already ships (ACP, webhook) so an OpenClaw channel conversation can delegate into a dsh session. No shared log, no shared loop, no shared tool registry, and no source-level dependency in either direction.

### Invariants

These five invariants are the design. Every subsequent decision is downstream of them, and any future change that violates one is rejected rather than negotiated.

1. **One turn, one owner.** A turn is owned by exactly one runtime. dsh owns the parent turn and the child's *published handle*; OpenClaw owns everything inside the delegated turn — its model choice, its tool calls, its sandbox, its own approvals. The bridge never executes a tool and never calls a model.
2. **No log mirroring.** Neither side writes the other's session log. A remote subagent run is one-shot with a terminal result (`SubagentRun.localAgent` is `undefined` by contract); dsh does not project OpenClaw's turn structure into its own authoritative log, and OpenClaw does not project dsh's. Observability is a separate, explicitly non-authoritative surface.
3. **Only identity is shared.** The single piece of shared mutable state is a session-identity map (plus a run record). Context, history, tool catalogs, credentials, and policy are *not* shared; each side applies its own.
4. **Asymmetric seams, chosen from what already exists.** Outbound uses dsh's own extension point for "run another agent" — `SubagentProvider`. Inbound reuses `acp` and `webhook`. No new protocol is invented on the dsh side, and no plugin is required on the OpenClaw side for the primary paths.
5. **Zero cross-repo source dependency.** The only coupling surface is the OpenClaw Gateway wire protocol, pinned and validated by handshake. The fork must be able to upgrade without touching OpenClaw, and OpenClaw must be upgradable to any version that still negotiates the supported protocol version.

### Package topology

| Package | Directory | Owns | Depends on |
|---|---|---|---|
| `@deepseek-ai/dsh-sdkwork-openclaw-protocol` | `packages/host/sdkwork-openclaw-protocol/` | Gateway wire client: connect/handshake, frame schemas, request/response correlation, event demux, idempotency keys, heartbeat, reconnect/backoff, backpressure. A normative bridge IR. **Zero Cordis, zero dsh semantics.** | `ws` (or Node global `WebSocket`), the pinned OpenClaw schema snapshot |
| `@deepseek-ai/dsh-sdkwork-openclaw` | `packages/host/sdkwork-openclaw/` | The bridge host service `ctx.sdkworkOpenclaw`: anti-corruption mapping to dsh vocabulary, the session-identity map, gateway lifecycle, settings, credential resolution, telemetry, health. | protocol + `cordis`, `settings`, `credentials`, `subprocess`, `telemetry` |
| `@deepseek-ai/dsh-sdkwork-openclaw-subagent` | `packages/subagent/sdkwork-openclaw-subagent/` | The outbound adapter: `SubagentProvider` named `openclaw`, plus its `cordis.patch.yml`. | bridge service + `subagent` |
| `@deepseek-ai/dsh-sdkwork-openclaw-ingress` *(P4, optional)* | `packages/host/sdkwork-openclaw-ingress/` | The inbound adapter, **only if** the reused ACP/webhook paths prove insufficient (see below). | bridge service + `webServer` / `webhook` |

A single-package fallback exists if the family feels too heavy for a first cut: `packages/host/sdkwork-openclaw/` with `src/protocol/`, `src/translate/`, and `src/subagent/` subdirectories and one patch file. The protocol package is separated from the start for one concrete reason — it is the *only* thing that must change when OpenClaw's wire evolves, and a package with a single, auditable, dsh-free external dependency makes that change cheap and testable in isolation. It also becomes the natural second consumer's dependency (the ingress adapter needs the same handshake).

Naming follows the fork contract: every added package carries the `sdkwork` marker (`dsh-sdkwork-openclaw*`), host packages live under `packages/host/sdkwork-*`. No new `bin` entry is added, so `verify-application-entrypoints` stays satisfied; the ACP launch path is the shipped `dsh --profile acp`, not a new executable.

### Layer responsibilities

The bridge is seven layers, each with one job. The split exists so that a change in one never forces a change in another.

- **L0 — Wire.** Frames in, frames out. Owns the `connect` handshake (auth plus capability/permission alignment), request ids, response correlation, event subscription and demultiplexing, idempotency keys for side-effecting methods, heartbeat, reconnect with capped backoff, and backpressure. Knows nothing about agents, sessions, or dsh.
- **L1 — ACL / translation.** Pure functions between the bridge IR and dsh vocabulary. Every mapping is total, and every lossy mapping is *named* in a single table (see the mapping tables below) rather than discovered at runtime.
- **L2 — Host service.** `ctx.sdkworkOpenclaw`: `status()`, `health()`, session-identity map, `submit()`, `abort()`, event fan-out, and the gateway lifecycle. This is the only place the two identities meet.
- **L3 — Outbound adapter.** The `SubagentProvider`. Translates a `ResolvedSubagentStartRequest` into a gateway session turn and a settled OpenClaw result into a `SubagentResult`.
- **L4 — Inbound adapter.** Reuses existing seams (below). Deliberately the thinnest layer.
- **L5 — Observability.** Telemetry events, structured logs, a health surface, and a run record. Never authoritative for either side's history.
- **L6 — Policy.** Trust boundary, token handling, environment scrubbing, per-delegation scope, and the treatment of results as untrusted content.

### Outbound: a dsh model delegates to an OpenClaw agent

The flow, end to end:

```
dsh model tool call (toolName: openclaw_delegate)
  -> ctx.tools pipeline: tools/pre-execute (allow | deny | ask)
     approval/sandbox policy applies here, unchanged — the bridge adds no path around it
  -> subagent service: validate declared capabilities, resolve the durable child descriptor
  -> SubagentProvider('openclaw').start(request)
       open/reuse the mapped OpenClaw session for this run
       send the prompt as one turn; apply the per-run tool/model policy if negotiated
       stream events internally for progress + cancellation
     -> SubagentRun { id, localAgent: undefined, result, dispose }
  -> await run.result  ->  SubagentResult { output, structured?, diagnostic?, stopReason }
  -> tool result (isError when stopReason !== 'completed')
```

The wiring is a patch row, not code. It mirrors the existing `tool-subagent` / `tool-subagent-fork` pair exactly:

```yaml
    - id: subagent-openclaw
      name: '@deepseek-ai/dsh-sdkwork-openclaw-subagent'
      config:
        providerName: openclaw

    - id: tool-subagent-openclaw
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: openclaw
        toolName: openclaw_delegate
        maxDepth: provider-managed
        backgroundMode: one-shot
```

`maxDepth: provider-managed` is not a convenience here; it is the documented shape for an out-of-process provider whose recursion budget belongs to the child runtime. OpenClaw's own subagent orchestration owns its recursion depth.

**Capability negotiation is the sharp edge.** `SubagentProvider.capabilities` is a static, mount-time declaration, but OpenClaw's real capability set is version-dependent and dynamic. The design is therefore: probe at mount, derive the declaration from the probe result, and freeze it for that mount's lifetime.

| `SubagentCapabilities` field | Declared | How the bridge honors it |
|---|---|---|
| `agentOptions` | `false` in P3 | Per-run provider/model override is not part of the negotiated floor; a per-agent OpenClaw model is configuration, not a per-run parameter. Promote only if the wire exposes it. |
| `outputSchema` | `true` | The bridge appends a schema-directed instruction, strictly validates the returned value against the requested object schema, and settles `stopReason: 'error'` on mismatch — the seam's stated contract for a provider that cannot satisfy a capture. |
| `depthLimit` | `false` | Delegation depth belongs to OpenClaw's own orchestration, so the tool row must say `provider-managed`. Declaring `false` makes a numeric `maxDepth` a loud mount failure instead of a silent lie. |
| `toolFilter` | `true` **only if** the negotiated session config exposes a per-session tool policy | Mapped onto OpenClaw's own "policy before prompt" visible-tool filtering. Never emulated by prompt text. |
| `persona` | `false` in P3, `true` when the session instruction path is confirmed | Passed as a session-level instruction, not spliced into the user prompt. |

If a reconnect negotiates a *narrower* vector than the one the provider was mounted with, the provider marks itself degraded and **refuses new starts** with an actionable diagnostic, rather than accepting a request it cannot honor. Silent capability lie is the one failure mode this design explicitly refuses.

### Inbound: an OpenClaw conversation delegates to dsh

Four candidate paths were considered; the recommendation is to ship the first two and treat the rest as opt-in.

| Path | Shape | Cost | Verdict |
|---|---|---|---|
| **ACP** | OpenClaw's ACP-agents route launches an external harness; point it at `dsh --profile acp` (stdio ACP server dsh already ships) | dsh: zero code. OpenClaw: config only. | **Primary** — interactive, turn-by-turn, standard protocol, and `packages/subagent/subagent-acp` already proves dsh speaks correct ACP on both sides. |
| **webhook** | OpenClaw (or a channel plugin) POSTs a signed delivery; `ctx.webhookRuntime` authenticates it and creates a Workspace Session | dsh: a rule plus a secret. OpenClaw: an HTTP action. | **Primary for push** — async, fire-and-forget, one session per task, reuses the existing rule/session-request contract. |
| **SDK JSON-RPC** | OpenClaw speaks dsh's `dsh --profile sdk` protocol | Low, but the protocol is version-matched to dsh's own SDK clients | **Alternative** — acceptable, but it is dsh's private client contract, not a third-party interchange format. |
| **fork ingress plugin** | A new authenticated HTTP/WS endpoint on the existing `ctx.webServer`, with a streaming progress downlink | dsh: a new package and a new wire. OpenClaw: a plugin. | **P4, only if needed** — justified only when a *streaming, bidirectional* inbound control channel is an actual requirement, since ACP already covers streaming interactively. |

Choosing ACP plus webhook means the inbound direction needs **no fork code at all** in its minimum form: a documented launch recipe and one webhook rule. That is the strongest possible expression of "the components evolve independently."

### Session identity: the one shared noun

The session-identity map is the core of interoperability and the only mutable state the bridge owns. It is persisted under the Harness home, owned by L2 as a single writer, and never written by either runtime's own session store.

| Field | Meaning |
|---|---|
| `bridgeRunId` | Bridge-minted, unique per delegation; the run record's primary key. |
| `direction` | `outbound` (dsh delegates) or `inbound` (OpenClaw delegates). |
| `openclawSessionKey` | OpenClaw's session key, including its channel/account/chat/thread/agent routing tuple. |
| `openclawAgentId` | Which OpenClaw agent serves this mapping. |
| `dshSessionId` | The dsh session: the parent that delegated, or the workspace session created for an inbound task. |
| `parentDshSessionId` | Set for outbound runs; absent at top level. |
| `idempotencyKey` | Guards a replayed start against duplicate side effects across a reconnect. |
| `state`, `lastSeq`, `lastActivityAt` | Liveness and resumability, for reconciliation and leak reporting. |

Two rules keep it honest. First, **`sessionMode`** is explicit config — `per-run` (default: a fresh OpenClaw session per delegation, so no cross-task context bleed), `shared` (one long-lived OpenClaw session per dsh agent), or `explicit-key` (operator-pinned). Second, an entry is *never* deleted on failure; a run that ends without a confirmed child settlement leaves a `orphaned` record, and the health surface reports it. Guessing that a remote session is finished is exactly the kind of silent divergence this design is built to avoid.

### Mapping tables

Translation is where cross-runtime designs rot, so every mapping is enumerated, total, and tested.

**Prompt and content.** dsh `ContentBlock[]` → the OpenClaw prompt payload. Text maps directly. Images and other binary blocks map only when the negotiated wire supports that content type; otherwise the mapping is *lossy and loud* — the bridge inserts an explicit `[unsupported content block: <type>]` marker rather than dropping it, so the child can ask for a re-send instead of silently answering a partial question.

**Stop reason.** OpenClaw's terminal outcome → `SubagentStopReason`. `completed` → `completed`; operator/model cancellation → `aborted`; model or transport failure → `error`; a length/token ceiling → `max-tokens`; an explicit decline → `refusal`. A reason the bridge cannot classify maps to `error` with a diagnostic naming the unmapped value — never to `completed`.

**Failure detail.** `SubagentResult.diagnostic` is provider-authored, secret-free, and capped at 4096 UTF-8 bytes: it carries the bridge's own slug, the negotiated protocol version, the run id, and the remote error class — never raw protocol payloads, file contents, prompt text, or credential material.

**Usage and telemetry.** Remote usage is reported on the bridge's own telemetry channel and attributed to the run and the parent session. It is deliberately *not* injected into dsh's authoritative usage accounting, because remeasuring a remote provider's tokens with local arithmetic produces numbers that look precise and are not.

**Errors.** Transport faults that the seam cannot express as a stop reason (handshake failure, unsupported protocol version, gateway unreachable at start) reject `start()`; everything after publication settles through the run as `stopReason: 'error'`. A run never hangs: when the gateway is down, `start()` rejects fast with an actionable message.

### Gateway lifecycle

Three modes, `attach` by default because the Gateway is normally the operator's process (systemd, launchd, container, or the desktop carrier):

- **`attach`** — connect to a running Gateway; retry with capped backoff; never start or stop it.
- **`supervise`** — spawn it through `ctx.subprocess` with `scrubbedParentEnv()` so no `DSH_*` value or model key leaks into the child, probe readiness before announcing healthy, restart with capped backoff, and tree-kill on dispose (the pattern already proven in `packages/host/sdkwork-app-build`).
- **`remote`** — an explicit opt-in for a non-loopback endpoint over TLS.

Lifecycle transitions are published as service events so the UI, telemetry, and the delegation tool can all say "gateway unavailable" truthfully instead of surfacing a timeout.

### Security and trust boundary

- **Loopback by default.** A non-loopback endpoint requires an explicit opt-in flag; the bridge refuses to treat a remote Gateway as equivalent to a local one.
- **Token handling.** The Gateway credential is a *credential reference* resolved through `ctx.credentials` at connect time — never plaintext in config, never in a log, never in a diagnostic.
- **Environment hygiene.** `scrubbedParentEnv()` on every supervised spawn: no model keys, no `DSH_*`, no provider tokens cross into the OpenClaw process.
- **Operator trust boundary, stated plainly.** A paired Gateway is inside the operator's trust boundary, exactly as OpenClaw's own architecture frames it. The bridge does not pretend to sandbox the far side.
- **Inbound authority is explicit and minimal.** An OpenClaw-originated task does **not** inherit the interactive user's authority. It enters with a named principal, is scope-restricted through the existing scoped-tool mechanism, and always traverses dsh's normal approval pipeline. This is the one place where a bridge can silently become a privilege-escalation path, so it is a first-class design rule rather than a hardening note.
- **Results are untrusted content.** OpenClaw's output is data, wrapped with provenance when it enters a dsh prompt; it is never auto-executed.

### Failure, cancellation, and reconnect

`request.signal` and `run.dispose()` are the canonical cancellation channels and both map to an abort on the OpenClaw session. If an abort cannot be confirmed within the stage timeout, the run settles `aborted` and the session-identity entry is marked for operator review — a leak is reported, not hidden. Reconnect resumes by session key; replayed side-effecting calls are guarded by the recorded idempotency key. Timeouts are per stage (connect, handshake, start, turn) and configurable; every stage failing produces a distinct, named diagnostic.

### Observability

Telemetry through the existing capability seam, structured logs with the run id as a correlation field, a health surface on the service (`gateway`, `version`, `negotiatedCapabilities`, `pendingRuns`, `orphanedMappings`), and an optional read-only session view for the UI that is explicitly labelled derived. The bridge never becomes a second source of truth for anyone's history.

### Test strategy

No CI dependency on OpenClaw being installed. L0 is tested against an in-process fake Gateway that replays recorded frames, including handshake rejection, capability narrowing, mid-turn disconnect, and duplicate idempotency keys. L1 is tested as golden tables plus round-trip properties, with each lossy mapping asserted *as* lossy. L2 is tested for lifecycle, reconnect, and reconciliation. L3 reuses the same subagent contract harness as `subagent-acp` and `subagent-dsh-sdk`. A process-level REAL-composition test is required per `packages/AGENTS.md`. A live end-to-end test against a real Gateway exists behind an explicit opt-in environment flag.

### P0 prerequisite: pin the wire

Before L0 is written, one discovery task is mandatory: perform a real handshake against a running Gateway, export the actual method catalog and frame schemas, and check that snapshot into the protocol package. Every method name in this note beyond the documented frame classes is *intent pending that snapshot* — the design assumes request/response/event frames and a capability handshake, and must not assume names.

### Delivery phases

| Phase | Deliverable | Gate |
|---|---|---|
| P0 | Wire snapshot, decision freeze | Real handshake captured and checked in |
| P1 | `sdkwork-openclaw-protocol` + fake Gateway | Frame and handshake tests green |
| P2 | `sdkwork-openclaw` service, `attach` mode, identity map, health, settings, credentials | Lifecycle and reconciliation tests green |
| P3 | `sdkwork-openclaw-subagent` provider + the two patch rows | Subagent contract harness green; README gates green |
| P4 | Inbound: ACP recipe + webhook rule; ingress package only if measured necessary | One OpenClaw-originated task lands in a real dsh session |
| P5 | Control-plane tools (`openclaw_status`, `openclaw_sessions`, `openclaw_channels`), telemetry, UI health | Every tool covered by the standard pipeline |
| P6 | `supervise` mode, `remote` mode, optional MCP sidecar for tool-level sharing | Opt-in security review |

### Decisions this note deliberately leaves open

1. **`sessionMode` default.** `per-run` is proposed; `shared` gives better continuity and worse isolation. Pinning it requires the intended use case.
2. **Which direction ships first.** Outbound is proposed (dsh delegates) because it reuses the most and is testable in isolation; inbound is config-only and could ship alongside.
3. **Tool-level sharing.** The design deliberately keeps the tool catalogs separate. Sharing them needs MCP and a dsh-side MCP server that does not exist today — a real sub-project, and out of scope unless tool-level interop is an explicit goal.
4. **Whether the ingress package is needed at all**, decided by measurement in P4 rather than by appetite.

## Alternatives considered

- **Treat OpenClaw as an LLM provider.** It is the wrong layer. OpenClaw is an agent runtime that itself calls models; registering it as an adapter would collapse "delegate a task" into "call a model," discard its tool surface and sandbox, and make dsh's own agent loop the owner of OpenClaw's turns — violating invariant 1 on the first day.
- **Bidirectional in-process embedding.** Import OpenClaw's runtime into the fork, or write an OpenClaw plugin that imports dsh. Both create a cross-repo source dependency and a shared loop, so each upgrade of either side becomes a merge, and the two release trains are welded together. Rejected: it destroys the independence the requirement asks for.
- **Run the whole bridge over MCP.** MCP carries tools and context, not agent lifecycle: it cannot express "run this task in your own session and tell me why it stopped." It is the right answer to a different question (Phase 6 tool sharing) and the wrong foundation for delegation.
- **Replace `agent-loop` via `setFactory` so OpenClaw *is* the dsh loop.** The factory admits exactly one implementation, so this would make OpenClaw and dsh mutually exclusive rather than interoperable, and it puts OpenClaw's session semantics where dsh's log and approval policy expect their own.
- **Mirror the two session logs.** Dual-write across two durable formats with independent versioning produces divergence that no reconciliation can resolve, and it implies both sides know the other's format — a coupling far more expensive than the one it removes.
- **A dedicated bidirectional WebSocket between the two runtimes.** Superficially the most "decoupled" option and actually the most coupled: it invents a third protocol that both sides must version, instead of riding OpenClaw's existing Gateway protocol and dsh's existing ACP/webhook seams.
- **One large package.** Feels simpler, but the protocol layer would then be entangled with Cordis, and the fork's package gates (README triple, dependency invariants, path generation) reward small, single-purpose packages. The fallback single-package layout is documented above if the family proves too heavy in practice.

## Acceptance criteria

1. A dsh session's model can call `openclaw_delegate`, receive a real OpenClaw agent's result as a tool result, and the run is visible in the bridge's health surface with a correct stop reason.
2. The same delegation, run with the Gateway stopped, fails fast: `start()` rejects with a named diagnostic and `status()` reports `gateway: unavailable` — no hang, no silent retry loop.
3. Cancelling the dsh tool call cancels the OpenClaw turn; an unconfirmed abort leaves an `orphaned` mapping rather than a fabricated completion.
4. An OpenClaw channel conversation can hand a task to dsh through the ACP path and receive dsh's answer, with dsh's approval and sandbox policy applied unchanged to that task.
5. Every mapping table row has a test, including the lossy ones, and every unclassifiable remote value settles `error` with the unmapped value named.
6. Capability narrowing across a reconnect refuses new starts instead of accepting unsupported requests.
7. `verify-cordis-config`, `verify-package-dependencies`, `verify-tsconfig-paths`, the three README gates, and `verify-application-entrypoints` all pass with the new packages mounted; `analyze-sdkwork-closure.mjs` is unaffected unless a `@sdkwork/*` sibling is imported.
8. No secret, prompt text, file content, or raw protocol payload appears in any diagnostic, log line, or error surface.

## Risks

- **Wire drift.** OpenClaw's Gateway protocol evolves; the notes call it out explicitly and direct clients to treat generated schemas as the source of truth. Mitigation: the protocol package is the only place that changes, the handshake carries the version, and an unsupported version refuses to start rather than degrading.
- **Capability over-declaration.** Claiming a capability the far side cannot honor produces work that silently loses fidelity. Mitigation: probe-derived frozen declarations, degradation on narrowing, and `false` as the default for anything not confirmed.
- **Inbound authority leakage.** The single highest-severity risk: an OpenClaw-originated task arriving with more dsh authority than intended. Mitigation: named principal, scoped restriction, mandatory approval pipeline, and an explicit test.
- **Identity-map divergence.** A crashed or unreachable Gateway can leave mappings whose remote session state is unknown. Mitigation: single-writer ownership, no deletion on failure, `orphaned` state, and a health surface that reports it.
- **Cost and latency opacity.** Delegation adds a second model bill and a second latency budget; a remote child can be slow without being wrong. Mitigation: per-stage timeouts, usage telemetry on the bridge's own channel, and no attempt to fold remote usage into local accounting.
- **What this knowingly gives up.** No live token-level streaming of a remote child into dsh's session log; no shared history; no unified tool catalog; no unified cost ledger. These are the deliberate price of invariant 1–3, and reversing any of them is a different design, not a refinement of this one.

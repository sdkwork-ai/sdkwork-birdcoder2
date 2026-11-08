# Agent Note: The desktop shell reloads onto current boot rows, and its event stream runs on fetch

Status: implemented

English | [中文](2026-11-08-desktop-boot-injections-and-stream-carrier.zh.md)

## Problem

Two desktop-only failures shared one cause: the shell owns the document, so nothing that a served `dsh web` page gets for free on every load was current.

The shell serves `dsh-app://app/` itself and asks the Host over private IPC for the boot injection rows once, when the Host reports ready. Nothing refreshes them afterwards. Client bundles and the plugin graph keep changing while the Host runs: an HMR rebuild publishes a new bundle revision, and a plugin install, enable, or disable recomposes the graph. A reload after such a change replayed the startup rows, whose blocking bootstrap script names `plugins/??@deepseek-ai/dsh-client-modules/client.js&rev=<old>`. The Host's bundle route is an exact-route table keyed by the current revision, so it answered 404, `__ModuleLoader__.create` never got its bootstrap registration, and the window stayed on its "Loading plugins…" face. Observed in the running online development app: the page requested `...&rev=3d2fe526c30f` while the Host's current graph named `...&rev=1a16ee674e32`; the same probe through the scaffold's served composition answered 200 because that Host renders its index from live state per request.

The client HMR transport opened `plugins/events` with the browser `EventSource`. Chromium cannot stream that route from a custom-scheme document: it completes the request (status 200) and then fails the connection (`net::ERR_FAILED`). The desktop page therefore never received the initial graph or `rebuilt` frames, so it could neither hot-replace a rebuilt plugin nor notice a graph change, and a reload was the only recovery — the reload that then hit the stale rows above.

A lost inject face surfaced as a crash instead of an unavailable bar. When a registration's `inject` factory throws (a session or service left between registration and render), `ui-renderer` intentionally mounts the entry without injected props. The composer body is built entirely from those props, so `InputBar` called an injected hook that was not there, crashed, and its session-scoped child slots threw `SlotAssemblyError` through the conversation tree: three console errors for one lost service.

## Decision

`boot-injections` joins the shell-to-Host control requests beside `update-tasks` and `quit-inspection`. The Host answers with `collectIndexInjections(ctx.connection.browserPeer)`, computed fresh per request, and the shell asks on every `DESKTOP_IPC.boot`, replacing its cache before composing the reply. The startup `ready` payload still supplies the first rows and the offline fallback: if the control request fails or times out, the page boots from the last rows rather than failing. The refresh is deliberately per boot, not pushed on graph changes — the page that is already running learns about rebuilds through the event stream, and only a fresh document needs fresh rows.

The HMR browser half chooses its carrier from the document owner: a shell-provided transport first (the worker preview tunnel), native `EventSource` on an http(s) document, and a `fetch` reader on any other scheme. Both fetch paths now share one reconnect loop: a closed or failed stream retries after one second, one error is logged per outage, and the first received frame clears the outage so a later failure is reported again. The desktop page reads the same `plugins/events` bytes through the same request pipeline as its other app routes.

`InputBar` keeps its inject-bound body behind a guard. When the injected hook seats are absent, the public entry renders an inert dock (`data-composer-unavailable`) and never enters the body, so the body's hooks are called only with the seats they require and no child slot is rendered from a broken face. The unavailable face holds the composer's layout without claiming a session, a draft, or any conversation behavior.

## Verification

`packages/client/hmr/tests/transport-fallback.client.spec.ts` pins carrier selection on http(s) versus `dsh-app:`, the fetch request shape, reconnect after a refused stream with one report per outage, and silence when disposal aborts an in-flight attempt; the existing transport suites still cover the shell transport, frame containment, and EventSource.

`apps/desktop/tests/host-process.spec.ts` drives the new control request through a real child process and asserts the correlated rows; `apps/desktop/tests/main-startup.spec.ts` boots twice and asserts each boot returns the rows the Host reports now, not the rows captured at startup.

`packages/client/ui-conversation/tests/input-bar.client.spec.tsx` renders the public entry with no injected props and asserts the unavailable dock with no editor.

`pnpm exec tsc -b packages/client/hmr/tsconfig.json packages/client/ui-conversation/tsconfig.json apps/desktop-host/tsconfig.json apps/desktop/tsconfig.json` passes.

A probe of the shipped Web composition (`launchWebScaffold`, real Loader, real Chromium) showed `POST /api/botharness/appearance-control` answering 200 with a client registration, so the appearance-control 404 reported alongside the desktop failures is a symptom of the Host being replaced while the page polled, not a missing route; the boot-freshness and stream fixes remove the state in which that poll could not recover.

End to end, the online development shell was restarted with the rebuilt shell, Host, and client bundles, then reloaded under the running DevTools connection. The page booted with a live composer, no `[data-slot-error]`, `[data-factory-error]`, or `[data-composer-unavailable]` node, and no request failure; the single `GET dsh-app://app/plugins/events` was served through the fetch carrier (no `EventSource`/`net::ERR_FAILED` entry), and `POST dsh-app://app/api/botharness/appearance-control` answered 200 both from the plugin poll and from a probe. The only console output left was Electron's development CSP warning and two informational `[mcp-connector]` lines.

## Alternatives considered

**Push fresh rows from the Host whenever the graph changes.** Rejected: the running page already receives the graph over the event stream, so a push would duplicate that channel for the one consumer that needs it only at document load, and it would couple the Host's graph publication to a shell IPC protocol.

**Read the Host-rendered index instead of the shell's dist.** Rejected: the shell owns its document on purpose (first paint, offline and crash faces, the boot-ready gate), and the served index would make the shell depend on the Host's HTTP listener before boot.

**Keep `EventSource` and special-case only the network error.** Rejected: the failure is a transport limitation, not a status the page can classify; the fetch reader is the same protocol implementation the shell tunnel already used, so one reader covers both carriers.

**Let `InputBar` decide per hook.** Rejected: React forbids conditional hook calls, and a partial face is not a state the body models; the guard belongs at the entry boundary where the missing face is already known.

## Consequences

A desktop reload after a rebuild, plugin install, or plugin disable now boots the current graph. The cost is one extra IPC round trip per page boot (bounded by the existing control deadline and falling back to the cached rows), and the Host must keep the control handler registered for the shell's lifetime.

The desktop event stream now reconnects on its own after a Host restart, at the price of a one-second delay and one log line per outage; the page no longer depends on `EventSource`'s browser-owned retry behavior.

The composer's lost-inject state renders an inert bar rather than throwing. The slot still logs the inject failure through `ui-renderer`, which remains the diagnostic, but the failure no longer cascades into the session scope.

# Agent Note: The Markets mode is a public surface browsable signed out

Status: implemented

English | [中文](2026-09-06-sdkwork-markets-public-mode.zh.md)

## Problem

The marketplace shipped behind the shared IAM gate: `markets` sat in `ui-sdkwork-iam`'s `AUTHENTICATED_APP_MODES`, `MarketsPage` mounted through `AuthenticatedSdkworkModePage`, and a signed-out visitor switching to the mode got the sign-in overlay plus an auth-required notice instead of the page. The mode has no IAM-session-bound capability — the tab shell browses nothing account-scoped and the add flows dispatch prompts like any other surface — so the gate hid the mode while protecting nothing. A market's contract matches the Token Plan precedent: browse anonymously, sign in only when an action needs a session.

## Decision

`markets` is not in `AUTHENTICATED_APP_MODES`. `MarketsPage` renders its outer shell (`data-mode`, `data-mode-page`, `data-markets-surface`) directly and mounts no IAM session face: the page injection carries no `authGate`, the plugin's service `inject` list has no `iam` entry, and `ui-sdkwork-markets` declares no ui-sdkwork-iam dependency (peer/dev, `dsh.client.inject`, or tsconfig reference). The `auth.required.*` signed-out copy stays out of the markets dictionaries. Mode dispatch needs no change: `requestAuthenticatedMode` reads the list, so switching to Markets signed out only switches, while still-gated modes keep the overlay. A future session-bound action (for example a catalog action that needs an account) wires its own sign-in at the action, the way Token Plan opens sign-in at checkout — not by re-gating the page.

## Alternatives considered

**Keep the gate and render a signed-out preview of the page.** Two renderings of the same chrome to maintain, and the preview would show exactly what the gate currently hides, so the gate protects nothing while dropping the anonymous-browsing contract.

**Leave the page gated and gate each future catalog action instead.** The gate would still blank today's shell signed out, and gating inside actions leaves the page's public contract unstated; the market is public as a whole, and each action adds its own session requirements when real account-bound work lands.

## Consequences

A signed-out visitor sees the full market page; the sign-in overlay no longer opens on switching to the mode, and the markets package has no ui-sdkwork-iam dependency edge at all. Coverage pins the behavior on both sides of the seam: `ui-sdkwork-iam`'s `authenticated-mode.client.spec.ts` pins the list membership and the signed-out dispatch, and the `ui-sdkwork-markets` specs pin the gate-free injection and the signed-out rendering.

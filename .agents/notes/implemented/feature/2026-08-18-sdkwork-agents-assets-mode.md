# Agent Note: SDKWork Agents generated-assets mode

Status: implemented

English | [中文](2026-08-18-sdkwork-agents-assets-mode.zh.md)

## Problem

The rail's Assets icon opens the placeholder page contributed by `@deepseek-ai/dsh-client-ui-assets`. It needs to show the SDKWork Agents asset library instead: the media assets persisted by generation tool invocations, in the shape of the Assets view in the SDKWork Agents PC application (kind filters, date-grouped grid, detail panel).

## Decision

`@deepseek-ai/dsh-client-ui-generations-assets` is an independent mode plugin that takes over the `assets` mode from the placeholder. Its keyed `mode.rail.entry` and `mode.page` registrations carry priority `-10`, shadowing the placeholder's default-priority registrations: the slot registry renders the lowest live priority per cell, so the real library wins while `ui-assets` stays untouched as the crash fallback — no placeholder package deletion, no ownership split.

The page mirrors the SDKWork Agents assets view: kind filters (all, image, video, audio, other; `music`/`sound-effect`/`voice` map to audio), a date-grouped grid (RFC3339 date part, unknown bucket for missing creation times), and a detail panel for the selected asset showing the preview, producing tool id, creation date, and Drive URI. Data comes from the agents media-tool channel's `client.ai.agents.assets.list()` endpoint through the same generated `@sdkwork/agents-app-sdk` client the generation plugins use; the adapter follows the same environment/IAM/versioning pattern and narrows the wire payloads (`toolId`, `toolCallId`, `mediaKind`, `driveUri`, optional `sourceUrl`/`createdAt`).

## Alternatives considered

| Rejected | Reason |
|---|---|
| Evolve `ui-assets` into the library | The requested plugin name and the generation-series naming (`ui-generations-*`) call for a new package; mutating the committed placeholder would entangle two workstreams |
| Delete `ui-assets` | Its placeholder registrations are a committed surface with uncommitted third-party edits; shadowing removes the need for any destructive change |
| Resolve preview URLs through the Drive SDK | The agents assets endpoint reports `driveUri` without fresh download URLs; the Drive round-trip is deferred, cards fall back to the tool-result `sourceUrl` or a media-kind badge |
| List through `drive.assets.list` | The agents assets channel is the deployment's own generated-assets record and matches the plugin family's single-SDK closure |

## Consequences

Clicking the Assets rail icon replaces the placeholder with the SDKWork Agents asset library; the placeholder registrations remain on the ledger as the shadowed fallback. Assets requests stay browser traffic and add no Harness prompt content, tools, session events, or KV Cache input. Without credentials the generated client rejects the protected list request before network dispatch and the page offers a retry state.

## Verification

Service tests pin environment configuration, credential precedence, IAM invalidation, stale-response suppression, client reuse per base URL, and payload narrowing. Component and plugin tests pin shadow-priority keyed registration, rail navigation, filters, date grouping, every request state, the detail panel (including the unknown-date bucket and other-kind previews), and teardown. The assembled web mode test clicks the Assets entry, verifies the library renders and the anonymous fixture rejects before dispatch with no `fetch` calls, and confirms the mode rail still carries one Assets button despite the double registration.

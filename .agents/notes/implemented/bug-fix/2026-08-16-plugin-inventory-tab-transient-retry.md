# Agent Note: Plugin inventory tab recovers from transient RPC failures

Status: implemented

English | [中文](2026-08-16-plugin-inventory-tab-transient-retry.zh.md)

## Problem

The settings center's Plugin list tab fetched the Loader inventory exactly once per mount and treated any RPC failure as terminal: the tab showed 暂时无法读取插件 with only a manual retry. A transient failure — a client-boot race with the remote namespace mount, an HMR remount, or a connection blip — left the surface stranded in the error state even though the Host had recovered moments later. The copy itself promises temporariness, so a dead-end error contradicted the surface's own contract.

## Decision

`PluginInventorySettingsTab` retries a failed `list()` automatically before giving up: up to two retries with exponential backoff (500 ms base, doubling), then the existing error state with its manual retry. The loading state persists across the automatic retries; the manual retry resets the retry budget. The budget is a small fixed product constant — the surface keeps fetching once per mount and only on demand, and the manual retry remains the terminal fallback for persistent failures.

## Alternatives considered

**Keep the one-shot fetch and manual retry (status quo).** Rejected because the reported failure mode is transient by nature; a dead-end error requires the user to discover the retry button and contradicts the temporarily copy.

**Retry without a bound.** Rejected because a persistent Host-side failure (disabled gateway, missing service) would spin the RPC forever.

**Re-fetch when the connection re-establishes.** Rejected as a larger change for the same outcome: the tab has no connection handle today, and the bounded backoff covers the same transient window.

## Consequences

A transient failure now self-heals within about 1.5 seconds; a persistent failure still lands on the generic error with the manual retry. Component tests cover the transient recovery, budget exhaustion, and the synchronous-failure path. No wire, DTO, or Host change.

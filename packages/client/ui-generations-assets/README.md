# @deepseek-ai/dsh-client-ui-generations-assets

English | [中文](README.zh.md)

The SDKWork Agents generated-assets application mode. This browser plugin owns the `assets` rail entry, the localized asset library page, and the SDKWork Agents listing adapter. It registers keyed `mode.rail.entry` and `mode.page` contributions; clicking the entry selects `assets` in the layout store, and the frame renders the page in the center column. The registrations shadow the placeholder entries of [ui-assets](../ui-assets/README.md) at a lower priority, so the real library renders while the placeholder package stays untouched.

## Asset library

The page lists the media assets persisted by Agents tool invocations through the generated `@sdkwork/agents-app-sdk` client. Filters narrow the list client-side; the page renders each asset's preview and offers the actions the SDKWork media surface supports.

## Runtime requirements

The active [ui-env](../ui-env/README.md) profile supplies the API base URL and optional static access token. An empty base URL renders a configuration notice and creates no SDKWork client. A static environment token takes precedence over the current [ui-iam](../ui-iam/README.md) session; without either credential, the generated SDKWork client rejects protected listing requests before network dispatch and the page offers a retry state. Environment and IAM changes invalidate in-flight requests so an older response cannot replace current library state.

## Model Experience

None, as mode selection, listing requests, and SDKWork HTTP responses remain browser viewing state and add no model request content, tools, or session events.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Read-only listing** — the page presents assets returned by the Agents media channel; upload, delete, and move actions are not exposed.
- **Online authenticated listing** — there is no offline cache or anonymous fallback when the deployed Agents API requires an SDKWork access token.

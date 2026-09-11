---
description: "Package map for the web GUI browser half: shell boot, browser-host communication, shared client services, localization, development reload, and the UI feature plugins."
kind: "package-group"
---

# client/ — web-GUI browser half

English | [中文](README.zh.md)

## Summary

The `client/` group provides the browser experience for the dsh web GUI, including conversation, navigation, settings, approvals, file access, and other interactive features. Choose packages from this family when adding browser-visible behavior; use [`host/`](../host/README.md) for server-side page delivery and host integration. Packages cover both the shared browser foundation and focused UI features, while each child README owns its configuration and behavior. Authoring rules live in [AGENTS.md](AGENTS.md), and the related documentation below explains cross-package composition.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

The kernel packages boot and serve the page; the UI feature packages present it. Each package README owns its contract and configuration.

| Package | Role | ctx key |
|---|---|---|
| [`web/`](web/README.md) | Boots the browser shell | — |
| [`modules/`](modules/README.md) | Loads browser-side client modules | `ctx.clientModules` / `ctx.modules` |
| [`connection/`](connection/README.md) | Maintains browser-host RPC communication and event delivery | `ctx.connection` |
| [`file-upload/`](file-upload/README.md) | Sends raw Blob and byte-stream request bodies outside the page thread | `ctx.fileUpload` |
| [`store/`](store/README.md) | Provides React-free observable and snapshot-store primitives | — |
| [`hmr/`](hmr/README.md) | Refreshes client plugins during development | — |
| [`locale/`](locale/README.md) | Provides localization preferences and message dictionaries | `ctx.locale` |
| [`test-runtime/`](../test-support/client-runtime/README.md) | Shared repository test support for client feature packages | — |
| [`ui-renderer/`](ui-renderer/README.md) | Binds slot data to React and mounts the assembled application | `ctx.uiRenderer` |
| [`ui-slots/`](ui-slots/README.md) | Defines how UI features register and compose extension slots | — |
| [`ui-session/`](ui-session/README.md) | Adapts Session Controller state into standard Slot sources and hooks | — |
| [`ui-theme/`](ui-theme/README.md) | Applies the selected color theme | — |
| [`ui-primitives/`](ui-primitives/README.md) | Provides shared React controls, icons, and content renderers | — |
| [`ui-attachment/`](ui-attachment/README.md) | Registers composer and message-image attachment presentation | — |
| [`ui-layout/`](ui-layout/README.md) | Arranges the main application regions | — |
| [`ui-sdkwork-app-modes/`](ui-sdkwork-app-modes/README.md) | Provides the app-mode rail shell and the two base mode entries and one placeholder page | — |
| [`ui-sdkwork-appstore/`](ui-sdkwork-appstore/README.md) | Provides the SDKWork-backed App Store mode as an independent plugin | — |
| [`ui-sdkwork-generations-image/`](ui-sdkwork-generations-image/README.md) | Provides the SDKWork Agents image generation mode as an independent plugin | — |
| [`ui-sdkwork-generations-video/`](ui-sdkwork-generations-video/README.md) | Provides the SDKWork Agents video generation mode as an independent plugin | — |
| [`ui-sdkwork-generations-assets/`](ui-sdkwork-generations-assets/README.md) | Provides the SDKWork Agents generated-assets library mode as an independent plugin | — |
| [`ui-sdkwork-knowledge/`](ui-sdkwork-knowledge/README.md) | Provides the SDKWork-backed Knowledge Base mode as an independent plugin | — |
| [`ui-sdkwork-course/`](ui-sdkwork-course/README.md) | Provides the SDKWork-backed Course mode as an independent plugin | — |
| [`ui-sdkwork-drive/`](ui-sdkwork-drive/README.md) | Provides the SDKWork-backed Drive mode as an independent plugin | — |
| [`ui-sdkwork-assets/`](ui-sdkwork-assets/README.md) | Provides the Assets mode as an independent module | — |
| [`ui-sdkwork-token-plan/`](ui-sdkwork-token-plan/README.md) | Provides the SDKWork membership and commerce mode as an independent plugin | — |
| [`ui-sdkwork-pptx-preview/`](ui-sdkwork-pptx-preview/README.md) | Draws `.pptx` presentations in the right Sidebar's document tab with an offline OOXML renderer | `ctx.documentPreviews` |
| [`ui-sdkwork-docx-preview/`](ui-sdkwork-docx-preview/README.md) | Draws `.docx` documents in the right Sidebar's document tab with an offline WordprocessingML renderer | `ctx.documentPreviews` |
| [`ui-sdkwork-xlsx-preview/`](ui-sdkwork-xlsx-preview/README.md) | Draws `.xlsx` workbooks in the right Sidebar's document tab with an offline SpreadsheetML renderer | `ctx.documentPreviews` |
| [`ui-sdkwork-pdf-preview/`](ui-sdkwork-pdf-preview/README.md) | Draws `.pdf` documents in the right Sidebar's document tab with a page rail and a selectable text layer | `ctx.documentPreviews` |
| [`ui-sdkwork-image-preview/`](ui-sdkwork-image-preview/README.md) | Draws images in the right Sidebar's document tab with format sniffing, a zoom and rotation stage, and a baseline TIFF decoder | `ctx.documentPreviews` |
| [`ui-sdkwork-video-preview/`](ui-sdkwork-video-preview/README.md) | Plays video in the right Sidebar's document tab with container and codec identification from the bytes and a full transport bar | `ctx.documentPreviews` |
| [`ui-sdkwork-audio-preview/`](ui-sdkwork-audio-preview/README.md) | Plays audio in the right Sidebar's document tab with container, codec, tag and cover-art reading from the bytes | `ctx.documentPreviews` |
| [`ui-sidebar/`](ui-sidebar/README.md) | Presents workspace and session navigation | — |
| [`resources/`](resources/README.md) | Unified resource model: protocol providers behind the `useResource` session standard hook | `ctx.resources` |
| [`ui-sidebar-files/`](ui-sidebar-files/README.md) | Right-Sidebar workspace file tree tab type | — |
| [`ui-brand-official/`](ui-brand-official/README.md) | Fills the generic browser-brand slots with the official name and marks | — |
| [`ui-workspace/`](ui-workspace/README.md) | Provides workspace selection and creation surfaces | — |
| [`ui-conversation/`](ui-conversation/README.md) | Presents the active conversation and its input surface | — |
| [`ui-chat/`](ui-chat/README.md) | Projects and renders the Chat conversation target | — |
| [`ui-approval/`](ui-approval/README.md) | Presents approval requests and returns user decisions | — |
| [`ui-tool/`](ui-tool/README.md) | Composes Tool call trees and keyed per-Tool views | — |
| [`ui-workflow-run/`](ui-workflow-run/README.md) | Replays durable workflow runs as nested chat disclosures | — |
| [`ui-goal/`](ui-goal/README.md) | Presents and manages the current goal | — |
| [`ui-trajectory/`](ui-trajectory/README.md) | Presents alternate views of agent activity | — |
| [`ui-commands/`](ui-commands/README.md) | Provides session-aware command discovery and dispatch | — |
| [`ui-input-trigger/`](ui-input-trigger/README.md) | Coordinates inline command and reference suggestions | — |
| [`ui-skill/`](ui-skill/README.md) | Adds skill references to inline suggestions | — |
| [`ui-reference/`](ui-reference/README.md) | Unified Web `@file` / `@session` reference source | — |
| [`ui-subagent/`](ui-subagent/README.md) | Provides subagent navigation, child transcript states, and inline references | — |
| [`ui-schedule/`](ui-schedule/README.md) | Lists the current Session's active reminders in a read-only header catalog | — |
| [`ui-jobs/`](ui-jobs/README.md) | Lists this session's background jobs in the conversation header | — |
| [`ui-model-selection/`](ui-model-selection/README.md) | Provides model selection in conversation surfaces | — |
| [`ui-permission-presets/`](ui-permission-presets/README.md) | Configures default permissions and switches the current session's access | — |
| [`ui-plan/`](ui-plan/README.md) | Presents active plan-mode status and its exit control | — |
| [`ui-settings-plugins/`](ui-settings-plugins/README.md) | Owns the Plugins settings section, its tab extension point, and configurable host-plane plugin cards | — |
| [`ui-user-questions/`](ui-user-questions/README.md) | Presents interactive questions requested by the agent | — |
| [`ui-agent-preset/`](ui-agent-preset/README.md) | Selects a session's agent preset and authors preset compositions | — |
| [`ui-settings/`](ui-settings/README.md) | Hosts the settings interface and its extension areas | — |
| [`ui-settings-general/`](ui-settings-general/README.md) | Provides the general settings section | — |
| [`ui-settings-models/`](ui-settings-models/README.md) | Provides model-provider configuration and DeepSeek onboarding | — |
| [`ui-settings-plugin-inventory/`](ui-settings-plugin-inventory/README.md) | Contributes the read-only Host Loader inventory tab to Plugins settings | — |
| [`ui-deliverables/`](ui-deliverables/README.md) | Produces the produced-files turn tail and clickable final-response file references | — |
| [`ui-message-feedback/`](ui-message-feedback/README.md) | The feedback surface: per-message Like/Dislike in the assistant-message action strip, and the feedback dialog behind Dislike and `/feedback` | — |
| [`ui-directory-picker-browse/`](ui-directory-picker-browse/README.md) | In-app directory browsing surface for the workspace directory flow | — |
| [`ui-directory-picker-native/`](ui-directory-picker-native/README.md) | Native directory-picker surface driving the host's OS chooser | — |
| [`ui-open-in-app/`](ui-open-in-app/README.md) | Session-header split button opening the workspace directory in an installed application | — |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem reference and the two notes that own the cross-package composition decisions, then the host half that serves this page.

- [Client modules subsystem](../../docs/subsystems/client-modules.md) — the web plugin table: `dsh.client` declarations, the boot graph wire, and the bundle route.
- [Slot system standard](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) — the definitive slot model: registration, props shares, and stores.
- [Web client architecture note](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) — the loading chain, object layer, and client services.
- [Host group map](../host/README.md) — the host half that serves this browser half.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

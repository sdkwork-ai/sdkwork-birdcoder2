# Agent Note: SDKWork Agents generation modes — image and video plugins

Status: implemented

English | [中文](2026-08-18-sdkwork-agents-generation-modes.zh.md)

## Problem

The rail's Video and Image icons open the [app-mode rail](2026-08-16-sidebar-app-modes.md) placeholder pages. Both modes need to reach SDKWork Agents' generation capability: the image icon should generate images, and the video icon should generate videos from a prompt. The SDKWork Agents PC application is private and heavy (router, auth shell, canvas), while BirdCoder already owns mode navigation, deployment configuration, authentication, locale, and browser plugin loading.

## Decision

`@deepseek-ai/dsh-client-ui-generations-image` and `@deepseek-ai/dsh-client-ui-generations-video` are independent mode plugins in the app-mode rail. Video and Image leave the `ui-app-modes` base set (`BASE_MODES` becomes `code | work`), and each generation plugin owns its glyphs, copy, and keyed page — the same independence App Store and Knowledge Base modes have.

Both plugins call the SDKWork Agents media-tool channel through the generated `@sdkwork/agents-app-sdk` client (`client.ai.agents.tools.invoke`). The image plugin's generation input is the **image input**: a prompt composer that submits `image.generations.create` (text-to-image, default model, one 1024×1024 image). The video plugin's generation input is the **video input**: a prompt composer that submits `video.create` (text-to-video, default model, five seconds, 1280×720) and then polls `video.retrieve` every 1.5 seconds until the task completes or fails (40-poll budget).

The generation adapter follows the [App Store catalog adapter](2026-08-17-sdkwork-appstore-mode-integration.md): it reads the API base URL and static access token from `ctx.env`, adopts `ctx.iam` session tokens only when the environment token is empty, lazily creates one client per base URL, and advances a request version on environment, credential, and disposal changes so stale responses or polls cannot publish over current state. The video adapter's polling loop re-checks the version after every delay and every retrieve, so an environment switch abandons the task without publishing.

## Type and bundle integration

Each package follows the App Store plugin's split: declaration emit resolves SDKWork imports to package-local declaration facades (`sdkwork-types/agents-app-sdk.d.ts`, `sdkwork-types/sdk-common.d.ts`), the dedicated no-emit tests project compiles the consumed SDKWork source closure against the real `sdkwork-agents-app-sdk-typescript` sources, and the browser bundle resolves the real sources to inline the generated client in one `client.js`. The SDK's public client surface is `ai.agents.tools` (`AiApi.agents` → `AiAgentsApi.tools`), so the adapters narrow the response `output` payloads at the wire boundary (`taskId`, `status`, `url`, `images`).

## Alternatives considered

| Rejected | Reason |
|---|---|
| Keep Video and Image as `ui-app-modes` placeholders | The shell package would own SDKWork business behavior, and the two modes would split glyph/copy ownership across packages |
| Mount the private SDKWork Agents PC application | Its router, auth shell, canvas, and private closure conflict with BirdCoder's keyed page and host-owned services |
| Call `sdkwork-generations` (`@sdkwork/generations-app-sdk`) directly | The agents media-tool channel is the capability already exposed by the deployment's app API, and it covers both text-to-image and text-to-video through one client |
| Let the video adapter publish each poll | A per-poll snapshot churn would re-render the page forty times; the page needs only generating → ready/error |

## Consequences

Clicking the Video rail icon replaces the Code conversation with the video generation surface (video input composer plus player), and the Image icon opens the image generation surface (image input composer plus result grid); returning to Code restores the workbench. Generation requests remain browser traffic and add no Harness prompt content, tools, session events, or KV Cache input. The modes depend on a configured SDKWork API and credentials accepted by that deployment; without credentials the generated client rejects protected invocations before network dispatch and the page offers a retry state.

## Verification

Service tests pin environment configuration, credential precedence, IAM invalidation, stale-response and stale-poll suppression, client reuse per base URL, output narrowing, and the video poll lifecycle (processing, completed without URL, failed, exhausted budget). Component and plugin tests pin keyed registration, rail navigation, the composer (trimmed submit, empty-draft guard), every request state, and teardown. The assembled web mode test clicks the Video and Image entries, submits prompts, and proves the anonymous fixture rejects before network dispatch with no `fetch` calls. The dedicated SDKWork source typechecks and the browser bundles pin the real generated-client integration.

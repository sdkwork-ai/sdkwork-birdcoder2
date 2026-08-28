---
description: "SDKWork Agents video generation application mode: the video rail entry mounting the Agents PC creative surface into the keyed mode.page seat with a video default."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-generations-video

[English](README.md) | 中文

## 概述


SDKWork Agents 视频生成应用模式。此浏览器插件持有 `video` 模式栏条目，并将 SDKWork Agents PC **生成** 页面——与 [sdkwork-agents](https://github.com/sdkwork-ai/sdkwork-agents) 侧栏 **生成** 标签相同的页面——挂载到 keyed 的 `mode.page` 席位。它注册 keyed 的 `mode.rail.entry` 与 `mode.page`；点击条目会在 layout store 中选择 `video`，框架随后在中心列渲染嵌入的 [`CreativeView`](../../../../sdkwork-agents/apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-creative/src/CreativeView.tsx)。该模式原先由 [ui-sdkwork-app-modes](../ui-sdkwork-app-modes/README.zh.md) 持有为基座占位页；本插件接管其图标、文案与页面。

## 目录

- [嵌入页面](#embedded-surface)
- [运行要求](#runtime-requirements)
- [Model Experience](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 嵌入页面

BirdCoder 不在本地重新实现生成 UI。宿主适配器（`creativeHost.ts`）将 [ui-sdkwork-env](../ui-sdkwork-env/README.zh.md) 与 [ui-sdkwork-iam](../ui-sdkwork-iam/README.zh.md) 映射到 Agents PC 会话存储与 SDK 客户端 provider，随后挂载 `@sdkwork/agents-pc-creative` 的 `CreativeView` 及 Agents 工作台 i18n 目录。嵌入输入框默认选中**视频**生成；图片与其他模态仍可在同一对话框中切换。图片生成由兄弟插件 [ui-sdkwork-generations-image](../ui-sdkwork-generations-image/README.zh.md) 承载同一页面，默认选中**图片**。

## 运行要求

活动的 [ui-sdkwork-env](../ui-sdkwork-env/README.zh.md) profile 提供 API 网关 origin、应用 id 与可选的静态 access token。基础 URL 为空时跳过 SDK 客户端装配；嵌入页面仍会挂载，但在配置网关前生成请求无法成功。静态环境 token 或交互式 [ui-sdkwork-iam](../ui-sdkwork-iam/README.zh.md) 会话（同时含 `accessToken` 与 `authToken`）为 Agents PC token manager 供凭据。环境与 IAM 变化通过客户端 remount 与会话重同步使进行中的请求失效。

## Model Experience

无，因为模式选择与 SDKWork HTTP 响应只属于浏览器查看状态，不添加模型请求内容、工具或会话事件。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## 已知限制与延后工作

- **video 模式承载完整生成页** — 模式栏 key 为 `video`，但嵌入的是 Agents 完整 creative 工作台（全部生成模态），与 sdkwork-agents 侧栏 **生成** 一致，而非仅视频子集。
- **在线认证生成** — 当部署的 Agents 或 Generations API 要求带 tenant 上下文的 SDKWork access token 时，没有离线缓存或匿名回退。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

模式栏 key 是 `video`，但嵌入的是与 ui-sdkwork-generations-image 共享的 Agents 完整 creative 工作台——两个插件只在对话框的默认模态上不同，Agents PC 表面变更时 `creativeHost.ts` 与兄弟图片插件的适配器必须同步修改。基础 URL 为空时页面仍会挂载，但配置网关前生成请求无法成功。

</details>

# @deepseek-ai/dsh-client-ui-generations-video

[English](README.md) | 中文

SDKWork Agents 视频生成应用模式。此浏览器插件持有 `video` 模式栏条目、本地化视频生成页面与 SDKWork Agents 生成适配器。它注册 keyed 的 `mode.rail.entry` 与 `mode.page`；点击条目会在 layout store 中选择 `video`，框架随后在中心列渲染该页面。该模式原先由 [ui-app-modes](../ui-app-modes/README.md) 持有为基座占位页；本插件接管其图标、文案与页面。

## 生成输入

页面的输入是**视频输入**：一个描述待生成视频的提示词编辑器。提交编辑器会通过 `@sdkwork/agents-app-sdk` 的 agents 媒体工具通道调用 `video.create` 工具（文生视频，模型 `default`，时长五秒，1280×720），随后每 1.5 秒轮询 `video.retrieve`，直到任务完成或失败（最多 40 次）。提交后的提示词会在新一轮后回填到编辑器草稿，重试动作会以相同提示词重新执行。

## 运行要求

活动的 [ui-env](../ui-env/README.md) profile 提供 API 基础 URL 与可选的静态 access token。基础 URL 为空时，页面显示配置提示且不创建 SDKWork 客户端。静态环境 token 优先于当前 [ui-iam](../ui-iam/README.md) 会话；两者都没有时，生成的 SDKWork 客户端会在网络分发前拒绝受保护的生成请求，页面则提供重试状态。

图片与音频生成分别属于兄弟插件 [ui-generations-image](../ui-generations-image/README.md) 与下述延后工作。环境与 IAM 变化会使进行中的请求失效，因此旧响应不能覆盖当前的生成状态。

## Model Experience

无，因为模式选择、生成请求与 SDKWork HTTP 响应只属于浏览器查看状态，不添加模型请求内容、工具或会话事件。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## 已知限制与延后工作

- **仅文生视频** — 编辑器只发送一次 `video.create` 请求，使用默认模型、时长五秒与固定 1280×720 尺寸；图生视频与视频生视频的源输入，以及模型、时长、尺寸参数尚未开放。
- **不做持久化** — 结果以轮询返回的 provider 资源 URL 直接呈现；`saveToDrive` 与 drive 资源流程未使用。
- **在线认证生成** — 当部署的 Agents API 要求 SDKWork access token 时，没有离线缓存或匿名回退。

# Agent Note: SDKWork Agents 生成模式——图片与视频插件

Status: implemented

[English](2026-08-18-sdkwork-agents-generation-modes.md) | 中文

## 问题

模式栏的视频与图片图标打开的是 [app-mode rail](2026-08-16-sidebar-app-modes.md) 的占位页。两个模式都需要接入 SDKWork Agents 的生成能力：图片图标应能生成图片，视频图标应能根据提示词生成视频。SDKWork Agents PC 应用是私有且重量级的（路由、认证壳、画布），而 BirdCoder 已经持有模式导航、部署配置、认证、语言与浏览器插件加载。

## 决策

`@deepseek-ai/dsh-client-ui-generations-image` 与 `@deepseek-ai/dsh-client-ui-generations-video` 是 app-mode rail 中的独立模式插件。视频与图片从 `ui-app-modes` 基座集合移出（`BASE_MODES` 变为 `code | work`），每个生成插件持有自己的图标、文案与 keyed 页面——与应用商店、知识库模式相同的独立性。

两个插件都通过生成的 `@sdkwork/agents-app-sdk` 客户端调用 SDKWork Agents 媒体工具通道（`client.ai.agents.tools.invoke`）。图片插件的生成输入是**图片输入**：提示词编辑器提交 `image.generations.create`（文生图，默认模型，单张 1024×1024）。视频插件的生成输入是**视频输入**：提示词编辑器提交 `video.create`（文生视频，默认模型，时长五秒，1280×720），随后每 1.5 秒轮询 `video.retrieve`，直到任务完成或失败（40 次轮询预算）。

生成适配器遵循[应用商店目录适配器](2026-08-17-sdkwork-appstore-mode-integration.md)：从 `ctx.env` 读取 API 基础 URL 与静态 access token，仅在环境 token 为空时采纳 `ctx.iam` 会话 token，按基础 URL 惰性创建客户端，并在环境、凭证与销毁变化时推进请求版本，使过期响应或轮询不能覆盖当前状态。视频适配器的轮询循环在每次延迟后与每次 retrieve 后都重新检查版本，因此环境切换会放弃任务且不发布结果。

## 类型与 bundle 集成

每个包遵循应用商店插件的拆分：声明发射将 SDKWork 导入解析到包内声明门面（`sdkwork-types/agents-app-sdk.d.ts`、`sdkwork-types/sdk-common.d.ts`）；专用 no-emit 测试工程针对真实的 `sdkwork-agents-app-sdk-typescript` 源码编译所消费的 SDKWork 源码闭包；浏览器 bundle 解析真实源码，将生成的客户端内联进单个 `client.js`。SDK 的公开客户端面是 `ai.agents.tools`（`AiApi.agents` → `AiAgentsApi.tools`），因此适配器在 wire 边界收窄响应 `output` 载荷（`taskId`、`status`、`url`、`images`）。

## 备选方案

| 拒绝的方案 | 原因 |
|---|---|
| 保留 Video 与 Image 为 `ui-app-modes` 占位页 | 壳包会持有 SDKWork 业务行为，两个模式的图标/文案所有权会被拆分到不同包 |
| 挂载私有 SDKWork Agents PC 应用 | 其路由、认证壳、画布与私有闭包和 BirdCoder 的 keyed 页面与宿主服务冲突 |
| 直接调用 `sdkwork-generations`（`@sdkwork/generations-app-sdk`） | agents 媒体工具通道是部署的 app API 已暴露的能力，且通过一个客户端同时覆盖文生图与文生视频 |
| 让视频适配器每次轮询都发布 | 每次轮询的发布会使页面重渲染四十次；页面只需要 generating → ready/error |

## 后果

点击视频模式栏图标会用视频生成界面（视频输入编辑器加播放器）替换 Code 对话，图片图标打开图片生成界面（图片输入编辑器加结果网格）；返回 Code 恢复工作台。生成请求保持为浏览器流量，不添加 Harness 提示词内容、工具、会话事件或 KV Cache 输入。模式依赖已配置的 SDKWork API 与部署接受的凭证；没有凭证时，生成的客户端会在网络分发前拒绝受保护的调用，页面提供重试状态。

## 验证

Service 测试固定环境配置、凭证优先级、IAM 失效、过期响应与过期轮询抑制、按基础 URL 复用客户端、输出收窄，以及视频轮询生命周期（processing、completed 无 URL、failed、预算耗尽）。组件与插件测试固定 keyed 注册、模式栏导航、编辑器（trimmed 提交、空草稿守卫）、每个请求状态与销毁。装配 web 模式测试点击视频与图片条目、提交提示词，并证明匿名 fixture 在网络分发前被拒绝且无 `fetch` 调用。专用 SDKWork 源码类型检查与浏览器 bundle 固定真实的生成客户端集成。

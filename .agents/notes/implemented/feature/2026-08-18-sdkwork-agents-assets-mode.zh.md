# Agent Note: SDKWork Agents 生成资产模式

Status: implemented

[English](2026-08-18-sdkwork-agents-assets-mode.md) | 中文

## 问题

模式栏的资产图标打开的是 `@deepseek-ai/dsh-client-ui-sdkwork-assets` 贡献的占位页。它需要展示 SDKWork Agents 资产库：即生成工具调用持久化的媒体资产，形态参考 SDKWork Agents PC 应用中的 Assets 视图（类型筛选、按日期分组网格、详情面板）。

## 决策

`@deepseek-ai/dsh-client-ui-sdkwork-generations-assets` 是接管 `assets` 模式的独立模式插件。其 keyed 的 `mode.rail.entry` 与 `mode.page` 注册携带 priority `-10`，shadow 掉占位插件的默认优先级注册：slot 注册表按单元格渲染最低存活优先级，因此真实资产库胜出，而 `ui-sdkwork-assets` 保持原样作为崩溃兜底——无需删除占位包，也无需拆分所有权。

页面镜像 SDKWork Agents 资产视图：类型筛选（全部、图片、视频、音频、其他；`music`/`sound-effect`/`voice` 归入音频），按日期分组网格（RFC3339 日期部分，缺失创建时间归入未知桶），以及选中资产的详情面板（预览、生成工具 id、创建日期与 Drive URI）。数据来自 agents 媒体工具通道的 `client.ai.agents.assets.list()` 端点，使用与生成插件相同的生成 `@sdkwork/agents-app-sdk` 客户端；适配器遵循相同的环境/IAM/版本化模式，并在 wire 边界收窄载荷（`toolId`、`toolCallId`、`mediaKind`、`driveUri`，可选 `sourceUrl`/`createdAt`）。

## 备选方案

| 拒绝的方案 | 原因 |
|---|---|
| 将 `ui-sdkwork-assets` 演进为资产库 | 请求的插件名与生成系列命名（`ui-generations-*`）要求新包；改动已提交的占位包会纠缠两个工作流 |
| 删除 `ui-sdkwork-assets` | 其占位注册是已提交表面且带有未提交的第三方改动；shadow 消除了任何破坏性变更的需要 |
| 通过 Drive SDK 换取预览 URL | agents 资产端点报告 `driveUri` 但没有新下载 URL；Drive 往返属于延后工作，卡片回退到工具结果的 `sourceUrl` 或媒体类型徽标 |
| 通过 `drive.assets.list` 列表 | agents 资产通道是部署自己的生成资产记录，且匹配插件家族的单一 SDK 闭包 |

## 后果

点击资产模式栏图标会用 SDKWork Agents 资产库替换占位页；占位注册保留在 ledger 上作为被 shadow 的兜底。资产请求保持为浏览器流量，不添加 Harness 提示词内容、工具、会话事件或 KV Cache 输入。没有凭证时，生成的客户端会在网络分发前拒绝受保护的列表请求，页面提供重试状态。

## 验证

Service 测试固定环境配置、凭证优先级、IAM 失效、过期响应抑制、按基础 URL 复用客户端与载荷收窄。组件与插件测试固定 shadow 优先级 keyed 注册、模式栏导航、筛选、日期分组、每个请求状态、详情面板（含未知日期桶与其他类型预览）与销毁。装配 web 模式测试点击资产条目，验证资产库渲染、匿名 fixture 在网络分发前被拒绝且无 `fetch` 调用，并确认双重注册下模式栏仍只渲染一个资产按钮。

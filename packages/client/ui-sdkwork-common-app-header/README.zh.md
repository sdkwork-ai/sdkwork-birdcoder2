---
description: "把当前非代码模式命名到外壳本就渲染的窗口框架上：将模块标题投影为桌面标题栏与浏览器标签页读取的页面标题的席位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-common-app-header

[English](README.md) | 中文

## 概述

每个非代码应用模式——视频、图片、应用商店、知识库、课程、云盘、资产、定时任务、插件市场、账号、Token Plan，以及工作/文档占位页——都在外壳本就渲染的框架里为自己命名：桌面端的原生标题栏，Web 端的浏览器标签页。切换模式会改写窗口标题；离开模式则还原产品名。代码模式不受影响，因为那里已由会话标题命名窗口。两种组成共用同一套投影，无需维护页内横条。

## 目录

- [运行时不变量](#runtime-invariants)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="runtime-invariants"></a>
## 运行时不变量

不发布运行时不变量伴随检查；它是纯展示插件——不发出 cordis 事件，也不拥有跨插件可变状态。组件规格测试断言标题写入、卸载还原与模式到键的名册；插件规格测试断言注册、字典命名空间，以及 host 入口保持惰性。

框架在 [ui-layout](../ui-layout/README.zh.md) 中声明 `shell.window-title` 席位，并在活动模式不是 `code` 时将其渲染在 keyed `mode.page` 分发之上；该席位接收当前模式与产品标题。本包装配该席位，用一个不渲染任何元素的投影把 `document.title` 写成 `{模块} — {产品}`，并在卸载时还原为裸产品标题。

约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)。

<a id="model-experience"></a>
## 模型体验

无，因为本包只写宿主窗口标题，不注册任何面向模型的内容。

#### KV Cache effect

无；本包从不组装或发送 provider 请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与暂缓事项

该投影跟随框架，因此只命名中列正在显示的那个模式。

- **每个模式 id 都需要一行名册与一行字典**：`MODE_TITLE_KEYS` 是覆盖 `AppModeId` 联合（去掉 `code`）的 `Record`，而 `AppHeaderKey` 由 `appHeader` 字典派生，因此新增模式 id 会让本包的类型检查失败，直到两处都补上行——不存在运行时的兜底标题。
- **代码模式有意排除**：当会话界面占据中列时框架不渲染该席位，因为那里已由会话标题命名窗口。
- **模式页内嵌自己的文档查看器时不会再次改标题**：该投影跟随框架的模式，而不是内嵌表面。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

框架为非代码模式挂载本席位，为代码模式挂载 ui-layout 自己的浏览器标题投影，二者从不同时存在：切换模式会先卸载其一，再跑另一者的 effect，因此两者不会争夺 `document.title`。该席位是框架中列里一个不渲染内容的投影——与 ui-layout 的 DocumentTitle 同形——从而让“模式到标题”的文案留在拥有它的特性里，而不是把 locale 依赖推进框架。

包名是这个契约曾经超出的一环：它原本拥有的是外壳如今不再绘制的页内头部的文案。

</details>

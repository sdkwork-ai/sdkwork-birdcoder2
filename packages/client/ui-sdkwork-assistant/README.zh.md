---
description: "SDKWork 助理：位于首页下方、打开所链接的 persona-bot（Tobs / DeepSeekBot）表面的模式栏图标。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-assistant

[English](README.md) | 中文

## 摘要

助理的产品表面：两列各一个入口。模式栏在首页正下方有一个图标格——产品名称「助理」（英文 "Assistant"），图标为[机器人头像造型](src/client/AssistantIcon.tsx)，采用模式栏的细线权重。左栏的新会话区域在侧栏的 `sidebar.actions` 座位有一个快捷入口，与紧挨着的定时任务入口完全同款：16px 细线图标、助理文案、没有美术字背景、没有角标。两者都打开 persona-bot 层界面，该界面由所链接的 `@botharness/ui` 插件以其 `botharness` 主面板发布。

面板占满整个表面；本包只负责名称、图标和导航。两个入口都通过 `ctx.layout.selectPanel` 选中该面板，与该插件自己的 `sidebar.panellist` 行完全一致，因此中间列显示插件界面，而框架的当前模式仍然是 `code`。由于模式不会切换，模式栏图标的选中态来自主面板选择（`usePanelInfo`），而不是模式栏自身的 `active` 属性；当有面板占用中间列时，模式栏中的各模式图标保持未选中。

插件自己的 `sidebar.panellist` 行——带头像美术字和「试试看」角标——通过 `ctx.sdkworkSidebar.suppressPanel` 被抑制，因此左栏对同一表面只保留一个入口。该抑制跟随侧栏服务，因此没有这一列的部署仍然有模式栏图标。

两个入口都只在那个主面板已注册期间存在：没有组合该插件的部署——停用了它的行的 profile，或没有随包发布 `deepseekbot` 依赖的构建——不会出现死导航，插件卸载时入口随面板一起移除。

## 目录

- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发者说明](#dev-note)

## Model Experience

无。本包只承载面向人的导航界面：打开助理只改变浏览器中的查看状态，不会进入模型请求。

#### KV Cache effect

无；本包既不组装也不发送模型请求。

## 已知限制与后续工作

- **面板标识是已发布的字符串** —— 图标选中 `botharness`，即 `@botharness/ui` 以其 `PANEL_ID` 注册的主面板键。插件不导出可供宿主导入的 id，因此上游改名时需要同步更新本包的 `ASSISTANT_PANEL_ID`。
- **模式 id 属于宿主词汇** —— `assistant` 由本次集成加入 `AppModeId`、模式栏顺序、固定（不可隐藏）模式集合和窗口标题字典。框架永远不会切换到它：它只是图标格的键，真正的表面是主面板选择。
- **图标可重排但不可隐藏** —— 它属于固定模式，自定义弹窗可以移动它但不能取消勾选。若允许隐藏，产品的主打助理表面就可能从模式栏中消失。
- **插件自带的美术字行是被抑制的，不是被改写的** —— `@botharness/ui` 会注册一行用头像图片和「试试看」引导角标绘制的 `sidebar.panellist` 行。本包在助理快捷入口存在期间抑制该行；插件 bundle 保持原样，移除此包即恢复插件自己的行。
- **所链接表面的浏览器与电脑行未挂载** —— 本次集成组合了 `@botharness/core` 与 `@botharness/ui`，没有组合插件可选的 `@botharness/browser`、`@botharness/computer` 能力行。需要 Bot 浏览器与电脑控制的部署应在后续 patch 层中连同其依赖一起添加这些行。

### 开发者说明

<details>
<summary>维护者工作上下文——点击展开</summary>

这次集成有四个接缝，且没有任何一个复制插件：

1. **宿主组合** —— web-app patch 挂载 `@botharness/core`（Bot 注册表、记忆仓库、`/api/botharness/*` 路由、Bot 会话驱动）、`@botharness/ui`（浏览器半）以及核心行指定的 `deepseekbot` agent preset。
2. **可用性** —— 本包的 apply 订阅 `main` 槽位注册表，只在存在键为 `botharness` 的条目时注册模式栏图标与侧栏快捷入口。这是两个包之间唯一的约定，也让导航的生命周期等于面板的生命周期。
3. **导航** —— 两个入口的 inject 面都闭包持有 `ctx.layout.selectPanel('botharness')`；插件的面板渲染界面，插件自己的 `registerModeShadow` 会把左栏换成 Bot 模式侧栏，面板关闭后本 fork 的侧栏恢复。
4. **每列一个入口** —— 本包提供快捷入口期间，`ctx.sdkworkSidebar.suppressPanel('botharness')` 抑制插件自带的 `sidebar.panellist` 行；本插件卸载后恢复该行。

不要重新注册、包装或复制插件的组件树：它通过公开槽位注册 `main`、`sidebar` 和设置分区，这些注册都必须保持属于插件自己。

</details>

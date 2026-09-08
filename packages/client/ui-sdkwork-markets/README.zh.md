---
description: "Markets 应用模式插件：插件市场快捷入口与 keyed 的中心列页面，页头 tab 承载插件、专家、技能、连接器市场，以及基于当前运行应用插件树的本地插件与已安装视图，插件 tab 提供添加入口（skill 引导的插件创建与插件市场录入弹窗）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-markets

[English](README.md) | 中文

## 概述

Markets 应用模式插件拥有 `markets` 侧边栏快捷入口与 keyed 的 `mode.page` 页面。页头左侧是分类 tab 栏（插件、专家、技能、连接器），右侧是目录工具：按分类搜索框，以及插件 tab 上的添加入口。添加触发器打开两项菜单：「创建插件」把技能引导的创建提示词派发到新会话；「添加插件市场」打开录入弹窗，记录市场的来源（GitHub `owner/repo`、Git URL 或本地文件夹，含可选的 Git 引用与稀疏检出路径），并把合成提示词作为一次派发提交。两条流程共用同一提示词派发通道，因为 harness 尚无可直接调用的市场 API。页面是公共的：未登录即可渲染，不挂载 IAM 会话面。

其中两个 tab 不是商店目录：**本地插件**与**已安装**是覆盖本部署自身插件树的视图，通过 Host inventory Remote 读取——与设置中心插件清单 tab 相同的只读数据源。本地插件列出每个 Loader 条目及其来源（本地路径或已发布包）、生效启用状态与根 fiber 阶段；已安装列出当前生效的条目，并为每行提供设置入口。因此市场始终是同一份名单：本应用正在运行的插件，而不是一份会与它静默分叉的清单。

## 目录

- [运行要求](#runtime-requirements)
- [浏览器 bundle](#browser-bundle)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 运行要求

插件通过 `ctx.slots` 注册侧边栏入口与 keyed 页面、通过 `ctx.locale` 注册字典、通过 `ctx.layout` 完成模式切换。页面是公共的：未登录即可渲染，不挂载 IAM 会话面，因此登录前即可浏览目录。插件声明 `slots`、`locale`、`layout`、`sessions`、`workspaces`、`env`、`iam`、`theme`、`remote`、`remote.pluginInventory` 与 `settingsScope`。添加入口需要 sessions 与 workspaces 服务：派发时把框架切到 `code` 模式、运行共享的新会话流程、（有界）等待新会话成为当前会话，再把合成提示词作为排队文本轮发送进去。两个清单 tab 在挂载时与每次手动刷新时读取 `ctx.remote.pluginInventory.list()`（该 Remote 不保留缓存，所以安装后刷新即可看到新树），并依据 `ctx.settingsScope.describe()` 报告的命名空间判定每行设置的可达性——与设置中心插件分区相同的交集规则。

## 浏览器 bundle

客户端插件只发射一个 `client.js` 闭包，样式为自包含的 CSS modules，字形为内联 SVG。它不依赖任何 SDKWork 兄弟检出，本地安装无需额外 workspace 源码。

## Model Experience

提示词派发通道只把用户撰写的文本作为排队文本轮提交；插件本身不添加提示词内容、工具或会话事件。实际的插件创建（由可用的插件创建技能引导）与市场添加（拉取仓库、按需稀疏检出并读取插件清单）由对话代理执行。

#### KV Cache effect

无；两条流程除了提交的提示词文本外不产生提供方可缓存的额外内容。

## Known Limitations and Deferred Work

- **空面板** —— 在每个分类的真实目录界面上线前，面板渲染建设提示或空状态。
- **对话执行的添加入口** —— 创建插件与添加市场通过合成提示词执行，因为尚无直接宿主市场 API；失败在会话内呈现，而非页面内。
- **仅插件 tab 的添加入口** —— 添加触发器只挂在插件 tab；其余 tab 保留惰性的我的目录入口。
- **已安装设置的可达性** —— 只有当本部署为该条目提供了设置命名空间时，该行的设置才可打开；没有命名空间的条目其入口为禁用态，配置本身在会话中完成（对市场自身没有表单的插件来说，这是唯一通道）。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

提示词派发是两条添加入口的唯一执行通道：先调用 `ctx.layout.setMode('code')`，再调用 `ctx.workspaces.startSession()`，在有界超时内等待 `ctx.sessions.list` 落地一个新的当前会话后才发送提示词。若没有会话落地（连接失败、无工作区），框架停留在会话界面，用户可直接操作。添加市场弹窗通过模板替换合成提示词，空白引用与稀疏路径字段使用 locale 属主的回退文案。

</details>

## 运行时不变量

不发布运行时不变量伴随检查；模式状态保存在布局 store 的声明动作集合中，入口/页面注册遵循 keyed 分发；store/模式一致性直接由本包的客户端行为规格测试覆盖。

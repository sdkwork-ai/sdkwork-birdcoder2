---
description: "输入框能力条目：为正在编写的消息选择技能、MCP 服务器或知识库，并作为可编辑的草稿文本插入。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-capabilities

[English](README.md) | 中文

## 概述

在输入框的「添加」区新增三条条目——技能、MCP、知识库：每条都在共享的 popupSelect 面板上打开自己的目录，分别是本会话可被用户调用的技能、已托管的 MCP 服务器、以及当前登录用户的知识库。选中项以可编辑文本落到当前草稿：宿主会展开的 `/名称` 手势、指明本轮应使用哪台 MCP 服务器工具的提示句、或带上本轮检索片段的知识库关联说明。弹窗、搜索、键盘与焦点行为由 `ui-commands` 负责，本包只决定每条条目的含义。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本插件与 `ui-commands`、`ui-conversation` 一起挂载，三条条目就会出现在输入框的「添加」区、文件与目标之间，其余场景不受影响。每条条目同时也是一个可输入的指令（`/skills`、`/mcp`、`/knowledge`），因此同一个选择面板既能从输入框的 `+` 按钮打开，也能从 `/` 菜单打开。条目只在持有绑定的普通会话中可用，子智能体会话不提供。

三条条目各自读取一种能力：

- **技能** 通过 `skills/list` 列出本会话可被用户调用的技能，选中后落成 `/名称 ` 手势。宿主的 tool-skill 前置步骤会识别该手势并注入技能正文，因此效果与手动输入技能指令一致；草稿中已经调用某技能时，该行会被标记为当前值。
- **MCP** 列出 `ctx.remote.mcpManager` 报告的每台服务器，带实时状态（已连接工具数、连接中、重连中、等待凭据、已停用、不可用）与 `mcp__服务器__` 工具前缀。选中项插入一句点名该服务器与前缀的提示句，引导本轮使用这些工具；它不会改动服务器配置。
- **知识库** 通过 SDKWork 知识库目录（`ctx.knowledgeBases`，由 `ui-sdkwork-knowledge` 提供）列出当前登录用户的知识库，按团队与个人分组。若草稿里已经写了问题，选中时还会从所选知识库检索最多五段内容，并以引用行追加。未挂载知识库能力的部署不显示该条目。

所有插入内容都是普通草稿文本：用户可以修改或删除，且在用户发送消息之前不会进入 Agent。

### 选择行为

每次打开面板只加载一次选项，搜索只在本地过滤。技能使用标签模糊排序，MCP 与知识库使用标签和详情的子串匹配。目录加载失败时显示可重试的失败文案；被取代的打开（面板关闭或重新打开）返回空列表，而不是暴露中止错误。

知识库检索以草稿为查询，并且有明确上限：最多五段、每段 600 个字符、整块引用最多 4000 个字符。草稿为空时完全不检索。检索无结果或失败时仍然插入关联说明，并在输入框提示一次，用户可以继续发送，或在补全草稿后重试。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

`src/client/rows.ts` 在注入的 {@link CapabilityRowDeps} 之上构造三条 `CommandContribution`：可用性、目录加载、草稿读取、草稿追加与提示。`src/client/options.ts` 把目录快照映射为选项行（技能会过滤掉仅模型可调用的条目，因为这里是面向人的界面），`src/client/insertion.ts` 负责插入文本与检索上限。`src/client/index.ts` 把条目接到 `ctx.commandUi`、`ctx.remote.skills.list`、`mcpManager/watch` 流（取首帧后立即释放）以及 `ctx.conversation.input`。

草稿追加走 `requestDraftInitialization({ whenDraftExists: 'append' })`：能力文本作为新段落加入，已有的引用芯片保持不变；输入框正在发送时返回本地化的拒绝提示，而不是丢弃这次选择。检索片段会归一化空白，因此多行内容仍然是一行可读文本。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-commands](../ui-commands/README.zh.md) —— 输入框菜单、popupSelect 面板与贡献契约。
- [ui-conversation](../ui-conversation/README.zh.md) —— 这些条目所追加的草稿状态机。
- [ui-sdkwork-knowledge](../ui-sdkwork-knowledge/README.zh.md) —— SDKWork 知识库目录与检索能力。
- [Client package map](../README.zh.md) —— 相邻的浏览器 UI 包。

-----

<a id="model-experience"></a>
## Model Experience

None, as the rows only insert reviewable text into the unsent draft and never submit, so the user decides what reaches a request.

#### KV Cache effect

None; the package sends no provider request and changes no prompt section. Inserted draft text reaches a request only as part of a user message the user sends, which appends to the conversation and therefore invalidates the cached prefix from that message onward like any other user input.

## Known Limitations and Deferred Work

- **MCP 选择只做引导，不限定范围。** MCP 工具由 `dsh-mcp-client` 全局注册，因此该条目只能告诉模型本轮打算使用哪台服务器的工具；按会话过滤工具需要客户端无法施加的宿主侧限制。
- **知识库检索发生在编写时，且按消息进行。** 片段在条目选中时针对当时的草稿取一次，之后草稿变化不会刷新；发送的只有检索结果，不包含知识库空间标识。
- **能力状态不跨消息保留。** 每次选择只把文本插入一份草稿；没有能把某项能力自动沿用到后续轮次的会话级绑定。

<a id="dev-note"></a>
### Dev Note

<details>
<summary>维护者工作上下文——点击展开</summary>

知识库条目在每次可用性检查与打开时惰性解析 `ctx.knowledgeBases`，因为 `ui-sdkwork-knowledge` 可能在本插件之后装载。这样条目在能力出现前保持隐藏、出现后立即可用，同时避免跨插件值导入。

</details>

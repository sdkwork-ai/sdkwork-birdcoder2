# Agent Note: Composer capability rows

Status: implemented

[English](2026-11-04-composer-capability-rows.md) | 中文

## Problem

输入框的「添加」区此前只能附加文件、触达宿主命令，但一次对话没有办法声明它要使用哪条技能、哪台 MCP 服务器、或哪个知识库来回答。这三种能力都已存在——`ui-skill` 已通过 `/` 触发源提供技能，`mcpManager` 报告已托管的服务器，SDKWork 知识库应用知道当前登录用户的知识库——但它们都不在 `+` 菜单里可达，其中两种在浏览器侧完全没有界面。

## Decision

新增浏览器插件 `@deepseek-ai/dsh-client-ui-sdkwork-capabilities`，注册三个 `ctx.commandUi` 贡献项：`skills`、`mcp`、`knowledge`。`ui-commands` 把它们排在「添加」区、文件与目标之间，因此 `+` 按钮与键入的 `/` 进入同一组选择面板。每条都是 `popupSelect` 规格：搜索、键盘、焦点、错误与重试由共享面板负责，本插件只负责目录与选中后的落地。

选中项以普通文本落到当前草稿，从不直接提交：

- 技能读取本会话的 `skills/list`，插入 `/名称 ` 手势。宿主的 `tool-skill` 前置步骤已经识别该手势并注入指令正文，因此效果与手动输入技能命令完全一致。仅模型可调用的技能会被过滤，因为这里是面向人的菜单。
- MCP 取 `mcpManager/watch` 流的首帧，插入一句点名服务器与其 `mcp__服务器__` 工具前缀的提示。MCP 工具是全局注册，所以该条目只引导本轮，不限定工具范围。
- 知识库通过 `ui-sdkwork-knowledge` 新提供的 `ctx.knowledgeBases` 服务列出 SDKWork 知识库的选择投影。草稿已有文本时，选中还会从所选空间检索内容，并在提示句之后追加最多五段引用（每段 600 字符、整块 4000 字符）。草稿为空则跳过检索；检索为空或失败时保留关联说明并只提示一次。

目录服务放在 `ui-sdkwork-knowledge`，因为该包已拥有 SDKWork 宿主适配器、环境、IAM 与生成的应用客户端。它以应用自己的 `knowledgeSelectionService.getBases` 与 `knowledge.retrievals.create` 暴露 `list` 与 `retrieve`；本插件惰性解析该服务，因此无论该能力何时挂载，条目都会随之出现。

插入走 `conversation.input.requestDraftInitialization({ whenDraftExists: 'append' })`：能力文本成为新段落，既有引用芯片保持不变。输入框正在发送时抛出该条目本地化的拒绝文案，弹窗面板把它呈现为可重试错误，token 保持原样。

## Alternatives considered

**宿主侧的会话级能力绑定。** 用持久会话事件加一个 Remote 写入，可以让选择跨轮保留，并让宿主自行过滤 MCP 工具、自行检索知识库片段。本次没有采用，因为它要触及会话格式、新增宿主插件与接口生成，而输入框需要的用户可见结果仍是用户可以继续编辑的可审阅文本。

**让三条条目复用 `/` 技能触发源。** 技能触发源已经能插入手势，但它绑定在 `/` token 上的逐键候选查询；MCP 服务器与知识库没有这样的 token，而菜单条目还必须能从 `+` 按钮进入。把三条条目放在 `ui-commands` 的贡献面上，可以让它们共用一套选择面板契约。

**渲染能力芯片而不是文本。** 提及芯片需要在既有管线之上新增引用类型与渲染器。插入文本在输入框中始终可见、可编辑、可删除；而技能条目因为 `ui-skill` 的用户文本规则识别 `/名称` 手势，已经自动获得芯片。

**让 MCP 条目按会话限定工具。** `dsh-mcp-client` 全局注册工具，`ctx.tools.restrict` 需要作用域化的宿主上下文，客户端无法为单个会话拒绝或允许某台服务器。因此条目只声明本轮打算使用哪台服务器的工具，并记录这一限制。

## Consequences

三种能力无需新的宿主协议即可从输入框被发现，且插入的文本在发送前完全可审阅。代价是不保留任何选择：每次选择只作用于它落入的那份草稿，后续轮次需要重新选择。知识库检索发生在选择那一刻，之后补全问题不会刷新片段，且只传递检索到的片段，不包含知识库空间标识。

未挂载 `ui-sdkwork-knowledge` 时知识库条目会消失，这让没有 SDKWork 知识的部署不会出现空条目，但也意味着它只能在已应用该包的部署中首次打开成功。

## Verification

`packages/client/ui-sdkwork-capabilities/tests` 固定了条目契约：技能目录、MCP 的每种托管状态、按组排列的知识库行的选项映射；插入文本及其检索上限；以及在伪能力之上的条目行为（被中止的打开、目录失败、检索回退、发送中拒绝）。`packages/client/ui-sdkwork-knowledge/tests/knowledge-catalog.client.spec.ts` 固定了目录的过滤、分组顺序、检索请求体、命中过滤与中止传播。`packages/client/ui-commands/tests` 在「添加」区重排后仍然通过，客户端类型检查聚合覆盖了新包的源码与测试。

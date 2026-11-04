---
description: "Knowledge Base app-mode plugin: the knowledge rail entry, center-column page, and SDKWork host adapter that mounts the SDKWork Knowledge Base PC application."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-knowledge

[English](README.md) | 中文

## 概述


知识库应用模式插件负责 `knowledge` 模式栏条目、中心列页面、SDKWork 宿主适配器，以及供其他浏览器界面读取的 `ctx.knowledgeBases` 目录。模式栏条目调用 layout store 既有的 `setMode('knowledge')` 动作；AppFrame 随后分发 keyed 的 `mode.page` 席位，本包在其中挂载 SDKWork 知识库 PC 应用。切回代码模式会恢复会话界面，无需 URL 路由或持久化模式状态。

## 目录

- [运行要求](#runtime-requirements)
- [知识库目录](#knowledge-base-catalog)
- [浏览器 bundle](#browser-bundle)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 运行要求

插件依赖 `ctx.env`、`ctx.iam` 与 `ctx.locale`。它在注册页面前配置自身的 SDKWork 宿主适配器。当前环境提供 API 基础 URL 与可选静态访问令牌；已配置的静态令牌优先于 IAM 会话凭据。环境变化会重建生成的 Knowledgebase 与 Drive 客户端并重新挂载 SDKWork 视图，IAM 与语言变化则通过 SDKWork 订阅传播，无需重新挂载。

SDKWork 导航运行在隔离的内存路由中，因此知识库内部导航不会修改 BirdCoder 的浏览器 URL。

## 知识库目录

应用本插件后会提供 `ctx.knowledgeBases`，浏览器界面复用这份能力，而不是直接与 SDKWork 通信。`list` 解析应用自己的选择投影（`knowledgeSelectionService.getBases`），返回当前登录用户可关联的知识库，保持应用给出的顺序并以团队或个人分组标注。`retrieve(query, spaceIds, signal)` 调用生成应用客户端的 `knowledge.retrievals.create`，返回最靠前的若干片段，丢弃空标题与空内容，并在五段处停止。

该服务在每次调用时读取当前环境与 IAM 状态，因此重新登录或切换环境后下一次请求即可生效，无需重新挂载。列举与检索都遵守调用方的中止信号。

## 浏览器 bundle

客户端插件只发射一个 `client.js` 闭包，因为 BirdCoder 客户端模块 loader 不发布任意同级分片。其 bundle 构建会编译 SDKWork Tailwind 样式表、只注入一次 SDKWork CSS、以 Blob URL 提供 PDF.js worker，并把路由与 i18n 上下文包解析到同一个物理实例。声明发射跳过对兄弟 SDKWork 实现的严格检查；`tsconfig.tests.json` 使用单一 React 类型身份检查被消费的源码闭包。

## Model Experience

无，因为插件渲染面向人的浏览器应用，其目录只向浏览器调用方返回知识库与片段；是否把这些草稿文本发送出去由用户决定。

#### KV Cache effect

无；SDKWork HTTP 请求属于独立的浏览器流量，不会改变 Harness 的模型提供方请求。

## Known Limitations and Deferred Work

- **兄弟源码要求** —— 从源码安装或重新构建浏览器闭包需要 `../sdkwork-knowledgebase` workspace 检出及其生成的 Knowledgebase 与 Drive 客户端。
- **单文件负载** —— 完整 SDKWork 应用、编译后样式与 PDF worker 位于同一个客户端插件闭包中，因此 Knowledge 插件的初始下载量高于分片应用。
- **选择投影归应用所有** —— 目录列出的是知识库应用提供给当前登录用户的选择项（`knowledgeSelectionService.getBases`），自身不提供空间目录；因此缺少该应用投影的部署会得到空目录。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

bundle 构建以 Blob URL 提供 PDF.js worker，并把路由与 i18n 上下文包解析到同一个物理实例——重复这些包会重新引入隐蔽的挂载问题。本地安装需要 `../sdkwork-knowledgebase` 兄弟 checkout；单文件 `client.js` 闭包源于 BirdCoder 客户端模块 loader 不发布任意同级分片。

</details>

## 运行时不变量

不发布运行时不变量伴随检查；模式状态保存在布局 store 的声明动作集合中，入口/页面注册遵循 rail shell 的 keyed 分发；store/模式一致性直接由本包的客户端行为规格测试覆盖。

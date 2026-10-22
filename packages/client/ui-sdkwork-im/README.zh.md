---
description: "SDKWork IM 宿主适配：加载部署方的 IM 嵌入包，向它注入网关地址、IAM 会话与界面语言，并提供 ctx.im（表层挂载、未读总数、会话选择与导航）"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-im

[English](README.md) | 中文

## 摘要

IM 宿主适配层拥有 BirdCoder 与 SDKWork IM 产品界面之间的边界。IM 界面由 sdkwork-im 构建并部署（`pnpm --dir apps/sdkwork-im-pc run build:embed` 产出 `dist-embed/im-pc-embed.js`），因此本插件不编译任何 IM 源码、不声明任何 IM 依赖：它只注入一次嵌入脚本，然后把请求的表层挂载到宿主管理的容器中，并传入当前网关地址、IAM 会话与界面语言。

`ctx.im` 是聊天与通讯录插件唯一可见的接口：

- `mountSurface(container, request)` —— 挂载 `conversation-list`、`conversation` 或 `contacts`，返回 `update`/`dispose`。
- `selectConversation(id)` / `openConversation(id)` —— 聊天页的选中会话，以及通讯录页的"发消息"导航。
- `getSnapshot()` / `subscribe()` —— rail 入口用于显示未读气泡的选中会话与未读总数。

## 运行时要求

适配层依赖 `ctx.env`、`ctx.iam`、`ctx.layout` 与 `ctx.locale`。当前环境 profile 的 `imEmbedUrl` 指向已部署的嵌入包；为空时页面会说明该部署未配置 IM。嵌入包拿到的是 profile 的 `imApiBaseUrl`（为空时回退 `apiBaseUrl`）作为网关 origin，因此每个环境都走自己的 IM 域名（`http://api-dev.birdcoder.com`、`https://api-test.birdcoder.com`、`https://api.birdcoder.com`），实时 origin 也由它派生。嵌入脚本通过 `<script>` 标签加载而非动态 import，因为客户端模块产物是闭包工厂，自身没有导入上下文。

`imEmbedUrl` 既接受绝对 HTTP(S)/application 地址，也接受由部署源站提供的根相对路径；其他 scheme 与携带凭证的地址会被拒绝，因为该脚本以宿主页面的权限执行。嵌入包 API 带版本：它随 `mountSurface` 发布 `version`（当前为 `1`），适配层会拒绝声明其他契约版本的嵌入包，而不是用不兼容的 API 挂载表层（缺少该字段的旧产物按版本 1 处理）；挂载参数或句柄语义变化时需同步提升两侧版本。

## 初始化与失败上报

`mountSurface` 会上报下列错误码，由页面翻译为提示：

- `unconfigured` —— profile 没有 `imEmbedUrl` 或没有 `apiBaseUrl`；服务会打印缺失的启动键。
- `mount-failed` —— IAM 会话没有可用于鉴权的双 token。
- `load-failed` —— 嵌入包脚本加载失败，或没有发布 `SdkworkImEmbed`。
- `init-failed` —— 嵌入包已加载，但 IM SDK 拒绝了宿主事实（网关地址非法、会话格式错误、SDK 构造失败）；页面显示 SDK 专用提示，控制台会指明网关与嵌入包地址。

嵌入包在宿主事实变化时（网关地址或 token 轮换）只初始化一次 SDK 客户端，且不打开实时连接。WebSocket 在已挂载表层订阅时连接，短时间模式切换内保持复用，运行时释放时关闭。

## 模型体验

无。本插件渲染面向人的消息界面，不增加提示词内容、工具或会话事件。

#### KV Cache 影响

无。IM 流量是独立的浏览器流量，不改变 Harness 的模型请求。

## 已知限制与后续工作

- **每页一个 IM 运行时** —— 嵌入包持有进程级 IM 状态，因此一个页面承载一个 IM 运行时；重新配置会替换之前的会话。
- **单脚本载荷** —— 嵌入包未做代码分割（原始约 3.3 MB，gzip 约 850 KB），会携带整个聊天表层。
- **portal 逃逸 shadow root** —— 会 portal 到 `document.body` 的 IM 弹窗在打包样式表之外渲染，因而没有样式。
- **未读气泡依赖已挂载的表层** —— 只有在会话列表或通讯录表层挂载期间，嵌入包才会上报未读总数；否则 rail 气泡保持最后一次的值。

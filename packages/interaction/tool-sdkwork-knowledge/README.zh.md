---
description: "面向模型的 sdkwork_knowledge_write 与 sdkwork_content_publish 工具：校验文章或媒体请求，转发给已登录的 BirdCoder 客户端，并返回知识库文章或媒体发布回执。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-sdkwork-knowledge

[English](README.md) | 中文

## 摘要

`sdkwork_knowledge_write` 在知识库中写入或读取文章。`sdkwork_content_publish` 通过两条路径把内容发布到选定的媒体账号：微信运行在已登录的 BirdCoder 客户端中，经 `sdkwork-knowledge/request` 转发，因为其账号与密钥属于知识库租户；Facebook、Twitter / X 与抖音由本 Host 进程使用运营方配置的账号直接调用官方 HTTP API。头条号与小红书在此没有公开的创作者发布 API，报告为不可用。工具校验每个请求、读取本地图片与视频文件，并返回文章标识或平台回执。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在具备 `tools`、`fs` 和 `workingDirectory` 的 Cordis 组合中挂载本包。Web 应用预设补丁会为 standard、PTC 和 Cordis 预设挂载它。

`sdkwork_knowledge_write` 接收一个 `action`：

- `list_spaces` 列出当前登录用户可以写入的知识库。
- `list_articles` 接收 `spaceId` 并列出其中的文档。
- `read_article` 接收 `documentId` 并返回 Markdown 正文。
- `create_article` 接收 `spaceId`、`title`、`markdown`，把文章作为新文档导入。
- `upsert_concept` 接收 `spaceId`、`title`、`markdown`，可再带 `conceptId` 与 `publishConcept`，创建或更新 wiki 概念页。

`sdkwork_content_publish` 接收一个 `action`：

- `capabilities` 报告所有媒体平台、当前部署能否发布到该平台，以及每个平台接受的内容。
- `accounts` 接收 `platform` 并列出已配置账号。
- `publish` 接收 `platform`、`accountIds` 以及该平台的内容字段：微信为 `title`/`author`/`contentHtml`/封面，Host 平台为 `text`/`link`/`imagePaths`/`videoPath`。
- `preview` 从第一个选定账号把微信预览发送给 `wechatIds`。

微信公众号文章必须提供封面图片。为本地 png、jpeg、gif 或 bmp 文件传 `coverPath`（不超过 5 MiB），Host 会将其编码为 data URI；也可以直接传 `coverDataUri` 或 `coverMediaId`。远端封面 URL 会被拒绝，因为平台不会抓取调用方提供的链接。

Host 平台从 `SDKWORK_MEDIA_ACCOUNTS_FILE`（否则 `$DSH_HOME/media-accounts.json`）读取账号：

```json
{
  "accounts": [
    { "id": "fb-page", "platform": "facebook", "name": "Product Page", "pageId": "123", "accessTokenEnv": "SDKWORK_MEDIA_FACEBOOK_TOKEN" },
    { "id": "x-brand", "platform": "twitter", "name": "@brand", "accessTokenEnv": "SDKWORK_MEDIA_X_TOKEN" },
    { "id": "dy-brand", "platform": "douyin", "name": "抖音号", "openId": "open-123", "accessTokenEnv": "SDKWORK_MEDIA_DOUYIN_TOKEN" }
  ]
}
```

每个账号用环境变量名引用其访问令牌；令牌不会进入工具参数、结果或日志。Facebook 发布主页动态、单张图片或单个视频；X 发布不超过 280 字符的文本；抖音先上传视频再创建作品。

两个工具都会去除空白参数（`INVALID_ARGS`），要求存在 Agent 会话（`TOOL_CONTEXT_UNAVAILABLE`），并在没有浏览器客户端响应转发请求时以 `NO_CLIENT` 失败，这正是无头场景。

返回结果是被上报的处理结论，而不是传输错误：`ok: false` 会携带停止的阶段（`validate`、`readCover`、`signedOut`、`unavailable`、`spaces`、`documents`、`ingest`、`concept`、`accounts`、`publish`、`preview`）、稳定错误码，以及可读消息。工具本身从不自动重试。

<a id="understand-the-implementation"></a>
## 理解实现

1. `execute` 校验参数；涉及微信封面时通过 `ctx.fs` 按会话工作目录解析路径并编码字节。
2. 微信操作通过 `ctx.waterfall(scopeTarget(agent, agent), …)` 派发作用域内的 `sdkwork-knowledge/request`，由 `@deepseek-ai/dsh-api-remotes` 转发给浏览器客户端，`ui-sdkwork-knowledge` 执行知识库 App 客户端调用。
3. Host 平台操作留在本进程：`src/media.ts` 加载账号文件、从对应环境变量解析令牌，并调用平台官方 HTTP API（Graph API、X API v2、抖音开放平台）。本地图片与视频在此读取并以 multipart 发送。
4. 工具把返回的文章或回执格式化为模型可读文本，并返回结构化值。

`src/types.ts` 拥有跨包词汇：请求、文章、账号、能力矩阵、失败阶段，以及 Remote 允许清单导入的 `Events` 声明。`src/media.ts` 拥有 Host 适配器。`src/index.ts` 拥有工具定义、参数归一化、能力路由、封面内嵌与面向模型的文本。

Host 不持有文章状态或持久发布记录：没有会话事件、没有投影。媒体账号文件是调用时读取的运营方配置。

<a id="model-experience"></a>
## 模型体验

### sdkwork_knowledge_write

#### 模型看到什么

schema 请求操作，以及该操作需要的空间、文档、标题、Markdown、概念与可见性。描述列出四个文章操作，说明写入需要空间 id，并说明工具复用当前登录账号。结果按空间或文章逐行渲染，或一行给出写入的文章及其标识，失败时输出一行阶段、错误码与详情。

#### Token 影响

每个挂载的 Agent 一份工具 schema，每次调用一份简短结果。只有调用方显式请求的 `read_article` 会包含文章正文。

#### KV Cache 影响

schema 与结果词汇在挂载生命周期内保持不变；结果只追加对话，不重写提示前缀。

### sdkwork_content_publish

#### 模型看到什么

schema 请求操作、平台、账号 id、平台内容字段、封面与模式。描述说明能力检查、账号选择要求、微信封面要求、三个 Host 平台及其官方 API 内容，以及不可用平台。结果渲染能力矩阵、账号列表、带平台 id 与详情的回执，或一行失败信息。

#### Token 影响

每个挂载的 Agent 一份工具 schema，每次调用一份简短结果。能力矩阵是六行文本；媒体字节不进入模型消息。

#### KV Cache 影响

schema 与结果词汇在挂载生命周期内保持不变；发布结果只追加对话，不重写提示前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **三个可用 Host 适配器。** Facebook、Twitter / X 与抖音通过各平台官方 HTTP API 发布。头条号没有公开的创作者发布 API，小红书内容 API 需商家/服务商资质，因此两者保持 `account-required`。
- **微信外部发布需要显式开启。** 知识库部署通过 `SDKWORK_KNOWLEDGEBASE_WECHAT_PUBLISH_ENABLED` 启用微信发布；未开启时客户端返回平台的 `Disabled` 错误，不会发布任何内容。
- **微信只支持封面。** 微信发布契约只携带封面图片，没有其他媒体字段；视频不在其中。Facebook 与抖音通过本工具使用本地图片/视频文件。
- **X 仅支持文本。** X 适配器使用 API v2 与用户上下文 Bearer 令牌；媒体上传需要 OAuth 1.0a，本适配器未实现。
- **平台令牌是运营方配置。** 账号位于 `SDKWORK_MEDIA_ACCOUNTS_FILE` / `$DSH_HOME/media-accounts.json`，并通过环境变量引用令牌；工具从不接受参数中的令牌。
- **发布是异步的。** 微信返回 `accepted`；工具作答时文章尚未上线。抖音审核由平台负责。
- **没有会话卡片。** 工具只返回文本与结构化值；文章或回执没有专门的工具视图。
- **微信需要已登录客户端。** 无头会话可以向三个 Host 平台发布，但微信会报告 `NO_CLIENT`，因为知识库 API 拒绝公开应用令牌执行用户写入。

<a id="dev-note"></a>
### 开发说明

平台矩阵位于 `src/types.ts`，因为两条路径都需要它：Host 用它回答 `capabilities`，客户端不再保留副本。微信账号仍来自知识库客户端；Host 平台来自账号文件。`src/media.ts` 刻意做成小的 provider 形状适配层，当知识库后端拥有这些平台时，同一契约可以直接迁移过去。

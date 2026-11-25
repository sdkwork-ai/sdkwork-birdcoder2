# Agent Note：在对话中写入知识库文章并发布到媒体

Status: implemented

[English](2026-11-25-knowledge-article-and-media-publish.md) | 中文

## 问题

知识库应用已经作为模式集成，但对话无法使用它：模型没有办法把文章写入知识空间，也没有办法把内容发布到媒体账号。SDKWork 知识库 App API 已有的发布能力需要绑定当前登录 IAM 会话的生成客户端，以及该租户上配置的公众号账号，两者都位于浏览器客户端。Host 进程无法调用它，公开应用令牌也会被用户写入拒绝。需求还点名了微信之外的媒体——头条号、抖音、小红书、Facebook、Twitter——因此模型需要的是如实的能力检查，而不是在没有适配器的地方假装发布。

## 决定

两个 Host 工具转发到客户端，一个客户端执行器运行知识库 App 客户端，两个内置技能教授工作流。

- `@deepseek-ai/dsh-tool-sdkwork-knowledge` 注册 `sdkwork_knowledge_write` 与 `sdkwork_content_publish`。它校验参数、通过 `ctx.fs` 在会话工作目录解析并内嵌本地封面图片、派发作用域内的 `sdkwork-knowledge/request` waterfall，并返回文章标识或平台回执。它不持有凭据，也不发起网络调用。
- `sdkwork_knowledge_write` 覆盖 `list_spaces`、`list_articles`、`read_article`、`create_article`（把 Markdown 作为文档导入）与 `upsert_concept`（创建或更新 wiki 概念页）。空间列表复用知识库应用自己的选择投影，因此模型可写入的空间就是应用提供给当前登录用户的空间。
- `sdkwork_content_publish` 覆盖 `capabilities`、`accounts`、`publish` 与 `preview`。微信通过知识库客户端发布。Facebook、Twitter / X 与抖音由 Host 进程调用各平台官方 HTTP API 发布，账号从 `SDKWORK_MEDIA_ACCOUNTS_FILE`（否则 `$DSH_HOME/media-accounts.json`）读取，每个账号用环境变量名引用其令牌。Facebook 发布文本/链接、单张图片或单个视频；X 发布至多 280 字符的文本；抖音上传本地视频并创建作品。头条号没有公开的创作者发布 API，小红书内容 API 需商家/服务商资质，因此两者报告为 `account-required`，不做近似实现。
- 发布映射到知识库微信契约：HTML 正文、标题至多 64 个字符、摘要至多 120 个字符、必需封面为 png/jpeg/gif/bmp 且不超过 5 MiB，单次操作 1 到 20 个账号。Host 读取封面路径并以 `data:image/...` URI 发送，服务会按账号把它上传为永久素材；已有 media id 直接透传。远端封面 URL 会被拒绝，因为平台不会抓取调用方提供的链接。
- `mode: draft` 映射到契约的 `sendNotification: false`（仅进草稿箱）；`mode: publish` 提交 `freepublish`。`preview` 从第一个选定账号发送给指定微信接收者。
- 技能 `birdcoder-knowledge-article` 与 `birdcoder-content-publish` 随内置技能目录交付，在 `.agents/skills/` 保留镜像，并由两个场景投影同时命名。发布技能要求显式选择账号，未选择时询问用户；在承诺某个平台之前先检查能力矩阵；并说明已接受的发布在上游异步完成。两个技能都复用应用已有登录，并禁止虚构空间、账号或结果。
- `@deepseek-ai/dsh-api-remotes` 中的 `sdkwork-knowledge/request` 允许清单行是这条桥接唯一需要的 Host 侧注册。

## 相关

- 转发形态沿用[对话内发布部署](2026-11-24-deploy-from-conversation.zh.md)；本记录是它在知识库与媒体方向上的对应物。
- 知识模式、其宿主适配器与 `ctx.knowledgeBases` 目录继续由 `@deepseek-ai/dsh-client-ui-sdkwork-knowledge` 拥有。
- 技能遵循[可移植技能包](../architecture/2026-11-24-portable-skill-packages.zh.md)；两者都是不依赖检出的单文件产品技能。

## 考虑过的替代方案

- **Host 用运维凭据调用知识库 App API。** 拒绝：API 把写入限定在登录用户的租户内，并拒绝公开应用令牌；生成客户端从浏览器 IAM 会话派生双令牌管理器。Host 路径需要产品并不存在的第二套凭据契约。
- **全部适配器都放进知识库后端。** 本次拒绝：部署后端是远端云服务，其仓库在本机没有热构建缓存，且五个平台在后端没有账号存储；应用的 Host 进程可以直接调用三个官方 HTTP API，无需这条部署链。适配层做成 provider 形状（`src/media.ts`），当 `sdkwork-knowledgebase` 后端拥有这些平台且部署能够承载时即可迁移。
- **同时实现头条号与小红书适配器。** 拒绝：头条号没有公开的创作者发布 API，小红书内容 API 需商家/服务商资质。未经验证的发布会对从未到达平台的内容报告成功。能力矩阵如实指出缺口。
- **把平台矩阵继续放在知识库客户端。** 拒绝：Host 现在需要它来回答 `capabilities` 并路由三个适配器，且客户端包不得值导入 Host 功能包。矩阵移到 `src/types.ts`；客户端只负责微信账号读取与发布。
- **把文章写成对象上传的文档版本。** 拒绝：文档版本路径需要对象存储引用与第二套上传契约；导入端点直接接收 Markdown，也是知识库 PC 编辑器使用的同一路径。

## 影响

微信路径需要已连接且已登录的浏览器客户端；CLI 或无头会话在微信上会报告 `NO_CLIENT`。三个 Host 适配器无需客户端，但需要运营方配置账号并通过平台自身的应用审核：缺少令牌会得到 `MISSING_CREDENTIAL`，平台拒绝会带错误码与消息上报，绝不报告成功。通过本工具导入的文档不可变：修改意味着新建文档，或通过 `upsert_concept` 原地更新 wiki 概念。微信外部发布在部署侧仍需显式开启（`SDKWORK_KNOWLEDGEBASE_WECHAT_PUBLISH_ENABLED`），未开启的租户会收到平台的 `Disabled` 错误且不会发布任何内容。已接受的微信发布是异步提交：工具无法读取上游 `publish_id`，因此报告接受状态而不是线上文章 URL。头条号与小红书如实保持不可用，而不是做近似实现。作为交换，Agent 可以在同一段对话中写入知识库文章、把文章发布或存为草稿到选定公众号，并发布到 Facebook、X 或抖音，且每个平台的真实状态都被如实报告。

## 验证

- `pnpm exec vitest run packages/interaction/tool-sdkwork-knowledge packages/client/ui-sdkwork-knowledge/tests/knowledge-conversation.client.spec.ts` 覆盖转发、参数归一化、封面内嵌与校验、空间/账号投影、导入轮询、能力矩阵、发布/草稿/预览映射、三个 Host 适配器对 mock 平台服务的请求、凭据解析以及失败错误码。
- `pnpm exec vitest run packages/skill/sdkwork-builtin-skills scripts/verify-builtin-scene-skills.spec.ts scripts/verify-skill-portability.spec.ts` 覆盖随包技能集与两个技能门禁。
- `pnpm run verify-builtin-scene-skills` 证明两个新技能已随包交付且两个投影都命名了它们。
- `pnpm run verify-skill-portability` 证明产品副本不携带检出依赖。
- `pnpm exec tsc -b packages/interaction/tool-sdkwork-knowledge packages/api/remotes/tsconfig.host.json packages/api/remotes/tsconfig.client.json` 证明转发的类型面。

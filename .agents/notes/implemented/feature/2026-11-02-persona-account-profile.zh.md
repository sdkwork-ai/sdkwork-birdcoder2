# Agent Note: Persona profile on the IAM account

Status: implemented

[English](2026-11-02-persona-account-profile.md) | 中文

## Problem

[最初的 persona 实现](2026-11-01-persona-role-and-interest-personalization.zh.md) 把角色、关注的兴趣方向以及首次引导的应答保存在 Host 的 `ui-sdkwork-persona` 用户设置分区里。该分区属于 Host 配置档案，而不属于 SDKWork IAM 账号，因此同一台机器上两个 IAM 账号会共享同一份 persona，换一台设备则从零开始。推荐类界面也没有稳定位置读取这份选择。

产品需要一个账号级的画像：所有客户端架构都能通过同一套 API 读取，并且可选的字典由服务端拥有，而不是每个应用各自硬编码。

## Decision

persona 画像归 `sdkwork-iam` 所有：

- **存储。** `iam_user_persona` 按 `(tenant_id, user_id)` 一行：可空 `role_code`、兴趣 code 的 JSON 数组、`prompt_dismissed`，以及校验该选择时使用的目录版本。可选字典在 `iam_persona_role` 与 `iam_persona_interest`。字典行归平台所有（`owner_tenant_id = '0'`，沿用 `iam_oauth_provider_catalog` 先例），因此没有任何种子写死租户字面量，所有租户读同一份字典；同一 code 的租户自有行覆盖平台行。标签是 `label_i18n` / `description_i18n` 中的 locale 映射，由每种 locale 一个种子文件写入。
- **授权边界。** persona 角色可以通过 `iam_persona_role.iam_role_code` 映射到授权角色目录，但选择 persona 从不授予权限，也不会有 persona 角色变成可授予的 `iam_role` 行。`manager` 与 `developer` 没有映射，仅作展示。
- **API。** `GET /app/v3/api/iam/persona_catalog`，以及 `GET` / `PUT` / `DELETE /app/v3/api/iam/users/current/persona`。`PUT` 是全量替换，并按启用字典校验（未知角色或兴趣 code 被拒绝，兴趣去重并按字典顺序存储）。从未选择过的用户读到空 persona，而不是 404。OpenAPI 文档由路由清单物化生成，TypeScript App SDK 再由它生成；其它语言按需从同一权威重新生成。
- **数据库初始化。** `database/migrations/postgres/0021_iam_user_persona.up.sql` 创建三张表（baseline 保持不变）。`seeds/common/005_iam_persona_catalog_seed.sql` 写入 8 个角色与 12 个兴趣；`seeds/locales/zh-CN/002_iam_persona_labels.sql` 与 `seeds/locales/en-US/001_iam_persona_labels.sql` 各自把一种 locale 合并进同一批行，因为一个种子文件不得混用多种 locale。
- **客户端。** `ui-sdkwork-iam` 在 `ctx.iam` 上暴露 `retrievePersona`、`updatePersona`、`retrievePersonaCatalog`，复用它已经持有的生成式客户端，因此 base URL 与 TokenManager 只有一个来源。`ui-sdkwork-persona` 在该面上构建账号端口：读取优先使用最新的账号快照，回退到 Host 缓存；当账号报告无记录而缓存有选择时，上传一次 —— 即迁移情形。账号可用时写入账号；被拒绝的写入直接报给弹窗，而不是记成已保存。同一个端口也携带字典，弹窗只渲染字典允许的 id。Host 分区保留为离线与未登录缓存。

## Alternatives considered

**继续把选择放在 Host 设置分区。** 否决：它按 Host 配置档案生效，而这正是需求要消除的限制。

**新增一个专门的个性化服务。** 就当前证据否决：只有一个消费方，新服务会重复 IAM 已提供的身份、租户隔离、种子与 SDK 基础设施。

**把 persona 存成 `iam_role` 授权。** 否决：一次引导回答会变成授权决定，后端用户目录的角色列表里会出现绝不能被授予的伪角色。

**扩展现有 `settings` 偏好存储。** 否决：settings 拥有通用应用偏好，但 persona 字典、其校验以及账号谓词都属于身份域数据；放进去会把同一份画像拆到两个服务。

## Consequences

选择会跟随账号跨设备、跨客户端生效，所有 SDK 消费方读同一份字典。Host 设置分区从权威存储变为缓存；未登录的本地会话仍然可用，但只在下一次登录启动时才上传到账号。

字典变更是数据变更：新增角色或兴趣需要种子行与两个 locale 文件，而不需要客户端发版 —— 但弹窗渲染的是本地化文案，因此全新 id 仍需客户端文案，在此之前会在读取时被丢弃。弹窗会按账号字典收窄，因此禁用既有 id 无需发版，被字典移除的已选角色视为未选择。配置了 IAM 时首次引导会短暂等待已保存会话恢复，账号已有角色的设备不会被误打扰。桌面上账户 onboarding 与本弹窗的首次引导顺序没有改变。

## Testing

`sdkwork-iam` 用 `node tests/contract/iam-database-contract-alignment.test.mjs` 与 `check-database-framework-standard.mjs` 验证数据库契约（两者都覆盖三张新表在全部五处注册位置的登记），OpenAPI/SDK 环节由 `node tools/generators/materialize-iam-v3-openapi-boundaries.mjs` 加 `node sdks/sdkwork-iam-app-sdk/bin/generate-sdk.mjs typescript` 以及生成项目的 `publish-core` 检查执行。`packages/client/ui-sdkwork-persona/tests` 覆盖账号读取、账号写入、被拒绝的写入、缓存镜像、一次性迁移、未登录缓存路径、首次引导门槛与设置菜单接缝；`packages/client/ui-sdkwork-iam/tests` 覆盖 persona 方法所扩展的运行时与服务。

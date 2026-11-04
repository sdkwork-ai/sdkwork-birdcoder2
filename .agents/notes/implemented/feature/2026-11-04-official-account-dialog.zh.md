# Agent Note：用户自己的公众号账号配置

状态：已实现

[English](2026-11-04-official-account-dialog.md) | 中文

## 问题

设置弹出菜单可以打开中转站 API Key 弹窗，但公众号能力在客户端里没有入口。IAM 侧唯一的实现是 `@sdkwork/iam-pc-admin-oauth`：面向后台管理的租户登录资源账号表面，由 IAM 管理台挂载，并使用 backend-admin 会话认证。对「每个用户维护自己的公众号」而言，这是错误的层级：登录资源是租户级集成，带 OAuth client 与密钥级联，而终端用户的会话根本无法访问后台 API。

## 决策

**用户自有的 app-api 资源。** IAM app API 新增 `iam.oauth.officialAccounts`——在 `/app/v3/api/iam/oauth/official_accounts` 提供 list/create/retrieve/update/delete——由新表 `iam_user_official_account` 承载，按 `(tenant_id, user_id)` 隔离。这些行是调用者自己的渠道配置（AppID、账号名称、账号类型、原始 ID、Logo、消息推送地址、自定义菜单草稿），从不参与登录，因此不涉及 integration、OAuth client 或租户运营者。AppSecret、消息推送 Token 与 EncodingAESKey 只以编码后的签名密钥引用存储，且从不返回；每个 handler 都从可信请求上下文解析调用者，并按会话的租户与用户过滤。

**新增 app 级 PC 模块。** `@sdkwork/iam-pc-oauth`（`sdkwork.architecture: pc-react`，`surface: app`，capability `oauth`）拥有该表面：`SdkworkIamOfficialAccountsPanel`（列表、创建/编辑、启用/停用、删除、自定义菜单草稿编辑器）、页面外壳、基于 `client.iam.oauth.officialAccounts` 的 `createSdkworkIamOfficialAccountsClient`、只在提交点发布的控制器，以及 zh-CN/en-US 语言目录。IAM PC 宿主注册表列出了该包，客户端表面模型与 parity 台账新增 `app.iam.oauth.official-accounts` 屏幕。

**BirdCoder 挂载该模块。** `@deepseek-ai/dsh-client-ui-sdkwork-official-accounts` 在设置菜单的中转站 API Key 行之上注册「公众号账号」行，并在 `settings.officialAccounts` 座位注册弹窗。其宿主适配器只构建基于共享网关源地址的 IAM app 客户端（dual-token，`pc`），把会话镜像进浏览器全局 token manager，适配 `iam.oauth.officialAccounts` 切片，并把控制器交给面板。弹窗判断网关就绪、会话存在、宿主语言与配色；`SdkworkThemeProvider` 与 `SdkworkI18nProvider` 提供 SDKWork 令牌与文案。面板的 Tailwind 样式表从 app 级模块与 `@sdkwork/ui-pc-react` 源码编译，并收敛在 `dsh-sdkwork-official-accounts-embed` 层与弹窗/body 门户作用域中。

## 备选方案

**复用 `@sdkwork/iam-pc-admin-oauth`。** 已否决：它是后台管理的登录资源表面。它的行是用于认证的租户集成，其客户端需要 backend API，而终端用户会话既没有该凭据也没有相应业务权限；允许终端用户编辑登录资源还会让他们改动租户认证。

**console 级模块。** 已否决：console 表面是租户运营者层级、基于 backend API，而不是终端用户自己的渠道。「每个用户管理自己的」在表面词汇里属于 app 级。

**在 fork 内重写表单。** 已否决：能力的数据契约、校验、密钥处理与后续发布属于 sdkwork-iam；fork 副本会在一个版本内与 app SDK 表面分叉。

## 影响

app API 现在承载一个用户级资源，拥有自己的表、迁移、契约条目与密钥引用；后台管理的资源账号表面不受影响。自定义菜单编辑器只保存草稿：推送到微信与发布文章需要 app API 尚未暴露的 provider 调用链，因此 parity 单元保持 `partial`，模块也尚未挂到 IAM PC 应用路由上。BirdCoder 插件把 app 级模块与 `@sdkwork/ui-pc-react` 内联进约 1.6 MB 的 bundle，其编译样式表沿用与其他嵌入一致的 shell 层位置契约。

## 验证

`iam-database-contract-alignment` 通过新表的校验；`db:migrate` 已把 `0024_iam_user_official_account` 应用到本地 Postgres，`db:drift:check` 通过。`cargo test -p sdkwork-routes-iam-app-api --lib` 覆盖载荷归一化、空白密钥保留、密钥封装/解码与菜单校验（24 项）；`cargo test -p sdkwork-routes-iam-app-api --test iam_http_standard` 通过 manifest 表面与 Postgres 路由器测试（28 项），`api:assembly:validate` 通过。`tools/check-iam-client-parity.mjs` 带新屏幕通过。`@sdkwork/iam-pc-oauth` 类型检查通过，12 项测试通过（适配器、控制器、面板）。BirdCoder 包类型检查通过，57 项客户端测试通过；真实 Web 应用已通过 CDP 驱动验证：菜单按位置渲染该行，弹窗打开，其嵌入根报告 `ready`，body 覆盖层标记已设置，且没有控制台错误。

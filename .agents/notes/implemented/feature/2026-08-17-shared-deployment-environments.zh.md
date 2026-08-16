# Agent Note：共享部署环境统一 sdkwork 插件配置

Status: implemented

[English](2026-08-17-shared-deployment-environments.md) | 中文

## 问题

每个 sdkwork 集成插件都在自己的设置命名空间里配置 base URL 等：ui-iam 携带 `baseUrl`/`appId`，ui-feedback 携带 `baseUrl`/`appKey`。部署到不同环境（开发 / 测试 / 线上）时需逐个修改插件设置，且没有地方为非交互式 API 调用配置静态 access token。产品要求一份环境配置（每环境的 base URL、access token、app key），所有插件统一消费。

## 决策

新插件包 `ui-env`（`@deepseek-ai/dsh-client-ui-env`）拥有共享环境配置，两个 sdkwork 插件都从它读取：

- **一个设置作用域，三份 profile。** `ui-env` 命名空间携带活动 `environment` 选择器（`development` / `testing` / `production`）加每环境一份 profile：`apiBaseUrl`（默认 `https://api.sdkwork.com`）、`appId`、`appKey`、`accessToken`（默认空）。部署方改一份文档即可切换环境，每环境携带自己的 token。
- **`ctx.env` 服务。** 浏览器半部提供 `EnvService`——活动 profile 投影（`apiBaseUrl()`、`appId()`、`appKey()`、`accessToken()`、`isConfigured()`）加作用域订阅。每个消费插件类型导入它（`ctx.get('env')`，绝不声明式注入）。
- **ui-iam 迁移。** 其设置命名空间移除 `baseUrl`/`appId`；IAM app-api 来源与租户应用 id 来自活动 profile。`ui-iam` 只保留展示与登录开关。认证运行时在环境移动时惰性重建；会话 bootstrap 改为跟随环境订阅。
- **ui-feedback 迁移。** 插件不再拥有设置命名空间（host loader 为 no-op）；收集端 baseUrl 与 app key 来自 profile。凭据按序解析：profile 配置了静态 `accessToken` 时使用它（非交互式部署），否则使用已挂载的 IAM 会话——每次提交前重新同步。
- **未配置即禁用。** 活动 profile 的 `apiBaseUrl` 为空时隐藏反馈行、关闭 IAM 轨条目——指向未配置环境即关闭 sdkwork 表面，无需逐个插件编辑。

## 备选方案

| 拒绝 | 一句话理由 |
|---|---|
| 保留各插件 baseUrl，各自加环境选择器 | 选择器重复且插件间漂移；统一一处的意义正在于此 |
| 用凭据/密钥存储而非普通设置字段 | access token 是部署常量而非用户密钥；credential-reference 服务于用户凭据 |
| 环境 profile 嵌套在各插件下 | 同样重复；ui-env 是共享脊柱 |

## 后果

部署方只需配置一份 `ui-env` 文档即覆盖所有 sdkwork 表面；ui-iam 与 ui-feedback 读取同一 profile，切换时所有表面一起移动。成本：旧的 `ui-iam.baseUrl`/`ui-feedback.baseUrl` 设置不再被读取（pre-release 政策：所有引用一起更新），两个插件依赖 ui-env 先于它们组合（web bundle 已排序行）。

## 测试

ui-env 包规格覆盖服务（默认生产 profile、环境切换投影、未配置检测、订阅）与 host 设置注册。ui-iam 规格覆盖环境驱动的 `isConfigured`/`appId` 与环境订阅；ui-feedback 规格覆盖环境驱动的 base URL/app key、环境 token 优先于会话、IAM 回退。settings-menu e2e 新增场景：以携带 `ui-env` testing profile 的独立 home 启动，断言反馈行与弹窗仍工作。

# Agent Note：基于 IAM 后台 OAuth 面的小程序账号管理

Status: implemented

[English](2026-11-06-mini-program-account-settings-plugin.md) | 中文

## 问题

公众号账号已有面向用户的管理行，但另一类微信 provider 资产——支撑小程序登录的小程序账号——在 BirdCoder 中没有入口。sdkwork-iam 只向 app 客户端暴露小程序*登录*（`oauth.miniProgramSessions`），小程序*账号管理*只存在于其 PC 管理端：`iam_oauth_resource_account` 中 `resourceAccountKind = "mini_program"` 的行，与 `wechat_mini_program` 登录集成一并创建，并附带后台登录检测。新界面必须位于公众号账号正下方，复用该账号模型而不是另造一套，并保持为独立插件。

## 决定

`ui-sdkwork-mini-program-accounts` 是第三个独立的设置菜单插件。它拥有 `settings.miniPrograms` 行（公众号账号正下方）、80vw 弹窗、自己的语言命名空间与宿主适配器。适配器用共享的 `ui-sdkwork-env` 网关地址和 `ui-sdkwork-iam` 会话构造生成的 **IAM 后台** 客户端（`@sdkwork/iam-backend-sdk`），使用浏览器全局 token manager 与 revision 计数器，使环境切换时重建客户端。

能力面是 IAM 后台 OAuth 资源账号接口，插件对齐管理端页面的流程而不是重新推导：从一页有界结果中读取 `mini_program` 行；创建时复用或创建 `wechat_mini_program` 登录集成（相同的代码、provider 字段、`surfaceKind`、启用状态），拒绝重复 AppID，并以 `accessMode: "operator_managed"` 创建资源账号；账号与集成一起启停；删除时只删账号行；提交 `miniProgramLoginChecks`；轮换 AppID/AppSecret 时留空 AppSecret 保持原凭据。后台对每次调用校验 OAuth 管理权限，因此弹窗呈现服务端拒绝，而不是在本地预判权限范围。

## 考虑过的替代方案

**直接嵌入 sdkwork-iam 管理端小程序页面。** `SdkworkIamOauthMiniProgramAccountsPage` 是视觉参考，但它是私有 `pc-admin` 包，会带入管理端外壳、Tailwind、Drive 上传字段以及完整的管理端控制器依赖（`iam-pc-admin-core`、`iam-service`、后台 SDK）。为一个账号表单把它挂进 80vw 设置弹窗，会让 BirdCoder 耦合到后台管理控制台的布局。

**使用 IAM app API。** app SDK 只暴露 `oauth.miniProgramSessions`（登录），没有小程序账号资源。另造 app 层账号端点需要本仓库之外的 backend 改动。

**把流程搬进 Host。** Host 服务会重新实现同一批后台调用，并在 IAM 权威之上再加一套契约；environment/IAM 服务已经提供了传输接缝。

## 影响

- `packages/client/ui-settings` 声明 `settings.miniPrograms`；`ui-sdkwork-settings-menu` 拥有授权、公众号账号与域名管理之间的行以及弹窗挂载。插件在自身套件中保持源码 100% 覆盖，`apps/web/tests/settings-menu.e2e.ts` 在真实 Web 组合中断言行与弹窗可以打开。
- 每次打开最多读取 200 条资源账号并在本地筛选。游标分页、管理端页面的域名/校验文件配置、Logo 上传以及登录检测结论轮询仍延后，并记录在该包 README。
- 弹窗位于 IAM 后台 OAuth 管理权限之后。没有该权限的登录用户会看到服务端拒绝；尚未记录针对真实网关且具备该权限的登录后可视化验证。

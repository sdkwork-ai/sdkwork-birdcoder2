# Agent Note：登录界面的 API Key 入口改为部署选项

Status: implemented

[English](2026-11-04-login-api-key-entry-opt-in.md) | 中文

## 问题

[统一登录表面](2026-11-04-unified-login-surface.zh.md)在每个登录入口的“登录”旁都渲染了“添加 API Key”。该备用入口配置的是 DeepSeek 官方提供方密钥，而产品的登录方式是 SDKWork 账号；默认同时提供两者会让每个用户都要在两种登录之间做选择，并暴露一条部署未必支持的路径。桌面欢迎窗口此前完全无法省略该入口。

## 决定

一个部署开关：OEM profile 的 `brand.showApiKeyEntry`，默认 `false`。它统一控制所有登录表面的 API Key 入口：

- **桌面欢迎窗口。** 主进程读取解析后的 OEM 品牌值，经窗口的附加参数传入隔离的欢迎渲染器；入口页与登录失败页在该开关关闭时省略 API Key 操作。密钥页面及其 IPC 仍然保留，只是隐藏期间不可达。
- **SDKWork IAM 弹窗入口。** 只有部署显式开启且桌面壳提供密钥页面时，注入面才携带 `startApiKey`；纯浏览器页面继续省略该选项。
- **Web 账号弹窗。** 开关关闭时，弹窗在初始入口以及超时/失败步骤都省略 API Key 操作。等待步骤的“取消”与该开关无关，保持不变。

页面 bootstrap 投影本就携带 OEM 品牌，因此浏览器端通过 `ui-primitives` 的共享 `readOemShowApiKeyEntry()` 读到与桌面壳相同的值。需要该备用入口的部署在品牌名旁设置 `brand.showApiKeyEntry: true` 即可。

## 考虑过的替代方案

**只在桌面欢迎窗口隐藏。** 放弃：同一个操作还出现在 IAM 弹窗与 Web 账号弹窗上，产品仍会在其他登录表面提出同样的问题。

**改为每用户桌面设置。** 放弃：部署是否支持官方 API Key 路径属于部署事实，不是用户偏好；OEM profile 本就承载展示策略，并能同时到达桌面壳与 Web 客户端。

**直接删除 API Key 页面。** 放弃：显式开启的部署仍需要它，而且该页面是官方提供方唯一的本地凭据备用路径。

## 后果

新安装的每个登录表面只显示一个登录操作。开启时桌面欢迎窗口仍渲染密钥页面，IPC、凭据写入与“稍后配置”行为都不变。依赖 API Key 路径的 OEM 部署必须在 profile 中加上 `brand.showApiKeyEntry: true`，否则登录只走配置好的账号手势。Web 账号弹窗的 API Key 编辑器仍可通过设置协调器在直接链接到它的表面中打开。

## 测试

`packages/host/sdkwork-oem/tests/config.spec.ts` 固定默认值、按环境覆盖与布尔校验；`plugin.spec.ts` 固定发布到 `ctx.oem` 的品牌值与浏览器投影。`packages/client/ui-primitives/tests/oem-brand.client.spec.tsx` 覆盖读取器的回退。`apps/desktop/tests/welcome-window.spec.ts` 固定渲染器参数，`welcome-renderer.client.spec.tsx` 断言关闭时入口不存在、开启时存在。`packages/client/ui-settings-account/tests/sign-in-dialog.client.spec.tsx` 覆盖隐藏默认与开启后的操作；`account.client.spec.tsx` 与 `onboarding.client.spec.tsx` 跑开启后的备用路径。`packages/client/ui-sdkwork-iam/tests/sign-in-overlay.client.spec.tsx` 保留组件对 `startApiKey` 的行为；注入开关本身是插件 overlay 注册里的一行条件。

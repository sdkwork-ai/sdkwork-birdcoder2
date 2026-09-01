---
description: "SDKWork 发布应用插件：会话头部日志右侧的发布图标，打开创建 deploy_app 对话框，复用 @sdkwork/deployments-pc-console-publishing 组件，由宿主构造 deploy/drive 客户端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-deploy

[English](README.md) | 中文

## 概要

本插件为 Web 客户端增加 SDKWork「发布应用」入口：会话头部（session 日志右侧）的火箭图标。点击打开共享的 `CreateDeployAppDialog`（定义于 `sdkwork-deployments` PC 应用，`@sdkwork/deployments-pc-console-publishing`），支持：

1. 选择源码目录（可更换；可关联已有 `deploy_app` 或创建新应用并填写名称）。
2. 应用类型：静态资源、小程序、Flutter iOS/安卓、原生 iOS/安卓、鸿蒙、SPA、API 服务。
3. 多级分类级联（持久化到 `deploy_app.metadata.category`）。
4. 上传应用 icon。
5. 上传封面图。
6. 截图与预览图（遵循 App Store 预览图规范：尺寸校验 + 每类最多 10 张）。
7. 版本号设置（语义化校验）。
8. 应用描述。
9. release notes。

宿主适配器（`deployHost.ts`）通过全局 token manager 从共享的 `ui-sdkwork-env` 与 `ui-sdkwork-iam` 服务构造生成的 deploy/drive 客户端，因此对话框保持宿主无关、可复用。所有持久化严格走 `sdkwork-deployments` 现有表结构（`deploy_app`、`deploy_app_platform_target`、`deploy_app.metadata` JSONB）与 deploy app-api OpenAPI 契约。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

将本插件挂载到运行时（一行 cordis.yml 组合行 + 本包依赖），发布图标即出现在会话头部操作条。点击打开对话框；提交后创建（或关联）`deploy_app`、通过 Drive 上传媒体并写入元数据。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/client/DeployPublishAction.tsx` — 头部触发按钮与对话框宿主。
- `src/client/deployHost.ts` — 环境/IAM 适配与客户端构造（对齐 `ui-sdkwork-drive` 模式）。
- 对话框本体位于 `@sdkwork/deployments-pc-console-publishing`；本包仅提供客户端、语言、主题与目录选择端口。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 浏览器目录选择（`showDirectoryPicker`）仅暴露文件夹名而非绝对路径；对话框保留路径输入框供用户补全。
- 分类目录为 deployments 包内的声明式数据；切换为服务端目录（如 appstore）仅需更换数据源。

---
description: "SDKWork 发布应用插件：会话头部右侧工具簇（Session log 省略号图标左侧）的发布图标，hover 下拉菜单启动三个部署流程（新建应用、上传代码、发布为模板），复用 @sdkwork/deployments-pc-console-publishing 对话框，由宿主构造 deploy/drive 客户端，并把 deploy_app / deploy_app_template 的 ID 持久化到项目清单。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-deploy

[English](README.md) | 中文

## 概述

本插件为 Web 客户端增加 SDKWork「部署」入口：会话头部右侧工具簇（Session log 省略号图标左侧）的火箭图标。悬停打开下拉菜单，包含三个部署流程（对话框均来自 `sdkwork-deployments` PC 应用的 `@sdkwork/deployments-pc-console-publishing`）：

0. **新建应用** —— 只登记 `deploy_app`（`CreateAppDialog`）：类型、分类、素材、描述，不上传代码。
1. **上传代码** —— 解析已关联应用后打开 `UploadSourceDialog`，走真实上传链路（Drive 上传会话 → `deploy_artifact` → 可选 release/deployment）。
2. **发布为模板** —— 解析已关联应用，创建 `deploy_app_template`（分类、展示文案、可见性），可选提交审核。

完整发布对话框（`CreateDeployAppDialog`）仍通过 `deployPublish` 服务供工作区行菜单使用，支持：

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

将本插件挂载到运行时（一行 cordis.yml 组合行 + 本包依赖），部署图标即出现在会话头部右侧工具簇。悬停打开流程菜单；每个流程的结果都会经宿主工作区桥写入当前会话项目的 `sdkwork.app.config.json`（`deploy` 节 + `backend.appId`），下次运行按 ID 关联已存在的 `deploy_app` / `deploy_app_template`，不再重复创建。上传代码与发布为模板流程先按持久化 ID 解析目标应用，失效时回退到插件内应用选择器。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/client/DeployPublishAction.tsx` — 头部触发按钮（含 hover 菜单）与流程编排。
- `src/client/deployHost.ts` — 环境/IAM 适配、客户端构造（对齐 `ui-sdkwork-drive` 模式）与项目清单读写桥。
- `src/client/deployAppConfig.ts` — 关联持久化标准：项目 `sdkwork.app.config.json` 的 `deploy` 节（`appId`/`appName`/`appSlug`/`templateId`/`templateKey`，并与既有 `backend.appId` 槽位同步），原位解析与合并，清单其余各节原样保留。
- `src/client/DeployAppPickerDialog.tsx` — 清单无关联应用（或关联已失效）时的应用解析步骤。
- `src/client/PublishTemplateDialog.tsx` — 模板发布表单（分类来自 `templateCategories.list`，创建 + 可选提交审核）。
- 创建/上传对话框位于 `@sdkwork/deployments-pc-console-publishing`；本包提供客户端、语言、主题、目录选择端口与持久化。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 浏览器目录选择（`showDirectoryPicker`）仅暴露文件夹名而非绝对路径；对话框保留路径输入框供用户补全。
- 分类目录为 deployments 包内的声明式数据；切换为服务端目录（如 appstore）仅需更换数据源。

## 运行时不变量

不发布运行时不变量伴随检查；该包是 UI 插件，其 session-header 入口只打开共享的 create-deploy-app 对话框；不拥有跨插件可变状态，其唯一的 slot 注册通过 HMR 安全规格测试验证销毁。

## 开发备注

该对话框是纯浏览器侧表面：通过共享的 `ui-primitives` 对话框原语渲染，消费 deployments 包内的 deploy-app 目录，并经 session-header 入口打开创建流程；此处不持有任何主机侧部署状态。

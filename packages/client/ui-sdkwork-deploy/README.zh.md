---
description: "SDKWork 发布应用插件：会话头部右侧工具簇（Session log 省略号图标左侧）的发布图标，hover 下拉菜单启动四个部署流程（新建应用、上传代码、发布应用、发布为模板），复用 @sdkwork/deployments-pc-console-publishing 对话框，由宿主构造 deploy/drive 客户端，并把 deploy_app / deploy_app_template 的 ID 持久化到项目清单。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-deploy

[English](README.md) | 中文

## 概述

本插件为 Web 客户端增加 SDKWork「部署」入口：会话头部右侧工具簇（Session log 省略号图标左侧）的火箭图标。悬停打开下拉菜单，包含四个部署流程（共享对话框来自 `sdkwork-deployments` PC 应用的 `@sdkwork/deployments-pc-console-publishing`）：

0. **新建应用** —— 只登记 `deploy_app`（`CreateAppDialog`）：类型、分类、素材、描述，不上传代码。
1. **上传代码** —— 解析已关联应用后打开 `UploadSourceDialog`，走真实上传链路（Drive 上传会话 → `deploy_artifact` → 可选 release/deployment）。
2. **发布应用** —— 基于已关联应用已登记的制品包切 release/部署（`AppPublishDialog`）。
3. **发布为模板** —— 挂载共享的 `PublishTemplateFlow`：先从项目清单解析已关联应用（失效回退选择器），再由 `PublishTemplateDialog` 创建 `deploy_app_template` —— 分类、平台维度、展示文案、可见性、首个版本记录，以及模板源：应用当前代码（默认）、本地 `.zip` 压缩包、浏览器内按 `.gitignore` 打包的本地目录、或 Git 仓库绑定 —— 可选提交审核。

完整发布对话框（`CreateDeployAppDialog`）与发布为模板流程都通过 `deployPublish` 服务（`open` / `openTemplate`）供工作区与会话行菜单使用，侧边栏行与头部运行同一份代码。对话框本身支持：

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

将本插件挂载到运行时（一行 cordis.yml 组合行 + 本包依赖），部署图标即出现在会话头部右侧工具簇。悬停打开流程菜单；每个流程的结果都会经宿主工作区桥写入目标项目的 `sdkwork.app.config.json`（`deploy` 节 + `backend.appId`），下次运行按 ID 关联已存在的 `deploy_app` / `deploy_app_template`，不再重复创建。上传代码与发布为模板流程先按持久化 ID 解析目标应用，失效时回退到插件内应用选择器。行菜单的发布服务（`deployPublish.openTemplate`）按行自身的项目目录解析与回写，头部流程面向当前会话的项目。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/client/DeployPublishAction.tsx` — 头部触发按钮（含 hover 菜单）与流程编排（新建/上传/发布内联解析；模板流程挂载共享组件）。
- `src/client/PublishTemplateFlow.tsx` — 共享的发布为模板流程（清单解析 → 选择器回退 → `PublishTemplateDialog` → 清单回写）；头部与行菜单消费的 `deployPublish.openTemplate` 服务都挂载它。宿主通知会重读客户端：IAM 会话迟到水合或令牌轮换时，重新同步私有令牌管理器并重挂选择器重试。
- `src/client/deployHost.ts` — 环境/IAM 适配、客户端构造（对齐 `ui-sdkwork-drive` 模式）与项目清单读写桥（`readDeployLink`/`writeDeployLink` 接受显式项目目录，缺省为会话 cwd）。
- `src/client/deployAppConfig.ts` — 关联持久化标准：项目 `sdkwork.app.config.json` 的 `deploy` 节（`appId`/`appName`/`appSlug`/`templateId`/`templateKey`，以及 git 发布模板的可选溯源字段 `templateGitUrl`/`templateGitBranch`/`templateSubDirectory`，并与既有 `backend.appId` 槽位同步），原位解析与合并，清单其余各节原样保留。
- `src/client/PublishTemplateDialog.tsx` — 模板发布表单：分类来自 `templateCategories.list`，平台维度多选，版本 + 更新说明，四种模板源；压缩包源经 `createDeployAppOperationsService.uploadCodeFromArchive` 上传，git 源经 `connectGitSource` 绑定。
- `src/client/gitignore.ts` — `.gitignore` 匹配器（否定、仅目录、锚定、`**`、深层文件覆盖）供目录打包器使用。
- `src/client/directoryArchive.ts` — 目录 → zip 打包器：子树作用域的忽略级联与 git 的目录剪枝语义，`.git` 始终剔除，字节上限保护，SHA-256 校验。
- `src/client/templatePlatforms.ts` — 平台维度词表（storefront 规范四值 + 其余 SDKWork 应用族）及其到制品包类型的映射。
- `src/client/templateInstall.ts` — 消费侧地基：经 Drive content API 下载产物字节（产物自带 `driveNodeId`，安装已发布模板不需要任何新增后端端点）、fflate 解压、zip-slip 与平台保留名筛查、展开上限，以及供目标目录写入器执行的文本/二进制切分。
- `src/client/deployPorts.ts` — 各发布表面共享的响应式主题/locale 端口与 locale→deployments-locale 映射。
- `src/client/DeployAppPickerDialog.tsx` — 清单无关联应用（或关联已失效）时的应用解析步骤。两个插件弹窗的亮/暗配色都由 `data-theme` 根元素驱动（`DeployDialogs.module.css`）。
- 创建/上传对话框位于 `@sdkwork/deployments-pc-console-publishing`；本包提供客户端、语言、主题、目录选择端口与持久化。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 浏览器目录选择（`showDirectoryPicker`）仅暴露文件夹名而非绝对路径；对话框保留路径输入框供用户补全。
- 分类目录为 deployments 包内的声明式数据；切换为服务端目录（如 appstore）仅需更换数据源。
- 模板版本的 `platformTargets` 服务端为自由字符串；词表仅由客户端约束（`templatePlatforms.ts`），deployments 服务端可收紧为枚举。
- 「使用模板创建项目」还剩最后一个宿主依赖：下载（产物 `driveNodeId` 走 Drive content API）、解压、安全筛查与写入规划均已在客户端完成（`templateInstall.ts`），但把规划出的文件落盘需要宿主写入桥——文本文件已可走受治理的 `writeTextFile`，二进制条目（图标、字体）等待 `directoryPicker` 缝上的有界二进制写入能力或一个 fork 自有的脚手架 Remote。git 发布的模板同时把仓库、分支与子目录记录进项目清单，作为后续脚手架流程（或 `create-sdkwork-app`）消费的本地打包规格。

## 运行时不变量

不发布运行时不变量伴随检查；该包是 UI 插件，其 session-header 入口只打开共享的 create-deploy-app 对话框；不拥有跨插件可变状态，其唯一的 slot 注册通过 HMR 安全规格测试验证销毁。

## 开发备注

该对话框是纯浏览器侧表面：通过共享的 `ui-primitives` 对话框原语渲染，消费 deployments 包内的 deploy-app 目录，并经 session-header 入口打开创建流程；此处不持有任何主机侧部署状态。

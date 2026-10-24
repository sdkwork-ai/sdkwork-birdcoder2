---
description: "SDKWork 发布应用插件：会话头部触发器打开应用库——有界的 workspace 扫描发现每一个携带 sdkwork.app.config.json 的项目并列表展示，行内提供发布、上传代码与打包操作，底部为新建应用；行菜单运行同样的按项目状态决策的流程——读取清单，已登记应用直接发布，未登记则用清单资料完成创建（应用记录 + 平台目标 + 项目关联）；关联写入规范的 metadata.publishing.appIdByTarget，项目已有应用时拒绝再次创建。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-deploy

[English](README.md) | 中文

## 概述

头部火箭图标打开**应用库**：对会话 workspace 做一次有界遍历，发现每一个携带 `sdkwork.app.config.json` 的项目，按清单自身的名称、类型、图标与关联状态列表展示。每一行的右侧可以直接发布、上传代码或打包该项目；底部「新建应用」打开控制台的完整创建表单；空扫描渲染可点击的占位块，动作与底部一致。创建会写出完整的 APP_MANIFEST_SPEC v3 清单——身份、按类型的运行时、发布、媒体与关联——并且应用库随会话 cwd 切换实时重扫。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

将本插件挂载到运行时（一行 cordis.yml 组合行 + 本包依赖）。头部图标打开应用库弹窗；行菜单的发布入口面向行自身目录运行按项目流程。

**应用库（头部触发器）。** 弹窗扫描会话 cwd（深度 3、至多 120 个列出目录，剪除隐藏与构建产物子目录）中的 `sdkwork.app.config.json` 清单并列出发现的每个项目：

- 每行展示清单的展示名称、推导的类型标签（清单映射到的控制台类型卡片）、关联徽标、项目路径与 logo（`app.iconUrl` / `media.icons.primary.url`，缺省回退到名称首字母）。
- 行右侧的「发布」「上传代码」按该目录复用共享项目流程（清单未登记应用时先创建或关联），「打包」在组合包含 `sdkwork-app-build` 时经宿主构建端口打开打包进度弹窗。
- 空扫描渲染可点击占位块，动作与底部「新建应用」一致：控制台的完整创建表单，其类型网格覆盖 SDKWork 全部应用词表（h5、pc-web、桌面、小程序、Android、iOS、鸿蒙、API 服务、静态站点，各含框架技术栈）。新建的应用在会话项目尚未登记应用时自动关联到该项目。

**行菜单项目流程。** 同一流程服务所有入口，由项目清单状态驱动：

- **没有登记应用**：「创建应用并发布」。清单提供草稿（展示名称、由 `appType`/`runtime`/`publish.platforms` 推导的类型卡片、描述、应用标识）；确认页展示后创建，清单无法确定类型卡片时转交控制台的完整创建表单。
- **已登记且可解析**：「发布应用」「上传代码」。流程在创建前会立即重读清单，因此在另一个窗口刚关联过应用的项目不会再得到第二个应用。
- **已登记但应用已不存在**：提供重建，并写回同一处关联。
- **发布为模板**保留为行菜单动作（`deployPublish.openTemplate`）；头部弹窗是应用清单，不是第二个菜单。

**创建写出完整清单（APP_MANIFEST_SPEC v3）。** 目标项目没有 `sdkwork.app.config.json` 时，关联写入组合出完整骨架，而不是规范 §4.1 允许的仅关联 stub：八个必备节齐全（`app`、`backend`、`runtime`、`media`、`publish`、`artifacts`、`release`、`security`），身份来自创建记录（key 依次取治理键、名称 kebab 推导、控制台 slug；名称、展示名、描述、`appType`），运行时身份按规范 §6.1 客户端架构对齐表由类型卡片或应用 kind 决定（family、framework、`publish.platforms`、`supportedDeploymentProfiles` + 默认 `standalone`），创建表单上传的图标同时落在两个图标槽，外加规范的 `metadata.deploymentConfig` 指针与初始 `0.1.0` 发布条目。创建流程无法真实得知的字段——官网、截图、包矩阵——保持缺席，交给应用仓库的作者补全；绝不伪造。已存在的清单只做合并、绝不重写。组合出的清单回读会解析出同一张类型卡片；补上记录的图标与官网后，九张卡片的组合清单全部通过 `check-app-manifest-standard.mjs`。

**实时列表。** 应用库在任一叠层表面关闭时重扫，也会在无叠层遮挡时随宿主变更通道的每次通知原地重扫——会话 cwd 切换，或其他表面（行菜单流程将自身结果转发为宿主通知）的清单写入——创建、关联与会话切换都无需重开窗口即可反映在界面上。

发布对话框复用 `@sdkwork/deployments-pc-console-publishing` 的 `CreateDeployAppDialog`（类型确认 → 源码目录/环境 → 目标应用 → 素材 → 版本/说明），并支持源码目录、应用类型、多级分类、图标/封面/截图、语义化版本、描述与 release notes；上传流程为 `UploadSourceDialog`，模板流程为本插件自有的 `PublishTemplateFlow`。

关联写入应用清单的规范位置（APP_MANIFEST_SPEC §4.1）：`metadata.publishing.appIdByTarget[<mode>.<environment>]` 保存平台应用 ID，旁边的 `metadata.publishing.birdcoder` 记录 fork 自有的展示与模板溯源信息。部署 profile 键由清单的 `runtime.defaultDeploymentProfile` 与宿主当前生命周期档位组成（`testing` 映射为 `test`）。旧版本插件写过顶层 `deploy` 节并覆盖 `backend.appId`；读取仍兼容旧节，首次写入会把旧数据折叠进规范块并删除这个非法顶层键，`backend.appId` 中的 IAM 应用标识保持不动。

创建是一个操作、三个按序持久化的事实：`deploy_app` 记录、项目关联、清单类型卡片对应的平台目标。关联写入失败时保留已创建的应用并给出「重试写入项目关联」，重试只补写关联与缺失的平台目标，绝不会再登记第二个应用。

宿主适配器（`deployHost.ts`）通过全局 token manager 从共享的 `ui-sdkwork-env` 与 `ui-sdkwork-iam` 服务构造生成的 deploy/drive 客户端，因此对话框保持宿主无关、可复用。持久化严格走 `sdkwork-deployments` 现有表结构（`deploy_app`、`deploy_app_platform_target`、`deploy_app.metadata` JSONB）与 deploy app-api OpenAPI 契约。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/client/DeployPublishAction.tsx` — 头部触发按钮；直接打开应用库弹窗（无菜单），并把应用库的结果以头部横幅呈现。
- `src/client/appLibrary.ts` — 文件驱动的发现遍历：对 workspace 扫描端口做有界广度优先遍历，收集每个携带清单的项目（深度、目录数与尝试次数三重上限；剪除隐藏与构建产物子目录），并把每份清单投影为库条目。
- `src/client/DeployAppLibraryDialog.tsx` — 应用库弹窗：发现列表（logo、类型标签、关联徽标与行内「发布 / 上传代码 / 打包」操作）、可点击的空态占位块，以及底部「新建应用」——打开控制台完整创建表单，并在会话项目尚未登记应用时把新建应用关联过去。
- `src/client/appManifestCompose.ts` — 创建时清单书写：逐类型运行时身份表（控制台类型卡片 → 规范 §6.1 的 family/framework/platforms/appType，应用 kind 兜底），无清单项目的完整骨架组合器，app.key 推导链，以及既有清单只合并不重写的路径。
- `src/client/DeployProjectAppFlow.tsx` — 所有入口共用的状态机：先解析已登记应用（直接发布/上传），否则用清单草稿确认创建，再进入请求的表面。
- `src/client/DeployProjectAppDialog.tsx` — 创建确认页：清单推导的名称/标识/描述、失效关联提示、关联重试态与完整表单转交。
- `src/client/projectApp.ts` — 纯清单解析：治理身份、已登记应用 ID，以及清单词表到控制台类型卡片的映射。
- `src/client/projectAppCreate.ts` — 创建操作：重复拦截、记录、关联、平台目标与可恢复的失败事实。
- `src/client/deployAppConfig.ts` — 关联标准：规范 `metadata.publishing.appIdByTarget`、fork 溯源块、旧 `deploy` / `backend.appId` 读取，以及保留其余各节的原位合并。
- `src/client/PublishTemplateFlow.tsx` — 共享的发布为模板流程（清单解析 → 选择器回退 → `PublishTemplateDialog` → 清单回写）；头部与行菜单消费的 `deployPublish.openTemplate` 服务都挂载它。宿主通知会重读客户端：IAM 会话迟到水合或令牌轮换时，重新同步私有令牌管理器并重挂选择器重试。
- `src/client/deployHost.ts` — 环境/IAM 适配、客户端构造（对齐 `ui-sdkwork-drive` 模式）、workspace 列举/扫描桥、项目状态读取（`readProjectApp`）、项目清单读写桥（`readDeployLink`/`writeDeployLink` 接受显式项目目录，缺省为会话 cwd；`writeDeployLink` 经创建身份组合完整清单）、会话列表接入的 `notifyChange` 通道，以及应用库「打包」动作挂载的构建端口。
- `src/client/DeployPublishDialog.tsx` — 基于 `CreateDeployAppDialog` 的独立发布表面；已解析的关联应用直接传入，因此跳过对话框的应用选择步骤。
- `src/client/PublishTemplateDialog.tsx` — 模板发布表单：分类来自 `templateCategories.list`，平台维度多选，版本 + 更新说明，四种模板源；压缩包源经 `createDeployAppOperationsService.uploadCodeFromArchive` 上传，git 源经 `connectGitSource` 绑定。
- `src/client/gitignore.ts` — `.gitignore` 匹配器（否定、仅目录、锚定、`**`、深层文件覆盖）供目录打包器使用。
- `src/client/directoryArchive.ts` — 目录 → zip 打包器：子树作用域的忽略级联与 git 的目录剪枝语义，`.git` 始终剔除，字节上限保护，SHA-256 校验。
- `src/client/templatePlatforms.ts` — 平台维度词表（storefront 规范四值 + 其余 SDKWork 应用族）及其到制品包类型的映射。
- `src/client/templateInstall.ts` — 消费侧地基：经 Drive content API 下载产物字节（产物自带 `driveNodeId`，安装已发布模板不需要任何新增后端端点）、fflate 解压、zip-slip 与平台保留名筛查、展开上限，以及供目标目录写入器执行的文本/二进制切分。
- `src/client/deployPorts.ts` — 各发布表面共享的响应式主题/locale 端口与 locale→deployments-locale 映射。
- `src/client/DeployAppPickerDialog.tsx` — 模板流程在清单无关联应用（或关联已失效）时的应用解析步骤。两个插件弹窗的亮/暗配色都由 `data-theme` 根元素驱动（`DeployDialogs.module.css`）。
- 发布/上传对话框位于 `@sdkwork/deployments-pc-console-publishing`；本包提供客户端、语言、主题、目录选择端口与持久化。

### Runtime invariants

不发布运行时不变量伴随检查；该包是 UI 插件，其 session-header 入口只打开共享的发布流程；不拥有跨插件可变状态，其唯一的 slot 注册通过 HMR 安全规格测试验证销毁。

<a id="known-limitations-and-deferred-work"></a>

## Model Experience

无，因为插件渲染面向人的发布对话框并写入部署记录与项目清单；不添加提示词、工具或会话事件。

#### KV Cache effect

无；SDKWork 部署请求与清单写入属于独立的浏览器流量，不会改变 Harness 的模型提供方请求。

## 已知限制与后续工作

- 组合清单只填写创建流程能真实得知的内容。`app.officialWebsiteUrl` 与主图标（创建表单未上传时）保持缺席，因此规范校验器 `check-app-manifest-standard.mjs` 会恰好报告这两个字段，直到应用仓库的作者补全；截图与包矩阵同样延后。绝不伪造。
- 应用库扫描是有界遍历（深度 3、120 个列出目录、300 次列目录尝试，剪除隐藏与构建产物子目录），依赖无法区分文件与目录的 workspace 列举桥，文件子目录会消耗一次失败的列目录。超出预算深度的项目仍可在 deployments 控制台看到，但不会进入应用库。
- 每个项目只记录一个 profile 的关联：清单默认部署形态 + 宿主当前生命周期档位。同一项目在 deployments 控制台发布到其他 profile 时，其条目保留在自己的键下；读取时优先宿主 profile，其次回退到唯一或同形态条目。
- 创建携带清单身份（名称、应用类型、描述、标识）与平台目标；分类与素材（icon、封面、截图）不从清单 `media` URL 导入，仍由 deployments 控制台的应用行上传。
- 浏览器目录选择（`showDirectoryPicker`）仅暴露文件夹名而非绝对路径；对话框保留路径输入框供用户补全。
- 分类目录为 deployments 包内的声明式数据；切换为服务端目录（如 appstore）仅需更换数据源。
- 模板版本的 `platformTargets` 服务端为自由字符串；词表仅由客户端约束（`templatePlatforms.ts`），deployments 服务端可收紧为枚举。
- 「使用模板创建项目」还剩最后一个宿主依赖：下载（产物 `driveNodeId` 走 Drive content API）、解压、安全筛查与写入规划均已在客户端完成（`templateInstall.ts`），但把规划出的文件落盘需要宿主写入桥——文本文件已可走受治理的 `writeTextFile`，二进制条目（图标、字体）等待 `directoryPicker` 缝上的有界二进制写入能力或一个 fork 自有的脚手架 Remote。git 发布的模板同时把仓库、分支与子目录记录进项目清单，作为后续脚手架流程（或 `create-sdkwork-app`）消费的本地打包规格。

### Dev Note

各对话框是纯浏览器侧表面：渲染共享的 `@sdkwork` 发布组件，消费 deployments 包内的 deploy-app 目录，并经 session-header 入口与 `deployPublish` 服务打开；此处不持有任何主机侧部署状态。

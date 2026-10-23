---
description: "SDKWork 发布应用插件：会话头部（及行菜单）只有一个按项目状态决策的发布入口——读取项目 sdkwork.app.config.json，已登记应用直接发布；未登记则用清单资料完成创建（应用记录 + 平台目标 + 项目关联）后继续发布；关联写入规范的 metadata.publishing.appIdByTarget，项目已有应用时拒绝再次创建。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-deploy

[English](README.md) | 中文

## 概述

从项目自身清单发布应用：点击头部火箭图标（或行菜单的发布入口），插件发布项目已登记的应用；未登记时用 `sdkwork.app.config.json` 的名称、类型、描述与标识创建应用，登记平台目标后继续进入发布对话框。已有应用的项目不会出现创建入口。当 BirdCoder 项目需要接入 SDKWork 部署、又不想重填仓库已治理的资料时使用它。应用 ID 写入清单规范的 `metadata.publishing.appIdByTarget`。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

将本插件挂载到运行时（一行 cordis.yml 组合行 + 本包依赖）。头部图标打开点击菜单，菜单行来自当前会话项目的清单；头部流程面向该会话的项目，行菜单流程面向行自身的目录。

- **没有登记应用**：只有一行「创建应用并发布」。清单提供草稿（展示名称、由 `appType`/`runtime`/`publish.platforms` 推导的类型卡片、描述、应用标识）；确认页展示后创建，清单无法确定类型卡片时转交控制台的完整创建表单。
- **已登记且可解析**：显示「发布应用」「上传代码」「发布为模板」。不渲染任何创建入口，并且流程在创建前会立即重读清单，因此在另一个窗口刚关联过应用的项目不会再得到第二个应用。
- **已登记但应用已不存在**：提供重建，并写回同一处关联。

发布对话框复用 `@sdkwork/deployments-pc-console-publishing` 的 `CreateDeployAppDialog`（类型确认 → 源码目录/环境 → 目标应用 → 素材 → 版本/说明），并支持源码目录、应用类型、多级分类、图标/封面/截图、语义化版本、描述与 release notes；上传流程为 `UploadSourceDialog`，模板流程为本插件自有的 `PublishTemplateFlow`。

关联写入应用清单的规范位置（APP_MANIFEST_SPEC §4.1）：`metadata.publishing.appIdByTarget[<mode>.<environment>]` 保存平台应用 ID，旁边的 `metadata.publishing.birdcoder` 记录 fork 自有的展示与模板溯源信息。部署 profile 键由清单的 `runtime.defaultDeploymentProfile` 与宿主当前生命周期档位组成（`testing` 映射为 `test`）。旧版本插件写过顶层 `deploy` 节并覆盖 `backend.appId`；读取仍兼容旧节，首次写入会把旧数据折叠进规范块并删除这个非法顶层键，`backend.appId` 中的 IAM 应用标识保持不动。

创建是一个操作、三个按序持久化的事实：`deploy_app` 记录、项目关联、清单类型卡片对应的平台目标。关联写入失败时保留已创建的应用并给出「重试写入项目关联」，重试只补写关联与缺失的平台目标，绝不会再登记第二个应用。

宿主适配器（`deployHost.ts`）通过全局 token manager 从共享的 `ui-sdkwork-env` 与 `ui-sdkwork-iam` 服务构造生成的 deploy/drive 客户端，因此对话框保持宿主无关、可复用。持久化严格走 `sdkwork-deployments` 现有表结构（`deploy_app`、`deploy_app_platform_target`、`deploy_app.metadata` JSONB）与 deploy app-api OpenAPI 契约。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/client/DeployPublishAction.tsx` — 头部触发按钮与点击菜单；菜单行由清单状态决定，每一行按所需表面挂载流程。
- `src/client/DeployProjectAppFlow.tsx` — 所有入口共用的状态机：先解析已登记应用（直接发布/上传），否则用清单草稿确认创建，再进入请求的表面。
- `src/client/DeployProjectAppDialog.tsx` — 创建确认页：清单推导的名称/标识/描述、失效关联提示、关联重试态与完整表单转交。
- `src/client/projectApp.ts` — 纯清单解析：治理身份、已登记应用 ID，以及清单词表到控制台类型卡片的映射。
- `src/client/projectAppCreate.ts` — 创建操作：重复拦截、记录、关联、平台目标与可恢复的失败事实。
- `src/client/deployAppConfig.ts` — 关联标准：规范 `metadata.publishing.appIdByTarget`、fork 溯源块、旧 `deploy` / `backend.appId` 读取，以及保留其余各节的原位合并。
- `src/client/PublishTemplateFlow.tsx` — 共享的发布为模板流程（清单解析 → 选择器回退 → `PublishTemplateDialog` → 清单回写）；头部与行菜单消费的 `deployPublish.openTemplate` 服务都挂载它。宿主通知会重读客户端：IAM 会话迟到水合或令牌轮换时，重新同步私有令牌管理器并重挂选择器重试。
- `src/client/deployHost.ts` — 环境/IAM 适配、客户端构造（对齐 `ui-sdkwork-drive` 模式）、项目状态读取（`readProjectApp`）与项目清单读写桥（`readDeployLink`/`writeDeployLink` 接受显式项目目录，缺省为会话 cwd）。
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

- 每个项目只记录一个 profile 的关联：清单默认部署形态 + 宿主当前生命周期档位。同一项目在 deployments 控制台发布到其他 profile 时，其条目保留在自己的键下；读取时优先宿主 profile，其次回退到唯一或同形态条目。
- 创建携带清单身份（名称、应用类型、描述、标识）与平台目标；分类与素材（icon、封面、截图）不从清单 `media` URL 导入，仍由 deployments 控制台的应用行上传。
- 浏览器目录选择（`showDirectoryPicker`）仅暴露文件夹名而非绝对路径；对话框保留路径输入框供用户补全。
- 分类目录为 deployments 包内的声明式数据；切换为服务端目录（如 appstore）仅需更换数据源。
- 模板版本的 `platformTargets` 服务端为自由字符串；词表仅由客户端约束（`templatePlatforms.ts`），deployments 服务端可收紧为枚举。
- 「使用模板创建项目」还剩最后一个宿主依赖：下载（产物 `driveNodeId` 走 Drive content API）、解压、安全筛查与写入规划均已在客户端完成（`templateInstall.ts`），但把规划出的文件落盘需要宿主写入桥——文本文件已可走受治理的 `writeTextFile`，二进制条目（图标、字体）等待 `directoryPicker` 缝上的有界二进制写入能力或一个 fork 自有的脚手架 Remote。git 发布的模板同时把仓库、分支与子目录记录进项目清单，作为后续脚手架流程（或 `create-sdkwork-app`）消费的本地打包规格。

### Dev Note

各对话框是纯浏览器侧表面：渲染共享的 `@sdkwork` 发布组件，消费 deployments 包内的 deploy-app 目录，并经 session-header 入口与 `deployPublish` 服务打开；此处不持有任何主机侧部署状态。

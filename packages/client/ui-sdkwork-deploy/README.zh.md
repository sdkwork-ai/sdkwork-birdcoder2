---
description: "SDKWork 发布应用插件：会话头部触发器打开应用库——有界的 workspace 扫描发现每一个携带 agent.app.config.json 的项目并列表展示，行内提供发布、上传代码与打包操作，底部为新建应用；设置菜单的「我的应用部署」行打开当前用户名下 deploy_app 记录的只读台账，可按应用类型筛选；行菜单运行同样的按项目状态决策的流程——读取清单，已登记应用直接发布，未登记则用清单资料完成创建（应用记录 + 平台目标 + 项目关联），「发布为模板」打开应用模板中心，按 sdkwork-specs 扫描项目 apps/ 下的独立应用并发布为脚手架模板，也可把模板安装回 apps/ 或自定义目录；关联写入规范的 metadata.publishing.appIdByTarget，项目已有应用时拒绝再次创建。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-deploy

[English](README.md) | 中文

## 概述

头部火箭图标打开**应用库**：对会话 workspace 做一次有界遍历，发现每一个携带 `agent.app.config.json` 的项目，按清单自身的名称、类型、图标与关联状态列表展示。每一行的右侧可以直接发布、上传代码或打包该项目；底部「新建应用」打开控制台的完整创建表单；空扫描渲染可点击的占位块，动作与底部一致。创建会写出完整的 APP_MANIFEST_SPEC v3 清单——身份、按类型的运行时、发布、媒体与关联——并且应用库随会话 cwd 切换实时重扫。

设置菜单 popover 的「我的应用部署」行打开只读的已部署应用弹窗：当前用户名下的 `deploy_app` 记录（应用 API 的 `USER` 归属作用域），按更新时间倒序，并可按应用类型筛选。它读取与发布流程相同的宿主构造客户端，且从不写入。

行菜单的「发布为模板」动作打开**应用模板中心**。发布页扫描 `<项目>/apps` 中符合 SDKWork workspace 规范的独立应用根目录（`apps/README.md` 索引 + `agent.app.config.json`），可勾选任意多个并逐个发布为应用开发脚手架模板：先按清单关联或注册当前账号的平台应用，经宿主桥用 `.gitignore` 感知的打包器打包应用目录（排除本机敏感文件）并上传为版本制品，再创建模板；同一账号对同一平台应用与模板标识已有模板时，改为更新模板并追加新版本，不会重复创建。每个选中行都有自己的名称、标识、版本、更新说明与实时发布进度。安装页列出我的模板（与模板市场），可安装到 `<项目>/apps/<模板标识>`——同名目录自动追加序号而不是覆盖本地应用——或自定义绝对目录；文件落盘后把模板身份写入应用清单，并更新 `apps/README.md` 索引行。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

将本插件挂载到运行时（一行 cordis.yml 组合行 + 本包依赖）。头部图标打开应用库弹窗；行菜单的发布入口面向行自身目录运行按项目流程。

**应用库（头部触发器）。** 弹窗扫描会话 cwd（深度 3、至多 120 个列出目录，剪除隐藏与构建产物子目录）中的 `agent.app.config.json` 清单并列出发现的每个项目：

- 每行展示清单的展示名称、推导的类型标签（清单映射到的控制台类型卡片）、关联徽标、项目路径与 logo（`app.iconUrl` / `media.icons.primary.url`，缺省回退到名称首字母）。
- 行右侧的「发布」「上传代码」按该目录复用共享项目流程（清单未登记应用时先创建或关联），「打包」在组合包含 `sdkwork-app-build` 时经宿主构建端口打开打包进度弹窗，「源码」打开源码绑定弹窗——应用除部署代码外携带的两种源码形态。
- 文件遍历与名下的 deploy 应用合并：没有任何本地清单引用的应用——创建时会话没有可承载清单的目录、关联写入失败、或会话项目已登记其他应用——以「未关联本地目录」徽标的服务端行列出，行内直接打开发布/上传（无本地目录，不提供打包）。因此创建成功永远不会不可见：无论清单是否落地，弹窗都会显示该应用。
- 空合并渲染可点击占位块，动作与底部「新建应用」一致：控制台的完整创建表单，其类型网格覆盖 SDKWork 全部应用词表（h5、pc-web、桌面、小程序、Android、iOS、鸿蒙、API 服务、静态站点，各含框架技术栈）。新建的应用在会话项目尚未登记应用时自动关联到该项目。

**已部署应用（设置菜单）。**「我的应用部署」行打开当前用户 `deploy_app` 记录的只读弹窗。列表来自 `apps.list` 的 `USER` 归属作用域——可达集仍由服务端归属闸门决定，作用域只把它收窄到调用者个人应用。弹窗先加载全部页（每请求 100 行，五页上限，触顶时显示截断说明），因此应用类型芯片与其筛出的行来自同一集合；空选择表示「全部类型」，多选为 OR。行内展示应用名、slug、类型、状态、最新发布版本与更新时间，按更新时间倒序。弹窗还提供刷新/重试、空态与筛选空态、网关未配置提示，以及未登录时的共享登录入口。它不写入任何数据：发布仍由应用库与行菜单承担。

**行菜单项目流程。** 同一流程服务所有入口，由项目清单状态驱动：

- **没有登记应用**：「创建应用并发布」。清单提供草稿（展示名称、由 `appType`/`runtime`/`publish.platforms` 推导的类型卡片、描述、应用标识）；确认页展示后创建，清单无法确定类型卡片时转交控制台的完整创建表单。
- **已登记且可解析**：「发布应用」「上传代码」。流程在创建前会立即重读清单，因此在另一个窗口刚关联过应用的项目不会再得到第二个应用。
- **已登记但应用已不存在**：提供重建，并写回同一处关联。
- **发布为模板**与**从模板安装**是行菜单动作（`deployPublish.openTemplate`）：前者在发布页打开应用模板中心，列出项目 `apps/` 下的独立应用及去重状态并发布勾选项；后者在安装页打开同一中心，把模板装回 `apps/` 或自定义目录。头部弹窗仍是应用清单，不是第二个菜单。

**创建写出完整清单（APP_MANIFEST_SPEC v3）。** 目标项目没有 `agent.app.config.json` 时，关联写入组合出完整骨架，而不是规范 §4.1 允许的仅关联 stub：八个必备节齐全（`app`、`backend`、`runtime`、`media`、`publish`、`artifacts`、`release`、`security`），身份来自创建记录（key 依次取治理键、名称 kebab 推导、控制台 slug；名称、展示名、描述、`appType`），运行时身份按规范 §6.1 客户端架构对齐表由类型卡片或应用 kind 决定（family、framework、`publish.platforms`、`supportedDeploymentProfiles` + 默认 `standalone`），创建表单上传的图标同时落在两个图标槽，外加规范的 `metadata.deploymentConfig` 指针与初始 `0.1.0` 发布条目。创建流程无法真实得知的字段——官网、截图、包矩阵——保持缺席，交给应用仓库的作者补全；绝不伪造。已存在的清单只做合并、绝不重写。组合出的清单回读会解析出同一张类型卡片；补上记录的图标与官网后，九张卡片的组合清单全部通过 `check-app-manifest-standard.mjs`。

**源码绑定。**「源码」动作在该行项目上打开源码绑定弹窗：**本地目录**选择目录并记录为 `metadata.publishing.birdcoder.sourceDirectory`（即「打包」的构建目录与发布对话框的默认目录）；**Git 仓库**记录 https 克隆地址、可选默认分支与应用打包的子目录（`sourceGitUrl` / `sourceGitBranch` / `sourceSubDirectory`），清单已登记应用时绑定同时经发布服务的 `connectGitSource` 落到平台（`sourceRepositories`）。未登记应用的项目只记录清单规格，在首次发布或创建应用时再绑定平台。任一事实在记录后，行内即显示「源码：本地目录 / 源码：Git」徽标，弹窗按清单预填。

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
- `src/client/DeployedAppsDialog.tsx` — 设置菜单弹窗外壳：网关就绪判定、登录门与台账读取的客户端对（`settings.myDeployments` 席位）。
- `src/client/DeployedAppsPanel.tsx` — 当前用户已部署应用台账：分页读取、应用类型芯片、按更新时间倒序的行，以及刷新/重试/空态。
- `src/client/deployedApps.ts` — 台账的纯模型：带页上限的翻页遍历、类型分面计数与 OR 筛选、更新时间排序、稳定的时间格式化，以及 `deploy_app` 枚举 → 字典映射。
- `src/client/appManifestCompose.ts` — 创建时清单书写：逐类型运行时身份表（控制台类型卡片 → 规范 §6.1 的 family/framework/platforms/appType，应用 kind 兜底），无清单项目的完整骨架组合器，app.key 推导链，以及既有清单只合并不重写的路径。
- `src/client/DeployProjectAppFlow.tsx` — 所有入口共用的状态机：先解析已登记应用（直接发布/上传），否则用清单草稿确认创建，再进入请求的表面。
- `src/client/DeployProjectAppDialog.tsx` — 创建确认页：清单推导的名称/标识/描述、失效关联提示、关联重试态与完整表单转交。
- `src/client/projectApp.ts` — 纯清单解析：治理身份、已登记应用 ID，以及清单词表到控制台类型卡片的映射。
- `src/client/projectAppCreate.ts` — 创建操作：重复拦截、记录、关联、平台目标与可恢复的失败事实。
- `src/client/deployAppConfig.ts` — 关联标准：规范 `metadata.publishing.appIdByTarget`、fork 溯源块、旧 `deploy` / `backend.appId` 读取，以及保留其余各节的原位合并。
- `src/client/PublishTemplateFlow.tsx` — 行菜单 `deployPublish.openTemplate` 挂载的共享应用模板流程：构造客户端、读取当前账号，并为目标项目目录渲染模板中心。宿主通知会重建客户端与身份，IAM 会话迟到水合或令牌轮换后中心以已登录状态重新加载。
- `src/client/TemplateCenterDialog.tsx` — 双页签中心外壳：账号芯片与登录门、带重试的发布扫描与目录读取、勾选/逐应用取值/发布设置状态、按行顺序发布并把阶段翻译成进度、以及安装面板挂载。
- `src/client/TemplatePublishPanel.tsx` — 发布表现层：应用卡片（勾选、图标、类型/平台/版本徽标、去重与平台应用状态）、逐应用可编辑的模板字段、共享分类/可见性/审核设置、计划数量与逐行实时进度。
- `src/client/TemplateDownloadPanel.tsx` — 安装表现层：我的模板/模板市场来源与搜索、目标模式（项目 `apps/` 或经宿主选择器的自定义目录）、逐行目标预览与安装进度。
- `src/client/templateApps.ts` — `apps/` 扫描：读取目录索引，要求每个候选有可解析的 `agent.app.config.json`，跳过共享包族与不完整根目录，并推导身份、类型卡片、版本、平台与既有链路。
- `src/client/appsIndex.ts` — `apps/README.md` 目录索引解析与原地行更新，供扫描与安装后对账使用。
- `src/client/templatePublish.ts` — 发布计划与状态机：平台应用匹配（清单链路 → slug/名称 → 展示名）、按平台应用 + 标识的模板去重、版本递增、注册平台应用、打包上传、模板创建/更新与版本追加、审核提交与清单链路写入。
- `src/client/templateDownload.ts` — 安装规划与对账：`apps/<标识>` 目标与数字后缀避让、自定义绝对目标、父目录创建、清单发现、模板链路写入，以及 `apps/README.md` 行更新与面向用户的提示。
- `src/client/templatePorts.ts` — 把纯发布/安装模块接到生成式 deploy/drive 客户端与宿主桥的适配器，含账号作用域的应用/模板翻页与源码脚手架包类型。
- `src/client/deployHost.ts` — 环境/IAM 适配、客户端构造（对齐 `ui-sdkwork-drive` 模式）、workspace 列举/扫描桥、当前账号投影（id、展示名、头像、邮箱）、模板打包读取桥（`listTemplateFiles`/`readTemplateFiles`）与文件写入桥（`writeTemplateFile`）、目录创建、项目状态读取（`readProjectApp`）、项目清单读写桥（`readDeployLink`/`writeDeployLink` 接受显式项目目录，缺省为会话 cwd；`writeDeployLink` 经创建身份组合完整清单）、会话列表接入的 `notifyChange` 通道，以及应用库「打包」动作挂载的构建端口。
- `src/client/DeployPublishDialog.tsx` — 基于 `CreateDeployAppDialog` 的独立发布表面；已解析的关联应用直接传入，因此跳过对话框的应用选择步骤。
- `src/client/hostArchive.ts` — 宿主打包器：把宿主的有限文件列举/分批读取变成 `directoryArchive` 的惰性文件面，打包前排除本机敏感文件，并上报读取进度。
- `src/client/gitignore.ts` — `.gitignore` 匹配器（否定、仅目录、锚定、`**`、深层文件覆盖）供目录打包器使用。
- `src/client/directoryArchive.ts` — 目录 → zip 打包器：子树作用域的忽略级联与 git 的目录剪枝语义，`.git` 始终剔除，字节上限保护，SHA-256 校验。
- `src/client/templatePlatforms.ts` — 平台维度词表（storefront 规范四值 + 其余 SDKWork 应用族）及其到制品包类型的映射。
- `src/client/templateInstall.ts` — 消费侧地基：经 Drive content API 下载产物字节（产物自带 `driveNodeId`，安装已发布模板不需要任何新增后端端点）、fflate 解压、zip-slip 与平台保留名筛查、展开上限，以及供目标目录写入器执行的文本/二进制切分。
- `src/client/deployPorts.ts` — 各发布表面共享的响应式主题/locale 端口与 locale→deployments-locale 映射。模板中心的亮/暗配色由 `data-theme` 根元素驱动（`DeployDialogs.module.css` + `TemplateCenter.module.css`）。
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
- 服务端合并按选择器的页大小（50）拉取名下应用；名下应用超过上限时，其余应用仍在 deployments 控制台可见。
- 设置菜单的已部署应用弹窗最多遍历五页、每页 100 行，触顶时会明确说明；应用更多的用户可在 deployments 控制台查看其余部分。
- 应用库扫描是有界遍历（深度 3、120 个列出目录、300 次列目录尝试，剪除隐藏与构建产物子目录），依赖无法区分文件与目录的 workspace 列举桥，文件子目录会消耗一次失败的列目录。超出预算深度的项目仍可在 deployments 控制台看到，但不会进入应用库。
- 每个项目只记录一个 profile 的关联：清单默认部署形态 + 宿主当前生命周期档位。同一项目在 deployments 控制台发布到其他 profile 时，其条目保留在自己的键下；读取时优先宿主 profile，其次回退到唯一或同形态条目。
- 创建携带清单身份（名称、应用类型、描述、标识）与平台目标；分类与素材（icon、封面、截图）不从清单 `media` URL 导入，仍由 deployments 控制台的应用行上传。
- 浏览器目录选择（`showDirectoryPicker`）仅暴露文件夹名而非绝对路径；对话框保留路径输入框供用户补全。
- 分类目录为 deployments 包内的声明式数据；切换为服务端目录（如 appstore）仅需更换数据源。
- 模板版本的 `platformTargets` 服务端为自由字符串；词表仅由客户端约束（`templatePlatforms.ts`），deployments 服务端可收紧为枚举。
- 从项目目录发布依赖宿主打包桥（`sdkworkTemplateInstall.listFiles`/`readFiles`）：未装载 `sdkwork-template-install` 的组合仍可打开中心，但选中的应用行无法打包，发布动作会报告宿主失败。宿主把归档遍历限制在 20,000 个文件 / 24 层，每批读取限制在 64 条路径 / 32 MiB（单文件 64 MiB）；超限应用会被拒绝，而不是发布不完整内容。`.env`、`*.local` 覆盖文件与密钥材料始终排除；签入的 `.env.<mode>.<environment>` 模板保留在脚手架中，其余仍由应用 `.gitignore` 决定。
- 应用扫描以可解析的 `agent.app.config.json` 作为独立应用根标记，并把 `apps/README.md` 中 `common` 角色视为排除项。没有该清单的 `apps/` 子目录（包括只是尚未补齐清单的可运行根目录）只计数忽略，不会发布；仅当 `apps/` 本身不存在时才考虑项目根目录。
- 去重按当前账号与标识进行：同一账号已有相同模板标识时复用，即使该模板记录的来源应用与当前匹配到的平台应用不同（重新发现或重新关联的应用根）；两个选中根目录声明同一标识时两行都被阻止，而不是把版本静默合并，需修改其中一个标识。
- 应用根尚未关联时，按清单的控制台类型卡片注册平台应用。多端根目录（Flutter 或共享移动壳）无法确定单一卡片时，回退到清单声明的第一个具体平台（`ANDROID_APP`、`IOS_APP` 等），因此仍可发布；只有既无卡片又无平台声明的应用会阻止该行，需先在 deployments 控制台完成关联。
- 安装页最多列出五页、每页 100 个名下模板，模板市场每次搜索取前 50 条；更大的目录仍在 deployments 控制台。市场安装需要市场读取权限，安装本身与发布共用同一个已登录账号。
- 两个页签都要求 IAM 用户会话（账号芯片与作者身份都来自它）。只配置静态应用访问令牌的部署没有可归属模板的用户主体，中心会停在登录门；此时仍可使用 deployments 控制台。
- 安装后的脚手架会把模板身份写入应用清单，但只有项目已包含规范目录表时才补充 `apps/README.md` 行；缺少该表的 README 只提示、不自动重构。
- `apps/` 模式从不覆盖已有目录：同名应用目录自动追加 `-2`、`-3`…… 后缀。自定义目标会覆盖操作者所选目录内的同名文件（选择本身归操作者），且不会写入 `apps/README.md`。

### Dev Note

各对话框是纯浏览器侧表面：渲染共享的 `@sdkwork` 发布组件，消费 deployments 包内的 deploy-app 目录，并经 session-header 入口与 `deployPublish` 服务打开；此处不持有任何主机侧部署状态。

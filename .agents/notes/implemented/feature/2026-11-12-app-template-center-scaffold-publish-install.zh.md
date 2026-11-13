# Agent Note: 应用模板中心——按 apps/ 发布脚手架并安装回 apps/

Status: implemented

[English](2026-11-12-app-template-center-scaffold-publish-install.md) | 中文

## Problem

行菜单的「发布为模板」原本是单应用流程：解析项目唯一关联的 `deploy_app`，打开一个表单，其来源选项是「应用当前代码」、本地 `.zip`、浏览器选择的目录或 git 仓库，并把模板身份记录到**项目**清单。它无法回答 SDKWork workspace 的实际形态：`apps/` 是一组独立应用根目录，每个都有自己的 `agent.app.config.json`；应用开发脚手架模板是其中一个根的源码树，而不是可部署产物，也不是根项目清单。

因此出现三个缺口。流程不从 `apps/` 列出任何内容，发布五个应用根就要手动选五次目录。浏览器无法读取任意应用目录的字节，所以「从项目目录发布」没有打包路径。消费侧则完全缺失：模板产物可以下载解压，但没有任何逻辑选择 `apps/<key>`、对账安装后的清单或更新仓库的 `apps/README.md` 目录索引，导致下载的脚手架不能像生成的应用那样加入工作区。

## Decision

发布与安装是相互独立的弹窗（`deployPublish.openPublishTemplate` 与 `openInstallTemplate`）。本笔记拥有共享的规划、打包与执行机制；[独立弹窗笔记](2026-11-13-independent-template-publish-install-dialogs.zh.md)拥有拆分本身。两个方向都是账号作用域。

### 发布：发现、去重、打包、上传、版本

发布弹窗扫描 `<项目>/apps`（仅当 `apps/` 不存在时才回退到项目根）。子目录携带可解析的 `agent.app.config.json` 才算独立应用根；目录索引标为 `role: common` 的子目录是共享包族，继续忽略，不完整根目录同样忽略。扫描会报告被忽略的数量，而不是静默列出（[`templateApps.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/templateApps.ts)）。

第二个来源覆盖不在 `apps/` 下的应用。用户经宿主目录选择器挑任意绝对目录；[`templateCustomApp.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/templateCustomApp.ts) 用同一套有界宿主遍历列出目录，读取少量标记文件（`agent.app.config.json`、`package.json`、`pubspec.yaml`、各平台工程文件），并构建同一种候选。有效清单优先。没有清单时，项目标记推断类型——Flutter 及其平台目录、React Native/Expo、小程序、Android、iOS、HarmonyOS、Electron/Tauri、Web 框架、静态 HTML 或服务端框架——并展示检测依据，允许从固定词表手动改选。无法识别的目录仍是有效候选，但在用户选择类型前不能继续，下一步与发布会说明原因，而不是打包后才失败。

选中的应用先匹配调用者自己的平台应用——清单链路、治理 key 对服务端 slug/name、展示名——再按模板 key 与调用者的模板列表去重。一次发布随后：

1. 没有匹配时注册平台应用；多端清单无法确定单一卡片时回退到第一个具体声明平台（`ANDROID_APP`、`IOS_APP` 等），因此 Flutter 根仍可发布；
2. 经宿主桥（`sdkworkTemplateInstall.listFiles`/`readFiles`）用与浏览器选目录相同的 `.gitignore` 感知打包器打包应用根，排除 `.env`/`*.local` 覆盖与密钥材料，并拒绝被宿主 20,000 文件 / 24 层上限截断的列表；打包器用 fflate 在本地生成 zip，并在任何网络写入前报告压缩后的文件数与字节数；
3. 只把这个本地生成的 zip 上传为模板版本的产物；
4. 创建模板；账号已拥有该 key 时更新列表并追加新版本（并发创建会被重读并采用）；
5. 可选提交审核；以及
6. 把应用 id、模板 id/key/name/version 写回应用根自己的 `metadata.publishing` 块。

选中应用的默认版本取已有模板最新**语义**版本的 patch+1，读取 `deploy_app_template_version.template_version`（列表行的 `version` 是乐观锁计数器，绝不当作版本号）。离线回退值是应用清单记录的 `templateVersion`。

### 安装：只落到 apps/ 下的一个应用根

安装弹窗列出调用者的模板与公开市场。默认目标把归档落到 `<项目>/apps/<模板标识>`；同名目录自动追加 `-2`、`-3`……而不是覆盖本地应用。也支持自定义绝对目录，并覆盖其中的同名文件。

文件落盘后，安装器把模板身份写入安装后的 `agent.app.config.json`（仅当归档携带可解析清单；绝不凭空生成），校验该清单，并按目录后缀与类型卡片推导角色，更新 `apps/README.md` 中的行（[`templateDownload.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/templateDownload.ts)、[`appsIndex.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/appsIndex.ts)）。自定义目标不属于项目树，因此不写索引。

### 宿主能力与产品表面

`packages/host/sdkwork-template-install` 在 `writeFile` 旁新增两个有界读取：`listFiles`（排序、拒绝符号链接、按跳过表遍历）与 `readFiles`（每批 64 条路径 / 32 MiB，单文件 64 MiB）。控制器经同一个 `sdkworkTemplateInstall` Remote 暴露它们；既有安装规划器无需新端点。浏览器用既有 `packDirectory` 惰性处理读取批次。

发布表面是独立弹窗，发布页是四步单应用向导：先选择一个项目应用卡片（单选、图标、类型/平台/版本徽标、去重状态），或选择一个自定义目录（路径、扫描文件数、自动检测类型与手动改选、清单缺失提示），再依次进入商店素材（1:1 Logo、16:9 封面、最多 8 张有序示例页面）、基本信息（名称、标识、简介、详细介绍）、版本与发布（版本/更新说明、分类/可见性/审核、发布摘要）。第一步之后每步顶部显示紧凑的已选应用上下文，正文单列居中；只有最后一步执行发布，并在当前页显示运行结果。图片在本地预览和校验，平台应用确定后上传到 Drive，并保存为稳定的 `drive://` 引用；未重新选择文件时保留已有引用。底部始终承载主操作；窄视口回退为单列与全宽底部按钮。登录账号就是作者身份并显示在头部。安装现在是独立弹窗，不是本表面的页签（见[独立弹窗笔记](2026-11-13-independent-template-publish-install-dialogs.zh.md)）。

仓库还在 `sdkwork-deployments` 中拥有独立的服务端打包组件 `sdkwork-deploy-archive`：按 git 兼容的 `.gitignore` 选择（嵌套规则、否定、目录剪枝、确定性 ZIP）打包目录，并在解压时防路径穿越、符号链接与解压炸弹。发布路径因目录访问属于宿主能力而保留浏览器打包器；Rust 组件是可复用的服务端权威实现，而不是第二个浏览器打包器。

## Alternatives considered

- **保留单应用模板表单并加应用多选。** 否决：表单的来源（归档、git、浏览器选目录）仍绕过 `apps/` 布局与去重，重复发布仍不安全。
- **要求所有模板来源都位于 `apps/` 下。** 否决：需求明确包含一次性的自定义目录，独立选择器是发布尚未迁入 workspace 的脚手架的唯一方式。
- **只在宿主做类型检测。** 否决：检测只是少量标记读取，放在客户端可让宿主能力保持为简单的有界读取器；打包已经复用同一 list/read 桥。
- **上传原始目录而不是 zip。** 否决：制品契约是带校验和的单个归档；本地压缩也让用户在网络调用前看到文件数与大小。
- **宿主侧创建 zip。** 否决：浏览器已拥有 `.gitignore` 选择、zip-slip/敏感文件筛查与 SHA-256；在宿主重写遍历与匹配器会制造第二套分叉打包器。列表加有界读取保留单一打包器且不新增宿主依赖。
- **一次 RPC 读所有文件。** 否决：每文件一次调用会放大往返且没有边界；批次摊薄 IPC/HTTP 成本，同时能力层保留单文件与单批上限。
- **把清单的 `latestVersionUuid` 当版本号。** 否决：uuid 不是版本。中心读取已有模板的语义 `template_version`，并记录到应用清单供离线去重。
- **安装时覆盖已有 `apps/<key>` 目录。** 否决：覆盖本地应用具有破坏性且难以撤销；数字后缀保留两者，操作者可自行删除旧目录。
- **归档缺少应用清单时凭空写一个。** 否决：这会伪造脚手架从未声明的身份（`app`/`app`）；安装只报告缺口并保持文件缺席。
- **要求每个应用根先在部署控制台关联。** 对多端根否决：控制台卡片词表不覆盖 Flutter/多移动端，因此用第一个声明平台作为血缘记录，模板自身的 `platformTargets` 保留完整表面。

## Consequences

- 从项目目录发布依赖宿主打包桥。未装载 `sdkwork-template-install` 的组合仍可打开中心，但无法打包；行内会报告宿主失败。
- 自定义目录检测是基于文件名与少量标记文件的启发式，不是构建系统求值。多框架项目、monorepo 根或不常见布局可能误判；类型选择是纠正路径，未选类型的候选不能继续。
- 没有 `agent.app.config.json` 的自定义目录不会被伪造清单，也不会写入应用/模板关联；UI 在发布前说明，账号作用域的模板标识仍让下次运行去重。
- 自定义检测与打包共享宿主跳过表与上限，因此被构建产物占满的目录会像 `apps/` 根一样表现为空或被拒绝。
- 宿主遍历把完整结果限制在 20,000 文件与 24 层；超限应用会被拒绝，而不是发布不完整内容。读取批次限制为 64 条路径 / 32 MiB。
- 去重按账号与 key 进行。单选界面不能同时选择两个根；规划 helper 在程序化调用时仍会拒绝两个声明同一 key 的候选。
- `.env`、`*.local` 覆盖与密钥材料始终排除；签入的 `.env.<mode>.<environment>` 配置保留为脚手架源码，其余由应用 `.gitignore` 决定。
- 既无控制台卡片也无平台声明的应用根无法注册，行内显示「需先在部署控制台关联平台应用」并禁用。
- 安装模板不是对已有应用目录的升级；重复安装会创建带后缀的兄弟目录。自定义目标不在项目索引内。
- 市场列表每次搜索取前 50 条，名下模板最多五页、每页 100 个；更大的目录留在部署控制台。

## Verification

- `packages/client/ui-sdkwork-deploy/tests/template-apps.client.spec.ts` 固定 `apps/` 扫描、common 角色排除、根回退与忽略原因。
- `apps-index.client.spec.ts` 固定目录索引解析与原地更新；`host-archive.client.spec.ts` 固定批处理、敏感文件排除、截断与超限拒绝。
- `template-publish.client.spec.ts` 固定平台应用匹配、key 去重、语义版本递增、创建/更新/版本链、slug 竞争采用与告警隔离。
- `template-download.client.spec.ts` 固定目标规划、后缀避让、清单/链路对账与 `apps/README.md` 更新；`template-install-panel.client.spec.tsx` 用桩客户端端到端运行真实 `installTemplateVersion`。
- `template-publish-dialog.client.spec.tsx` 固定四步单应用导航、单选、语义版本校验、发布运行、重试、重置回选择、语义版本补全、空选择禁用、自定义目录选择/检测/发布（不写清单）、手动类型改选，以及商店资料路径（Logo/封面/示例页面/简介持久化、已有素材、类型/体积/数量校验）；`publish-template-flow.client.spec.tsx` 在真实生成式 SDK 栈上固定 IAM 迟到水合。
- `sdkwork-intelligence-deploy-repository-sqlx/tests/template_market_postgres.rs` 经真实仓库固定截图 metadata 与媒体引用；`crates/sdkwork-deploy-archive/tests/archive.rs` 固定可复用的 gitignore 打包/解压组件。
- `template-custom-app.client.spec.ts` 固定 Flutter/React/小程序/Expo 检测、清单优先、未识别候选、空/不可读拒绝、截断与类型词表；`template-publish.client.spec.ts` 固定打包与上传之间新增的本地压缩阶段。
- `packages/host/sdkwork-template-install/tests/template-source.host.spec.ts` 与控制器套件固定有界遍历、批量读取、符号链接拒绝与线上错误投影。

## Prior art

- [One state-aware project publish entry](2026-10-23-project-publish-entry-and-canonical-app-linkage.zh.md) 拥有 `deployPublish` 服务、规范应用链路以及本笔记保持不变的发布/上传状态机；模板行现在打开的是本笔记的表面，而不是该流程。
- [发布与安装是相互独立的模板弹窗](2026-11-13-independent-template-publish-install-dialogs.zh.md) 取代本笔记的单页签中心：发布机制与安装执行仍归本笔记，外壳现在是两个弹窗。

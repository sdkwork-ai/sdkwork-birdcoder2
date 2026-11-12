# Agent Note: 应用模板中心——按 apps/ 发布脚手架并安装回 apps/

Status: implemented

[English](2026-11-12-app-template-center-scaffold-publish-install.md) | 中文

## Problem

行菜单的「发布为模板」原本是单应用流程：解析项目唯一关联的 `deploy_app`，打开一个表单，其来源选项是「应用当前代码」、本地 `.zip`、浏览器选择的目录或 git 仓库，并把模板身份记录到**项目**清单。它无法回答 SDKWork workspace 的实际形态：`apps/` 是一组独立应用根目录，每个都有自己的 `agent.app.config.json`；应用开发脚手架模板是其中一个根的源码树，而不是可部署产物，也不是根项目清单。

因此出现三个缺口。流程不从 `apps/` 列出任何内容，发布五个应用根就要手动选五次目录。浏览器无法读取任意应用目录的字节，所以「从项目目录发布」没有打包路径。消费侧则完全缺失：模板产物可以下载解压，但没有任何逻辑选择 `apps/<key>`、对账安装后的清单或更新仓库的 `apps/README.md` 目录索引，导致下载的脚手架不能像生成的应用那样加入工作区。

## Decision

两个行菜单动作（发布页的「发布为模板」与安装页的「从模板安装」）都通过 `deployPublish.openTemplate` 打开同一个**应用模板中心**，由它负责两个账号作用域的方向。

### 发布：发现、去重、打包、上传、版本

发布页扫描 `<项目>/apps`（仅当 `apps/` 不存在时才回退到项目根）。子目录携带可解析的 `agent.app.config.json` 才算独立应用根；目录索引标为 `role: common` 的子目录是共享包族，继续忽略，不完整根目录同样忽略。扫描会报告被忽略的数量，而不是静默列出（[`templateApps.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/templateApps.ts)）。

每个候选应用先匹配调用者自己的平台应用——清单链路、治理 key 对服务端 slug/name、展示名——再按模板 key 与调用者的模板列表去重。一次发布随后：

1. 没有匹配时注册平台应用；多端清单无法确定单一卡片时回退到第一个具体声明平台（`ANDROID_APP`、`IOS_APP` 等），因此 Flutter 根仍可发布；
2. 经宿主桥（`sdkworkTemplateInstall.listFiles`/`readFiles`）用与浏览器选目录相同的 `.gitignore` 感知打包器打包应用根，排除 `.env`/`*.local` 覆盖与密钥材料，并拒绝被宿主 20,000 文件 / 24 层上限截断的列表；
3. 把归档上传为模板版本的产物；
4. 创建模板；账号已拥有该 key 时更新列表并追加新版本（并发创建会被重读并采用）；
5. 可选提交审核；以及
6. 把应用 id、模板 id/key/name/version 写回应用根自己的 `metadata.publishing` 块。

每行的默认版本取已有模板最新**语义**版本的 patch+1，读取 `deploy_app_template_version.template_version`（列表行的 `version` 是乐观锁计数器，绝不当作版本号）。离线回退值是应用清单记录的 `templateVersion`。

### 安装：只落到 apps/ 下的一个应用根

安装页列出调用者的模板与公开市场。默认目标把归档落到 `<项目>/apps/<模板标识>`；同名目录自动追加 `-2`、`-3`……而不是覆盖本地应用。也支持自定义绝对目录，并覆盖其中的同名文件。

文件落盘后，安装器把模板身份写入安装后的 `agent.app.config.json`（仅当归档携带可解析清单；绝不凭空生成），校验该清单，并按目录后缀与类型卡片推导角色，更新 `apps/README.md` 中的行（[`templateDownload.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/templateDownload.ts)、[`appsIndex.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/appsIndex.ts)）。自定义目标不属于项目树，因此不写索引。

### 宿主能力与产品表面

`packages/host/sdkwork-template-install` 在 `writeFile` 旁新增两个有界读取：`listFiles`（排序、拒绝符号链接、按跳过表遍历）与 `readFiles`（每批 64 条路径 / 32 MiB，单文件 64 MiB）。控制器经同一个 `sdkworkTemplateInstall` Remote 暴露它们；既有安装规划器无需新端点。浏览器用既有 `packDirectory` 惰性处理读取批次。

模板中心是一个模态框：亮/暗 token 配色、带勾选的应用卡片、类型/平台/版本徽标、去重状态、逐应用可编辑字段、共享的分类/可见性/审核设置、逐阶段实时进度、骨架与空/错误状态，以及响应式单列回退。登录账号就是作者身份并显示在头部；两个页签都要求 IAM 用户会话。

## Alternatives considered

- **保留单应用模板表单并加应用多选。** 否决：表单的来源（归档、git、浏览器选目录）仍绕过 `apps/` 布局与去重，重复发布仍不安全。
- **宿主侧创建 zip。** 否决：浏览器已拥有 `.gitignore` 选择、zip-slip/敏感文件筛查与 SHA-256；在宿主重写遍历与匹配器会制造第二套分叉打包器。列表加有界读取保留单一打包器且不新增宿主依赖。
- **一次 RPC 读所有文件。** 否决：每文件一次调用会放大往返且没有边界；批次摊薄 IPC/HTTP 成本，同时能力层保留单文件与单批上限。
- **把清单的 `latestVersionUuid` 当版本号。** 否决：uuid 不是版本。中心读取已有模板的语义 `template_version`，并记录到应用清单供离线去重。
- **安装时覆盖已有 `apps/<key>` 目录。** 否决：覆盖本地应用具有破坏性且难以撤销；数字后缀保留两者，操作者可自行删除旧目录。
- **归档缺少应用清单时凭空写一个。** 否决：这会伪造脚手架从未声明的身份（`app`/`app`）；安装只报告缺口并保持文件缺席。
- **要求每个应用根先在部署控制台关联。** 对多端根否决：控制台卡片词表不覆盖 Flutter/多移动端，因此用第一个声明平台作为血缘记录，模板自身的 `platformTargets` 保留完整表面。

## Consequences

- 从项目目录发布依赖宿主打包桥。未装载 `sdkwork-template-install` 的组合仍可打开中心，但无法打包；行内会报告宿主失败。
- 宿主遍历把完整结果限制在 20,000 文件与 24 层；超限应用会被拒绝，而不是发布不完整内容。读取批次限制为 64 条路径 / 32 MiB。
- 去重按账号与 key 进行。两个选中根声明同一 key 时两行都被阻止，而不是合并版本。
- `.env`、`*.local` 覆盖与密钥材料始终排除；签入的 `.env.<mode>.<environment>` 配置保留为脚手架源码，其余由应用 `.gitignore` 决定。
- 既无控制台卡片也无平台声明的应用根无法注册，行内显示「需先在部署控制台关联平台应用」并禁用。
- 安装模板不是对已有应用目录的升级；重复安装会创建带后缀的兄弟目录。自定义目标不在项目索引内。
- 市场列表每次搜索取前 50 条，名下模板最多五页、每页 100 个；更大的目录留在部署控制台。

## Verification

- `packages/client/ui-sdkwork-deploy/tests/template-apps.client.spec.ts` 固定 `apps/` 扫描、common 角色排除、根回退与忽略原因。
- `apps-index.client.spec.ts` 固定目录索引解析与原地更新；`host-archive.client.spec.ts` 固定批处理、敏感文件排除、截断与超限拒绝。
- `template-publish.client.spec.ts` 固定平台应用匹配、key 去重、语义版本递增、创建/更新/版本链、slug 竞争采用与告警隔离。
- `template-download.client.spec.ts` 固定目标规划、后缀避让、清单/链路对账与 `apps/README.md` 更新；`template-download-panel.client.spec.tsx` 用桩客户端端到端运行真实 `installTemplateVersion`。
- `template-center-dialog.client.spec.tsx` 固定发布运行、失败行、页签保留、语义版本补全与空选择禁用；`publish-template-flow.client.spec.tsx` 在真实生成式 SDK 栈上固定 IAM 迟到水合。
- `packages/host/sdkwork-template-install/tests/template-source.host.spec.ts` 与控制器套件固定有界遍历、批量读取、符号链接拒绝与线上错误投影。

## Prior art

- [One state-aware project publish entry](2026-10-23-project-publish-entry-and-canonical-app-linkage.zh.md) 拥有 `deployPublish` 服务、规范应用链路以及本中心保持不变的发布/上传状态机；模板行现在打开的是本笔记的中心，而不是该流程。

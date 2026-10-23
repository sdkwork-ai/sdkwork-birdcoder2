# Agent Note：单一状态化项目发布入口与规范化的应用关联

Status: implemented

[English](2026-10-23-project-publish-entry-and-canonical-app-linkage.md) | 中文

## Problem

会话头部原先用 hover 菜单暴露四个部署流程（新建应用、上传代码、发布应用、发布为模板），工作区/会话行菜单又用另一行发布入口打开另一套对话框。创建应用与发布应用是两个对话框里的两个操作：创建表单要求填写名称、类型、描述、素材与分类，而这些资料项目 `sdkwork.app.config.json` 已经治理；创建完成后用户还要重新打开发布流程再挑同一个应用。没有任何地方检查项目是否已经有应用，重复使用就会重复登记；对话框自带的应用选择器还能把行关联到别的应用而不更新清单。

关联本身也已经偏离 SDKWork App Manifest 标准：插件写顶层 `deploy` 节（规范校验器按未知顶层字段拒绝），并把 `backend.appId`（IAM 应用标识，另一个身份）覆盖成 deploy app 的 uuid。APP_MANIFEST_SPEC §4.1 规定平台应用 ID 存放在 `metadata.publishing.appIdByTarget`，以 `<mode>.<environment>` 为键。

## Decision

两个表面运行同一套状态机 `DeployProjectAppFlow`，并且只从项目清单判断状态：

- **没有已登记应用**：只有一行「创建应用并发布」。清单提供草稿（展示名称、由 `appType`/`runtime`/`publish.platforms` 推导的类型卡片、描述、应用标识）；确认页展示后创建，清单无法确定类型卡片时转交控制台的完整创建表单。
- **已登记且可解析**：显示「发布应用」「上传代码」「发布为模板」。不渲染任何创建入口，并且流程在创建前会立即重读清单，因此在另一个窗口刚关联过应用的项目不会再得到第二个应用。
- **已登记但应用已不存在**：提供重建，并写回同一处关联。

创建是一个操作、三个按刻意顺序持久化的事实：`deploy_app` 记录、项目关联、解析出的类型卡片对应的平台目标。先写关联再写平台目标，意味着后续失败永远不能靠再次创建来修复；关联写入失败会保留已创建的应用并给出「重试写入项目关联」，只重试清单写入，然后补登记缺失的平台目标。

关联遵循 APP_MANIFEST_SPEC §4.1：`metadata.publishing.appIdByTarget[<mode>.<environment>]` 保存应用 ID，profile 由清单 `runtime.defaultDeploymentProfile` 与宿主当前生命周期档位组成（`testing` 映射为 `test`）。fork 自有的展示与模板溯源信息放在旁边的 `metadata.publishing.birdcoder`；`metadata` 在标准中是自由结构，发布器合并单个目标键时会保留其他 metadata 子树。读取仍兼容旧的顶层 `deploy` 节与 uuid 形态的 `backend.appId`；首次写入会把它们折叠进规范块并删除这个非法顶层键。插件不再写 `backend.appId` 本身。

行菜单通过 `deployPublish` 服务（`open`、`openTemplate`）运行同一流程，头部与侧边栏不会分叉。

## Alternatives considered

- **保留四流程 hover 菜单，应用存在时禁用创建行。** 否决：同一操作仍有两个入口，状态藏在 hover 卡片里，而且对清单已点名应用的项目仍会打开发布对话框的应用列表。
- **预填控制台的完整创建表单而不是新增 fork 确认页。** 否决：`CreateAppDialog` 位于 `sdkwork-deployments` 兄弟仓库，没有初始值 props；在那边添加会把本 fork 的 UX 要求塞进另一个仓库的公共组件，而完整表单仍会追问清单已治理的字段。
- **创建应用后再点一次发布。** 否决：那正是本次要移除的两段式往返；直接进入发布符合启动该行的意图。
- **在创建应用之前写清单关联。** 否决：关联值就是应用 ID，创建之后才存在；重复拦截与“只重试关联”的路径覆盖了这个失败窗口。
- **为兼容保留顶层 `deploy` 节。** 否决：规范校验器拒绝未知顶层字段，旧插件碰过的每个项目都会在 `check-app-manifest-standard` 失败；旧节读取加写入时迁移既兼容存量项目，又不必保留非法结构。
- **只记录应用 ID。** 否决：离线菜单标签、源码目录关联与已发布模板身份都需要存放位置，每次打开菜单重新拉取会让标签依赖网络调用。

## Consequences

- 打开头部菜单会读取项目清单；菜单行比一次异步读取慢一步，所以状态落地前触发器显示「正在读取项目」。
- 创建现在可以登记控制台创建对话框从未写过的平台目标，这正是紧随其后的发布能够成立的原因。
- 发布对话框收到已解析的应用，因此跳过应用选择步骤；只有行菜单的组合也通过服务获得同样行为。
- 存量项目继续可用：读取兼容旧节，首次写入完成迁移。被旧插件覆盖过 `backend.appId` 的项目会保留那个错误值；一旦它不是 uuid，插件就不再把它当作 deploy 应用 ID。
- 分类与素材（icon、封面、截图）仍不从清单 `media` URL 导入，仍由 deployments 控制台的应用行上传。

## Verification

`packages/client/ui-sdkwork-deploy/tests/deploy-app-config.client.spec.ts` 固化规范读/写、旧节迁移、`backend.appId` 不被触碰以及 profile 选择。`project-app.client.spec.ts` 固化清单身份与类型卡片映射，`project-app-create.client.spec.ts` 固化重复拦截与失败事实，`deploy-project-app-flow.client.spec.tsx` 用真实生成的 SDK 客户端与本地网关跑通创建 → 关联 → 平台目标 → 发布链路，并覆盖重复拦截、关联重试与平台目标失败。`deploy-project-app-dialog.client.spec.tsx` 覆盖确认页各表面。写出的清单字段就是 SDKWork 校验器接受的字段：`node ../sdkwork-specs/tools/check-app-manifest-standard.mjs --root <project>`。

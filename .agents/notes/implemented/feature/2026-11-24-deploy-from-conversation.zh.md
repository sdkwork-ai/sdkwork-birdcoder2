# Agent Note: Deploy from the conversation

Status: implemented

[English](2026-11-24-deploy-from-conversation.md) | 中文

## 问题

部署插件的发布流程此前都是界面：用户打开应用库或会话行菜单，填写弹窗。对话可以描述一次部署，却无法执行，于是「部署并发布」的最后一步总要用户手工完成。部署 API 需要已登录的 IAM 会话，而那是按浏览器保存的状态；Host 进程无法调用，公共应用访问令牌对用户所属的写操作会被拒绝。发布完成后也无法展示站点：没有任何地方记录转录可以读取的站点事实。

## 决定

对话发布是一个把请求转交给客户端的 Host 工具，加上客户端执行器、结果卡片与右侧站点面板。

- `@deepseek-ai/dsh-tool-sdkwork-deploy` 注册面向模型的 `sdkwork_deploy_app` 工具。它校验参数、派发作用域 `sdkwork-deploy/request` waterfall，并返回站点事实或停止的阶段与错误码。它不持有凭据，也不持有布局。
- `sdkwork-deploy/request` 是 `@deepseek-ai/dsh-api-remotes` 中的转发 waterfall，因此 Host 事件会到达携带同一 Agent 的已连接浏览器客户端。客户端用 `ui-sdkwork-deploy` 的执行器应答：登录门禁、项目读取、应用创建与关联、构建产物定位、打包、下一版本、平台目标、四阶段 `createDeployApplicationPublisher` 调用、源码记录、部署回读与站点读取。请求可覆盖制品形态、平台目标与部署 kind/target，因此清单未描述的发布形态（商店提交、OTA 下发、容器滚动）无需第二条流程即可表达。结果报告作为回滚参照的上一部署 id 与执行发布的已登录账户。无头 Session 返回 `NO_CLIENT`，未登录客户端返回 `signedOut`。
- 工具把结构化结果记录为呈现元数据，客户端按工具名注册 `tool.call.toolview` 卡片：运行中行、带封面图（清单预览、其次截图、最后图标）、复制与面板入口的已发布站点，或已报告的失败。卡片显示规范主机名，或在绑定建立前显示平台默认的 `<label>.app.<suffix>`（标记 `domainDefault`）。选中已发布卡片会调用 `ctx.sidebarRight.openContent('sdkwork-deploy-site', { site }, { key: appId })`。
- `sdkwork-deploy-site` 页签类型渲染站点面板：站点头、观测指标与健康检查、应用/域名/平台目标、部署与版本历史、最近一次部署的日志事实。面板在打开与刷新时经同一宿主适配器重新读取实时仪表盘。
- `birdcoder-app-deploy` 随内置技能目录分发（同时镜像到 `.agents/skills/`，并被两个场景投影点名），教模型工作流：读取清单、预检、构建、选择档位与发布形态、调用工具、读取停止阶段并报告实时站点。它渐进式加载：`SKILL.md` 承载工作流与一张参考表，只在任务需要时打开 `lifecycle.md`、`app-standards.md`、`deployment-targets.md`、`troubleshooting.md` 与 6 份 `standards/` 提炼契约，并附带 `scripts/preflight.mjs`（离线清单/构建检查）、`scripts/standards.mjs`（checkout 或内置契约解析）与 `scripts/selfcheck.mjs`（包完整性）。技能包携带 `skill.manifest.json` 与 `references/standards.lock.json`，因此在没有 `sdkwork-specs` checkout 的机器上仍可用，并可自证完整性；见[可移植技能包](../architecture/2026-11-24-portable-skill-packages.zh.md)。

## 相关记录

- 界面发布入口、应用关联与其弹窗仍由
  [项目发布入口记录](2026-10-23-project-publish-entry-and-canonical-app-linkage.zh.md) 负责；本记录在它们旁边增加对话路径。

## 考虑过的替代方案

- **从对话打开现有发布弹窗。** 否决：弹窗的选择步骤正是请求要代理完成的工作，结果也不会作为可打开面板的站点进入转录。
- **用运维凭据在 Host 侧发布。** 否决：部署 API 拒绝公共应用令牌执行用户所属写操作，而 `DeployHost` 的双 token 客户端派生自只有浏览器持有的 IAM 会话。Host 侧路径需要产品并不存在的第二套凭据契约。
- **重写一份发布序列。** 否决：组合式 `createDeployApplicationPublisher` 已按一个顺序与幂等键执行上传、制品、release 与 deployment，`packScaffoldApp` 已按上限打包项目字节并排除敏感文件。对话执行器组合它们，而不是复制。
- **把技能放在仓库根 `skills/`。** 否决：用户工作区从不是本仓库，签出本地目录无法服务产品对话。内置目录才是分发容器；根 `skills/` 用于仓库级维护工作流，本能力不属于此类。

## 后果

该能力需要已连接且已登录的浏览器客户端；CLI 或无头 Session 只能报告 `NO_CLIENT`。早于本包的已安装应用版本仍会加载该技能，因此技能写明降级路径而不是承诺该版本没有的工具：使用应用内发布入口，绝不直接调用部署 API。执行器只在创建后回读一次部署，因此仍在推进的 deployment 在卡片上显示已受理状态，而面板刷新读取实时记录。按卡片推导的制品形态与部署方案（Web 到 `WEB_NODE`、API 服务到 `CONTAINER`、商店卡片到其审核或商店目标）只是默认值；清单未描述的形态经请求覆盖表达，平台拒绝的目标与生命周期转换仍由 deployments 控制台负责。交换来的是：代理可以在已登录账户上端到端完成创建-发布-验证生命周期，转录保留持久的站点卡片，右侧边栏无需第二套控制台即可承载站点实时记录。

## 验证

- `pnpm exec vitest run packages/interaction/tool-sdkwork-deploy packages/client/ui-sdkwork-deploy` 覆盖工具转交及其形态覆盖、执行器的网络前失败、仪表盘读取、封面/域名卡片与面板。
- `pnpm exec vitest run packages/skill/sdkwork-builtin-skills scripts/verify-skill-portability.spec.ts` 覆盖随包技能集合、预检脚本、标准解析器、selfcheck 与可移植门禁。
- `pnpm run verify-skill-portability` 与 `pnpm run verify-skill-package` 证明每个产品技能自包含、包锁为最新。
- `pnpm run verify-builtin-scene-skills` 证明新技能随包分发且两个投影都点名它。
- `pnpm exec tsc -b packages/interaction/tool-sdkwork-deploy packages/api/remotes/tsconfig.host.json packages/api/remotes/tsconfig.client.json` 证明转交类型面。

# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-alpha.5（fork 发布 2026-11-03）

本版本打在 `birdcoder-v0.2.2-alpha.4`（`5695690194`）之后，包含两段内容：该 tag 之后到本 tag 前的全部 fork 自有变更（cloud 部署档位与浏览器 runtime env 标准、发布包内置部署凭据、桌面发布逐目标 lane、默认内置插件市场、客户端账号切换与页面导航修复、打包 lane 下载缓存目录与发布契约的修复），以及首个上游同步窗口——上游 `master` 从 `ce7073d512`（tag `dsh-v0.2.2-alpha.2`）前进到 `8bd073392e`（tag `dsh-v0.2.2-alpha.3`），共 666 个上游提交，以真实双父提交合并（`--no-ff`）叠加在本版本之上，上游作者、提交信息与代码注释原样保留。

### 上游变更（`dsh-v0.2.2-alpha.3`）

以下逐字摘自上游 `dsh-v0.2.2-alpha.3` 的官方 Release notes（中文部分，英文版见该 Release 页面）。

#### 新增功能

* 支持统一右键与键盘菜单，覆盖会话、工作区和侧边栏，并支持开发者扩展 @std4453
* 文件预览支持常驻目录树和文件定位功能。 @yudshj
* 实验性「变更请求与工作树」统一代码审查与工作树入口，支持通过可搜索文件树和逐文件导航查看本地及 PR 差异，将选中代码和评论交给 Agent，并跟踪检查与评审状态。 @LegGasai

#### 体验优化

* 改善手机端侧栏导航与窄屏布局，保持会话标题稳定，并让模型目录输入和插件发现页操作完整可见。 @Stevring @Saafo @EricMoin
* 菜单和浮窗优先保持在可见区域内，跟随浏览器缩放、平移和软键盘变化。 @Stevring
* Trajectory 支持独立折叠子调用，保留父调用和摘要；搜索或跨视图定位时可展开对应子调用。 @kermanx
* 优化对话中思考内容的展示，摘要、展开正文和翻译不再显示模型输出开头的签名前缀。 @LegGasai
* 减少会话状态更新时的重复发布和目录处理开销，并降低长回复流式组装的运行时成本。 @liukx0205 @imccyu
* 改善底部输入框的布局稳定性，减少输入、菜单展开和统计更新时的跳动。 @imccyu

#### 问题修复

* 通过 pi-ai 接入的模型在会话图片超过请求数量上限时，自动省略最早的图片并继续请求，避免持续失败。 @turtle2099
* 修复 OpenCode 路由下自动审核在工具执行前失败的问题，审查请求携带对应会话的身份和用途。 @LegGasai
* 修复 alpha.2 引入的空会话恢复后被当作「未命名」会话持续显示的问题，并恢复按最后提示时间排序。 @imccyu
* 修复包含旧版子代理描述的历史会话无法打开，并导致会话搜索失败的问题。 @turtle2099
* 修复加载更早的已压缩会话历史后，聊天记录停止加载和更新的问题。 @turtle2099
* 聊天中的 Markdown 文件链接容忍无效行号，并支持行范围及行列后缀；无法定位时仍打开原文件，URL 保持为网页链接。 @kermanx
* 文本和 Markdown 文件预览在刷新后保留阅读位置，文件暂时变短时也保留原位置，避免跳回第一页。 @yudshj
* Trajectory 保留失败工具实际返回的文本，列表、详情和复制不再用合成错误信息替换它；原生工具和嵌套 PTC 调用使用相同规则。 @kermanx
* 修复部分历史 `run_code` 记录的代码页缺少 TypeScript 或 Python 语法高亮的问题。 @kermanx
* 打开既有定时任务时显示对应的日期、时间、间隔与星期控件，并按字段给出纠正提示；仅修改名称或指令时保留计时规则，超出控件精度的复杂规则保留原始文本。 @Magolor

#### 其他变更

* 同步 Cordis Core 至 4.0.0-rc.11、Loader 至 1.0.0-rc.8、Include 至 1.1.1，统一配置访问、条目变更和持久化行为。 @shigma @imccyu
* pi-ai 支持插件按会话和请求用途提供动态请求头；无效请求头在请求发出前报错。 @LegGasai
* 插件可为自己的设置页面提供导航图标，卸载后恢复默认图标。 @Magolor
* 插件安装失败时显示完整诊断与 Host 日志入口，并区分安装失败和安装后启用失败。 @kermanx
* 「Git 工作树」入口已合入「变更请求与工作树」，此前启用独立插件的用户需手动从 profile 的 dsh.profile.bundles 中移除 @deepseek-ai/dsh-experimental-tool-worktree
* 「自动化任务」改为统一的宿主级管理，支持手动创建、直接编辑和通过预填提示在会话中创建，保留编辑草稿并支持冲突复核，可选择复用或新建会话执行任务。 @ZiyaZhang @Magolor
* 新增默认关闭的 `apply_patch` 工具，一次完成多文件新增、编辑、删除和移动，并在 Review 中查看变更。 @sjw1231 @CreatixChu
* TypeScript 与 Python SDK 补齐原生命令和插件管理能力，支持计划审阅、目标续跑与操作审批；插件变更重启后生效。 @LogosVeritas @koalazf99
* macOS Computer Use 改用独立应用申请系统权限，打开对应系统设置并提供应用拖入引导，返回后刷新权限状态。 @CreatixChu
* 文件修改的先读和外部修改防护默认关闭，沙箱限制和 Review 保持不变；需要原防护的 profile 可显式恢复观察策略。 @sjw1231
* 回退 alpha.2 中引入的跨行 `$$` 数学块的不稳定兼容解析。 @yudshj

### BirdCoder 本地修改

#### 功能

* **桌面发布改为逐目标 lane**：`desktop-release.yml` 保留唯一的六目标表，每个目标成为独立 job（`package-win-x64` 到 `package-linux-arm64`）并调用新的可复用 workflow `desktop-package-target.yml`。失败时运行摘要与 Actions API 直接指明目标，"re-run failed jobs" 只重试该目标；`resolve` 校验 `targets` 子集并按发布顺序归一，部分运行仅用于重新打包与诊断。各 lane 复用 runner 临时目录下载缓存（Electron、随包 Node/pnpm/Python 负载），Windows 短构建根保持不变；`scripts/desktop-release-workflow.spec.ts` 把六目标表、runner、构建根、平台设置文件、打包脚本与产物名钉在 `desktop-build-paths.mjs` 和发布汇总器上。
* **插件市场默认随应用出货**：Web 组合 `packages/bundle/web-app` 以 npm 依赖 `dshmarket ^1.73.8` 钉住已发布构建产物，并在自己的 `cordis.patch.yml` 挂载 `dsh-market` 行，桌面组合直接继承。出货的 Web 或桌面构建打开插件页即落在可浏览的社区目录，无需安装步骤；`built-in-plugin-market.spec.ts` 断言挂载行、两半边产物与 `market` 控制服务契约。
* **cloud 部署档位成为默认**：新增 `.env.cloud.{development,test,production}`，取值对齐 `etc/topology/cloud.<environment>.env`（production 为 `https://api.sdkwork.com`，应用入口按域名访问）；`apps/web/vite.config.ts` 默认 `cloud`，非 development 构建丢弃 loopback 地址；桌面发布 lane 显式声明 `DSH_WEB_DEPLOYMENT_PROFILE=cloud`。
* **标准 env 物化流程**：仓库根 `workflow:materialize-client-env` 改调 sdkwork-specs 标准物化器，`check:client-env` 校验 50 个已提交面；新增 `sdkwork-birdcoder2-pad` 面；pad、Flutter 与小程序构建默认 cloud，standalone 保留为显式变体。
* **容器 Compose 直接读取部署的 per-environment topology env**：`docker-compose.yml` 不再依赖打包期投影。
* **创意应用跟随账号重建**：图像/视频创作面的 Host 适配器按账号标识（tenant、organization、user）生成 `surfaceRevision`，账号切换时重建内嵌视图，同账号令牌刷新与语言切换不重建。
* **模板库与需求大厅重新打开回到首页**：两个 Host 适配器新增 `navigationResetKey` 与 `resetNavigation()`，侧边栏每次点击都把内嵌路由重置到页面根；需求提交支持多应用形态 `appForms`。
* **技能设置入口区分**：设置侧栏的 `skills` 行使用技能图标，文案改为「技能设置」/「Skill settings」，避免与技能市场行混淆。

#### 修复

* **安装包的 IAM 登录**（`bb2014454b`）：打包清单把应用编码写入 `resources/sdkwork-app.json`，外壳在启动 Host 前解析并经 `SDKWORK_APPLICATION_CODE` 传入，凭据包按应用编码而非 profile 目录名定位，修复 GitHub 构建的安装包报 `access-token-only request requires Access-Token before request dispatch`。
* **发布包自带部署凭据**（`388efed45d`、`e629acd53f`）：受跟踪的 `.env.standalone.production` 携带本部署的 `SDKWORK_ACCESS_TOKEN`，发布车道改为 `deployment` 类别；令牌过期或 claims 不匹配时构建 fail closed，轮换方式为吊销旧值、刷新该文件并重新打包。
* **浏览器 runtime env 标准门禁**（`5b4483e55d`）：仓库根链接 `@sdkwork/sdk-common`，`check-browser-runtime-env-standard` 输出 `standard ok`。
* **构建模式按车道选择**（`7d2869486a`）：dev/online 各自烘焙对应环境，启动进程自身的 `SDKWORK_*` 在 `loadEnv` 前移除，避免已安装应用的环境污染源码构建。
* **SDKWork 配置改由 Vite env 文件在构建期注入**（`c98f6b8234`）：删除打包期投影、`resources/sdkwork-release.env` 与 `resources/sdkwork-app.json` 之外的外壳投影管线，环境由构建模式选择，一环境一构建。
* **容器发布包携带 topology env**（`3bea2db50b`）：`release:pack-container` 纳入 `etc/topology`，bundle 校验器拒绝缺失的 Compose `env_file`，修复 amd64 lane 的 Compose smoke 报 `cloud.production.env not found`。
* **桌面打包 lane 的下载缓存目录**（`9237b9165e`）：打包步骤按步骤级 `runner.temp` 读取 `DSH_DESKTOP_PACKAGE_CACHE_DIR`，与 restore/save 缓存目录一致，重试不再重复下载 Electron 与 runtime 载荷。

#### 依赖与版本

* 新增 npm 依赖 `dshmarket@1.73.8`（Web 组合与 client-runtime 测试支撑），其运行时闭包带入 `undici` 与 `js-yaml`；锁文件已同步，`pnpm install --frozen-lockfile` 通过。
* submodule 前进到各自跟踪分支的最新 pin：`plugins/dsh-im` `dd500d24` → `d2f2703d`（v5.9.1 之后的模型目录错误保留与保存失败提示，`lib/` 已重建）、`plugins/dsh-mcp-connector` `0aaf140` → `80f6182`（v0.2.93 专家数据市场，`lib/` 与 `ui/` 随提交出货）；`plugins/dsh-better-sidebar` dev `bd6cfa5`、`plugins/dsh-skill-market` `4cda930`（v2.0.7）维持不动。
* SDKWork 发布车道依赖维持 `scripts/sdkwork-sources.manifest.json` 与 `agent.workflow.json` 的双记录 pin：本地走相对路径工作区，发布按 pin 克隆 git 仓库；本版本未前进 pin。
* 版本号同步推进到 `0.2.2-alpha.5`（451 个 released manifest，`verify-version-sync` 通过）。

#### 上游同步

* **合并方式**：`git fetch upstream && git merge upstream/master --no-ff`，真实双父提交，不做 squash；上游 666 个提交的作者、日期、提交信息与代码注释原样进入历史，`8bd073392e` 是本次同步的上限。
* **冲突 419 个，逐文件裁决**：368 个是纯 `version` 字段冲突（fork 保持 `0.2.2-alpha.5`，上游为 `0.2.2-alpha.3`），保留 fork 版本号但不丢弃同文件内的上游改动；其余 51 个按「fork 表面保 fork、上游核心取上游、双方都改则合两者行为并以 上游结构为基线」处理。
* **fork 表面保持**：`ui-sidebar` 的 `BirdLogo` 品牌标记、`sidebar.actions` 快捷入口席位与模式栏「更多」菜单文案、`ui-conversation` 会话头部把 body 拆成 `conversation.session.header.surface` 兜底的 fork 结构、`ui-settings-web-search` 与 `ui-sidebar` README 的 fork 段落、`packages/host/apiproxy`、`packages/client/runtime`、`packages/boot/app-boot/src/watch-config.ts` 等 `keptByFork` 条目均按 `.sdkwork/upstream-sync-anchor.json` 保留。
* **`deletedByFork` 继续删除**：`.github/workflows/ci-windows.yml`、`ci-python.yml` 由上游改动、fork 已改单 `ci.yml`，本合并按锚点记录保持删除；所有 `deletedByFork` 路径复查后无一被上游重新带回。
* **上游结构性改名被采纳**：`packages/experimental/{agent-team,tool-agent-team,client-ui-agent-team,agent-team-profile}` → `packages/team/*`、`packages/client/ui-agent-team`，包名去掉 `experimental-` 前缀；`web-search-exa`、`web-search-perplexity`、独立 `tool-worktree` 等上游下线面随上游删除。共删除 107 个上游下线路径，`sdkwork` 自有文件零删除。
* **桌面外壳跟随上游契约**：`connectDesktopWelcome(hostUrl, cookie, send)`、`desktopAccountBackend(origin, invoke, cookie, acceptsInsecureTls)` 改为上游的显式 Cookie 签名，fork 的 `--insecure-tls` / `DSH_DESKTOP_INSECURE_TLS` 能力作为末位参数继续下传；`main()` 采用上游 `await readDesktopSettings`，`applyBrandBootstrap` 与 `oem()` 保持在读取设置之前。
* **上游清理的样式类同步**：`ui-conversation` 面包屑去掉上游已删除的 `crumbSubagent`，渲染 `conversation.session.header.corner` 席位；`vitest.config.ts` 采纳上游 `--experimental-vm-modules` 参数与重写的覆盖率豁免注释。
* **`web-deepseek-api` 端点来源变更（已核验等价，非功能回退）**：上游把该行的 `apiKeyEnv`/`baseURL` 换成 `searchBaseURL`/`fetchBaseURL`（YAML-only），并改为**按路由推导端点**——`deepseek-account` 路由取该路由 origin + `/v1/tools`，恰好等于 OEM `deepseek.webApiBaseUrl` 的默认值 `${inferenceOrigin}/v1/tools`，OEM 登录态的搜索与抓取仍落在 OEM 主机；`llm-deepseek`（API-key 路由）按 fork 补丁既有约定「vendor 与展示端点不迁到 OEM 域名」继续指向 DeepSeek，与路由推导结果一致。故 `deepseek.webApiBaseUrl` 不再被该行消费（字段与 `must share the origin of deepseek.inferenceOrigin` 校验保留，不破坏 OEM 档案契约）；若某部署需钉住端点，可按上游 `v0.2.2-alpha.2/web-search-credential-modes` 指南在行上写 `searchBaseURL`+`searchApiKeyEnv`（`fetch*` 同理），但钉住后该能力不再发送账号令牌。`packages/bundle/base/tests/base.spec.ts` 的断言已同步收敛为「两条 OEM 覆盖」+「该行无 `inject`/`config`」。
* **apiproxy 跟随上游 subagent 控制面**：上游删除 `@deepseek-ai/dsh-subagent/internal` 符号桥后，宿主侧人类消息改走 Service 的 `ctx.subagents.prompt(...)`（附件准入、请求身份与收件箱路由收敛到一处），wire 内容类型随之从 `ContentBlock[]` 收窄为 `PromptContentPart[]`（与 `session.prompt` 一致）；`subagentPromptError` 补齐 `RemoteError` 分支，`subagent-not-resumable`/`-unauthorized`/`-delivery-unavailable` 三个线上错误码保持不变。上游把 live lineage 移出 core agent registry 后，归属判定归一到 header `origin === 'subagent'`；`interrupt` 授权收窄为 `{ kind: 'user' }`。

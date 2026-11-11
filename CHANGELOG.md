# BirdCoder 更新日志

本文件只记录**当前版本**——`##` 标题就是本次发布打的 tag，不累积历史版本条目；往期条目随各自版本的提交保留在 git 历史里（`git log -p CHANGELOG.md`）。「上游变更」逐字摘自上游该 release 的官方 Release notes（中文部分，英文版见各 Release 页面）；上游尚未发布 Release notes 时，按该 tag 内的实际提交归纳并注明来源。「BirdCoder 本地修改」记录 fork 在该版本上的自有变更（SDKWork 组件、品牌、打包与部署等），不受上游发布节奏影响。

## 0.2.2-rc.1（fork 发布 2026-11-05，2026-11-09 重新打包，2026-11-11 同步上游 0.2.2-rc.2）

本次更新是**上游同步**，不是新的发布版本线：把 `deepseek-ai/deepseek-harness` 的 `0.2.2-rc.2` 完整合入当前 fork，同时把自上次上游合并（`ed49f8b445`，上游 `fcc0ad4621`）以来落在 `main` 上的 64 个 BirdCoder 自有提交一并纳入当前版本说明。本文件仍只保留一个 `##` 版本节，历史版本条目随各自提交留在 git 历史里，不在此叠加。

合并基底 `fcc0ad4621` → `e8f7b93a34`（tag `dsh-v0.2.2-rc.2`），共 **923 个上游提交、3479 个文件变更**（+108953 / −33648）。使用真实双亲 merge commit，上游的提交记录、commit message 与代码注释逐字保留，未做 squash、rebase 或 cherry-pick。54 个冲突文件按 fork-first 规则解决：SDKWork 自有组件与品牌表面保留 ours，上游自有文件与全部无冲突改动完整采纳，双方同改的清单/配置按语义合并。

### 上游变更（deepseek-harness 0.2.2-rc.2）

以下逐字摘自上游 [v0.2.2-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.2) 官方 Release notes 中文部分；英文版见该 Release 页面。

#### 新增功能

- Git Worktree 支持按分支、提交和文件类型审阅改动，并直接处理 GitHub 评审、同步已审阅进度和更新分支。 @LegGasai
- SubAgent 支持具名与多层协作，AgentTeam 可按会话开启，共用成员与任务面板。 @Dudu-0223, @Yifffan
- 桌面端支持在设置中切换正式版与开发版更新渠道。 @winewill

#### 体验优化

- 改善代码审阅时的评论、文件导航与窄屏布局，减少查看大型改动时的卡顿，并放宽大型仓库创建工作树的等待时间。 @LegGasai
- 改善多层子代理的浏览与任务协调，优先展示任务描述，支持逐层展开和读取失败后重试。 @Dudu-0223
- 优化左侧栏插件入口的收纳，不常用入口可移入“更多”，重新固定时保持原顺序。 @Yifffan
- 简化个性化页面安装后的操作，移除“保留”按钮，统一使用撤销与恢复。 @ZiyaZhang
- 改善自定义主题对通知、卡片、计划和任务等界面颜色的覆盖。 @turtle2099
- 改善页面缩放、平移及长列表场景下的菜单定位，保持菜单与触发位置对齐；自定义浮层需适配新定位接口。 @Stevring, @LegGasai
- 改善暗色模式下文件树浮层的显示，使用背景层次区分面板，避免白色投影。 @turtle2099
- 改善在侧栏查找文件的体验，支持按名称或路径搜索，并可调整排除规则与隐藏文件显示。 @yudshj
- 改善侧栏长列表的浏览与拖动体验，插件导航和会话列表共用滚动区域，工作区工具栏保持可见。 @Yifffan
- 优化从会话打开工作目录的操作，统一“在应用中打开”菜单，并改善窄屏使用体验。 @Yifffan
- 加快文件右键菜单的打开；关联应用查询较慢时，先提供默认应用入口。 @yudshj
- 向上回看聊天时自动加载更早消息，优先保持阅读位置，并保留手动加载和重试入口。 @imccyu
- 改善聊天过程的可查看性，可展开工作区指令、技能目录等信息，了解模型收到的上下文。 @turtle2099
- 改善补丁编辑的回执，折叠状态下也可查看修改的文件，并在成功后直接打开。 @sjw1231
- 优化会话首页的交互动画。 @ZiyaZhang
- 改善会话恢复或压缩后的上下文提示，明确当前运行信息与旧信息的替换关系。 @kermanx
- 改善聊天中代码差异的阅读，显示增删行颜色，并按文件语言高亮。 @mektpoy
- 改善粘贴图片和文件的体验，未聚焦输入框时也可粘贴到最近使用的可用输入框或主对话。 @std4453
- 改善暂停、恢复定时任务时的操作反馈，保持按钮焦点与显示稳定，避免重复操作。 @turtle2099
- 优化目标栏的操作排列与按钮间距，统一为“编辑、清除、暂停或恢复”。 @turtle2099
- 优化模型请求失败后的重试设置，可在模型设置中选择重试条件、次数和等待时间。 @turtle2099
- 改善临时请求失败后的恢复操作，可直接点击“继续生成”，无需另写消息。 @LegGasai
- 改善 API Key 的管理，已保存密钥以掩码显示，支持整体替换或清除，不显示完整旧密钥。 @Magolor
- 优化多问题检索，单次网页搜索默认支持最多 10 个查询和 10 个来源。 @turtle2099
- 改善 Agent 终端的可见性与接管体验，命令在侧栏终端运行，用户输入即可接管；允许读取的用户终端内容会进入模型与会话记录。 @LegGasai
- 优化批量查询文件、任务和资源时的执行效率，更多只读工具可并行运行，结果仍按调用顺序返回。 @turtle2099
- 改善桌面更新下载时的进度显示，可点击下载百分比或“检查更新”查看状态。 @winewill

#### 问题修复

- 修复 PR 更新后审阅差异与提交行号不一致的问题，并改善大量评审讨论的统计。 @LegGasai
- 修复只有 SSH 凭据时无法查看私有 Git 插件详情的问题。 @turtle2099
- 修复可选插件加载失败导致整个 Web 页面无法启动的问题；必需插件失败仍会提示。 @imccyu
- 修复已启用但未成功加载的插件容易被误认为正在运行的问题，明确显示“未运行”及原因。 @turtle1999
- 修复 PTC 中重复等待子代理消息时，同一条消息反复触发唤醒的问题。 @Dudu-0223
- 修复浏览特殊文件名或扩展名时，文件树视图崩溃的问题。 @LegGasai
- 修复“未分组”会话中显示无效“新建会话”按钮的问题。 @turtle2099
- 修复复制聊天公式时出现乱码的问题，同一条 Markdown 内容中的公式可复制为 TeX 源码。 @turtle2099
- 修复查看 Perl 代码时，正则表达式导致后续内容高亮错误的问题。 @turtle2099
- 修复聊天更新出错后，历史加载和新消息显示持续卡住的问题。 @Magolor
- 改善重复创建会话分支时的标题编号，跳过已用编号，减少同名会话。 @turtle2099
- 修复停止任务或关闭会话时，部分错误导致任务未中止或资源提前释放的问题。 @liukx0205
- 修复发送消息或准备附件期间重试请求，导致同一消息被重复提交的问题。 @liukx0205
- 修复中文目标栏混淆“待继续”与“已暂停”状态的问题。 @imccyu
- 修复桌面端多次启动后，因鉴权信息累积而无法启动的问题。 @turtle2099
- 修复 Windows 通过短路径启动命令行时，无法保存欢迎页确认的问题。 @winewill
- 修复 macOS 窗口拖动与粘贴快捷键问题，以及 Windows 暗色模式启动白闪。 @yxy72, @winewill, @turtle2099
- 改善 Windows 更新安装期间的反馈，显示安装状态窗口，减少重启过程中的无提示等待。 @winewill
- 修复移动端 Safari 在展开屏幕或切换视口后，聊天文字被额外放大的问题，保留用户主动缩放。 @Saafo
- 修复 Linux 存在长期后台进程时，会话加载与新建变慢的问题。 @turtle2099
- 修复会话中移除或替换工具后，部分模型拒绝继续请求的问题。 @Tuyixiang
- 通过 Anthropic Messages 接入时，历史前缀变化后省略失效的签名 thinking，减少压缩后持续请求失败。 @turtle2099
- 修复部分模型网关错误被误报为“API 密钥无效”的问题，使重试按实际响应状态处理。 @LegGasai
- 修复在 DSH 用户目录中配置 DeepSeek 端点后无法启动的问题；项目目录中的环境配置仍不能覆盖端点。 @LegGasai
- 修复连续浏览多页 PDF 时加载越来越慢、快速翻页卡顿的问题。 @turtle2099
- 修复使用 Inspector 查看较大的 Cordis 树时，快照接近上限可能导致服务退出的问题。 @turtle2099

#### 其他变更

- 网页搜索默认改用 DeepSeek Search API，搜索与获取可分别选择计费账号或 API Key；旧提供方和自定义配置需按升级指南调整。 @yudshj
- 归档会话默认清理符合条件的 Git 工作树，保留分支与提交；需保留本地目录时请关闭清理，自定义配置与 Forge 插件需迁移。 @LegGasai
- AgentTeam 改用统一的具名子代理，中断工具默认关闭；自定义插件与 SDK 集成需迁移，共享会话的进程须同步升级。 @Dudu-0223
- SDK 可通过配置为新会话默认开启团队协作，恢复已有会话时保留原选择。 @Dudu-0223
- 允许插件动态注册和移除 MCP 服务，并查询状态、重启或探测连接，无需用户逐项维护服务配置。 @LegGasai
- 插件可按语言扩展聊天代码块的显示，未匹配或渲染失败时回退为普通代码块。 @imccyu
- 插件索引可提供 GitHub Star 和 npm 周下载量，默认仍按索引提供的顺序排列。 @turtle1999
- Creator 的开发指引统一到 dsh-doc，用于定制 DSH 并查阅当前版本资料；引用旧技能名称或路径的扩展需迁移。 @turtle1999
- 自定义模型提供方支持 Gemini 原生接口，可获取模型列表并设置推理等级。 @turtle2099
- 模型请求的 User-Agent 增加启动配置标记，便于服务端区分桌面端、Web、命令行与 SDK 请求。 @imccyu
- 调整账号通知，支持产品公告等消息并随界面语言更新；已有登录保留，自定义账号插件与配置需迁移。 @lsdsjy
- PTC 按运行时限限制工具调用总量，超限会终止代码并清空保留状态，已完成的操作不会撤销。 @kermanx
- Session 支持批量追加事件，日志格式不变；自定义追加接口的包装代码需适配批量调用。 @liukx0205
- 工具失败提供更明确的错误类型与代码，便于定位问题；依赖旧错误分类的插件和 SDK 集成需同步适配。 @sjw1231
- 调整 Computer Use 的窗口操作、键盘控制和授权，默认不移动系统鼠标；自定义脚本与 helper 需同步升级。 @CreatixChu, @Tuyixiang, @Dudu-0223
- Office 改用原生工具，Web 与 SDK 均可加载技能；旧包和技能需迁移，文档解析在 DSH 主进程中运行，不受命令行沙箱保护。 @yudshj
- Windows 的额外目录授权仅供文件工具使用，不扩大终端或 PTC 的访问范围；相关沙箱扩展需迁移。 @Tuyixiang
- 调整 LiveShare 的多会话分享与插件授权，旧授权需重新配置；PTC 可访问分享目录之外，仅应分享给可信任的人。 @mektpoy
- npm 安装与桌面端随附对应版本的源码和文档，方便查阅与开发扩展；Python 单文件运行时不包含这些资源。 @turtle1999
- 升级 Zod 至 4.6.6、Stagehand 至 4.4.0；Stagehand 改为自动发现扩展，旧 extensionId 配置不再生效。 @imccyu

### BirdCoder 本次更新摘要（2026-11-11）

* **同步与冲突处理**：上游新增的 602 个文件**零遗漏**合入；3479 个上游改动文件中有 3233 个与 upstream/master 逐字一致，其余差异均为 fork 自有改动或按冲突决策有意保留。上游已删除、fork 仍保留的 4 个 modify/delete 文件（apps/desktop-host/src/office-engine.ts、对应 spec、AccountNotice.tsx、deepseek-account-platform/src/index.ts）未误删。
* **品牌与登录**：BirdLogo / BirdWordmark / LoginPanel 仍是唯一的品牌与登录表面；apps/desktop/README.i18n.yaml 的 /birdcoder-desktop/* 路径、website/docs.ts 的中文导航文案沿用 fork 版本，上游新增的桌面卸载文档以 fork 文案接入；上游鱼形 SVG、favicon.svg、wordmark.svg 与图标原始稿未回流。品牌复核清单（FishLogo / BirdLogo / LoginPanel / BirdWordmark / boot brand / favicon / window icon / dsh-mark）全部通过。
* **Markets 与助理**：专家市场 surface 与固定专家名册、四类目录统一先展示 SDKWork 云目录、iam:self 应用令牌、目录访问登录门禁、注入面板读取修复；助理 rail 入口与图标选中态、会话内模型选择器工厂化、抽屉改模态对话框，以及 sdkwork-deepseekbot 子模块的多次 pin 推进全部保留。
* **设置、计费与桌面**：ui-sdkwork-token-plan 的设置套餐卡与积分区、域名/证书/小程序账号设置插件、用量计费仪表盘等 fork 插件依赖清单原样保留（packages/bundle/web-app/package.json 的 99 行 SDKWork 依赖未受上游改动影响）；桌面发布源配置与定时更新检查、Web 预构建 IM embed bundle、IAM 登录链路的三个修复、容器打包集与插件 pin 的发布修复一并保留。
* **版本号与依赖**：fork 发布版本仍为 **0.2.2-rc.1**，未被上游 rc.2 的版本行覆盖——内置插件的 devDependencies 把 @deepseek-ai/dsh-* 钉在精确的 rc.1，随手 bump 会让冻结安装的 lockfile 校验失败。上游新增/变更的依赖声明（dsh-terminal-panel、dsh-cua-windows、dsh-office-kit、zod 4.6.6、@browserbasehq/stagehand 4.4.0、libreoffice-kit 0.2.3 等）已按三方语义并入各 package.json 与 pnpm-workspace.yaml，files 数组取双方并集。
* **生成物与后续适配**：pnpm-lock.yaml 沿用 fork 侧已物化的 workspace 依赖图，需在下次安装时刷新；apps/desktop-host/src/cli.ts、ui-workspace/rows/Rows.tsx、WorkspaceBrowser.tsx、packages/bundle/base/cordis.patch.yml 等接口级重构点在合并时先保留了 fork 的可运行实现，随后在合并后复核中按升级指南完成迁移与修复（见下）。
* **合并后功能复核与修复**（2026-11-11）：以 upstream/master、fork 基线与合并结果做三方差异复核，修复 6 类「上游重构 API 后 fork 自有文件/配置未跟上」的破损——① `ui-workspace` 行组件把上游的创建/重排 `actions` 与 fork rowMenus 插件的菜单 `actions` 混为一谈，导致 `ProjectRowActions` 未定义、`access` 读取崩溃；现拆分为 `ProjectRowAccess`（承载绑定到 Workspace 的 `create` 回调）与 fork 的 `actions`（rename/delete），并采纳上游 `onCreate(workspaceId)`、移除 `useRemoteAccess`；② `desktop-host/src/cli.ts` 保留 fork 的两参数 `runDesktopCli(runtimeDir, supportDir)`，补回 `runtimeArchivePath` 导出并修正 CLI 入口与测试的调用签名；③ base 配置的 `deepseek-account` 行按上游升级指南从已删除的 `@deepseek-ai/dsh-deepseek-account-platform` 改指 `@deepseek-ai/dsh-deepseek-account`，清理失去 package.json 的孤儿源文件，功能由上游新包承接；④ 把 fork 的 OEM 能力（`applicationOrigins` 登录回调白名单、`allowInsecureHttp`）迁移进新账号服务，并修正 `platformOrigin` 三/四参数错配（否则字符串被当成真值、静默放开明文 HTTP）；⑤ `deepseek-account/tests/account.spec.ts` 改导入 `DeepSeekAccount`；⑥ 删除零消费者且依赖已被上游移除的 `ui-settings-account/AccountNotice.tsx`（通知能力由上游新包 `ui-account-notifications` 承接）。同步刷新 30 项中英文档配对记录，并更新模块依赖图与 AGENTS.md 中的旧包名。
* **复核验证**：定向 lint 0 错误；`desktop-cli.spec.ts`、账号服务与 `ui-workspace` 三组合计 **704 个测试全绿**；全仓配置审计覆盖 383 个 cordis 文件 / 1632 行 name 与 349 个 `dsh-*` 源码导入，零悬空；上游新增的 602 个文件、84 份升级指南零遗漏；品牌契约清单复核通过。残余类型门禁报错仅来自未刷新的依赖与 host 生成物（`@vscode/ripgrep`、`@deepseek-ai/libreoffice-kit`、`dsh-office-kit/remote` 等），需下次安装并重跑 `run-tsdown-build-face.mjs host` 后消除。

### BirdCoder 本地修改（0.2.2-rc.1 起累积）

本次是 `0.2.2-rc.1` 的重新打包，不是新的版本线：内置插件在 `devDependencies` 里把 `@deepseek-ai/dsh-*` 钉在精确的 `0.2.2-rc.1`，插件的开发依赖因此要求发布版本必须仍是 rc.1（换成 rc.2 会让冻结安装的 lockfile 校验直接失败）。相对 2026-11-05 首次发布的 rc.1，本次累计带上 `main` 上在其后落地的全部改动：域名与证书设置插件、小程序账号设置、Markets 云目录优先、IAM 登录链路的三个修复、内置插件推进到各自的最新发布提交，以及助理 surface 的一组功能与修复（见下）。SDKWork 生态兄弟仓库的 31 个依赖 pin 同步推进到各自已推送的 `origin/main`（`scripts/sdkwork-sources.manifest.json` 与 `agent.workflow.json` 双记录保持一致）。发布资产与首次 rc.1 同构：六个平台（win-x64、win-arm64、mac-x64、mac-arm64、linux-x64、linux-arm64）桌面安装包、两套原生容器镜像、以及 Compose/Kubernetes 部署包，共 31 个附件。

#### 新增功能

* 新增**助理（assistant）surface**：助理 rail 入口接回侧栏且图标随选中态填充；会话内模型选择器改由工厂渲染，复用 Home 的模型分组与会话目录读取，并在刷新时保持复用的选择器不关闭；抽屉式资源面板统一替换为模态对话框。
* 设置菜单新增**域名管理**（`ui-sdkwork-dns`）与**证书管理**（`ui-sdkwork-certificate`）两个独立插件，落在「公众号账号」「小程序账号」之下。两者各自持有设置行、80vw 弹窗框架、工作区、语言命名空间与 Host 适配器，能力本身取部署应用 API 的 `domain.domainZones` 与 `certificate` 表面，不引入第二套后端契约，也不互相依赖；设置菜单只通过 `settings.dns` / `settings.certificates` 两个根级 feature-modal 座位授予可见性。
* 设置菜单新增**小程序账号**设置插件。
* 部署目标选择更精确：桌面宿主的环境启动参数区分部署档位，未显式指定时回落到既有行为。
* Markets 四个分类（插件、技能、专家、连接器）统一改为**先展示 SDKWork 云目录**并默认选中，连接器分类首次也有云目录货架；此前插件分类以社区市场打头、技能分类云目录排第二的次序被本版本推翻。
* Markets 改用 `iam:self` 应用令牌访问云目录，会话与令牌在每次读取前镜像到浏览器全局令牌管理器。
* 侧栏代码入口改用 home 图标，令牌套餐等 rail 入口的图标与文案同步收敛。
* 内置**用量与计费仪表盘**（`dsh-ui-usage-billing`）：侧栏费用卡与八分区仪表盘，供应商余额、订阅与中转站额度，低谷任务队列和 CSV/JSON 导出；用量取自持久化会话日志的真实聚合，价格取自实时目录（含 DeepSeek 峰谷分时价），宿主侧以同源 `/api/billing/*` 路由提供数据，模型侧 `usage_stats` 工具默认关闭。插件以 `plugins/dsh-ui-usage-billing` 子模块接入并在 Web 组合里默认挂载，无需安装步骤。
* 用量卡的入口移到**设置菜单用户名下方**：侧栏费用卡默认**完全隐藏**，打开左下角设置齿轮即可在用户名下面看到今日花费（今日/本周/本月主数字、涨跌徽章、近 7 天迷你柱），点击打开完整仪表盘；已存偏好不改写，插件设置页仍可恢复侧栏卡面。实现走宿主的 `settings.menu.account` 座位（`ui-settings` 声明、`ui-sdkwork-settings-menu` 渲染在账户身份行下方），插件注册卡面并读侧栏实例发布的同一份快照，两处金额与失败态永远一致。子模块同时切换到 SDKWork 自有 fork `sdkwork-ai/sdkwork-dsh-usage-billing`（包名与 loader 行 id 不变），此后该插件的源码与构建产物由本 fork 维护。

* 设置中心新增**「输入框底部内容」**配置：输入框底部的两枚常驻胶囊——**低谷队列**（入口与入队控件）与**价格**（当前会话即时费用，含平价/峰谷）——**默认都不显示**；设置页第一组、导航第一项即可按需打开，价格开关打开后才展开位置选择（输入框内部 / 上方 / 下方）。读取改为 opt-in（只有显式 `true` 才显示），并对存量偏好执行一次性迁移（`dsh.ui-usage-billing.composer-footer-hidden`）：旧版本把当时默认的 `show/showEntry=true` 固化进 localStorage，升级后首次加载会把这两个显示开关关一次，其它偏好字段保留；之后用户手动打开照常生效。侧栏卡的偏好读取同口径收紧：没有 `mode` 字段的旧偏好按隐藏处理，只有显式 full/compact 才显示。

#### 问题修复

* **登录弹层可操作**：Radix 对话框会给 `body` 加 `pointer-events: none`、给兄弟节点加 `aria-hidden`，因此从 Token Bank 充值弹窗上浮起的登录卡「画得出来却点不动」。登录宿主现在为自己的子树恢复 `pointer-events`、清掉 `aria-hidden`，并独占顶层槽位（z-index 1200），压在页面模态、商城对话框、菜单与 toast 之上。
* **桌面深链登录的一次性授权码最多兑换一次**：生成的传输层遇到传输失败、超时、5xx 与 429 会重试三次，而这些恰恰是服务端可能已经消费掉授权码的情形，重试只能换回「OAuth authorization code is invalid or expired」并把浏览器已完成的登录报成失败。兑换改为不重试，同一授权码的重复投递（并发或渲染进程晚加载）只兑换一次；本地等待窗口由十分钟收紧到与服务端一致的授权状态窗口，失败原因此前只留在错误对象里、现在会呈现给用户。
* **支付与兑换就地拉起登录**：未登录时的支付、兑换不再先打网关再回显 bearer-token 错误，也不再弹出桌面欢迎页盖住工作区。两处用户发起的商城变更改由 `requestSignInInPlace` / `requireSignedInInPlace` 守护：登录浮层就地打开在当前对话框之上，登录后同一个请求继续；关闭浮层给出本地化的 `commerce.signInRequired` 提示。
* **令牌套餐档位表深色模式悬停可读**：嵌入的 Tailwind 样式表重新声明了浅色 hover 工具类，导致深色表面上整行变成近白色、深色文字不可读。深色变体恢复为预期的半透明深色填充，与分组表头的覆盖保持一致。

#### 插件与依赖

* `dsh-better-sidebar` 前进到 **v0.30.1**：支持 DSH 0.2.2，侧聊支持图片，引用块可点击跳转，编辑器草稿本地备份。
* `dsh-mcp-connector` 前进到 **v0.2.95**：连接器设置拥有独立入口。
* `dsh-skill-market` 前进到 **v2.1.0**：插件获得自己的设置页，`lib/` 产物在功能提交内同批重建，符合「按发布产物运行」的 pin 契约。
* `dsh-better-sidebar` 前进到 v0.30.1 之后的文档提交（AGENTS.md 重构，源码与 `lib/` 产物不变）。
* `dsh-im` 保持 **v5.10.0**（`origin/main` 上的提交尚未发布，其 `lib/` 产物与本仓库「按发布产物运行」的 pin 契约不符）。
* 新增内置插件 `dsh-ui-usage-billing`，子模块改指 SDKWork 自有 fork `sdkwork-ai/sdkwork-dsh-usage-billing`，pin 落在 **`1.8.4-sdkwork.3`**（`9cba33d`，基线 `v1.8.3-alpha.4`）；其 `lib/` 产物与源码在同一次提交内重建，符合「按发布产物运行」的 pin 契约。包名 `@kenz1117/dsh-ui-usage-billing` 与 loader 行 id `ui-usage-billing` 保持不变，上游署名与版权保留。
* `dsh-ui-usage-billing` 同时是 workspace 成员，自带开发者依赖闭包，因此本次 **`pnpm-lock.yaml` 随插件 pin 一起刷新**；其余四个插件的 pin 与依赖清单不变。
* SDKWork 生态兄弟仓库的 31 个 pin 推进到各自已推送的 `origin/main`（`scripts/sdkwork-sources.manifest.json` 与 `agent.workflow.json` 双记录同步）。

#### 打包与发布

* 版本号保持 **0.2.2-rc.1**（`package.json` 与 tag `birdcoder-v0.2.2-rc.1` 一致）；tag 改指本次构建的提交，发布 workflow 会删除该 tag 的既有 Release 并按同一份 31 个资产重建。
* 依赖解析规则不变：本地开发走 `pnpm-workspace.yaml` 的相对路径 / `workspace:` 协议，发布产物走 git 仓库与 registry 依赖；SDKWork 生态兄弟仓库仍按 `scripts/sdkwork-sources.manifest.json` 的 pin 检出。

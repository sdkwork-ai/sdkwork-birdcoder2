# BirdCoder 更新日志

## 0.1.2-rc.1（2026-09-04）

本版本同步上游 deepseek-harness 0.1.2-rc.1（merge 71928b6624），作为 0.1.2 系列的首个候选发布，并完成合并后的集成修复、版本对齐与容器冒烟稳定性修复。

### 同步上游 0.1.2-rc.1 主要变更

#### 新增功能

- 会话流默认在每个已完成回答前折叠过程内容与「System prompt」，正文宽度可自适应或拖拽调整。

- 回答末尾显示 token 用量和耗时，可展开查看精确用量与详细统计；会话视图提供覆盖完整历史的回合导航。

- 插件支持在模型设置页添加提供方登录配置；界面支持第三方语言，统一权限分类和标签的本地化表达。

- 子代理模型选择支持 Agent 授权范围内自主选择，也支持调用方指定提供方、模型、推理力度和最大输出长度，并为 Claude Code、Codex 配置模型。

- Python SDK runtime 新增 Windows x64 发行包；ACP 补齐标准会话控制、模型设置、MCP、权限和取消能力。

- DeepSeek 官方适配器默认随请求提供已启用插件的包名和版本（可配置关闭），并新增可选的 Session 日志增量上传（默认关闭）。

- 新增实验性 Inspector 工具与 Web Preview；界面显示连接状态，支持连接中断后的自动重试或立即重连。

- 父 Agent 与可持续子 Agent 可通过 `send_message` 双向传递后续消息，取代单向 `report` 工具。

#### 体验优化

- 减少页面启动和会话初始化中的代码加载、数据传输与解析开销；改善会话记录占用的磁盘空间。

- 优化 `/` 与 `@` 菜单的图标、目录加载和文件搜索，支持鼠标在目录层级间导航。

- 输入框中的文件和会话引用在相邻文字编辑后仍保持有效；切换会话后保留未提交的提问卡片草稿。

- 图片发送后立即显示，压缩和上传在后台继续；上下文压缩会计入图片占用；轨迹视图支持展示图片。

- 插件列表按会话插件和全局插件分组，可切换 Agent Preset 查看组合、搜索其他预设。

- 提升长会话和密集实时消息的处理效率，降低内存占用以及流式回复、代码高亮、布局和导航预览的渲染开销。

- `web_search` 失败时报告实际端点和错误明细；减少 macOS 和 Linux 加载会话时不必要的文件系统检查。

#### 问题修复

- 修复 macOS 和 Linux 上持久 PowerShell 启动过早、输出不完整的问题；修复 Linux 持久 Bash 在管道内部读取时提前返回空输出的问题。

- 修复 Bash 命令派生大量子进程时 macOS 宿主卡顿的问题；修复 Windows 目录选择器截断特定编码字符路径的问题。

- 修复 Profile 配置的 Agent Preset 目录在启动时丢失的问题；无法加载的 preset 提前标记并说明原因。

- 修复 Node.js 24.0–24.11.1 上启动可能失败且 HMR 失效的问题；网关定期发送 WebSocket 心跳，避免空闲连接中断。

- 修复新建空会话挤掉 Workspace 折叠列表已有会话的问题；会话运行中追加或排队发送的图片可正确回显并可靠投递。

- 命令菜单打开时 `Tab` 可补全当前高亮的斜杠命令；文件编辑工具接受当前操作未使用字段的 `null` 占位值。

#### 其他变更

- 更新安全说明：DeepSeek Harness 尚未接受安全审计，沙箱、审批与权限控制不能保证隔离。

- Remote 网关统一远程调用 API 与异常分发，旧版 APIProxy 已迁移并移除。

- 网络访问 Web 界面时启用链接中的一次性 token 认证鉴权；应用统一通过 `dsh` Profile 启动（含 Python SDK、ACP 模式）。

- Headless 运行期间向 stderr 流式输出进度，stdout 只输出最终结果；Code Mode 统一更名为 PTC mode，现有会话记录仍可读取。

- 默认启用公网 WebFetch（内置 SSRF 防护）；移除可选的 SQLite Session 持久化后端。

- `Session.events` 被按需读取 API `seq`、`eventAt()` 和 `snapshotEvents()` 取代；`SessionSeq` 与 `SessionLogOffset` 使用强类型区分。

### 本地修改

- **版本对齐**：合并后 28 个 fork 侧包（`ui-sdkwork-*`、`sdkwork-desktop-app`、`sdkwork-desktop-carrier`、`sdkwork-env-bootstrap`、`client/runtime`、`host/apiproxy`、`sdkwork-app-build`、`apps/desktop` 等）版本统一到 0.1.2-rc.1。

- **恢复合并中丢失的 fork 事实**：`packages/client/connection` 恢复 `./desktop` 导出与通配 `files` 模式（桌面宿主按 `@deepseek-ai/dsh-client-connection/desktop` 加载）；`apps/web` 恢复五个环境构建/开发脚本（`build:test`、`build:staging`、`build:production`、`dev:test`、`dev:staging`）；`apps/cli` 恢复发布 `config` 目录；`packages/client/ui-settings-general` 恢复注入 `dsh-client-ui-sdkwork-app-modes`。

- **构建注册**：为名称与目录不一致的三个 fork 包（`dsh-api-sdkwork-app-build-controller`、`dsh-client-ui-sdkwork-deploy`、`dsh-client-ui-sdkwork-share`）补充 `tsconfig.base.json` 别名并重新生成客户端 slot 目录。

- **容器冒烟修复**：Web 界面挂载在一次 token 认证之后，未认证的 `GET /` 返回 401；容器 HEALTHCHECK 改为存活探针（任一 HTTP 状态 < 500 即健康），并将启动等待预算从 15 分钟提升到 30 分钟（entrypoint 超时）与 40 分钟（HEALTHCHECK start-period、CI 冒烟循环与 Compose `--wait` 超时），以覆盖 Web 首次冷启动时长。

- **桌面打包闭包修复**：`check:pack-deps` 报告 `@deepseek-ai/dsh-http-proxy` 未进入桌面打包闭包，已在 `apps/desktop` 补齐该依赖并同步 lockfile，闭包校验恢复通过。

- **容器镜像 npm 解析修复**：node:22 自带 npm 10 的 arborist 在解析 peer 密集的根级 tarball 集合时崩溃（`Cannot read properties of null (reading 'edgesOut')`），构建阶段升级到 npm 11（与本地验证版本一致）后同一集合可正常安装并完成 launcher 冒烟。

## 0.1.2-alpha.1（2026-08-29）

本版本同步上游 deepseek-harness 0.1.2-alpha.1（merge cd5ef81481），并完成合并后的集成修复，使 dsh 发布族 265 个成员全部处于同一版本、可打包可发布。

### 修复

- **版本对齐**：合并后停留在 0.1.1-rc.2 的 24 个 fork 侧包（`ui-sdkwork-*`、`sdkwork-desktop-app`、`sdkwork-desktop-carrier`、`sdkwork-env-bootstrap`、`client/runtime`、`host/apiproxy`、`apps/desktop`）对齐到 0.1.2-alpha.1，`release:verify` 恢复通过。

- *ui-sdkwork-* 与 dsh-client-runtime 解耦\*：客户端插件不再通过 `client.inject` / peerDependencies 依赖 `dsh-client-runtime`，快照 store 引擎改用 `@deepseek-ai/dsh-client-store`，`tsdown.client.ts` 移除对应的临时豁免（`RUNTIME_STORE_EXEMPTION`）；`dsh-client-runtime` 仅保留在 devDependencies 供测试夹具使用。

- **发布产物文件清单**：修复 `check-workspace-constraints` 对 bundle 包 `cordis.patch.yml` 的重复期望（`dsh.bundle.patch` 已派生该条目）；`apps/cli` 的 `config` 目录纳入发布策略；`dsh-client-connection` 的 `files` 按规范顺序排列；`dsh-client-ui-sdkwork-iam` 补上 `./sdkwork-global-token-manager` 子路径所需的 `lib/types/**/*.js` 发布项。

- **sibling 钉版重钉**：`scripts/sdkwork-sources.manifest.json` 的 24 个仓库钉定 commit 全部更新到各自远端 tip，消除 CI 按 pin 克隆旧源码与 lockfile 不一致导致的打包漂移。

## 0.1.1-rc.2（2026-08-23）

本次发布在上一版本基础上完成了 SDKWork 生态的完整接入，并修复了打包、发布与运行时的一系列问题。所有桌面端产物（Windows / macOS / Linux，x64 / arm64）与容器化部署包（amd64 / arm64）均在同一版本下构建、验证并发布。

### 新增：SDKWork 生态插件（18 个客户端插件）

#### 账号与认证

- **SDKWork IAM 集成**（`ui-sdkwork-iam`）：通过 sdkwork-iam 认证栈提供登录 / 注册（全新页面与 Modal 弹窗两种形态）与退出登录，挂载为账号应用模式、设置菜单账号缝与框架浮层 Modal 宿主。

#### 应用与服务

- **SDKWork 应用商店**（`ui-sdkwork-appstore`）：应用商店应用模式，拥有 `appstore` 侧栏入口，挂载 SDKWork 应用商店 PC 表面，支持应用浏览与安装流程。

- **令牌套餐**（`ui-sdkwork-token-plan`）：`token-plan` 应用模式，提供套餐订阅、充值等令牌管理能力，并集成 Membership / Order / UI 等 SDKWork 前端表面。

#### 内容与协作

- **知识库**（`ui-sdkwork-knowledge`）：`knowledge` 应用模式，集成 SDKWork 知识库宿主，支持知识条目、文档导出（含 PDF）等能力。

- **课程**（`ui-sdkwork-course`）：`course` 应用模式，集成 SDKWork 课程 PC 表面。

- **云盘**（`ui-sdkwork-drive`）：`drive` 应用模式，集成 SDKWork 云盘 PC 表面，提供文件管理、分享与下载能力。

#### AI 创作

- **图片生成**（`ui-sdkwork-generations-image`）：`image` 应用模式，接入 SDKWork Agents 图片生成页面。

- **视频生成**（`ui-sdkwork-generations-video`）：`video` 应用模式，接入 SDKWork Agents 视频生成页面。

- **创作资产**（`ui-sdkwork-generations-assets`）：`assets` 应用模式，接入 SDKWork Agents 资产页面。

- **资产应用模式**（`ui-sdkwork-assets`）：独立的资产模式栏条目与中心列页面。

#### 平台与体验

- **部署环境**（`ui-sdkwork-env`）：SDKWork 部署环境插件，提供共享的设置作用域（活动环境 + 每环境 profile），以 `ctx.env` 服务暴露给各集成插件。

- **设置菜单**（`ui-sdkwork-settings-menu`）：模式栏设置齿轮上的设置菜单及设置弹窗外壳。

- **桌面更新**（`ui-sdkwork-updater`）：Electron 壳层的桌面更新发现 UI，更新横幅 + 设置偏好行。

- **窗口控制**（`ui-sdkwork-window-controls`）：无边框 Electron 外壳的自绘窗口控件（最小化 / 最大化-还原 / 关闭，纯 HTML/CSS 实现）。

- **用户反馈**（`ui-sdkwork-feedback`）：设置菜单的反馈弹窗，通过 appstore 反馈收集端提交用户反馈。

- **移动端模拟器**（`ui-sdkwork-mobile-simulator`）：基于浏览器的移动端模拟器，在真实设备边框内渲染网页内容（iPhone、三星、华为、小米、OPPO、Pixel、OnePlus 等）。

- **通用应用头部**（`ui-sdkwork-common-app-header`）：非代码应用模式的通用顶栏。

- **应用模式外壳**（`ui-sdkwork-app-modes`）：类微信桌面的模式栏外壳、基础模式条目与侧边栏可见性偏好。

### 运行时修复

- 修复安装后插件加载崩溃：客户端插件 bundle 中 SDKWork 源码（`@sdkwork/*`）及所依赖的 npm 包的裸导入在发布环境无法解析，被降级为运行时外部引用，导致 `missed the module table` 错误。现已通过 pnpm 虚拟存储扁平链接作为兜底解析路径，使发布产物与本地构建的解析结果完全一致（CI 与本地 0 警告、0 外部引用）。

- 修复 `@sdkwork/ui-pc-react`、`@sdkwork/appstore-pc-*` 等模块在运行时无法从加载器模块表解析的问题。

- 修复启动后界面空白：令牌套餐（token-plan）样式入口 `tokenPlan.css` 的 Tailwind 导入（`tailwindcss/theme.css`、`tailwindcss/utilities.css`）在打包时被通用 CSS 内联插件抢先拦截、未经过 Tailwind 编译，导致渲染器请求 `app://dsh/tailwindcss/theme.css` 返回 404。现已调整编译插件优先级，Tailwind 主题与工具类在构建期完整内联。

- 非 SDKWork 插件不再依赖 `@sdkwork/utils`（约定：非 sdkwork 插件不得使用 sdkwork-utils），相关 `id` 生成统一替换为 `crypto.randomUUID`（浏览器上下文带兜底实现）。

- 补齐知识库 PDF 导出所需的 `jspdf` 依赖；批准 `core-js` 构建脚本（pnpm 11 严格策略）。

### 打包与发布流程修复

- **客户端构建（release.yml）**：

  - 修复 Client 阶段 `UNRESOLVED_ENTRY`：`ui-sdkwork-mobile-simulator` 补登记进客户端聚合工程。

  - 修复发布环境（无 sibling node\_modules）下 Tailwind 编译无法解析 `tailwindcss` 的问题（CSS/JS 双解析器 + `tailwindcss-animate` 依赖补齐）。

  - 修复 `sdkwork-drive` 仓库缺失 111 个生成文件导致构建失败的问题（已补交并重新钉定版本）。

  - 修复 Web 构建中 `@sdkwork/sdk-common` 入口解析失败的问题（Vite 源码别名）。

  - 修复 Landlock 打包缺原生二进制的问题（安装 musl 工具链并执行原生构建）。

  - 修复打包产物安装验证中 esbuild 平台包版本错配与 `@sdkwork` 依赖 404 的问题。

- **桌面发布（container-release.yml）**：

  - 修复桌面打包依赖闭包缺失（`sync-pack-deps` 全量同步）。

  - 修复打包冒烟测试断言与运行时注入不一致的问题。

  - 修复容器镜像构建中跨平台 Landlock 包导致的 `EBADPLATFORM`。

  - 修复 Landlock 中间产物混入 Release 资产下载的问题。

  - 修复 git 依赖方式本地打包（`release:gitdependencylocal`）产物复制遗漏 `win-unpacked` 目录、可能用旧树验证新构建的问题（先清空再递归复制，保证验证与交付对象始终是本次构建）。

- **发布机制**：移除 npm 发布工作流与相关脚本、文档，统一以 GitHub Release 发布打包产物（桌面安装包、容器镜像、部署包）；文档站点发布改为通用 tag 校验。

- **调试支持**：`release:gitdependencylocal` 新增 `--inspect [port]` 参数（默认 9229，默认不开启）：打包的桌面主进程在首次启动时自动带 `--inspect=<port>` 重启一次，之后可连接 `127.0.0.1:9229` 用 VS Code / DevTools 断点调试主进程；不带参数打包时产物不含任何调试代码。

### 工程与稳定性

- 打包全流程可在 CI 稳定复现：本地使用相对路径工作区，线上按钉定清单从 Git 拉取同一版本源码。

- 锁文件与依赖闭包保持单一事实源，后续每次打 tag 均可自动完成打包与 GitHub Release 发布。

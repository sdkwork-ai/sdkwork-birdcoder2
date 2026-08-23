# BirdCoder 更新日志

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
- 补齐知识库 PDF 导出所需的 `jspdf` 依赖；批准 `core-js` 构建脚本（pnpm 11 严格策略）。

### 打包与发布流程修复

- **客户端构建（release.yml）**：
  - 修复 Client 阶段 `UNRESOLVED_ENTRY`：`ui-sdkwork-mobile-simulator` 补登记进客户端聚合工程。
  - 修复发布环境（无 sibling node_modules）下 Tailwind 编译无法解析 `tailwindcss` 的问题（CSS/JS 双解析器 + `tailwindcss-animate` 依赖补齐）。
  - 修复 `sdkwork-drive` 仓库缺失 111 个生成文件导致构建失败的问题（已补交并重新钉定版本）。
  - 修复 Web 构建中 `@sdkwork/sdk-common` 入口解析失败的问题（Vite 源码别名）。
  - 修复 Landlock 打包缺原生二进制的问题（安装 musl 工具链并执行原生构建）。
  - 修复打包产物安装验证中 esbuild 平台包版本错配与 `@sdkwork` 依赖 404 的问题。
- **桌面发布（container-release.yml）**：
  - 修复桌面打包依赖闭包缺失（`sync-pack-deps` 全量同步）。
  - 修复打包冒烟测试断言与运行时注入不一致的问题。
  - 修复容器镜像构建中跨平台 Landlock 包导致的 `EBADPLATFORM`。
  - 修复 Landlock 中间产物混入 Release 资产下载的问题。
- **发布机制**：移除 npm 发布工作流与相关脚本、文档，统一以 GitHub Release 发布打包产物（桌面安装包、容器镜像、部署包）；文档站点发布改为通用 tag 校验。

### 工程与稳定性

- 打包全流程可在 CI 稳定复现：本地使用相对路径工作区，线上按钉定清单从 Git 拉取同一版本源码。
- 锁文件与依赖闭包保持单一事实源，后续每次打 tag 均可自动完成打包与 GitHub Release 发布。

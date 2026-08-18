## 根因
当前 BirdCoder 的 `ui-appstore` 接入了自定义的 `AppStorePage`、`DiscoverModule` 和 `AppStoreCatalogService`，只复刻了首页数据区块，没有接入 SDKWork App Store 的完整产品壳。上游完整入口是 `sdkwork-appstore-pc/src/App.tsx`，其中包含 `Layout`、`DesktopSidebar`、`DesktopHeader`、MobileNav、Router、AuthGate、ThemeProvider、InstallProvider，以及 apps/games/AI Hub/plugins/skills/MCP/templates/charts/search/library/wishlist/updates/detail/console/publisher/admin 等路由。现有 `@sdkwork/appstore-pc-shell` 只是依赖 `@/src` Vite alias 的私有 facade，不能直接作为 BirdCoder 的稳定嵌入组件。

## 实施方案
### 1. 在 sdkwork-appstore 提取可嵌入 Host 导出层
- 在 `apps/sdkwork-appstore-pc/packages/` 新增公开的 `@sdkwork/appstore-pc-host` 包，作为唯一面向外部宿主的 React 集成入口。
- 将当前 `src/App.tsx` 的完整组合迁移为 Host 内部的可配置组合，不复制页面视觉和业务组件；继续复用已有 `Layout`、`DesktopSidebar`、`DesktopHeader` 以及所有现有 feature page 包。
- 将 `Layout`、layout 子组件和 Host 依赖的基础组件从 `@/src/...`、`../../../src/...` 应用根 alias 改为包内相对导入或明确的 workspace package 导入，确保 Host 不依赖 SDKWork PC 应用的 Vite alias。
- 为 Host 及被 Host 直接依赖的 feature 包补齐真实 `dependencies`/`peerDependencies` 和 `exports`，至少显式声明 React、ReactDOM、react-router-dom、i18next/react-i18next、lucide-react、motion、SDKWork auth/runtime/client 包和公共类型；清除“依赖由 app 根 manifest 或 hoisting 隐式提供”的情况。
- 将上游 `index.css` 中与宿主无关的 Tailwind app 入口、Google 字体和应用根全局初始化拆开，新增可发布的 Host CSS 资源：保留 sidebar/header/layout/page 所需 token、dark mode、滚动条和动画样式，避免向 BirdCoder 注入 Router、完整 auth 页面或全局应用启动副作用。
- 导出明确的 Host API，例如：
  - `AppstorePcHost`
  - `AppstorePcRoutes`
  - `AppstorePcShell`/`Layout`
  - `AppstorePcHostProps`、runtime/auth/navigation 配置类型
  - Host CSS 和 i18n 初始化/资源入口
- Host 的路由采用可嵌入模式：默认使用 `MemoryRouter` 或注入的 router context，支持 `initialPath`、`basename`、当前路径变化回调；不强制在 BirdCoder 外层创建第二个 `BrowserRouter`。
- Host runtime 改为显式输入或工厂参数，而不是模块级 `createAppstorePcRuntime()` 单例。宿主可传入 API base URL、SDKWork access/session token、locale、runtime target、可选 admin 权限和 install/session 适配器。
- 保留完整 SDKWork 产品行为：sidebar active matching、底部更新/下载/已安装入口、header 搜索跳转、语言切换、更新计数、主题切换、用户入口、窗口控制、移动端底部导航、全部已实现页面和详情/安装/收藏/更新流程。未配置外部认证时由 Host 明确进入配置/认证状态，不静默伪造数据。

### 2. 让 BirdCoder ui-appstore 只做宿主适配
- 删除或停止使用当前自定义 `AppStorePage`、`DiscoverModule`、`appstore-service` 的产品渲染路径；这些实现不再作为 App Store 主界面，避免两套产品 UI 并存。
- 保留 `ui-appstore` 的 Cordis 注册边界：`mode.rail.entry` 和 keyed `mode.page` 仍由 BirdCoder 注册，App Store Host 作为 keyed page component 挂载。
- 将 `ui-env` API URL、`ui-iam` session token、BirdCoder locale 和宿主主题/尺寸映射成 `AppstorePcHostProps`，通过显式 props/runtime adapter 传入；不用上游私有 `BrowserRouter`、认证壳或 app-root globals。
- 让 Host 生命周期跟随 Cordis effect/dispose：环境、IAM、locale 变化更新 Host 配置，旧 runtime/request 不得覆盖新状态；dispose 时移除 Host 的事件、storage、router 和 SDK listeners。
- 调整 `ui-appstore` package manifest、tsconfig/tsdown paths 和 SDKWork source manifest，使 source plane 指向 sibling checkout 的公开 Host entry，bundle plane 使用 Host 的正式构建产物/CSS，不再直接 alias 一组私有 PC app 文件。
- 以宿主自己的 mode rail 保持 BirdCoder 级导航；App Store 内部 sidebar 作为产品二级导航，视觉上形成截图所示的“BirdCoder mode rail + SDKWork App Store sidebar + App Store header/content”三层结构。

### 3. 同步文档与集成记录
- 更新 SDKWork App Store Host 包 README，说明嵌入 API、router/runtime/auth/theme/install 适配、CSS 导入和不应直接引用 PC app-root 私有路径的规则；补齐中英文和配对记录。
- 更新 BirdCoder `ui-appstore` README，明确该包现在是 SDKWork App Store Host 的 Cordis adapter，不再声称自行实现 Discover 页面。
- 更新现有 App Store Agent Note，记录“公共 Host 提取 + BirdCoder 宿主适配”的决策、sidebar/header/全路由复用范围、运行时边界和 source/artifact plane 规则；不要新增重复 note。
- 如上游 sdkwork-appstore 仓库要求，增加对应 feature/integration note，记录公开 Host export 的兼容前提和迁移原因。

### 4. 测试与验证
- SDKWork Host 包测试：
  - Host 在 MemoryRouter 下渲染完整 sidebar 分组和底部入口。
  - Discover、apps、games、AI Hub、plugins、skills、MCP、templates、charts、search、library、wishlist、updates、app detail、console、publisher、admin 路由可切换。
  - sidebar active state、updates query tabs、header search、language/theme/update controls、mobile nav 和 responsive shell 行为。
  - 外部 token/API/locale props 更新与 dispose 清理。
  - 不依赖 app-root Vite alias、私有 BrowserRouter 或 import-time 全局认证副作用。
- BirdCoder `ui-appstore` 测试：
  - keyed rail/page 注册保持不变。
  - page 注入的是 SDKWork Host，而不是旧 Discover page。
  - env/IAM/locale 映射正确，匿名/未配置状态可恢复，dispose 卸载完整 Host。
- assembled web 测试：
  - App Store mode 显示 SDKWork sidebar、header 和 Discover 首屏。
  - 切换侧边栏菜单时内容路由变化，搜索和 updates/library 入口可用。
  - 保持匿名鉴权失败路径和其他 mode 不回归。
- 重新构建 SDKWork Host、BirdCoder `ui-appstore` bundle 和 web assembled bundles；运行 focused typecheck/lint/Vitest、assembled web test、translation/docs gates。
- 启动 `pnpm dsh web`，用浏览器在桌面和移动视口对照附件验证：sidebar 宽度/分组/选中态、header 搜索与右侧控件、深色主题、内容滚动、移动底部导航、路由切换、无横向溢出和无重叠；必要时只修 Host 宿主适配，不重新仿制上游页面。

## 预期结果
最终 `ui-appstore` 不再维护一套与 SDKWork App Store 分叉的首页设计，而是以稳定的 `@sdkwork/appstore-pc-host` 为产品实现来源。BirdCoder 只负责 mode/plugin 生命周期、环境/IAM/locale 注入和外层 mode rail，用户看到的 sidebar、header、Discover 以及其他 App Store 功能由 SDKWork App Store 原有组件直接提供。
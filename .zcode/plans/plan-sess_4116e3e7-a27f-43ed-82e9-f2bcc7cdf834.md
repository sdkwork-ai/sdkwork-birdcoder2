## App Store 插件集成方案

### 目标
点击现有模式栏中的 App Store 图标后，将 `LayoutStore.mode` 切换为 `appstore`，由 keyed `mode.page` 挂载一个按 SDKWork 插件规范注册的 App Store 页面；页面通过已锁定的 `@sdkwork/appstore-app-sdk` 获取目录数据，并复用宿主的 `ui-env` 与 `ui-iam` 配置/会话。

### 设计决定
- 保留当前工作树把 `code/work/video/image` 留在 `ui-app-modes` 的拆分方向，不把 App Store 页面或业务 API 放进 shell。
- 在 `ui-layout` 的 mode vocabulary 和 `ModeRail.MODE_ORDER` 中保留/恢复 `appstore`，但 App Store 的 rail entry 与 page 都由新插件注册。
- 不直接复用 `sdkwork-appstore/apps/sdkwork-appstore-pc` 的私有整站 `App.tsx`：它依赖独立 Router、AuthGate、ThemeProvider、全局 `@/` alias 和私有 PC workspace 包，不符合 dsh 的 keyed slot 组件边界。使用其已发布/已锁定的 App SDK，在 dsh 页面内实现宿主适配层。
- 通过本地 `sdkwork-appstore` facade 隔离 SDKWork 导出，声明 emit 使用 facade，bundle 阶段解析真实 SDKWork 包，遵循 `ui-knowledge`/`ui-token-plan` 的 source/artifact plane 约定。

### 实施步骤

1. **恢复宿主 mode vocabulary 与顺序**
   - 修改 `packages/client/ui-layout/src/client/modes.ts`，加入 `appstore` 到 `AppModeId`。
   - 修改 `packages/client/ui-app-modes/src/client/ModeRail.tsx`，在 `image` 后、`knowledge` 前加入 `appstore`；不把它加入当前四项 `BASE_MODES` 或 `PLACEHOLDER_MODES`。
   - 保持 `ui-app-modes` 当前基础包职责和设置/侧边栏逻辑不变。

2. **新增 SDKWork facade**
   - 新建 `packages/client/sdkwork-appstore/package.json`，使用 private workspace facade，依赖锁定的 `@sdkwork/appstore-app-sdk` 与 `@sdkwork/sdk-common`，导出稳定的 App Store client/token 类型入口。
   - 新建 `packages/client/sdkwork-appstore/src/index.ts`，只重导出插件需要的 `createAppStoreClient`、`AppStoreClient`、token manager 类型/工厂及必要目录响应类型。
   - 添加 README（中英文或按现有 SDKWork facade 文档约定）说明该包只负责宿主稳定导出，不构建外部 SDK。
   - 不把外部 `sdkwork-appstore` 私有 PC 应用包加入 workspace build target；现有 app SDK workspace member/lockfile 作为唯一运行依赖来源。

3. **新增标准 `ui-appstore` client 插件**
   - 创建 `packages/client/ui-appstore` 完整插件骨架：`package.json`、`README.md`/`README.zh.md`/i18n sidecar、`tsconfig.json`、`tsconfig.bundle.json`、`tsdown.config.ts`、`src/index.ts`、`src/invariant.ts`、CSS Modules declaration。
   - manifest 注册 `dsh.client.platform=web`，声明 runtime/locale/slots/ui-app-modes/ui-env/ui-iam 依赖；在 dependencies 中使用 `sdkwork-appstore` facade，在 peer/devDependencies 中声明 dsh/React 依赖。
   - `src/client/index.ts` 通过 `ctx.slots.inject` 注册：
     - keyed `mode.rail.entry`，key 为 `appstore`；
     - keyed `mode.page`，key 为 `appstore`。
     - 注册独立 `appstore` locale namespace，避免向 `ui-app-modes` 注入业务文案。
   - 新增 App Store rail entry，复用现有四宫格图标视觉，但将图标、tooltip、active/pressed 状态归 App Store 插件所有；点击调用宿主传入的 `setMode('appstore')`。
   - 新增 `AppStorePage`，通过 `PropsRuntime<'mode.page'>`、注入的 env/IAM 能力和 locale 渲染：
     - 未配置 API base URL 时显示可识别的配置状态；
     - 已配置时惰性创建 SDKWork App Store client，同步静态 access token 或 IAM session token；
     - 请求 catalog home/featured/categories/listings，显示 loading、空态和错误态，并提供基础搜索/刷新交互；
     - 保留 `data-mode="appstore"` 与 `data-mode-page="appstore"`，确保 AppFrame keyed dispatch 和黑盒测试可验证。
   - 将 token/base URL 同步放在插件 service/注入层，页面只消费四 shares，不在组件中直接访问 `ctx` 或创建外部订阅。

4. **接入客户端构建与 Web bundle**
   - 在 `tsconfig.client.json` 增加 `packages/client/ui-appstore` project reference。
   - 在 `packages/bundle/web-app/cordis.patch.yml` 增加 `ui-appstore` row，位于 `ui-app-modes` 之后、其他独立 mode 之前/相邻位置。
   - 在 `packages/bundle/web-app/package.json` 增加 `@deepseek-ai/dsh-client-ui-appstore` dependency。
   - 按现有 SDKWork 插件配置 bundle tsconfig/tsdown，使 declaration emit 使用本地 facade、bundle 使用真实 `@sdkwork/appstore-app-sdk`；更新 workspace/lockfile，只接受当前锁定版本，不引用外部 dirty sibling 的候选版本。

5. **补齐测试与 assembled 行为**
   - `ui-appstore` apply contract 测试：locale、rail/page key、inject face、late slot declaration、dispose teardown。
   - rail entry 测试：outline/filled icon、`aria-label`、`aria-pressed`、点击后调用 `setMode('appstore')`。
   - page/service 测试：未配置态、成功 catalog 数据、加载/错误/空态，以及静态 token 优先于 IAM token；mock 只放在 SDK boundary。
   - 更新 `ui-app-modes`/`ui-layout` 相关测试，验证 `appstore` 顺序和 `LayoutStore.setMode('appstore')`。
   - 更新 `apps/web/tests/assembled-boot.ts` 装载新插件；更新 `apps/web/tests/app-modes.e2e.ts`，点击 App Store 入口并断言 `data-mode-page="appstore"`、页面标题/状态，同时保留 sidebar 折叠后 rail 仍存在的断言。
   - 按 GUI 规范运行 focused GUI tests、App Store bundle/typecheck，以及 `DSH_SNAPSHOT=replay` 的 assembled web 检查；若可见输出改变触发快照差异，只更新对应 keyless fixture。

6. **文档、Agent Note 与验证收尾**
   - 为新插件补充 Model Experience、配置来源、未配置/鉴权行为和 SDKWork facade/build 说明；同步中英文文档并遵循当前段落预算。
   - 为这个非机械的跨包集成新增 implemented Agent Note 及 bilingual sidecar，记录“私有 PC 应用不可直接嵌入，采用 App SDK + keyed mode plugin”的决策。
   - 最后检查 `git diff --check`、新增/修改文件的导出 JSDoc、构建产物引用和现有用户改动，绝不回退无关 dirty 文件。
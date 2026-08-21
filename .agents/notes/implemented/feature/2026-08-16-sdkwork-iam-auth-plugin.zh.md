# Agent Note：SDKWork IAM 认证集成（ui-sdkwork-iam 插件）

状态：已实现

[English](2026-08-16-sdkwork-iam-auth-plugin.md) | 中文

## 问题

harness（web + 桌面）此前没有账号概念：`ui-sdkwork-settings-menu` 的账号缝只渲染匿名档案与禁用的退出行，也没有任何登录/注册表面。产品要求把 sdkwork-iam 集成进来——登录、注册、退出登录——按 harness 插件规范做成插件，复用 sdkwork-iam PC 认证组件（页面 + Modal），并同时落地到 web 与桌面组合。

## 决策

新客户端插件 `packages/client/ui-sdkwork-iam`（`@deepseek-ai/dsh-client-ui-sdkwork-iam`）把 sdkwork-iam 认证栈组合在 harness 既有扩展点之后，另有共享包中的四个小缝演进：

- **账号缝演进（`ui-sdkwork-settings-menu`）。** `AccountRuntime` 增加可替换的 `AccountSource`（`setSource`），带 `signIn` 手势与 `signInAvailable` 档案标志；悬浮菜单在未登录源声明可用时渲染“登录 / 注册”行。缝保留匿名默认值，未装插件的部署看不到变化。
- **账号应用模式（`ui-layout` + `ui-sdkwork-app-modes`）。** `AppModeId` 增加 `account`；`ILayout.setMode` 把框架模式切换暴露给服务；rail 的 `MODE_ORDER` 纳入 `account`。全页登录位于账号模式页。
- **设置命名空间暴露（`host/apiproxy`）。** api-proxy 的 settings describe RPC 只暴露固定的产品命名空间白名单；`ui-sdkwork-iam` 与共享的 `ui-sdkwork-env` 环境段加入其中，否则浏览器 scope 停留在 `loading`，插件保持惰性。这是 e2e 在 bundle 本身加载成功后发现的第二个启动阻塞点。
- **插件**提供 `ctx.iam`（基于生成的 `@sdkwork/iam-app-sdk` 客户端的 sdkwork 认证控制器 + `ui-sdkwork-iam` 设置镜像 + 形态分发），绑定菜单缝，注册账号模式（rail 入口 + 页面），并在 `shell.overlay` 上宿主 Modal。IAM baseUrl 与租户应用 id 来自共享的 `ui-sdkwork-env` 环境 profile（新增客户端包 `packages/client/ui-sdkwork-env`）；每个环境的 `apiBaseUrl` 默认为 api.sdkwork.com 源，开箱即用，显式置空时关闭 rail 入口、会话恢复与认证表面——但菜单的“登录 / 注册”行仍然可见，点击打开的是配置提示弹窗，而不是静默无反应。`ui-sdkwork-iam` 设置命名空间只保留展示与 QR/OAuth 开关。
- **Bundle 接线。** `web-app` 与 `sdkwork-desktop-app` 补丁行挂载插件；两个应用都依赖它。`apps/web` 增加 Tailwind v4 管线（sdkwork 认证组件用 Tailwind 样式；`@source` 指向 sdkwork 包，`primary-*` 别名到 deepseek 品牌色阶）。sdkwork 表面通过认证栈自身的 appearance 系统驱动主题：harness 主题快照（`ctx.theme`，经 `theme/change` 实时更新）选择浅色 `sdkwork` 或深色 `midnight` 预设，`client/auth-appearance.ts` 再按 [浅色输入框与二维码外观 note](../bug-fix/2026-08-19-iam-auth-light-field-contrast.md) 把 harness 语义令牌叠加到表单列上。品牌色与主按钮文字经 `--sdk-color-brand-primary` 与 `--sdkwork-auth-primary-button-text-color` 在 web 样式表中做同一投影。样式表还把 Tailwind 的 `dark:` 变体重绑到 `body[data-ds-dark-theme]`（`@custom-variant dark`），并在 `.sdkwork-auth-surface` 上翻转 `color-scheme`，使次级 `dark:` 工具类与原生表单控件跟随 harness 的外观偏好而不是 OS 媒体查询。ui-sdkwork-iam 的配置提示表面改用 harness 浮层令牌（`--dsw-alias-bg-layer-2`），替换了两个主题表从未定义的令牌。

### 工作区与类型检查架构

sdkwork 包以兄弟 pnpm workspace 成员方式加入（sdkwork 生态惯例，`../sdkwork-*` 与本仓库并排），catalog 把 react 钉在 18 线（override 驯服了兄弟包的 react 19 devDeps，否则会污染 `@testing-library/react` 的 peer 解析）。sdkwork 源码无法在 harness 最严格标志下编译，也无法可移植地发射进 `lib/types`，因此：

- `tsconfig.json`（发射项目）把 `@sdkwork/*` 解析到本地声明门面（`sdkwork-types/`）并以 `noCheck` 发射；门面只覆盖被消费的表面。
- `tsconfig.tests.json`（完整检查，接入 `typecheck:contracts-ready`）以 sdkwork 标志集（仅 strict）与单一 React 类型身份（paths 把 `react`/`react-dom`/`react/jsx-runtime` 映射到 `@types/react` 19）编译插件与真实 sdkwork 源码。它是门面的漂移守卫。
- tsdown 客户端 bundle 换用无 paths 的 tsconfig（内联真实包），把 `qrcode` 钉到浏览器入口（其 node 渲染器会把 `fs`/`stream` 拖进浏览器 bundle，模块表 loader 会拒绝），并清空 sdkwork 闭包中唯一的普通样式表（appbase 的 AppErrorPage css；该页面从不挂载）。

## 备选方案

| 否决 | 一句话理由 |
|---|---|
| 依赖已发布的 sdkwork npm 包 | auth-pc-react 链路未发布；npm 上只有 app-sdk 与 sdk-common |
| 在 harness 严格标志下类型检查 sdkwork 闭包 | 其代码按仅 strict 编写；exactOptionalPropertyTypes/noUnusedLocals/override 违例是他们的 |
| 用 sdkwork 源码做整程序 tsc | rootDir 声明发射不可行（其 menubar 的 TS2883）；因此拆出门面 + tests 项目 |
| 手写仿冒认证 UI | 产品要求复用 sdkwork-iam PC 组件 |

## 后果

- 配置 `ui-sdkwork-env` 的 apiBaseUrl 后，登录/注册（账号模式全页、设置菜单 Modal）、退出与会话恢复在 web 与桌面可用——默认为 api.sdkwork.com 源，无需设置文档即可开始使用。显式置空时，设置菜单在未登录状态下仍展示“登录 / 注册”行，点击打开的是共享的配置提示（Modal 形态或全页账号模式），功能在配置前即可被发现，而不是静默缺失。
- e2e（`apps/web/tests/ui-sdkwork-iam.e2e.ts`）以 stub IAM 服务器启动真实组合，断言未配置时的菜单→提示弹窗流程、默认 baseUrl 下的 rail 入口与 Modal 认证表面（默认源通过路由拦截提供与 stub 相同的响应）、配置后的 rail 入口、全页认证与 Modal 宿主；它会关闭启动数秒后出现的一轮 onboarding 弹窗（欢迎声明 + 凭据步骤）。
- 验证码登录方式隐藏（harness app 客户端缺少消息验证码 API）；后端策略允许时注册/找回密码无需验证码。
- 可移植性：兄弟 workspace 条目要求 `../sdkwork-*` 检出与本仓库并排（sdkwork 生态布局）；没有它们的独立检出无法安装。

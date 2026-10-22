# Agent Note：以预构建嵌入包集成 SDKWork IM 表层

Status: implemented

[English](2026-10-20-im-surfaces-from-prebuilt-bundle.md) | 中文

## 问题

BirdCoder 需要在最左侧栏、Code 图标正下方，以一等公民模式提供 SDKWork IM 的产品表层——会话列表、单个已打开的对话、通讯录——且不重写任何 IM 界面。IM 产品界面已存在于同级的 `sdkwork-im` 仓库，但它的 PC 包与该生态深度耦合：聊天包声明的依赖闭包横跨 RTC、Notary、Agents 三棵子树，其模块直接 import 约五十个兄弟包。

若从 BirdCoder 直接编译这些源码——通过 `tsconfig.base.json` 路径别名加一份钉住的同级检出——就会把整个闭包拉进 BirdCoder 的依赖门禁：门禁会报告所有未被映射覆盖的闭包包，Dockerfile 需要多复制一棵源码树，最终浏览器产物还会携带 IM 的内部模块图。为了三个表层而把两个产品的发布列车绑在一起。

把同一仓库当作 npm 包依赖也不够：IM 的 PC 包是应用内部件（`package.json` 指向源码，样式是绑定 IM 文档的 Tailwind 表，会话/鉴权门禁假设独立应用的存在）。

## 决策

**IM 产品拥有自己的构建，BirdCoder 只承载契约。**

- `sdkwork-im` 新增嵌入构建（`apps/sdkwork-im-pc/src/embed/main.tsx`、`vite.embed.config.ts`、`pnpm --dir apps/sdkwork-im-pc run build:embed`）。它产出一个自包含 IIFE：`dist-embed/im-pc-embed.js`，在宿主页面发布 `SdkworkImEmbed.mountSurface(container, options)` 以及 `update(options)` / `unmount()` 句柄。表层为 `conversation-list`、`conversation`、`contacts`；每个表层挂载进 shadow root，并携带自己的样式表，因此 IM 的 Tailwind 样式不会泄漏到宿主页面。
- 宿主只传宿主事实与回调：`apiBaseUrl`、双 token 会话、`locale`、`colorScheme`、选中会话 id，以及 `onConversationSelect` / `onConversationOpen` / `onUnreadChange` / `onError`。传输、实时、消息加载、通讯录加载与翻译仍由嵌入包自己负责。
- 嵌入包会校验这些事实，并在运行时建立时一次性初始化 IM SDK 客户端（带类型的 `ImPcEmbedInitError` 错误码），而 WebSocket 保持惰性，等到有表层订阅时才连接。短暂的模式切换通过有界的空闲宽限复用客户端与连接；释放运行时会关闭连接并重置客户端。校验失败不再清空界面：运行时记录失败，表层仍在产品形态的占位后面挂载，宿主以瞬时 toast 上报（嵌入包加载失败保留独立的 `load-failed` 上报）。
- 宿主与嵌入包的边界带版本：嵌入包在 `mountSurface` 旁发布 `SdkworkImEmbed.version`（当前为 `1`），适配层拒绝声明其他契约版本的嵌入包，而不是调用不兼容的 API；缺少该字段的旧产物按版本 1 处理。适配层同时校验部署地址：接受绝对 HTTP(S)/application 地址与同源根相对路径，拒绝其他 scheme 及携带凭证的地址，因为脚本以宿主页面权限执行。
- BirdCoder 新增四个 sdkwork 客户端插件，均不 import IM 代码：
  - `ui-sdkwork-im` 依据当前环境 profile 的 `imEmbedUrl`（由 `SDKWORK_IM_EMBED_URL` 投影）每页加载一次嵌入包，提供 `ctx.im`，并跟踪未读总数与选中会话。
  - `ui-sdkwork-im-conversations` 拥有 `chat` 模式：rail 入口（带未读气泡）与两栏页面；左列挂载会话列表，并声明 `im.chat.pane` 槽位。
  - `ui-sdkwork-im-chat` 用对话表层填充该槽位。
  - `ui-sdkwork-im-contacts` 拥有 `contacts` 模式及其页面。
- `AppModeId` 增加 `chat` 与 `contacts`，rail 顺序都紧跟在 `code` 之后。窗口标题与文案进入既有的 locale 字典。
- 用 script 标签而非动态 `import()` 加载嵌入包：客户端模块产物是闭包工厂，自身没有导入上下文；IIFE 全局变量能工作，而 ES module import 不能。

## 备选方案

**把 sdkwork-im 的 PC 包当同级源码编译。** 否决：会让整个 IM 生态出现在依赖门禁中、扩大 Docker 构建上下文，并使 BirdCoder 的每次构建依赖 IM 的内部模块图与 TypeScript 设置——为三个表层付出高耦合代价。

**并入完整的 SDKWork 生态工作区。** 同样因耦合被否决，另有 CI 成本：IM 的每次发布都要满足 BirdCoder 的门禁，而 BirdCoder 的每次重构又要保证 IM 源码可编译。

**用 iframe 装载 IM PC 应用。** 技术上宿主最小，但失去了集成的意义：跨表层的导航（选中会话、从通讯录打开聊天）、共享主题与语言、单一登录会话都会丢；独立应用自己的路由与鉴权门禁会与宿主冲突，而且每个表层仍会加载整个应用。

**在 BirdCoder 里重写三个表层。** 否决：重复 IM 产品的消息、通讯录、实时与翻译行为，并与产品自身界面分叉——与高内聚正好相反。

**把 IM PC 包发布到 registry 再作为依赖。** 暂缓而非否决：它们目前是应用内部件，发布本身比本次集成更大。无论走哪条路，稳定的嵌入契约都是前提。

## 影响

- BirdCoder 的 manifest、tsconfig 路径与依赖门禁完全不知道 IM 的存在。耦合只剩一个运行时契约：`mountSurface` 与选项对象，由部署方提供的嵌入产物版本化。
- 环境 profile 除 `apiBaseUrl` 外还带有 `imApiBaseUrl`，默认取所在环境的域名（`http://api-dev.birdcoder.com`、`https://api-test.birdcoder.com`、`https://api.birdcoder.com`），并可由 `SDKWORK_IM_API_BASE_URL` 投影；IM 优先读取它、再回退 `apiBaseUrl`，因此每个环境都走自己的 IM 网关并由它派生实时 origin。
- 部署方必须把 `im-pc-embed.js` 发布到一个 URL，并设置 `SDKWORK_IM_EMBED_URL`（或设置文档里的 `imEmbedUrl`）。字段为空时，聊天页与通讯录页会说明 IM 未配置，而不是挂载一个坏掉的表层。
- 嵌入包是单块原始约 3.3 MB（gzip 约 850 KB）的载荷，包含聊天表层及其依赖。后续可在表层不再 import 应用外壳后拆分瘦身。
- 会 portal 到宿主 `document.body` 的 IM 弹窗逃逸 shadow root，因而没有样式。在嵌入包接受 portal 目标之前，这类弹窗只能留在 IM 表层树内。
- 一页一个 IM 运行时：嵌入包持有进程级 IM 状态，所以一个页面只承载一个嵌入式 IM 会话；重新配置会替换会话。
- IM 网关必须接受宿主页面来源的 REST 与实时连接（嵌入包发送 `Authorization` 与 `Access-Token` 头），部署方还需以 JavaScript content type 提供嵌入包。
- 未读气泡只在会话列表或通讯录表层挂载期间更新；否则保持最后一次的值。

## 验证

- `sdkwork-im`：`pnpm --dir apps/sdkwork-im-pc run lint`、SDK `typecheck`、`test:chat-auth-realtime-guard`、`build:embed`（产出 `dist-embed/im-pc-embed.js`，原始约 3.7 MB / gzip 约 1.0 MB，入口暴露 `SdkworkImEmbed.mountSurface`）。
- BirdCoder：`pnpm exec tsc -b tsconfig.client.tests.json`、`pnpm run verify-sdkwork-dependencies`、`pnpm run verify-package-dependencies`，以及四个包自己的测试（`pnpm exec vitest run packages/client/ui-sdkwork-im*/tests`），覆盖加载器的脚本加载、失败、未配置、未登录分支与页面的挂载/更新/卸载行为，并达到逐文件覆盖率门禁。
- 四个客户端 bundle 可以只用 BirdCoder 源码构建（`pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-im run bundle` 等），`lib/client.js` 体积（7–35 KB）表明没有编译进任何 IM 代码。
- `pnpm exec playwright test`（sdkwork-im，Chromium）通过 13 个用例（live-stack 用例跳过）：已登录外壳、收件箱水合与出站发送、1 万会话虚拟列表，以及 `e2e/embed-surfaces.spec.ts` —— 把构建产物注入由路由构造的空白页，在 shadow root 中挂载会话列表、渲染消息时间线并发送一条出站消息、并通过模拟的 CCP WebSocket 握手（auth → hello → auth bind → subscriptions）追加一条入站实时消息的对话、通讯录目录、网关不可达时仍渲染 IM 产品外壳的会话列表，以及网关地址非法时宿主收到错误且外壳保持挂载。
- `pnpm run test:im-embed-host`（sdkwork-im）验证宿主注入的网关地址、实时地址派生、双 token 会话优先级、嵌入态持久化路由、登出态与 detach 行为。
- 组装后的客户端图（`apps/web/tests/app-modes.e2e.ts`）按 Code → 聊天 → 通讯录渲染 rail，分发两个 IM 模式页，并在匿名组合下用 IAM 未登录提示替换其表层。
- 对构建产物（`SdkworkImEmbed.mountSurface`）做 jsdom 冒烟：`conversation-list`、`conversation`、`contacts` 三种表层都能挂载进带内联样式表与 dark 作用域的 shadow root，更新与卸载均无 console 错误；构建已内联 React 生产环境 define，产物中 `process.env.NODE_ENV` 引用数为 0。

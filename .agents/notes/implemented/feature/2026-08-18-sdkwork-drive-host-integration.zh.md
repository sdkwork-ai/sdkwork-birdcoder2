# Agent Note: SDKWork Drive 宿主集成

Status: implemented

[English](2026-08-18-sdkwork-drive-host-integration.md) | 中文

## 问题

Drive 模式栏条目需要在 BirdCoder 内打开既有的 SDKWork 云盘 PC 应用。该应用期望生成的 Drive 客户端、会话与语言端口、Tailwind 输出，以及按需加载的 Monaco 预览；而 BirdCoder 已拥有部署、认证、语言、导航状态，以及每个插件只求值一个浏览器闭包的客户端 loader。

## 决策

`@deepseek-ai/dsh-client-ui-drive` 是[应用模式栏](2026-08-16-sidebar-app-modes.zh.md)中的独立模式插件。其条目调用 layout store 既有的 `setMode('drive')` 动作，其 keyed 的 `mode.page` 注册在中心列挂载 SDKWork 应用。该模式是瞬态布局状态：Drive 导航既不增加浏览器路由，也不持久化 BirdCoder 偏好。

`@deepseek-ai/dsh-client-ui-drive` 内的 `driveHost.ts` 模块持有 SDKWork 宿主适配。插件在注册页面前，用既有的 `ctx.env`、`ctx.iam` 与 `ctx.locale` 服务配置它。适配器按当前 API 基础 URL 惰性构造生成的 Drive 客户端，让已配置的静态环境访问令牌优先于 IAM 凭据，只映射可用的身份与租户上下文字段，并区分根与会话上下文 session id。环境变化会使客户端失效并重新挂载 SDKWork 应用；IAM 与语言变化通过 SDKWork 订阅传播，无需重新挂载。

`DriveApp` 以环境修订号为 key 挂载 SDKWork `DriveView`，因此环境切换会重建表面的运行时。与知识库表面不同，Drive 不使用路由：`sdkwork-drive-pc-drive` 的 `DriveView` 自包含，并通过 `configureDrivePcRuntime` 读取宿主端口（`getDriveClient`、`readHostSession`、`subscribeHostSession`、`resolveHostLanguage`、`subscribeHostLanguage`）。

## 类型与 bundle 集成

包的声明发射工程跳过对兄弟 SDKWork 实现的严格检查，防止其私有包类型进入已发布的 Harness 声明。另设一个不发射的 TypeScript 工程用单一 React 类型身份编译被消费的 SDKWork 源码闭包，因此适配器不会静默漂移。

浏览器构建只发射一个树摇后的 `client.js` 闭包，因为客户端模块 loader 既不发布也不求值任意同级分片。bundle 构建会编译 SDKWork Tailwind 样式表，解析普通 CSS 的 `@import` 链并在注入前剥离 Tailwind 编译期指令（幂等注入），并移除浏览器不适用的 Node 兼容导入。Monaco 文本预览保持惰性模块，编辑器在首次使用时才从 CDN 加载，因此闭包不携带编辑器二进制。React 仍是 BirdCoder 平台模块，而非打包的第二套运行时。

## 备选方案

| 已否决 | 原因 |
|---|---|
| 增加 URL 路由或持久化 Drive 模式 | layout store 已持有模式选择，SDKWork 导航不得接管 BirdCoder 的地址栏 |
| 引入 Drive 专属的认证或环境 store | `ui-env` 与 `ui-iam` 已持有这些事实；复制会造成冲突的刷新、登出与部署状态 |
| 从 `DrivePage` 直接导入 SDKWork 内部实现 | 页面会承担生成客户端与会话适配细节，而非使用插件专属的宿主适配器 |
| 发射多个浏览器分片 | BirdCoder 只服务与求值注册插件 `client.js`；未注册的同级分片不属于客户端模块协议 |
| 在运行时注入原始 Tailwind 源码 | 浏览器 CSS 无法求值 Tailwind 指令或发现 SDKWork 工具类候选 |
| 打包 Monaco 编辑器 | `@monaco-editor/react` 默认从 CDN 加载编辑器；内联会为按需打开的预览给插件闭包增加数兆字节 |

## 后果

点击 Drive 模式栏图标会用真实的 SDKWork 云盘表面替换代码会话，返回代码则恢复工作台。SDKWork 业务 HTTP 请求仍是浏览器流量，不增加 Harness 提示词内容、工具、会话事件或 KV Cache 输入。

集成需要 `../sdkwork-drive` 兄弟检出及其生成客户端。完整应用与编译后样式位于一个较大的客户端插件闭包中。由于 SDKWork PC 运行时端口是进程级的，一个浏览器窗口只有一个活动的 SDKWork Drive 宿主适配器；知识库与 Drive 适配器配置各自独立的端口注册表，因此两个表面可以共存。

## 验证

Facade 测试固定凭据、会话、上下文、语言、环境修订号与释放行为；集成 spec 在 jsdom 中配置真实宿主适配器并挂载 SDKWork 表面，固定客户端构造、端口交接、环境驱动的重挂载与 fail-loud 路径。插件测试固定声明的注入、keyed 注册、拆除与 SDKWork 页面标记。装配后的 web 模式测试点击 Knowledge 与 Drive 条目，验证每个 SDKWork 页面都会替换会话表面，且 Drive 在模式栏中直接位于 Knowledge 下方。SDKWork 源码检查工程与 bundle 检查固定真实源码闭包、单文件输出、编译后的 Tailwind 样式与允许的平台导入。

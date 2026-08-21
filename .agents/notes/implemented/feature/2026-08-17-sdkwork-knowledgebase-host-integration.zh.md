# Agent Note: SDKWork 知识库宿主集成

Status: implemented

[English](2026-08-17-sdkwork-knowledgebase-host-integration.md) | 中文

## 问题

知识库模式栏条目需要在 BirdCoder 内打开既有的 SDKWork 知识库 PC 应用。该应用需要生成的业务客户端、会话与语言端口、React Router 上下文、Tailwind 输出和 PDF.js worker；BirdCoder 则已持有部署、认证、语言与导航状态，而且其客户端 loader 对每个插件只求值一个浏览器闭包。

## 决策

`@deepseek-ai/dsh-client-ui-sdkwork-knowledge` 在[应用模式栏](2026-08-16-sidebar-app-modes.md)中保持为独立模式插件。其条目调用 layout store 既有的 `setMode('knowledge')` 动作，keyed 的 `mode.page` 注册则在中心列挂载 SDKWork 应用。模式属于瞬时 layout 状态：知识库导航既不添加浏览器路由，也不增加持久化 BirdCoder 偏好。

`@deepseek-ai/dsh-client-ui-sdkwork-knowledge` 内部的 `knowledgebaseHost.ts` 模块负责 SDKWork 宿主适配。插件在注册页面前使用既有的 `ctx.env`、`ctx.iam` 与 `ctx.locale` 服务配置它。适配器按当前 API 基础 URL 延迟构造生成的 Knowledgebase 与 Drive 客户端；已配置的环境静态访问令牌优先于 IAM 凭据；它只映射可用的身份与租户上下文字段，并保持根 session id 与上下文 session id 相互独立。环境变化会使两个客户端失效并重新挂载 SDKWork 应用；IAM 与语言变化通过 SDKWork 订阅传播，无需重新挂载。

`KnowledgebaseApp` 提供按环境修订号设置 key 的隔离 `MemoryRouter`。SDKWork 可以使用自身内部导航 API，环境切换也会重置该导航，而不会读取或修改 BirdCoder 的浏览器 URL。

## 类型与 bundle 集成

本包的声明发射项目跳过对兄弟 SDKWork 实现的严格检查，防止其私有包类型进入已发布的 Harness 声明。单独的 no-emit TypeScript 项目使用单一 React 类型身份编译被消费的 SDKWork 源码闭包，因此适配器无法静默漂移。

浏览器构建发射一个经过 tree-shaking 的 `client.js` 闭包，因为客户端模块 loader 既不发布也不求值任意同级分片。bundle 构建会编译 SDKWork Tailwind 样式表、幂等注入普通 SDKWork CSS、把 PDF.js worker 表示为 Blob URL、移除不适用于浏览器的 Node 兼容导入，并把路由与 i18n 上下文包解析到同一个物理实例。React 继续作为 BirdCoder 平台模块，不会打包第二个运行时。

## 备选方案

| 已拒绝 | 原因 |
|---|---|
| 添加 URL 路由或持久化知识库模式 | layout store 已负责模式选择，SDKWork 导航不能接管 BirdCoder 地址栏 |
| 引入知识库专用认证或环境 store | `ui-sdkwork-env` 与 `ui-sdkwork-iam` 已持有这些信息；复制后会产生冲突的刷新、退出与部署状态 |
| 从 `KnowledgePage` 直接导入 SDKWork 内部实现 | 页面会因此承担生成客户端与会话适配细节，而不是使用插件专门的宿主适配器 |
| 发射多个浏览器分片 | BirdCoder 只提供并求值已注册插件的 `client.js`；未注册的同级分片不属于客户端模块协议 |
| 在运行时注入原始 Tailwind 源码 | 浏览器 CSS 无法求值 Tailwind 指令，也无法发现 SDKWork utility 候选项 |
| 与 SDKWork 共享 BirdCoder 浏览器 router | SDKWork 内部路由会成为应用路由，并可能替换或破坏宿主 URL |

## 后果

点击知识库模式栏图标会用真实 SDKWork 知识库表面替换代码会话，切回代码则恢复工作台。SDKWork 业务 HTTP 请求仍是浏览器流量，不会添加 Harness 提示词内容、工具、会话事件或 KV Cache 输入。

该集成依赖 `../sdkwork-knowledgebase` 兄弟检出与生成客户端。完整应用、编译后样式与 PDF worker 位于一个较大的客户端插件闭包中。SDKWork PC 运行时端口在进程内全局存在，因此一个浏览器窗口只有一个活动 SDKWork 知识库宿主适配器。

## 验证

适配器测试钉住凭据、会话、上下文、语言、环境修订与资源释放行为。插件测试钉住声明的注入、keyed 注册、teardown 与 SDKWork 页面标记。assembled web 模式测试点击知识库条目并验证 SDKWork 页面替换会话。SDKWork 源码检查项目与 bundle 检查钉住真实源码闭包、单文件输出和允许的平台导入。

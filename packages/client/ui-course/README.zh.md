# @deepseek-ai/dsh-client-ui-course

[English](README.md) | 中文

Course 应用模式插件拥有 `course` 侧栏入口、中栏页面以及 SDKWork 宿主适配器。侧栏入口调用布局 store 现有的 `setMode('course')` 动作；AppFrame 随后分派 keyed `mode.page` 席位，本包在该席位挂载 SDKWork Course PC 应用。返回 Code 会恢复对话工作区，无需 URL 路由或持久化模式状态。

## 运行时要求

插件需要 `ctx.env`、`ctx.iam` 与 `ctx.locale`。它在注册页面前配置 SDKWork 宿主适配器。当前环境提供 API 基址与可选静态 access token；已配置的静态 token 优先于 IAM 会话凭证。环境变更会重建生成的 Course 客户端并 remount SDKWork 视图；IAM 与 locale 变更通过 SDKWork 订阅传播，无需 remount。

## 浏览器 bundle

客户端插件输出单个 `client.js` 闭包，因为 BirdCoder 客户端模块加载器不会发布任意 sibling chunk。其 bundle 面编译 SDKWork Tailwind 样式表并一次性注入 SDKWork CSS。声明 emit 跳过对 sibling SDKWork 实现的严格检查；`tsconfig.tests.json` 以单一 React 类型身份检查所消费的源码闭包。

## 模型体验

无。该插件渲染面向人类的浏览器应用，不增加 prompt 内容、工具或 session 事件。

#### KV Cache 影响

无；SDKWork HTTP 请求是独立的浏览器流量，不会改变 Harness provider 请求。

## 已知限制与后续工作

- **Sibling 源码要求** — 从源码安装或重建浏览器闭包需要 `../sdkwork-course` workspace checkout 及其生成的 Course 客户端。
- **单文件 payload** — 完整 SDKWork 应用与编译样式打包在一个 client-plugin 闭包中，相比分块应用会增加 Course 插件的初始下载体积。
- **单一活跃宿主适配器** — SDKWork Course PC runtime ports 是进程全局的，因此一个浏览器窗口只托管一个 Course 表面；重新配置会 dispose 先前的适配器。

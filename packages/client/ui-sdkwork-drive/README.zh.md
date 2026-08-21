# @deepseek-ai/dsh-client-ui-sdkwork-drive

[English](README.md) | 中文

云盘应用模式插件负责 `drive` 模式栏条目、中心列页面与 SDKWork 宿主适配器。模式栏条目调用 layout store 既有的 `setMode('drive')` 动作；AppFrame 随后分发 keyed 的 `mode.page` 席位，本包在其中挂载 SDKWork 云盘 PC 应用。切回代码模式会恢复会话界面，无需 URL 路由或持久化模式状态。

## 运行要求

插件依赖 `ctx.env`、`ctx.iam` 与 `ctx.locale`。它在注册页面前配置自身的 SDKWork 宿主适配器。当前环境提供 API 基础 URL 与可选静态访问令牌；已配置的静态令牌优先于 IAM 会话凭据。环境变化会重建生成的 Drive 客户端并重新挂载 SDKWork 视图，IAM 与语言变化则通过 SDKWork 订阅传播，无需重新挂载。

## 浏览器 bundle

客户端插件只发射一个 `client.js` 闭包，因为 BirdCoder 客户端模块 loader 不发布任意同级分片。其 bundle 构建会编译 SDKWork Tailwind 样式表并只注入一次 SDKWork CSS。内嵌云盘页面仅在打开文本文件预览时从 CDN 加载 Monaco 编辑器，因此闭包保持精简。声明发射跳过对兄弟 SDKWork 实现的严格检查；`tsconfig.tests.json` 使用单一 React 类型身份检查被消费的源码闭包。

## Model Experience

无，因为插件渲染面向人的浏览器应用，不添加提示词、工具或会话事件。

#### KV Cache effect

无；SDKWork HTTP 请求属于独立的浏览器流量，不会改变 Harness 的模型提供方请求。

## Known Limitations and Deferred Work

- **兄弟源码要求** —— 从源码安装或重新构建浏览器闭包需要 `../sdkwork-drive` workspace 检出及其生成的 Drive 客户端。
- **单文件负载** —— 完整 SDKWork 应用与编译后样式位于同一个客户端插件闭包中，因此 Drive 插件的初始下载量高于分片应用。
- **单一活动宿主适配器** —— SDKWork 云盘 PC 运行时端口是进程级的，因此一个浏览器窗口只承载一个云盘界面；重新配置会释放先前的适配器。

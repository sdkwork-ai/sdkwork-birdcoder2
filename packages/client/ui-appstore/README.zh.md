# @deepseek-ai/dsh-client-ui-appstore

[English](README.md) | 中文

SDKWork 应用商店模式。该浏览器插件拥有 `appstore` 侧栏入口，并通过 `@sdkwork/appstore-pc-host` 挂载 SDKWork 应用商店 PC 表面。它注册 keyed 的 `mode.rail.entry` 与 `mode.page` 贡献；选择入口会切换布局模式，框架会在中栏渲染对应页面。

## 运行时要求

当前 [ui-env](../ui-env/README.zh.md) 配置提供 API 基址和可选静态访问令牌。基址为空时页面保持空白，不会创建 SDKWork 运行时。静态环境令牌优先于当前 [ui-iam](../ui-iam/README.zh.md) 会话。宿主 `zh` 请求 `zh-CN`；其他已发布宿主语言请求 `en-US`。环境变化会重挂载 SDKWork 运行时；IAM 与语言变化通过宿主 props 传播。

## 嵌入表面

页面在 BirdCoder 现有框架内挂载完整 SDKWork 应用商店产品壳：`@sdkwork/appstore-pc-host` 拥有的隔离页内路由提供 Discover、搜索、分类、资料库、愿望单、更新、应用详情与发布者等路由。SDKWork 导航不会新增浏览器路由，也不会写入持久化的 BirdCoder 偏好。

## 模型体验

无。模式选择、商店浏览、目录搜索与 SDKWork HTTP 响应都停留在浏览器视图状态，不会进入模型请求内容、工具或会话事件。

#### KV Cache 影响

无；该包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- **需要 sibling checkout** — 本地构建从与本仓库并列的 `../sdkwork-appstore` 解析 SDKWork 应用商店 PC 包。
- **在线认证目录** — 当已部署的应用商店 API 需要 SDKWork 访问令牌时，没有离线缓存或匿名回退。

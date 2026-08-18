# @deepseek-ai/dsh-client-ui-generations-assets

[English](README.md) | 中文

SDKWork Agents 生成资产应用模式。该浏览器插件拥有 `assets` 模式栏条目、本地化的资产库页面，以及 SDKWork Agents 列表适配器。它注册 keyed 的 `mode.rail.entry` 与 `mode.page` 贡献；点击条目会在 layout store 中选择 `assets`，框架在中心列渲染页面。注册以较低优先级遮蔽 [ui-assets](../ui-assets/README.md) 的占位条目，因此真实库得以渲染，占位包保持不变。

## 资产库

页面通过生成的 `@sdkwork/agents-app-sdk` 客户端列出 Agents 工具调用持久化的媒体资产。过滤器在客户端收窄列表；页面渲染每个资产的预览，并提供 SDKWork 媒体表面支持的动作。

## 运行要求

当前的 [ui-env](../ui-env/README.md) 配置提供 API 基础 URL 与可选静态访问令牌。基础 URL 为空时渲染配置提示且不创建 SDKWork 客户端。静态环境令牌优先于当前 [ui-iam](../ui-iam/README.md) 会话；两者都没有时，生成的 SDKWork 客户端会在网络分发前拒绝受保护的列表请求，页面提供重试状态。环境与 IAM 变化会使在途请求失效，避免旧响应覆盖当前库状态。

## 模型体验

无，因为模式选择、列表请求与 SDKWork HTTP 响应均属于浏览器视图状态，不增加模型请求内容、工具或会话事件。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## 已知限制与暂缓事项

- **只读列表** —— 页面呈现 Agents 媒体通道返回的资产；不提供上传、删除与移动动作。
- **在线认证列表** —— 当部署的 Agents API 要求 SDKWork 访问令牌时，没有离线缓存或匿名回退。

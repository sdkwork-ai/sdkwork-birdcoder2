# @deepseek-ai/dsh-client-ui-generations-assets

[English](README.md) | 中文

SDKWork Agents 资产应用模式。此浏览器插件持有 `assets` 模式栏条目，并将 SDKWork Agents PC **资产** 页面——与 [sdkwork-agents](https://github.com/sdkwork-ai/sdkwork-agents) 侧栏 **资产** 标签相同的页面——挂载到 keyed 的 `mode.page` 席位。它注册 keyed 的 `mode.rail.entry` 与 `mode.page`；点击条目会在 layout store 中选择 `assets`，框架随后在中心列渲染嵌入的 [`AssetsView`](../../../../sdkwork-agents/apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-assets/src/AssetsView.tsx)。该注册以较低优先级覆盖 [ui-assets](../ui-assets/README.zh.md) 的占位条目，因此真实资产库会渲染，而占位包保持不变。

## 资产库

BirdCoder 不在本地重新实现资产 UI。宿主适配器（`assetsHost.ts`）将 [ui-env](../ui-env/README.zh.md) 与 [ui-iam](../ui-iam/README.zh.md) 映射到 Agents PC 会话存储与 Drive SDK 客户端 provider，随后挂载 `@sdkwork/agents-pc-assets` 的 `AssetsView` 及 Agents 工作台 i18n 目录。嵌入页面与 Agents PC 工作台一致，包含顶栏标签、媒体筛选、日期分组网格与详情弹窗。

## 运行时要求

当前 [ui-env](../ui-env/README.zh.md) 配置提供 API 网关地址与可选静态 access token。用户登录后，[ui-iam](../ui-iam/README.zh.md) 会话 token 优先于 env 引导 token。宿主仅转发凭证；租户与用户身份在 Agents PC 内由 JWT 声明解析。

## 模型体验

无。模式选择、Drive 列表请求与 SDKWork HTTP 响应均属于浏览器查看状态，不增加模型请求内容、工具或会话事件。

#### KV Cache 影响

无；此包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- **仅 Drive 列表** — 页面展示 Drive 资产 API 返回的内容；上传、删除与移动行为与 Agents PC 表面一致。
- **在线鉴权列表** — 当部署的 Drive API 需要 SDKWork access token 时，没有离线缓存或匿名回退。

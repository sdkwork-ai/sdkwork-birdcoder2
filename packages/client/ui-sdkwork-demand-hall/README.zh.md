---
description: "SDKWork 需求大厅：位于模板库入口下方的侧栏快捷入口，以及经 @sdkwork/appstore-pc-embed 挂载应用商店需求大厅（发布与承接软件开发需求）的 keyed demand-hall 页面。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-demand-hall

[English](README.md) | 中文

## 摘要


SDKWork 需求大厅。该浏览器插件拥有 `demand-hall` 侧栏快捷入口（在新会话按钮区排在模板库入口之后，order 51 晚于 50），以及该入口打开的 keyed `mode.page` 贡献：以 code 表面内浮层的形式打开需求大厅，模式栏选择保持 `code`，需求大厅渲染在中栏，侧栏连同其工作区与会话列表保持挂载。页面经 `@sdkwork/appstore-pc-embed` 的单页表面（`page: 'demands'`）挂载 SDKWork 应用商店需求大厅，由共享的环境、IAM 与 locale 服务配置。

嵌入式表面就是应用商店前台的需求大厅页，功能保持一致：头部横幅、需求类型筛选、搜索、需求卡片、空态、发布需求弹窗（标题、类型、分类、预算、截标时间、详情）、需求详情弹窗，以及带投标表单与投标状态的抢单（我要抢单）流程。需求数据归属应用商店的企业域，经模板目录所用的同一平台网关读写。

## 目录

- [运行时要求](#runtime-requirements)
- [嵌入式表面](#embedded-surface)
- [模型体验](#model-experience)
- [已知限制与遗留工作](#known-limitations-and-deferred-work)
- [开发注记](#dev-note)

## 运行时要求

活动的 [ui-sdkwork-env](../ui-sdkwork-env/README.zh.md) 配置提供 API 基址与可选的静态访问令牌。基址为空时页面停留在未配置状态面，不创建 SDKWork 运行时。静态环境令牌优先于当前 [ui-sdkwork-iam](../ui-sdkwork-iam/README.zh.md) 会话。宿主 `zh` 请求 `zh-CN`；其他随附宿主 locale 请求 `en-US`。环境变化会重挂 SDKWork 运行时；IAM 与 locale 变化经宿主 props 传播。浏览需求保持匿名友好；发布与抢单绑定账户，由嵌入式表面自行打开登录流程。

## 嵌入式表面

页面在 BirdCoder 现有框架内承载应用商店前台的需求大厅（头部横幅、搜索栏、发布按钮、分类筛选、需求卡片），不带前台自身的导航部件。SDKWork 导航不新增浏览器路由，也不产生持久化的 BirdCoder 偏好。

## 模型体验

无：快捷入口、浮层选择、需求浏览、发布、抢单与 SDKWork HTTP 响应都保持为浏览器查看状态，不新增模型请求内容、工具或会话事件。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与遗留工作

- **需要兄弟检出** —— 本地构建从本仓库旁的 `../sdkwork-appstore` 解析 SDKWork App Store PC 包；可嵌入单页表面的 `demands` 页在该仓库中。
- **依赖已部署的需求后端** —— 需求大厅读写应用商店企业域的需求端点；网关未暴露这些端点的环境会呈现前台自身的空态/错误面。

### 开发注记

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

环境变化会重挂整个 SDKWork 运行时，而 IAM 与 locale 变化经宿主 props 传播 —— 改动适配器时保持这一分工。宿主适配器、主题外壳与 tsdown CSS/别名机制是与 `ui-sdkwork-markets`、`ui-sdkwork-template-library` 共享的、按包拷贝的既定模板（client-bundle 纯净性禁止跨插件值导入）；修改时须同步。本地构建从 `../sdkwork-appstore` 兄弟检出解析 `@sdkwork/appstore-pc-embed`，缺少该检出时本包无法构建。

</details>

## 运行时不变量

不发布运行时不变量伴随物；本包贡献的 keyed 页面条目的归属已由 slot 注册表权威记录，而目录适配器没有可对照的独立宿主关系。

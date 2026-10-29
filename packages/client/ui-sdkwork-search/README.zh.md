---
description: "搜索应用模式，作为独立模块提供：位于自定义按钮上方的模式栏条目，以及接入 SDKWork 搜索的页面，并包含 BirdCoder 能力目录与 SDKWork 索引查询运行时。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-search

[English](README.md) | 中文

## 概述

搜索应用模式，作为独立模块提供：它自己的模式栏条目与中心列页面。模式栏外壳（ui-sdkwork-app-modes）按模式 id 渲染 keyed 的 `mode.rail.entry` 席位，并把实时选中状态交给每个条目；本包把 `search` 条目——字形、文案与外观——以及 `search` 页面注册进框架的 keyed `mode.page` 槽。模式 id 同时加入 ui-layout 的 `AppModeId` 词汇与模式栏的用户自有条目集合：它和其它可选模式一样出厂隐藏，由自定义弹窗勾选启用，启用后位于「资产」下方、直接处于自定义加号按钮之上。

页面通过 SDKWork 搜索能力接缝查询：`@sdkwork/search-service` 负责查询排序、分组与分页，`@sdkwork/search-contracts` 提供文档与结果词汇，生成的 `@sdkwork/search-app-sdk` 客户端访问搜索应用索引。两套文档进入同一管线——本插件自有的能力目录（已注册 keyed `mode.page` 条目、由本包 locale 字典解析的产品表面），以及部署带凭证时的 SDKWork 搜索索引。命中的本地结果显示为可导航结果，切换到其文档指向的模式；索引命中仅当其 `metadata.mode` 指向本客户端可渲染的表面时才可导航。

## 目录

- [运行要求](#runtime-requirements)
- [搜索管线](#search-pipeline)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 运行要求

插件需要 `ctx.slots`、`ctx.locale`、`ctx.env`、`ctx.iam` 与 `ctx.layout`。环境提供 API 网关地址与可选的静态访问令牌；IAM 会话提供已登录凭证，生成的客户端通过共享的 SDKWork 令牌管理器（ui-sdkwork-iam 的 `sdkwork-global-token-manager`，一个平台模块）转发它们。网关地址变化时运行时会重建生成的客户端，插件销毁时释放它。

本地目录不需要网关：未登录与离线时页面照常应答。只有当存在 IAM 会话或环境携带静态访问令牌时才会查询 SDKWork 索引，且索引查询失败时页面降级为本地结果并显示提示，而不是整体失败。

## 搜索管线

1. 页面把去掉首尾空白的查询交给注入的运行时接缝。
2. 运行时按当前字典与存活的 `mode.page` key 构建目录，再通过 SDKWork 服务门面查询这些文档。
3. 存在凭证时，同一门面通过生成的 app 客户端查询 SDKWork 索引；响应在线上传输时是无类型的，因此运行时在该边界归一化并丢弃畸形行。
4. 本地分组先渲染，随后是索引分组；没有可导航目标的命中只作为文本渲染。

## 模型体验

无，因为本包是人类使用的浏览器表面；它不增加提示内容、工具或会话事件。

#### KV Cache effect

无；SDKWork 搜索请求是独立的浏览器流量，不改变 Harness 的 provider 请求。

## 已知限制与暂缓事项

- **同级源码依赖** —— 重新构建客户端闭包需要 `../sdkwork-search` 工作区检出，以获取搜索契约、服务与生成的 app SDK。
- **本地目录范围** —— 页面只索引应用的可导航表面；会话内容检索仍由侧边栏自身的搜索控件承担，而没有目录模式的索引命中仅作信息展示。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

模式栏位置由 ui-sdkwork-app-modes 的 `RAIL_MODE_ORDER` 中 `search` 行以及它不在 `FIXED_MODES` 中共同决定——这正是它出厂隐藏、由自定义弹窗启用的原因；启用后它位于顶部组末尾，紧接自定义加号按钮之上。应用头部标题字典需要对应的 `mode.search` 行——新增模式 id 会让该包的类型检查失败，直到名册与字典都补齐。目录在自己的 `search` 命名空间里复写模式标题，因为跨插件值导入被禁止；模式改名必须同时到达两本字典。

</details>

## 运行时不变量

每个网关地址对应一个生成的客户端，绝不跨环境复用旧客户端。搜索状态是组件本地的：页面只保留查询文本、进行中状态与最近一次结果，因此切换模式会丢弃它，而不是把搜索持久化到其他分区。

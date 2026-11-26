---
description: "移动端连接界面：消息中心上方的 rail 快捷入口，以及它 hover 或弹窗时显示的扫码卡片——移动端 App / 微信小程序两个扫码目标，加上持久保存的「允许移动设备远程连接」开关。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-mobile-connect

[English](README.md) | 中文

## 摘要

移动端连接界面：模式栏底部快捷入口区里的一个图标格，位于消息中心正上方；hover 或点击时显示扫码卡片——移动端 App 与微信小程序两个扫码目标各有一个二维码，加上记录「本机是否允许移动设备远程连接」的开关。

## 目录

- [实现说明](#understand-the-implementation)
- [配置](#configuration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="understand-the-implementation"></a>

## 实现说明

该图标注册在 `mode.rail.panel` 的 order 15，因此 rail 底部一列自上而下是：IM 连接器（10）、本入口（15）、消息中心（20）、设置。这个图标只负责展示：它不选中任何中栏面板、没有选中态，并复用共享的 `remote-connection-outline` 字形，而不是新增图形。hover 时打开 `HoverCard`（compact，140ms 停留），内容就是扫码卡片；点击时在 `Modal` 里打开同一个卡片，这是键盘与触屏路径——hover 卡本身忽略触屏指针，也不会因为焦点而打开。

卡片是一个组件、两种材质。在 hover 卡里它沿用该原语的 hover-card 材质，并把交给 `SegmentedTabs` 与 `Switch` 的语义别名（`--dsw-alias-label-*`、`--dsw-alias-bg-module-platform`、`--dsw-alias-bg-layer-3`、`--dsw-alias-border-l3`）重映射到该材质上，共享控件因此保持自己的几何、角色与键盘行为；在弹窗里它作为独立子卡片使用页面材质。两种材质下二维码都落在自己的浅色底板上：扫码符号需要白底近黑色模块，所以底板使用静态中性色（`--dsw-static-neutral-bluish-00` / `-1000`），不随主题变化。符号中心嵌入产品 favicon，纠错级别为 `H`，被挖空的中心仍可恢复。

卡片呈现的状态：设置分区尚未同步时显示一个极简 spinner；解析到非空目标地址后显示二维码；地址为空或该命名空间未被部署时显示未配置提示（并说明填写部署地址即可）；开关写入被拒时显示一行失败提示。分区不可写时开关自身禁用。

<a id="configuration"></a>

## 配置

本包拥有 `ui-sdkwork-mobile-connect` 设置命名空间；Host 半声明 `Config` schema 并关闭自动生成的设置页，因为卡片是唯一读取它的界面。字段（全部为 volatile，浏览器能收到实时更新）：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `remoteAccessEnabled` | `true` | 开关的持久值。 |
| `appDownloadUrl` | `https://sdkwork.com/apps/sdkwork-birdcoder2` | 「移动端 App」页二维码指向的地址。 |
| `miniProgramUrl` | `https://sdkwork.com/apps/sdkwork-birdcoder2-mini-program` | 「微信小程序」页二维码指向的地址。 |

部署方在 profile 的 Cordis patch 中、`ui-sdkwork-mobile-connect` 条目下覆盖这些字段。浏览器半通过 `ctx.configForms` 读取解析后的分区，并经由同一个 scope 回写开关，因此刷新页面与第二个窗口看到同一份值。

<a id="model-experience"></a>

## 模型体验

无。本包只有人类可见的界面装饰与一个布尔偏好：它不打开会话、不触达模型请求，也不向提示词注入任何内容。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

<a id="known-limitations-and-deferred-work"></a>

## 已知限制与后续工作

- **开关目前是持久偏好，还不是执行点**——`remoteAccessEnabled` 会被保存、镜像并渲染，但目前没有任何 Host 授权路径读取它：已经能访问本机的移动设备在开关关闭时仍可连接。强制生效属于移动端连接能力（Host 的 remote access 准入），这个字段就是它将来读取的接缝。
- **扫码目标是部署配置**——目标地址为空时卡片显示未配置提示，且不提供应用内编辑器；修改地址意味着改写 profile 条目，因为该命名空间的自动设置页被刻意关闭。
- **一张卡片对应一个部署品牌**——符号中心使用 Web 外壳已经在提供的产品 favicon，因此替换 favicon 的 OEM 部署无需改代码就会得到自己的标记；但同一部署无法为两个扫码目标分别选择标记。
- **rail 位置固定**——15 让该图标位于 IM 连接器与消息中心之间；与模式入口不同，面板快捷入口不属于 rail 的自定义对话框，用户不能移动或隐藏它。

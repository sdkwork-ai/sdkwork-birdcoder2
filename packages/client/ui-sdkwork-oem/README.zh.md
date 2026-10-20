---
description: "OEM 品牌客户端插件：把 Host 发布的显示名与生命周期应用到 locale 文案、文档标题与诊断信息。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-oem

[English](README.md) | 中文

## 摘要

OEM 配置的浏览器半边。启动时读取 [`@deepseek-ai/dsh-sdkwork-oem`](../../host/sdkwork-oem/README.zh.md) 发布的 `__DSH_OEM__` 页面投影，把显示名交给 locale 注册表，用它设置文档标题，并把解析出的生命周期记录到 `documentElement.dataset.dshEnvironment` 以便诊断。所有拼写 `BirdCoder` 的客户端字典文案随后渲染为部署品牌；没有配置时仍回落到出厂 `BirdCoder`。

侧栏字标通过 [`ui-primitives`](../ui-primitives/README.zh.md) 的 `readOemBrandName()` 直接读取同一投影；名称是实时 SVG 文本，较长的 OEM 名称会在上游字标框内缩小字号，而不是撑开槽位。

## 模型体验

无。该插件只改变显示文案与文档标题。

#### KV Cache 影响

无；本包不组装任何 provider 请求。

## 已知限制与后续工作

- Web manifest 与 `index.html` 标题是构建期文本；配置重命名的是运行期文档标题与产品文案，不是已安装 PWA 的名称。
- Logo 仍是构建期的 BirdCoder 标识。采用其他品牌的部署需要在构建中替换 Logo 位图（应用图标、安装器品牌图与欢迎页标识）；配置只承载显示名称。
- locale 替换只匹配 `BirdCoder` 这一确切拼写；品牌名若在不相关单词中包含该拼写，应改用其他品牌名。
- H5 与小程序是独立外壳，拥有自己的产品标签，本配置不会触达。
